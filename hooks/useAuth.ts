'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const SESSION_AUTH_KEY = 'finance-session-authenticated';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // 홈 페이지에서는 인증 체크를 하지 않음
    if (pathname === '/') {
      setIsAuthenticated(true);
      return;
    }
    
    const sessionAuth = sessionStorage.getItem(SESSION_AUTH_KEY);
    if (sessionAuth !== 'true') {
      setIsAuthenticated(false);
      router.push('/');
      return;
    }
    
    setIsAuthenticated(true);
  }, [router, pathname]);

  return isAuthenticated;
}
