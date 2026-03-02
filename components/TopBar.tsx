'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardState, Scope } from '@/types';
import { getDashboardState, setDashboardState } from '@/lib/store';
import ExchangeRateDisplay from '@/components/ExchangeRateDisplay';

export default function TopBar() {
  const [state, setState] = useState<DashboardState | null>(null);
  const pathname = usePathname();
  const isSalaryPage = pathname === '/salary';

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
    // 연봉 페이지에서는 합산 선택 불가
    if (isSalaryPage && scope === 'combined') return;
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
    <div className="w-full bg-white border-b border-gray-200 px-6 py-4 shadow-sm sticky top-0 z-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">가구명:</label>
            <input
              type="text"
              value={state.householdName}
              onChange={handleHouseholdNameChange}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">기준월:</label>
            <input
              type="month"
              value={state.baseMonth}
              onChange={handleMonthChange}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">범위:</span>
            <div className="flex gap-1 bg-gray-100 rounded-md p-1">
              <button
                onClick={() => handleScopeChange('combined')}
                disabled={isSalaryPage}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  state.scope === 'combined'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                } ${
                  isSalaryPage ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                합산
              </button>
              <button
                onClick={() => handleScopeChange('husband')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  state.scope === 'husband'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                남편
              </button>
              <button
                onClick={() => handleScopeChange('wife')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
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

        <div className="flex items-center gap-4">
          <ExchangeRateDisplay />
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
            설정
          </button>
        </div>
      </div>
    </div>
  );
}
