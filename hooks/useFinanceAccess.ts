'use client';

import { getAccessStage } from '@/lib/authFlow';
import { useEmailAllowlist } from '@/hooks/useEmailAllowlist';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';

export function useFinanceAccess() {
  const firebaseAuth = useFirebaseAuth();
  const allowlist = useEmailAllowlist(firebaseAuth.user?.email);
  const stage = getAccessStage({
    configured: firebaseAuth.configured,
    authLoading: firebaseAuth.loading,
    userEmail: firebaseAuth.user?.email ?? null,
    allowlist: allowlist.state,
  });

  return {
    ...firebaseAuth,
    allowlist: allowlist.state,
    refreshAllowlist: allowlist.refresh,
    stage,
    hasAccess: stage === 'app',
  };
}
