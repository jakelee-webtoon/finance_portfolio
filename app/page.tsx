'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const PASSWORD_KEY = 'finance-app-password';
const SESSION_AUTH_KEY = 'finance-session-authenticated';

export default function Home() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 초기 비밀번호 설정 확인
    if (typeof window !== 'undefined') {
      const storedPassword = localStorage.getItem(PASSWORD_KEY);
      setIsInitialized(!!storedPassword);
      
      // 세션 인증 확인 (sessionStorage는 탭이 닫히면 자동으로 삭제됨)
      const isAuthenticated = sessionStorage.getItem(SESSION_AUTH_KEY);
      if (isAuthenticated === 'true') {
        router.push('/dashboard');
      }
    }
  }, [router]);

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) {
      setError('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(PASSWORD_KEY, password);
      sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
      setIsInitialized(true);
      setPassword('');
      setError('');
      router.push('/dashboard');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window === 'undefined') return;
    
    const storedPassword = localStorage.getItem(PASSWORD_KEY);
    
    if (!storedPassword) {
      setError('비밀번호가 설정되지 않았습니다. 먼저 비밀번호를 설정해주세요.');
      return;
    }
    
    if (password === storedPassword) {
      sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
      setPassword('');
      setError('');
      router.push('/dashboard');
    } else {
      setError('비밀번호가 일치하지 않습니다.');
      setPassword('');
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">포트폴리오 관리</h1>
          <p className="text-sm text-gray-600 mb-6 text-center">
            처음 사용하시는 경우 비밀번호를 설정해주세요.
          </p>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                비밀번호 설정 (최소 4자)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="비밀번호를 입력하세요"
                autoFocus
              />
            </div>
            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              비밀번호 설정
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">포트폴리오 관리</h1>
        <p className="text-sm text-gray-600 mb-6 text-center">
          비밀번호를 입력하여 접속하세요.
        </p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="비밀번호를 입력하세요"
              autoFocus
            />
          </div>
          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
