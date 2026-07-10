import { hash, secret } from '@/lib/crypto';
import { parseToken } from '@/lib/jwt';
import { createCommerceEvent, getCommerceEvent } from '@/queries/prisma/commerce';
import { saveRevenue } from '@/queries/sql/events/saveRevenue';

export const COMMERCE_PROVIDERS = ['stripe', 'lemonsqueezy', 'polar', 'shopify', 'custom'] as const;

export type CommerceProvider = (typeof COMMERCE_PROVIDERS)[number];

export const ATTRIBUTION = {
  session: 'session',
  token: 'token',
  none: 'none',
} as const;

export interface RecordPaymentArgs {
  websiteId: string;
  provider: CommerceProvider;
  // Idempotency key: the provider's webhook event / delivery id.
  providerEventId: string;
  // Order / charge / invoice id. Defaults to providerEventId.
  providerTransactionId?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  customerEmail?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  // Negative amounts represent refunds/adjustments.
  amount: number;
  currency: string;
  // 'payment' | 'refund' | 'subscription_payment' | ...
  eventType?: string;
  occurredAt?: Date;
  // Explicit session attribution.
  sessionId?: string;
  visitId?: string;
  // Signed tracker cache token (from umami.getSession()) passed through
  // provider metadata; parsed server-side to resolve session/visit.
  attributionToken?: string;
  integrationId?: string;
  metadata?: Record<string, any>;
}

export interface RecordPaymentResult {
  id: string;
  duplicate: boolean;
  attribution: string;
  sessionId?: string;
}

export function resolveAttribution(args: RecordPaymentArgs): {
  attribution: string;
  sessionId?: string;
  visitId?: string;
} {
  const { websiteId, sessionId, visitId, attributionToken } = args;

  if (sessionId) {
    return { attribution: ATTRIBUTION.session, sessionId, visitId };
  }

  if (attributionToken) {
    const payload = parseToken(attributionToken, secret()) as {
      websiteId?: string;
      sessionId?: string;
      visitId?: string;
    } | null;

    if (payload?.sessionId && payload?.websiteId === websiteId) {
      return {
        attribution: ATTRIBUTION.token,
        sessionId: payload.sessionId,
        visitId: payload.visitId,
      };
    }
  }

  return { attribution: ATTRIBUTION.none };
}

export async function recordPayment(args: RecordPaymentArgs): Promise<RecordPaymentResult> {
  const {
    websiteId,
    provider,
    providerEventId,
    providerTransactionId = args.providerEventId,
    providerCustomerId,
    providerSubscriptionId,
    customerEmail,
    productId,
    productName,
    quantity,
    amount,
    currency,
    eventType = 'payment',
    occurredAt = new Date(),
    integrationId,
    metadata,
  } = args;

  // Providers retry webhook deliveries; dedupe on (website, provider, event id).
  const existing = await getCommerceEvent(websiteId, provider, providerEventId);

  if (existing) {
    return {
      id: existing.id,
      duplicate: true,
      attribution: existing.attribution,
      sessionId: existing.sessionId ?? undefined,
    };
  }

  const { attribution, sessionId, visitId } = resolveAttribution(args);

  const revenue: any = await saveRevenue({
    websiteId,
    sessionId,
    eventName: eventType,
    provider,
    providerId: providerTransactionId,
    currency,
    revenue: amount,
    createdAt: occurredAt,
  });

  const event = await createCommerceEvent({
    websiteId,
    integrationId,
    provider,
    eventType,
    providerEventId,
    providerTransactionId,
    providerCustomerId,
    providerSubscriptionId,
    customerEmailHash: customerEmail ? hash(customerEmail.trim().toLowerCase()) : undefined,
    productId,
    productName,
    quantity,
    amount,
    currency,
    attribution,
    sessionId,
    visitId,
    revenueId: revenue?.id,
    metadata,
    occurredAt,
  });

  return { id: event.id, duplicate: false, attribution, sessionId };
}
