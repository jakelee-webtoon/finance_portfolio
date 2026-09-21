'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardState, Scope } from '@/types';
import { getDashboardState, setDashboardState } from '@/lib/store';
import ExchangeRateDisplay from '@/components/ExchangeRateDisplay';

export default function TopBar() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [isMobileHidden, setIsMobileHidden] = useState(false);
  const topBarRef = useRef<HTMLDivElement>(null);
  const isMobileHiddenRef = useRef(false);

  useEffect(() => {
    setState(getDashboardState());
  }, []);

  useEffect(() => {
    const topBar = topBarRef.current;
    if (!topBar) return;

    const root = document.documentElement;
    const mobileMedia = window.matchMedia('(max-width: 1023px)');
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

      if (!mobileMedia.matches || currentScrollY <= 8) {
        setMobileHidden(false);
      } else if (delta > 1 && currentScrollY >= 24) {
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
      root.style.removeProperty('--topbar-height');
      delete root.dataset.mobileTopbar;
    };
  }, [state !== null]);

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

  if (!state) return null;

  return (
    <div
      ref={topBarRef}
      className={`w-full max-w-[100vw] min-w-0 overflow-x-clip bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 transition-[transform,margin-bottom] duration-200 ease-out motion-reduce:transition-none lg:mb-0 lg:translate-y-0 ${
        isMobileHidden ? '-translate-y-full' : 'translate-y-0'
      }`}
      style={{ marginBottom: isMobileHidden ? 'calc(var(--topbar-height) * -1)' : 0 }}
    >
      <div className="mx-auto max-w-7xl px-3 py-2.5 sm:hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
          <label className="min-w-0">
            <span className="sr-only">가구명</span>
            <input
              type="text"
              aria-label="가구명"
              value={state.householdName}
              onChange={handleHouseholdNameChange}
              className="h-9 w-full min-w-0 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">기준월</span>
            <input
              type="month"
              aria-label="기준월"
              value={state.baseMonth}
              onChange={handleMonthChange}
              className="h-9 w-full min-w-0 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm font-medium text-gray-800 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
        </div>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 rounded-md bg-gray-100 p-0.5" aria-label="자산 범위">
            {([
              ['combined', '합산'],
              ['husband', '남편'],
              ['wife', '아내'],
            ] as const).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                onClick={() => handleScopeChange(scope)}
                className={`min-w-0 flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                  state.scope === scope ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ExchangeRateDisplay compact />
            <button
              type="button"
              className="h-8 rounded-md px-2 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              설정
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto hidden max-w-7xl min-w-0 flex-col gap-3 px-6 py-4 sm:flex lg:flex-row lg:items-center lg:justify-between">
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
            className="px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors shrink-0"
          >
            설정
          </button>
        </div>
      </div>
    </div>
  );
}
