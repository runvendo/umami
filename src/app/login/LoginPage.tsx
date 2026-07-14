'use client';
import { Column, Loading } from '@umami/react-zen';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useLoginQuery } from '@/components/hooks';
import { safeNextPath } from '@/lib/safe-next';
import { LoginForm } from './LoginForm';

export function LoginPage() {
  const { user, isLoading } = useLoginQuery();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));

  useEffect(() => {
    if (user) {
      router.replace(next);
    }
  }, [next, user, router]);

  if (isLoading || user) {
    return <Loading placement="absolute" />;
  }

  return (
    <Column
      alignItems="center"
      justifyContent="flex-start"
      height="100vh"
      backgroundColor="surface-raised"
      style={{ paddingTop: '15vh' }}
    >
      <LoginForm />
    </Column>
  );
}
