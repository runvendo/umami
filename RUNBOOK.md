# Umami + Vendo MCP runbook

This fork adds Vendo to upstream Umami 3.2.0 as a customer-style integration. It uses Umami's real bearer login and user records for the Vendo principal and OAuth consent seams, exposes a curated read-only analytics tool catalog through `mcp: true`, and forwards the OAuth discovery documents from the origin root.

## Deployment

- GitHub: `https://github.com/runvendo/umami`, branch `vendo-mcp`
- Railway project: `umami-mcp-demo` (`4ffc3f86-4f51-4450-8080-2c1f4442605c`)
- App service: `umami` (`ddccf330-a76a-43cb-ab7d-cf1ab0b1f265`)
- Postgres service: `Postgres` (`4f00bce4-c2a0-4a65-9e76-095638bdac19`)
- Public URL: `https://umami-production-2721.up.railway.app`
- Current app source: `ffb9fe16fcc0d1c34061c7e9a717a8c2a0cd9991`
- Current Railway deployment: `fa8745c6-7c61-42b0-b71d-be4e9e2a0e94`

Railway deploys the Dockerfile from `vendo-mcp`. To upload the current clean checkout, run `railway up --project 4ffc3f86-4f51-4450-8080-2c1f4442605c --environment 8e854206-2369-47ba-bcec-c123ddc70053 --service ddccf330-a76a-43cb-ab7d-cf1ab0b1f265 --detach`. `railway redeploy` only rebuilds the source already attached to the latest Railway release; it does not upload newer local commits.

## Environment variables

Required on the Railway `umami` service:

- `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
- `APP_SECRET`: random signing secret
- `VENDO_BASE_URL`: the public origin, with no trailing path
- `PORT`: `3000`
- `DEMO_USERNAME` and `DEMO_PASSWORD`: demo login credentials
- `ALLOW_DEMO_SEED`: explicit safety gate for the seed command
- `DEMO_SEED_DAYS`: number of days of synthetic analytics to create

`ANTHROPIC_API_KEY` is optional for Vendo's generative app/chat features. The checked-in analytics MCP tools and OAuth flow do not require it.

The demo login (`DEMO_USERNAME` / `DEMO_PASSWORD`) is an intentionally public,
non-secret demo credential: `admin` / `umami`. It is documented in
[`README.md`](./README.md) so anyone can drive the demo. `APP_SECRET` and the
database credentials remain secret and live only in Railway variables.

To retrieve the current demo login from Railway:

```bash
railway variable list --service umami --json | jq -r '{username: .DEMO_USERNAME, password: .DEMO_PASSWORD}'
```

## Local development

Run Postgres on `localhost:55432`, set `DATABASE_URL`, `APP_SECRET`, and `VENDO_BASE_URL=http://localhost:3000` in an ignored `.env`, then:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Umami owns authentication. Its login API returns an encrypted bearer stored by the browser under `umami.auth`; the OAuth adapter validates that bearer with Umami's existing `checkAuth`, bridges it into a short-lived HttpOnly cookie, and returns the current Umami subject from `HostOAuthAdapter.session`. The door owns the consent page and decision flow, including CSRF protection, single-use replay protection, and the standard OAuth redirect. The prebuilt page receives Umami's extracted theme through `--vendo-*` CSS variables. Vendo uses the same Postgres database through its supported store adapter, in Vendo-owned tables, so OAuth grants survive app restarts.

## Vendo packages

The public npm packages were not usable for this integration. The `vendor/` tarballs were built from Vendo commit `4bfb72495a6abad16e04298b0e188b98fc9e92a9` with `corpus/harness`'s `installLocalVendoPackages` after PR #181 landed; `package.json` and `pnpm-lock.yaml` resolve every `@vendoai/*` package to those tarballs. The installed umbrella's real `vendo init . --yes` flow produced the `.vendo/` artifacts and extracted Umami theme.

When refreshing Vendo, rebuild and inject with the same corpus harness boundary from a current Vendo `origin/main`, run a non-frozen install so the local tarball integrity values update, and rerun all verification below. Do not replace the tarballs with registry versions until the registry is known good.

## Seed and verify

Seed production from this checkout through Railway's public Postgres endpoint. The script refuses to run without the explicit gate and reads credentials from Railway variables:

```bash
DATABASE_URL="$(railway variable list --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL')" \
ALLOW_DEMO_SEED=1 \
DEMO_USERNAME="$(railway variable list --service umami --json | jq -r '.DEMO_USERNAME')" \
DEMO_PASSWORD="$(railway variable list --service umami --json | jq -r '.DEMO_PASSWORD')" \
pnpm seed:vendo-demo
```

The MCP proof client uses the real MCP SDK and runs discovery, dynamic client registration, PKCE S256, Umami's exact login return bounce, the prebuilt themed consent page, authorization-code exchange, consent-replay rejection, and an authenticated analytics tool call:

```bash
UMAMI_DEMO_USERNAME="$(railway variable list --service umami --json | jq -r '.DEMO_USERNAME')" \
UMAMI_DEMO_PASSWORD="$(railway variable list --service umami --json | jq -r '.DEMO_PASSWORD')" \
pnpm mcp:e2e -- https://umami-production-2721.up.railway.app
```

Health and discovery probes:

```bash
curl --fail https://umami-production-2721.up.railway.app/api/heartbeat
curl --fail https://umami-production-2721.up.railway.app/.well-known/oauth-protected-resource/api/vendo/mcp
curl --fail https://umami-production-2721.up.railway.app/.well-known/oauth-authorization-server/api/vendo/mcp
```

## Production verification

On 2026-07-14, Railway deployment `fa8745c6-7c61-42b0-b71d-be4e9e2a0e94` reached `SUCCESS` from app source `ffb9fe16fcc0d1c34061c7e9a717a8c2a0cd9991`.

- The live MCP SDK proof completed protected-resource and authorization-server discovery, dynamic client registration, PKCE S256, the exact Umami login `returnTo`, prebuilt consent approval, authorization-code exchange, token issuance, tool discovery, and `list_umami_websites`. The tool returned the two seeded sites, Demo Blog and Demo SaaS.
- A fresh isolated Chromium session with no existing cookies opened the authorize URL, landed on Umami login, and returned after login to the exact original authorize URL. It rendered `Allow Umami browser proof to access this product?` with `--vendo-color-accent: #2b7fff`, `--vendo-font-family: Inter, sans-serif`, and `--vendo-radius-medium: 6px`; clicking Allow completed the browser-side consent decision and redirected to the registered local callback.
- The live heartbeat returned `{\"ok\":true}`, and both OAuth discovery documents returned successfully at the URLs above.
