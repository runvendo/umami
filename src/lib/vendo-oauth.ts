import type { HostOAuthAdapter } from '@vendoai/vendo';
import { checkAuth, getBearerToken } from '@/lib/auth';
import { getUser } from '@/queries/prisma/user';
import theme from '../../.vendo/theme.json';

const OAUTH_COOKIE = 'umami.vendo.oauth';

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

async function oauthUser(request: Request) {
  const token = cookieValue(request, OAUTH_COOKIE);
  if (!token) return null;

  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${token}`);
  return (await checkAuth(new Request(request.url, { headers })))?.user ?? null;
}

function loginBounce(returnTo: string): Response {
  const returnUrl = new URL(returnTo);
  const next = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
  const loginUrl = `/login?next=${encodeURIComponent(next)}`;
  const safeLoginUrl = JSON.stringify(loginUrl).replaceAll('<', '\\u003c');
  const safeReturnTo = JSON.stringify(returnTo).replaceAll('<', '\\u003c');

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
        const returnTo = ${safeReturnTo};
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
          window.location.replace(response.ok ? returnTo : loginUrl);
        }).catch(() => window.location.replace(loginUrl));
      })();
    </script>
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
  async session(request, { returnTo }) {
    const user = await oauthUser(request);
    return user?.id ? { subject: user.id } : loginBounce(returnTo);
  },

  async principal(subject) {
    const user = await getUser(subject);
    return user ? { kind: 'user', subject: user.id, display: user.username } : null;
  },
};
