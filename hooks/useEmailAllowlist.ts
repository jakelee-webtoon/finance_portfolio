'use client';

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AllowlistState } from '@/lib/authFlow';

const allowlistCache = new Map<string, AllowlistState>();

export function useEmailAllowlist(email?: string | null) {
  const normalizedEmail = email?.trim().toLocaleLowerCase('en-US') ?? '';
  const [state, setState] = useState<AllowlistState>(() =>
    normalizedEmail ? allowlistCache.get(normalizedEmail) ?? 'idle' : 'idle'
  );

  const refresh = useCallback(async () => {
    if (!db || !normalizedEmail) {
      setState('idle');
      return;
    }

    if (allowlistCache.get(normalizedEmail) !== 'allowed') setState('loading');
    try {
      const snapshot = await getDoc(
        doc(db, 'workspaces', 'finance', 'allowedEmails', normalizedEmail)
      );
      const nextState = snapshot.exists() && snapshot.data().enabled === true
        ? 'allowed'
        : 'denied';
      allowlistCache.set(normalizedEmail, nextState);
      setState(nextState);
    } catch {
      allowlistCache.set(normalizedEmail, 'error');
      setState('error');
    }
  }, [normalizedEmail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}
