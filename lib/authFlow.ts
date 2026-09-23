export type AllowlistState = 'idle' | 'loading' | 'allowed' | 'denied' | 'error';
export type AccessStage = 'config-error' | 'loading' | 'sign-in' | 'allowlist' | 'app';

export function getAccessStage({
  configured,
  authLoading,
  userEmail,
  allowlist,
}: {
  configured: boolean;
  authLoading: boolean;
  userEmail: string | null;
  allowlist: AllowlistState;
}): AccessStage {
  if (!configured) return 'config-error';
  if (authLoading || (userEmail && (allowlist === 'idle' || allowlist === 'loading'))) {
    return 'loading';
  }
  if (!userEmail) return 'sign-in';
  if (allowlist !== 'allowed') return 'allowlist';
  return 'app';
}

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : '';

  if (code.includes('redirect-uri-mismatch') || code.includes('unauthorized-domain')) {
    return 'Google 로그인 반환 주소가 허용되지 않았습니다. Firebase와 Google OAuth 설정을 확인해주세요.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'Firebase에서 Google 로그인이 활성화되지 않았습니다.';
  }
  if (code.includes('account-exists-with-different-credential')) {
    return '같은 이메일이 다른 로그인 방식으로 등록되어 있습니다.';
  }
  if (code.includes('network-request-failed')) {
    return '네트워크 연결을 확인한 뒤 다시 시도해주세요.';
  }

  return code
    ? `인증을 완료하지 못했습니다. (${code})`
    : '인증을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.';
}
