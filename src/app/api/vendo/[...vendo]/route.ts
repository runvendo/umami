import { nextVendoHandler } from '@vendoai/vendo/server';
import { vendo } from '@/lib/vendo';
import { publicVendoRequest } from '@/lib/vendo-request';

const handler = nextVendoHandler(vendo);

export const GET = (request: Request) => handler.GET(publicVendoRequest(request));
export const POST = (request: Request) => handler.POST(publicVendoRequest(request));
export const DELETE = (request: Request) => handler.DELETE(publicVendoRequest(request));
