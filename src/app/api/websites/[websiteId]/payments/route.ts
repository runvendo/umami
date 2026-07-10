import { z } from 'zod';
import { COMMERCE_PROVIDERS, recordPayment } from '@/lib/payments';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewWebsite } from '@/permissions';
import { getCommerceEvents } from '@/queries/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    provider: z.enum(COMMERCE_PROVIDERS).optional(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;
  const { provider } = query;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const events = await getCommerceEvents(websiteId, {
    where: provider ? { provider } : undefined,
    take: 100,
  });

  return json(events);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    provider: z.enum(COMMERCE_PROVIDERS).default('custom'),
    eventId: z.string().max(255),
    transactionId: z.string().max(255).optional(),
    customerId: z.string().max(255).optional(),
    subscriptionId: z.string().max(255).optional(),
    customerEmail: z.string().email().optional(),
    productId: z.string().max(255).optional(),
    productName: z.string().max(500).optional(),
    quantity: z.number().int().positive().optional(),
    amount: z.number(),
    currency: z.string().min(3).max(10),
    eventType: z.string().max(50).default('payment'),
    occurredAt: z.coerce.date().optional(),
    sessionId: z.string().uuid().optional(),
    attributionToken: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const result = await recordPayment({
    websiteId,
    provider: body.provider,
    providerEventId: body.eventId,
    providerTransactionId: body.transactionId,
    providerCustomerId: body.customerId,
    providerSubscriptionId: body.subscriptionId,
    customerEmail: body.customerEmail,
    productId: body.productId,
    productName: body.productName,
    quantity: body.quantity,
    amount: body.amount,
    currency: body.currency,
    eventType: body.eventType,
    occurredAt: body.occurredAt,
    sessionId: body.sessionId,
    attributionToken: body.attributionToken,
    metadata: body.metadata,
  });

  return json(result);
}
