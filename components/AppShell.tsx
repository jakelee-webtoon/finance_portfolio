'use client';

import { usePathname } from 'next/navigation';
import Navigation from '@/components/Navigation';
import PageTransition from '@/components/PageTransition';
import TopBar from '@/components/TopBar';
import { useFinanceAccess } from '@/hooks/useFinanceAccess';
import AssistantPanel from '@/components/assistant/AssistantPanel';

const APP_ROUTES = new Set([
  '/dashboard',
  '/portfolio',
  '/monthly-plan',
  '/apartment',
  '/rsu',
  '/isa',
  '/stocks',
  '/salary',
  '/cash',
  '/income',
  '/ledger',
  '/other',
]);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasAccess } = useFinanceAccess();
  const hasAppChrome = APP_ROUTES.has(pathname) && hasAccess;

  return (
    <>
      {hasAppChrome && (
        <>
          <TopBar />
          <Navigation />
          <AssistantPanel />
        </>
      )}
      <PageTransition>{children}</PageTransition>
    </>
  );
}
