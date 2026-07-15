import { createStore } from '@vendoai/store';
import type { ActAs, Principal } from '@vendoai/vendo';
import { createVendo } from '@vendoai/vendo/server';
import { checkAuth } from '@/lib/auth';
import { hash, secret } from '@/lib/crypto';
import { createSecureToken } from '@/lib/jwt';
import { getUser } from '@/queries/prisma/user';
import { model } from './ai';
import { hostOAuthAdapter } from './vendo-oauth';

const store = createStore({ url: process.env.VENDO_DATABASE_URL ?? process.env.DATABASE_URL });

async function resolvePrincipal(request: Request): Promise<Principal | null> {
  const user = (await checkAuth(request))?.user;
  return user?.id ? { kind: 'user', subject: user.id, display: user.username } : null;
}

const actAs: ActAs = async principal => {
  const user = await getUser(principal.subject, { includePassword: true });
  if (!user?.password) return null;

  const token = createSecureToken(
    { userId: user.id, role: user.role, pwd: hash(user.password) },
    secret(),
  );
  return { headers: { authorization: `Bearer ${token}` } };
};

export const vendo = createVendo({
  model,
  store,
  principal: resolvePrincipal,
  actAs,
  mcp: true,
  oauth: hostOAuthAdapter,
});
