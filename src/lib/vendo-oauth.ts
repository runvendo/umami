import type { HostOAuthAdapter } from '@vendoai/vendo';
import { checkAuth, getBearerToken } from '@/lib/auth';
import { secret } from '@/lib/crypto';
import { createSecureToken, parseSecureToken } from '@/lib/jwt';
import { getUser } from '@/queries/prisma/user';
import theme from '../../.vendo/theme.json';

const OAUTH_COOKIE = 'umami.vendo.oauth';
const CONSENT_PARAM = 'vendo_consent';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function html(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      ...headers,
    },
  });
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function sessionCookie(request: Request, token: string, maxAge = 600): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${OAUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function consentRequestKey(url: URL): string {
  const params = new URLSearchParams(
    [...url.searchParams.entries()].filter(([name]) => name !== CONSENT_PARAM),
  );
  return `${url.pathname}?${params.toString()}`;
}

async function oauthUser(request: Request) {
  const token = cookieValue(request, OAUTH_COOKIE);
  if (!token) return null;

  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${token}`);
  return (await checkAuth(new Request(request.url, { headers })))?.user ?? null;
}

function loginBounce(request: Request): Response {
  const url = new URL(request.url);
  const next = `${url.pathname}${url.search}`;
  const loginUrl = `/login?next=${encodeURIComponent(next)}`;
  const safeLoginUrl = JSON.stringify(loginUrl).replaceAll('<', '\\u003c');

  return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect to Umami</title>
    <style>
      :root { color-scheme: light; font-family: ${escapeHtml(theme.typography.fontFamily)}; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: ${theme.colors.background}; color: ${theme.colors.text}; }
      main { width: min(420px, calc(100% - 32px)); padding: 28px; border: 1px solid ${theme.colors.border}; border-radius: ${theme.radius.large}; background: ${theme.colors.surface}; box-shadow: 0 16px 48px rgb(15 23 42 / 10%); }
      p { color: ${theme.colors.muted}; line-height: 1.55; }
      a { color: ${theme.colors.accent}; }
    </style>
  </head>
  <body>
    <main>
      <h1>Connect to Umami</h1>
      <p>Checking your existing Umami login before showing the analytics access request.</p>
      <p><a href="${escapeHtml(loginUrl)}">Sign in to Umami</a></p>
    </main>
    <script>
      (() => {
        const loginUrl = ${safeLoginUrl};
        let token;
        try {
          const raw = window.localStorage.getItem('umami.auth');
          const parsed = raw ? JSON.parse(raw) : null;
          token = typeof parsed === 'string' ? parsed : undefined;
        } catch {}
        if (!token) {
          window.location.replace(loginUrl);
          return;
        }
        fetch('/api/vendo/oauth/session', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: '{}',
          credentials: 'same-origin',
        }).then(response => {
          window.location.replace(response.ok ? window.location.href : loginUrl);
        }).catch(() => window.location.replace(loginUrl));
      })();
    </script>
  </body>
</html>`);
}

function consentPage(
  request: Request,
  userId: string,
  clientName: string,
  scopes: string[],
): Response {
  const url = new URL(request.url);
  const consent = createSecureToken(
    { purpose: 'vendo-mcp-consent', userId, request: consentRequestKey(url) },
    secret(),
    { expiresIn: '10m' },
  );
  const inputs = [...url.searchParams.entries()]
    .filter(([name]) => name !== CONSENT_PARAM)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join('\n');
  const scopeList = scopes.length
    ? scopes.map(scope => `<li>${escapeHtml(scope)}</li>`).join('')
    : '<li>Read the analytics tools exposed by this Umami instance</li>';

  return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${escapeHtml(clientName)} | Umami</title>
    <style>
      :root { color-scheme: light; font-family: ${escapeHtml(theme.typography.fontFamily)}; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: ${theme.colors.background}; color: ${theme.colors.text}; }
      main { width: min(460px, calc(100% - 32px)); padding: 28px; border: 1px solid ${theme.colors.border}; border-radius: ${theme.radius.large}; background: ${theme.colors.surface}; box-shadow: 0 16px 48px rgb(15 23 42 / 10%); }
      .eyebrow { color: ${theme.colors.accent}; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; }
      p, li { color: ${theme.colors.muted}; line-height: 1.55; }
      .actions { display: flex; gap: 12px; margin-top: 24px; }
      button, a { border-radius: ${theme.radius.medium}; padding: 10px 16px; font: inherit; font-weight: 650; text-decoration: none; }
      button { border: 1px solid ${theme.colors.accent}; background: ${theme.colors.accent}; color: ${theme.colors.accentText}; cursor: pointer; }
      a { border: 1px solid ${theme.colors.border}; color: ${theme.colors.text}; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Umami analytics</div>
      <h1>Connect ${escapeHtml(clientName)}?</h1>
      <p>This lets the client ask questions using the analytics visible to your signed-in Umami account.</p>
      <ul>${scopeList}</ul>
      <form method="get" action="${escapeHtml(url.pathname)}">
        ${inputs}
        <input type="hidden" name="${CONSENT_PARAM}" value="${escapeHtml(consent)}" />
        <div class="actions">
          <button data-test="vendo-oauth-approve" type="submit">Allow analytics access</button>
          <a href="/">Cancel</a>
        </div>
      </form>
    </main>
  </body>
</html>`);
}

export async function createOAuthSession(request: Request): Promise<Response> {
  const auth = await checkAuth(request);
  const token = getBearerToken(request);
  if (!auth?.user?.id || !token) {
    return Response.json(
      { error: { code: 'unauthorized', message: 'Sign in to Umami first.' } },
      { status: 401 },
    );
  }

  return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookie(request, token) } });
}

export const hostOAuthAdapter: HostOAuthAdapter = {
  async authorize(request, { clientName, scopes }) {
    const user = await oauthUser(request);
    if (!user?.id) return loginBounce(request);

    const consent = new URL(request.url).searchParams.get(CONSENT_PARAM);
    if (!consent) return consentPage(request, user.id, clientName, scopes);

    const payload = parseSecureToken(consent, secret()) as {
      purpose?: string;
      userId?: string;
      request?: string;
    } | null;
    if (
      payload?.purpose !== 'vendo-mcp-consent' ||
      payload.userId !== user.id ||
      payload.request !== consentRequestKey(new URL(request.url))
    ) {
      return html('<h1>That consent request is invalid or expired.</h1>', 400);
    }

    return { subject: user.id };
  },

  async principal(subject) {
    const user = await getUser(subject);
    return user ? { kind: 'user', subject: user.id, display: user.username } : null;
  },
};
