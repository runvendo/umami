import type { Prisma } from '@/generated/prisma/client';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';

// integrations

export async function getCommerceIntegration(integrationId: string) {
  return prisma.client.commerceIntegration.findUnique({
    where: { id: integrationId },
  });
}

export async function getWebsiteCommerceIntegration(websiteId: string, provider: string) {
  return prisma.client.commerceIntegration.findUnique({
    where: { websiteId_provider: { websiteId, provider } },
  });
}

export async function getWebsiteCommerceIntegrations(websiteId: string) {
  return prisma.client.commerceIntegration.findMany({
    where: { websiteId, deletedAt: null },
  });
}

export async function createCommerceIntegration(
  data: Omit<Prisma.CommerceIntegrationUncheckedCreateInput, 'id'>,
) {
  return prisma.client.commerceIntegration.create({
    data: { id: uuid(), ...data },
  });
}

export async function updateCommerceIntegration(
  integrationId: string,
  data: Prisma.CommerceIntegrationUpdateInput,
) {
  return prisma.client.commerceIntegration.update({
    where: { id: integrationId },
    data,
  });
}

export async function deleteCommerceIntegration(integrationId: string) {
  return prisma.client.commerceIntegration.update({
    where: { id: integrationId },
    data: { deletedAt: new Date(), status: 'disabled' },
  });
}

// events

export async function getCommerceEvent(
  websiteId: string,
  provider: string,
  providerEventId: string,
) {
  return prisma.client.commerceEvent.findUnique({
    where: {
      websiteId_provider_providerEventId: { websiteId, provider, providerEventId },
    },
  });
}

export async function createCommerceEvent(
  data: Omit<Prisma.CommerceEventUncheckedCreateInput, 'id'>,
) {
  return prisma.client.commerceEvent.create({
    data: { id: uuid(), ...data },
  });
}

export async function getCommerceEvents(
  websiteId: string,
  criteria?: Prisma.CommerceEventFindManyArgs,
) {
  return prisma.client.commerceEvent.findMany({
    ...criteria,
    where: { websiteId, ...criteria?.where },
    orderBy: { occurredAt: 'desc' },
  });
}
