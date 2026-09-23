'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardState, Scope } from '@/types';
import { getDashboardState, setDashboardState } from '@/lib/store';
import ExchangeRateDisplay from '@/components/ExchangeRateDisplay';
import { signOutFirebase } from '@/lib/firebase';

export default function TopBar() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState | null>(null);
  const [isMobileHidden, setIsMobileHidden] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const topBarRef = useRef<HTMLDivElement>(null);
  const isMobileHiddenRef = useRef(false);

  useEffect(() => {
    setState(getDashboardState());
  }, []);

  useEffect(() => {
    const topBar = topBarRef.current;
    if (!topBar) return;

    const root = document.documentElement;
    const mobileMedia = window.matchMedia('(max-width: 767px)');
    let lastScrollY = Math.max(window.scrollY, 0);
    let frameId: number | null = null;

    const updateTopBarHeight = () => {
      root.style.setProperty('--topbar-height', `${topBar.offsetHeight}px`);
    };

    const setMobileHidden = (hidden: boolean) => {
      if (isMobileHiddenRef.current === hidden) return;
      isMobileHiddenRef.current = hidden;
      setIsMobileHidden(hidden);
      root.dataset.mobileTopbar = hidden ? 'hidden' : 'visible';
    };

    const updateVisibility = () => {
      const currentScrollY = Math.max(window.scrollY, 0);
      const delta = currentScrollY - lastScrollY;

      if (!mobileMedia.matches || currentScrollY <= 4) {
        setMobileHidden(false);
      } else if (delta > 0 && currentScrollY >= 8) {
        setMobileHidden(true);
      } else if (delta < -2) {
        setMobileHidden(false);
      }

      lastScrollY = currentScrollY;
      frameId = null;
    };

    const handleScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateVisibility);
    };

    const handleViewportChange = () => {
      updateTopBarHeight();
      if (!mobileMedia.matches) setMobileHidden(false);
    };

    const resizeObserver = new ResizeObserver(updateTopBarHeight);
    resizeObserver.observe(topBar);
    updateTopBarHeight();
    root.dataset.mobileTopbar = 'visible';

    window.addEventListener('scroll', handleScroll, { passive: true });
    mobileMedia.addEventListener('change', handleViewportChange);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      mobileMedia.removeEventListener('change', handleViewportChange);
      resizeObserver.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      delete root.dataset.mobileTopbar;
    };
  }, [state !== null]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSettingsOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!state) return;
    const newState = { ...state, baseMonth: e.target.value };
    setState(newState);
    setDashboardState(newState);
    // localStorage 변경 이벤트 발생 (다른 탭/페이지에서 감지)
    window.dispatchEvent(new Event('storage'));
    // 같은 페이지에서도 감지할 수 있도록 커스텀 이벤트 발생
    window.dispatchEvent(new CustomEvent('dashboardStateChanged', { detail: newState }));
  };

  const handleScopeChange = (scope: Scope) => {
    if (!state) return;
    const newState = { ...state, scope };
    setState(newState);
    setDashboardState(newState);
    // localStorage 변경 이벤트 발생 (다른 탭/페이지에서 감지)
    window.dispatchEvent(new Event('storage'));
    // 같은 페이지에서도 감지할 수 있도록 커스텀 이벤트 발생
    window.dispatchEvent(new CustomEvent('dashboardStateChanged', { detail: newState }));
  };

  const handleHouseholdNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!state) return;
    const newState = { ...state, householdName: e.target.value };
    setState(newState);
    setDashboardState(newState);
  };

  const handleLogout = async () => {
    await signOutFirebase();
    setIsSettingsOpen(false);
    router.replace('/');
  };

  if (!state) return null;

  const [year, month] = state.baseMonth.split('-');
  const baseMonthLabel = year && month ? `${year}년 ${Number(month)}월` : state.baseMonth;
  const scopeLabel = state.scope === 'combined' ? '합산' : state.scope === 'husband' ? '남편' : '아내';

  return (
    <>
      <div
        ref={topBarRef}
        data-mobile-topbar-shell
        className={`fixed inset-x-0 top-0 z-50 w-full max-w-[100vw] min-w-0 overflow-x-clip border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur-md transition-transform duration-150 ease-out motion-reduce:transition-none md:sticky md:inset-x-auto md:translate-y-0 ${
          isMobileHidden && !isSettingsOpen ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:hidden">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="min-w-0 text-left"
            aria-label="조회 설정 열기"
          >
            <div className="truncate text-lg font-extrabold text-gray-950">{state.householdName || '우리집'}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-gray-500">
              <span>{baseMonthLabel}</span>
              <span className="text-gray-300" aria-hidden="true">·</span>
              <span className="text-blue-600">{scopeLabel}</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-sm font-bold text-gray-700 active:bg-gray-200"
            aria-label="조회 설정 열기"
          >
            <span aria-hidden="true" className="text-base leading-none">⚙</span>
            설정
          </button>
        </div>

        <div className="mx-auto hidden max-w-7xl min-w-0 flex-col gap-3 px-6 py-4 md:flex lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <div className="col-span-2 flex min-w-0 flex-1 items-center gap-2 sm:col-auto sm:flex-initial sm:max-w-[220px]">
            <label className="text-xs sm:text-sm font-medium text-gray-700 shrink-0">가구명</label>
            <input
              type="text"
              value={state.householdName}
              onChange={handleHouseholdNameChange}
              className="min-w-0 flex-1 px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="min-w-0 sm:flex sm:shrink-0 sm:items-center sm:gap-2">
            <label className="mb-1 block text-[11px] font-medium text-gray-500 sm:mb-0 sm:text-sm sm:text-gray-700">기준월</label>
            <input
              type="month"
              value={state.baseMonth}
              onChange={handleMonthChange}
              className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto sm:px-3"
            />
          </div>

          <div className="min-w-0 sm:flex sm:items-center sm:gap-2">
            <span className="mb-1 block text-[11px] font-medium text-gray-500 sm:mb-0 sm:shrink-0 sm:text-sm sm:text-gray-700">범위</span>
            <div className="flex min-w-0 gap-0.5 rounded-md bg-gray-100 p-0.5 sm:gap-1 sm:p-1">
              <button
                onClick={() => handleScopeChange('combined')}
                className={`min-w-0 flex-1 rounded px-1.5 py-1 text-xs transition-colors sm:flex-initial sm:shrink-0 sm:px-3 sm:text-sm ${
                  state.scope === 'combined'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                합산
              </button>
              <button
                onClick={() => handleScopeChange('husband')}
                className={`min-w-0 flex-1 rounded px-1.5 py-1 text-xs transition-colors sm:flex-initial sm:shrink-0 sm:px-3 sm:text-sm ${
                  state.scope === 'husband'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                남편
              </button>
              <button
                onClick={() => handleScopeChange('wife')}
                className={`min-w-0 flex-1 rounded px-1.5 py-1 text-xs transition-colors sm:flex-initial sm:shrink-0 sm:px-3 sm:text-sm ${
                  state.scope === 'wife'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                아내
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-t border-gray-100 pt-2 sm:flex-wrap sm:justify-start sm:gap-4 sm:pt-3 lg:border-t-0 lg:pt-0">
          <div className="min-w-0 max-w-full">
            <ExchangeRateDisplay />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors shrink-0"
          >
            로그아웃
          </button>
        </div>
        </div>
      </div>
      <div className="h-16 md:hidden" aria-hidden="true" />

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-settings-title">
          <button
            type="button"
            aria-label="조회 설정 닫기"
            className="absolute inset-0 bg-gray-950/35 backdrop-blur-[1px]"
            onClick={() => setIsSettingsOpen(false)}
          />
          <section className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" aria-hidden="true" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 id="mobile-settings-title" className="text-xl font-extrabold text-gray-950">조회 설정</h2>
                <p className="mt-1 text-sm text-gray-500">화면에 표시할 기준을 선택하세요.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-2xl leading-none text-gray-600"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">가구명</span>
                <input
                  type="text"
                  value={state.householdName}
                  onChange={handleHouseholdNameChange}
                  className="h-12 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 text-base font-semibold text-gray-950 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-700">기준월</span>
                <input
                  type="month"
                  value={state.baseMonth}
                  onChange={handleMonthChange}
                  className="h-12 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 text-base font-semibold text-gray-950 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <fieldset>
                <legend className="mb-2 text-sm font-bold text-gray-700">자산 범위</legend>
                <div className="grid grid-cols-3 rounded-lg bg-gray-100 p-1">
                  {([
                    ['combined', '합산'],
                    ['husband', '남편'],
                    ['wife', '아내'],
                  ] as const).map(([scope, label]) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => handleScopeChange(scope)}
                      className={`h-11 rounded-md text-base font-bold transition-colors ${
                        state.scope === scope ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="flex min-h-12 items-center justify-between rounded-lg bg-gray-50 px-4">
                <span className="text-sm font-bold text-gray-600">현재 환율</span>
                <ExchangeRateDisplay />
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="h-12 w-full rounded-lg border border-red-200 bg-red-50 text-base font-bold text-red-700 active:bg-red-100"
              >
                로그아웃
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
