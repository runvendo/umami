export function publicVendoRequest(request: Request): Request {
  const baseUrl = process.env.VENDO_BASE_URL;
  if (!baseUrl) return request;

  const incoming = new URL(request.url);
  const publicUrl = new URL(`${incoming.pathname}${incoming.search}`, baseUrl);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
  };
  return new Request(publicUrl, init);
}
