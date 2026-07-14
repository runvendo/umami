#!/usr/bin/env node
/* eslint-disable no-console */

import { hashPassword } from '../src/lib/password.js';
import prisma from '../src/lib/prisma.js';
import { seed } from './seed/index.js';

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error('Set ALLOW_DEMO_SEED=1 to confirm this demo-only database mutation.');
  }

  const username = process.env.DEMO_USERNAME;
  const password = process.env.DEMO_PASSWORD;
  if (!username || !password) {
    throw new Error('DEMO_USERNAME and DEMO_PASSWORD must be set.');
  }

  const admin = await prisma.client.user.findFirst({
    where: { role: 'admin' },
    select: { id: true },
  });
  if (!admin)
    throw new Error('The Umami admin user does not exist; run database migrations first.');

  await prisma.client.user.update({
    where: { id: admin.id },
    data: { username: username.toLowerCase(), password: hashPassword(password) },
  });
  await prisma.client.$disconnect();

  const result = await seed({
    days: Number(process.env.DEMO_SEED_DAYS ?? '14'),
    clear: true,
    verbose: false,
  });
  console.log(JSON.stringify({ seeded: true, ...result }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
