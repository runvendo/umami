#!/usr/bin/env node
/* eslint-disable no-console */

import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  assert(response.ok, `${label} failed (${response.status}): ${text}`);
  return JSON.parse(text) as T;
}

function decodeHtml(value: string): string {
  return value.replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&amp;', '&');
}

async function main() {
  const target = process.argv.slice(2).find(argument => argument !== '--');
  const origin = new URL(target ?? 'http://localhost:3000');
  origin.pathname = '/';
  origin.search = '';
  origin.hash = '';
  const resource = new URL('/api/vendo/mcp', origin).toString();
  const protectedMetadataUrl = new URL(
    '/.well-known/oauth-protected-resource/api/vendo/mcp',
    origin,
  );

  const protectedMetadata = await json<{
    resource: string;
    authorization_servers: string[];
  }>(await fetch(protectedMetadataUrl), 'protected-resource discovery');
  assert(
    protectedMetadata.resource === resource,
    'Protected-resource metadata advertised the wrong resource.',
  );

  const authorizationServer = protectedMetadata.authorization_servers?.[0];
  assert(
    authorizationServer,
    'Protected-resource metadata did not advertise an authorization server.',
  );
  const authorizationMetadataUrl = new URL(
    `/.well-known/oauth-authorization-server${new URL(resource).pathname}`,
    authorizationServer,
  );
  const authorizationMetadata = await json<{
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint: string;
    code_challenge_methods_supported: string[];
  }>(await fetch(authorizationMetadataUrl), 'authorization-server discovery');
  assert(
    authorizationMetadata.code_challenge_methods_supported?.includes('S256'),
    'Authorization server did not advertise PKCE S256.',
  );

  const redirectUri = 'http://127.0.0.1:43891/callback';
  const registration = await json<{ client_id: string }>(
    await fetch(authorizationMetadata.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Umami MCP proof client',
        redirect_uris: [redirectUri],
        scope: 'analytics:read',
      }),
    }),
    'dynamic client registration',
  );

  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(18).toString('base64url');
  const authorizeUrl = new URL(authorizationMetadata.authorization_endpoint);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'analytics:read',
    resource,
    state,
  }).toString();

  const bounce = await fetch(authorizeUrl, { redirect: 'manual' });
  const bounceHtml = await bounce.text();
  assert(
    bounce.status === 200 && bounceHtml.includes('Connect to Umami'),
    'Login bounce did not render.',
  );

  const username =
    process.env.UMAMI_DEMO_USERNAME ?? (origin.hostname === 'localhost' ? 'admin' : undefined);
  const password =
    process.env.UMAMI_DEMO_PASSWORD ?? (origin.hostname === 'localhost' ? 'umami' : undefined);
  assert(
    username && password,
    'Set UMAMI_DEMO_USERNAME and UMAMI_DEMO_PASSWORD for non-local e2e runs.',
  );
  const login = await json<{ token: string; user: { id: string; username: string } }>(
    await fetch(new URL('/api/auth/login', origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    'Umami login',
  );

  const sessionResponse = await fetch(new URL('/api/vendo/oauth/session', origin), {
    method: 'POST',
    headers: { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  assert(sessionResponse.ok, `OAuth login bridge failed (${sessionResponse.status}).`);
  const cookie = sessionResponse.headers.get('set-cookie')?.split(';', 1)[0];
  assert(cookie, 'OAuth login bridge did not set its HttpOnly session cookie.');

  const consentResponse = await fetch(authorizeUrl, { headers: { cookie }, redirect: 'manual' });
  const consentHtml = await consentResponse.text();
  assert(
    consentResponse.status === 200 && consentHtml.includes('Allow analytics access'),
    'Consent page did not render.',
  );
  const consentMatch = consentHtml.match(/name="vendo_consent" value="([^"]+)"/);
  assert(consentMatch?.[1], 'Consent page did not contain a signed consent value.');
  const signedConsent = decodeHtml(consentMatch[1]);
  const replayUrl = new URL(authorizeUrl);
  replayUrl.searchParams.set('state', `${state}-altered`);
  replayUrl.searchParams.set('vendo_consent', signedConsent);
  const replay = await fetch(replayUrl, { headers: { cookie }, redirect: 'manual' });
  assert(replay.status === 400, 'Consent proof was not bound to the exact OAuth request.');

  const approvedUrl = new URL(authorizeUrl);
  approvedUrl.searchParams.set('vendo_consent', signedConsent);
  const approved = await fetch(approvedUrl, { headers: { cookie }, redirect: 'manual' });
  assert(
    approved.status >= 300 && approved.status < 400,
    `Consent did not redirect (${approved.status}).`,
  );
  const callback = new URL(approved.headers.get('location') ?? '');
  assert(callback.searchParams.get('state') === state, 'OAuth state did not round-trip.');
  const code = callback.searchParams.get('code');
  assert(code, 'Consent redirect did not contain an authorization code.');

  const token = await json<{ access_token: string; refresh_token: string; token_type: string }>(
    await fetch(authorizationMetadata.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: registration.client_id,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource,
      }),
    }),
    'authorization-code exchange',
  );

  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
  });
  const client = new Client({ name: 'umami-mcp-proof', version: '1.0.0' });
  await client.connect(transport);
  const listed = await client.listTools();
  const tool = listed.tools.find(entry => entry.name === 'list_umami_websites');
  assert(tool, 'The authenticated MCP catalog did not include list_umami_websites.');
  const result = await client.callTool({ name: tool.name, arguments: {} });
  assert(!result.isError, `Authenticated MCP tool call failed: ${JSON.stringify(result.content)}`);

  console.log(
    JSON.stringify(
      {
        origin: origin.toString(),
        discovery: {
          protectedResource: protectedMetadataUrl.toString(),
          authorizationServer: authorizationMetadataUrl.toString(),
        },
        oauth: {
          dcr: true,
          pkceS256: true,
          loginUser: { id: login.user.id, authenticated: true },
          consent: true,
          consentReplayRejected: true,
          authorizationCode: true,
          accessToken: true,
          refreshToken: Boolean(token.refresh_token),
        },
        mcp: {
          sdkClient: true,
          toolsListed: listed.tools.map(entry => entry.name),
          called: tool.name,
          result: result.structuredContent ?? result.content,
        },
      },
      null,
      2,
    ),
  );
  await client.close();
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
