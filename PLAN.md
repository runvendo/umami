# External Revenue Attribution — Implementation Plan

Goal: compete with [DataFast](https://datafa.st/) by connecting external payment providers
(Stripe, Lemon Squeezy, Polar, Shopify) to Umami's existing session/attribution graph, so
users can answer "which channel/campaign/page made me money?" — not just "which event fired?"

## Strategy

Umami already has a revenue read model (`revenue` in Postgres, `website_revenue` in
ClickHouse) that every revenue report queries. We keep those as the **universal read model**
and add a canonical **commerce layer** as the system of record for external payments:

```
tracker event (browser) ──▶ event_data ──▶ revenue / website_revenue (via MV)   [existing]
provider webhook / API  ──▶ commerce_event (dedupe, canonical) ──▶ revenue / website_revenue [new]
                                                    ▲
                                        attribution: session token
```

Key decisions:

1. **`revenue` tables stay the read model.** Existing charts/stats/breakdowns work for
   external payments on day one; reports only gain a `provider` filter.
2. **`commerce_event` (Postgres, always — even in ClickHouse mode) is the source of truth**
   for webhook data: provider ids, event type, customer/product data, dedupe key. Revenue
   rows are derived from it, so attribution can be re-derived/backfilled later.
3. **Idempotency lives in Postgres.** All providers retry webhooks. A unique constraint on
   `(website_id, provider, provider_event_id)` on `commerce_event` gates writes to the
   revenue tables in both DB modes (ClickHouse MergeTree has no uniqueness).
4. **Refunds are negative-amount revenue rows.** Existing `SUM()` queries keep working.
5. **Attribution token = the existing signed cache token.** `/api/send` already returns a
   JWT (`cache`) containing `websiteId`/`sessionId`/`visitId` signed with `secret()`, plus
   plain `sessionId`/`visitId`. Users pass either into provider metadata (Stripe
   `metadata`, Lemon Squeezy `custom_data`, Polar `metadata`, Shopify cart attributes);
   webhook handlers resolve it back to a session. No cookies, no fingerprinting changes.
6. **Unattributed revenue is kept, not dropped** (`session_id` nullable / zero-UUID in CH),
   and surfaced as an "unattributed" bucket in reports.

---

## Phase 1 — Foundation (this branch)

Data layer + generic Payment API. No provider-specific code yet.

- [x] **Prisma migration `21_add_commerce`**
  - `revenue`: add `provider varchar(50) not null default 'web'`,
    `provider_id varchar(255) null`; make `session_id` / `event_id` nullable
    (relationMode = "prisma", so no DB FK changes needed);
    unique index `(website_id, provider, provider_id)` (NULLs distinct, tracker rows unaffected).
  - New `commerce_integration`: per-website provider connection (status, encrypted
    credentials, webhook secret, provider account id). Unique `(website_id, provider)`.
  - New `commerce_event`: canonical payment record — `provider`, `provider_event_id`
    (dedupe key), `provider_transaction_id`, customer/subscription/product fields,
    `amount`/`currency`, attribution fields (`session_id`, `visit_id`, `attribution`),
    `metadata` json, `occurred_at`. Unique `(website_id, provider, provider_event_id)`.
- [x] **ClickHouse migration `13_add_commerce.sql`**
  - `website_revenue`: add `provider LowCardinality(String) DEFAULT 'web'`,
    `provider_id String DEFAULT ''`. Existing MV keeps populating tracker rows
    (defaults apply); webhook rows are inserted directly into `website_revenue`
    (MVs only fire on inserts to their *source* table, so both paths coexist).
  - Unattributed rows use zero-UUID for `session_id`/`event_id`.
- [x] **`saveRevenue` upgrade** — provider-aware args; Postgres upsert on
  `(websiteId, provider, providerId)` for external rows (tracker rows keep `create`);
  new ClickHouse branch that inserts directly into `website_revenue` (only called for
  external payments; tracker path still flows through the MV).
- [x] **`recordPayment` service** (`src/lib/payments.ts`) — single entry point used by the
  generic API now and all provider webhooks later:
  1. Resolve attribution: explicit `sessionId` → as-is; `attributionToken` → verify JWT
     with `secret()` and extract `sessionId`/`visitId`; else unattributed.
  2. Normalize: refunds → negative amount; default `provider_event_id` to
     `{transactionId}:{eventType}` when the provider has no event id.
  3. Dedupe: insert `commerce_event`; unique violation → return `{ duplicate: true }`,
     skip revenue write.
  4. Write revenue row (both DB modes).
- [x] **Commerce queries** (`src/queries/prisma/commerce.ts`) — CRUD for
  `commerce_event` + `commerce_integration`.
- [x] **Generic Payment API** — `POST /api/websites/{websiteId}/payments`
  (auth: `canUpdateWebsite`, i.e. API key / bearer token), zod-validated; the DataFast
  "Payments API" equivalent for custom backends. `GET` lists recent commerce events
  (auth: `canViewWebsiteSection('revenue')`) for setup verification/debugging.

## Phase 2 — Stripe MVP + report updates

- Stripe integration (settings UI: paste restricted API key + webhook secret, or Stripe
  Connect for cloud): webhook route `POST /api/webhooks/stripe/{integrationId}` with
  `Stripe-Signature` verification.
- Events: `checkout.session.completed`, `payment_intent.succeeded` (when not via
  Checkout), `invoice.paid` (subscription renewals), `charge.refunded`,
  `customer.subscription.*` lifecycle → normalized `commerce_event` types.
- Attribution: read `umami_session_id` / `umami_token` from `metadata`
  (Checkout Sessions, Payment Links, PaymentIntents); docs + snippet.
- Tracker: document `umami.getSession()`-based token passing; extend the tracker to
  expose `sessionId`/`visitId` (already returned by `/api/send`).
- Reports: `provider` filter on revenue queries; attributed vs unattributed split
  (nullable/zero-UUID session ids must not be silently dropped by session joins);
  transactions table with journey link.

## Phase 3 — Lemon Squeezy + Polar

- Lemon Squeezy: webhook route with `X-Signature` HMAC verification; events
  `order_created`, `order_refunded`, `subscription_payment_success`, subscription
  lifecycle; attribution via checkout `custom_data`.
- Polar: webhook endpoint (standard-webhooks signatures); events `order.paid`,
  `order.refunded`, subscription lifecycle; attribution via checkout `metadata`
  (copied to orders/subscriptions by Polar).
- Shared webhook plumbing hardening: delivery log, replay protection, health status
  on the integration (last event at, error counts).

## Phase 4 — Shopify

- Official app (OAuth) + web pixel extension for tracking; attribution via cart/checkout
  attributes.
- Webhooks: `orders/paid`, `refunds/create`, HMAC verification, dedupe on webhook id;
  GDPR compliance webhooks (required for public distribution).
- Reconciliation job (webhooks are not guaranteed delivery — poll orders API to backfill).

## Phase 5 — Competitive polish

- Customer layer: `commerce_customer` (LTV, first/last touch, MRR state) derived from
  `commerce_event`; MRR/ARR/churn/LTV-by-channel reports.
- Setup UX: integration health dashboard, test-event button, unattributed-revenue
  diagnostics, backfill tools.
- Ad spend / ROAS (Meta, Google) as a later differentiator.

## Positioning vs DataFast

Open-source, self-hostable, privacy-first revenue attribution with full data ownership —
on top of analytics DataFast doesn't have (session replay, heatmaps, ClickHouse scale,
teams). The commerce layer is additive; nothing about existing tracking changes.
