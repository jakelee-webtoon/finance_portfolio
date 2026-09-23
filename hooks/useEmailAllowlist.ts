'use client';

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AllowlistState } from '@/lib/authFlow';

export function useEmailAllowlist(email?: string | null) {
  const [state, setState] = useState<AllowlistState>('idle');

  const refresh = useCallback(async () => {
    if (!db || !email) {
      setState('idle');
      return;
    }

    setState('loading');
    try {
      const normalizedEmail = email.trim().toLocaleLowerCase('en-US');
      const snapshot = await getDoc(
        doc(db, 'workspaces', 'finance', 'allowedEmails', normalizedEmail)
      );
      setState(snapshot.exists() && snapshot.data().enabled === true ? 'allowed' : 'denied');
    } catch {
      setState('error');
    }
  }, [email]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}
