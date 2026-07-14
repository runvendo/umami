'use client';

import type { VendoTheme } from '@vendoai/vendo';
import { createVendoClient, VendoRoot } from '@vendoai/vendo/react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

const AUTH_TOKEN_KEY = 'umami.auth';

function readAuthToken(): string | undefined {
  try {
    const raw = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function UmamiVendoRoot({ children, theme }: { children: ReactNode; theme: VendoTheme }) {
  const pathname = usePathname();
  const [token, setToken] = useState<string>();

  useEffect(() => {
    setToken(readAuthToken());
  }, [pathname]);

  const client = useMemo(
    () =>
      createVendoClient({
        baseUrl: '/api/vendo',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    [token],
  );

  return (
    <VendoRoot client={client} theme={theme}>
      {children}
    </VendoRoot>
  );
}
