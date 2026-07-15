# Umami + Vendo MCP runbook

This fork adds Vendo to upstream Umami 3.2.0 as a customer-style integration. It uses Umami's real bearer login and user records for the Vendo principal and OAuth consent seams, exposes a curated read-only analytics tool catalog through `mcp: true`, and forwards the OAuth discovery documents from the origin root.

## Deployment

- GitHub: `https://github.com/runvendo/umami`, branch `vendo-mcp`
- Railway project: `umami-mcp-demo` (`4ffc3f86-4f51-4450-8080-2c1f4442605c`)
- App service: `umami` (`ddccf330-a76a-43cb-ab7d-cf1ab0b1f265`)
- Postgres service: `Postgres` (`4f00bce4-c2a0-4a65-9e76-095638bdac19`)
- Public URL: `https://umami-production-2721.up.railway.app`

Railway deploys the Dockerfile from `vendo-mcp`. A push to that branch triggers a redeploy; an operator can also run `railway service redeploy --service umami` from this checkout.

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

Secret values live only in Railway variables. To retrieve the demo login as an authorized operator:

```bash
railway variable list --service umami --json | jq -r '{username: .DEMO_USERNAME, password: .DEMO_PASSWORD}'
```

Do not copy those values into this repository, issues, PRs, or logs.

## Local development

Run Postgres on `localhost:55432`, set `DATABASE_URL`, `APP_SECRET`, and `VENDO_BASE_URL=http://localhost:3000` in an ignored `.env`, then:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Umami owns authentication. Its login API returns an encrypted bearer stored by the browser under `umami.auth`; the OAuth adapter validates that bearer with Umami's existing `checkAuth`, bridges it into a short-lived HttpOnly cookie, obtains explicit consent, and maps the grant back to the current Umami user. Vendo uses the same Postgres database through its supported store adapter, in Vendo-owned tables, so OAuth grants survive app restarts.

## Vendo packages

The public npm packages were not usable for this integration. The `vendor/` tarballs were built from Vendo commit `4bfb72495a6abad16e04298b0e188b98fc9e92a9` with `corpus/harness`'s local-package installer after PR #181 landed; `package.json` and `pnpm-lock.yaml` resolve every `@vendoai/*` package to those tarballs. The installed umbrella's real `vendo init . --yes` flow produced the `.vendo/` artifacts and extracted Umami theme.

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

The MCP proof client uses the real MCP SDK and runs discovery, dynamic client registration, PKCE S256, Umami login, consent, authorization-code exchange, and an authenticated analytics tool call:

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
