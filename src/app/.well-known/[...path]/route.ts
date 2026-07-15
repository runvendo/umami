import { vendo } from '@/lib/vendo';
import { publicVendoRequest } from '@/lib/vendo-request';

export const GET = (request: Request) => vendo.handler(publicVendoRequest(request));
