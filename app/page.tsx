'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authErrorMessage } from '@/lib/authFlow';
import { signInWithGoogle, signOutFirebase } from '@/lib/firebase';
import { useFinanceAccess } from '@/hooks/useFinanceAccess';

export default function Home() {
  const {
    user,
    stage,
    allowlist,
    refreshAllowlist,
    errorCode,
  } = useFinanceAccess();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (errorCode) setError(authErrorMessage({ code: errorCode }));
  }, [errorCode]);

  useEffect(() => {
    if (stage === 'app') router.replace('/dashboard');
  }, [router, stage]);

  const handleGoogleLogin = async () => {
    setIsBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(authErrorMessage(loginError));
      setIsBusy(false);
    }
  };

  const handleUseAnotherAccount = async () => {
    setError('');
    await signOutFirebase();
  };

  if (stage === 'loading' || stage === 'app') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
          <p className="mt-4 text-sm font-medium text-gray-600">포트폴리오를 여는 중입니다.</p>
        </div>
      </main>
    );
  }

  if (stage === 'config-error') {
    return (
      <AccessShell>
        <p className="text-sm font-bold text-blue-600">우리집 자산관리</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-950">Firebase 설정이 필요합니다</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          로컬 또는 배포 환경의 Firebase 환경변수를 확인해주세요.
        </p>
      </AccessShell>
    );
  }

  if (stage === 'allowlist' && user) {
    return (
      <AccessShell>
        <p className="text-sm font-bold text-blue-600">우리집 자산관리</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-950">허용된 계정이 아닙니다</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Firestore 허용 이메일 목록에 아래 Google 계정을 추가해주세요.
        </p>
        <code className="mt-4 block break-all rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800">
          {user.email}
        </code>
        {allowlist === 'error' && (
          <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            허용 목록을 확인하지 못했습니다. Firestore 규칙과 문서를 확인해주세요.
          </div>
        )}
        <button
          type="button"
          onClick={() => void refreshAllowlist()}
          className="mt-5 h-12 w-full rounded-md bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          다시 확인
        </button>
        <button
          type="button"
          onClick={() => void handleUseAnotherAccount()}
          className="mt-3 h-11 w-full text-sm font-bold text-gray-600 hover:text-gray-950"
        >
          다른 Google 계정 사용
        </button>
      </AccessShell>
    );
  }

  return (
    <AccessShell>
      <p className="text-sm font-bold text-blue-600">우리집 자산관리</p>
      <h1 className="mt-2 text-2xl font-extrabold text-gray-950">포트폴리오 로그인</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        허용된 Google 계정으로 로그인하면 공동 포트폴리오가 열립니다. 로그인 상태는 이 브라우저에 유지됩니다.
      </p>

      {error && (
        <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleGoogleLogin()}
        disabled={isBusy}
        className="mt-6 h-12 w-full rounded-md bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:bg-blue-400"
      >
        {isBusy ? 'Google로 이동 중...' : 'Google로 로그인'}
      </button>

      <p className="mt-5 text-center text-xs leading-5 text-gray-500">
        공용 기기에서는 사용 후 반드시 로그아웃해주세요.
      </p>
    </AccessShell>
  );
}

function AccessShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-7 shadow-sm sm:p-8">
        {children}
      </section>
    </main>
  );
}
