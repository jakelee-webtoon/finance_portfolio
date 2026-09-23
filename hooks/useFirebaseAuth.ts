'use client';

import { useEffect, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  configureAuthPersistence,
  isFirebaseConfigured,
} from '@/lib/firebase';

const getErrorCode = (error: unknown): string =>
  typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : 'auth/initialization-failed';

const LEGACY_AUTH_KEYS = [
  'finance-app-password',
  'finance-session-authenticated',
] as const;

function clearLegacyAuthStorage(): void {
  LEGACY_AUTH_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  });
}

export function useFirebaseAuth() {
  const currentUser = auth?.currentUser ?? null;
  const [user, setUser] = useState<User | null>(currentUser);
  const [loading, setLoading] = useState(isFirebaseConfigured && !currentUser);
  const [errorCode, setErrorCode] = useState('');

  useEffect(() => {
    clearLegacyAuthStorage();

    if (!auth) {
      setLoading(false);
      return;
    }

    const firebaseAuth = auth;
    let active = true;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setLoading(false);
    });

    getRedirectResult(firebaseAuth).catch((error) => {
      if (active) {
        setErrorCode(getErrorCode(error));
        setLoading(false);
      }
    });

    configureAuthPersistence().catch((error) => {
      if (active) {
        setErrorCode(getErrorCode(error));
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { user, loading, configured: isFirebaseConfigured, errorCode };
}
