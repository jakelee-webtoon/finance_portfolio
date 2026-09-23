'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFinanceAccess } from '@/hooks/useFinanceAccess';

export function useAuth() {
  const { hasAccess, stage } = useFinanceAccess();
  const router = useRouter();

  useEffect(() => {
    if (stage !== 'loading' && !hasAccess) router.replace('/');
  }, [hasAccess, router, stage]);

  if (stage === 'loading') return null;
  return hasAccess;
}
