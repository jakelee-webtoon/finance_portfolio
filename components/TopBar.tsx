'use client';

import { useState, useEffect } from 'react';
import { DashboardState, Scope } from '@/types';
import { getDashboardState, setDashboardState } from '@/lib/store';
import ExchangeRateDisplay from '@/components/ExchangeRateDisplay';

export default function TopBar() {
  const [state, setState] = useState<DashboardState | null>(null);

  useEffect(() => {
    setState(getDashboardState());
  }, []);

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
    <div className="w-full max-w-[100vw] min-w-0 overflow-x-clip bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial sm:max-w-[220px]">
            <label className="text-xs sm:text-sm font-medium text-gray-700 shrink-0">가구명</label>
            <input
              type="text"
              value={state.householdName}
              onChange={handleHouseholdNameChange}
              className="min-w-0 flex-1 px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs sm:text-sm font-medium text-gray-700">기준월</label>
            <input
              type="month"
              value={state.baseMonth}
              onChange={handleMonthChange}
              className="px-2 sm:px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs sm:text-sm font-medium text-gray-700 shrink-0">범위</span>
            <div className="flex gap-0.5 sm:gap-1 bg-gray-100 rounded-md p-0.5 sm:p-1 min-w-0">
              <button
                onClick={() => handleScopeChange('combined')}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded transition-colors shrink-0 ${
                  state.scope === 'combined'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                합산
              </button>
              <button
                onClick={() => handleScopeChange('husband')}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded transition-colors shrink-0 ${
                  state.scope === 'husband'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                남편
              </button>
              <button
                onClick={() => handleScopeChange('wife')}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded transition-colors shrink-0 ${
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

        <div className="flex flex-wrap items-center gap-2 sm:gap-4 shrink-0 min-w-0 border-t border-gray-100 pt-3 lg:border-t-0 lg:pt-0">
          <div className="min-w-0 max-w-full overflow-x-auto no-scrollbar overscroll-x-contain">
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
