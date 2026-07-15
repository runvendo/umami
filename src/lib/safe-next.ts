export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';

  try {
    const parsed = new URL(value, 'https://umami.invalid');
    if (parsed.origin !== 'https://umami.invalid') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}
