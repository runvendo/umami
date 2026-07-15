import { createOAuthSession } from '@/lib/vendo-oauth';
import { publicVendoRequest } from '@/lib/vendo-request';

export const POST = (request: Request) => createOAuthSession(publicVendoRequest(request));
