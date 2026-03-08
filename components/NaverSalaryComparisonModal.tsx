'use client';

import { useState, useEffect, useMemo } from 'react';
import { Salary, NaverSalaryStats } from '@/types';
import { SalaryScope, NaverOrg } from '@/types';
import { getFilteredStats, getFilteredStatsByYears } from '@/lib/salaryComparison';
import SalaryStatsTable from './SalaryStatsTable';
import SalaryGapTable from './SalaryGapTable';
import { formatCurrency } from '@/lib/salaryFormat';

interface NaverSalaryComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  salaries: Salary[];
  exchangeRates: Record<string, number> | null;
}

export default function NaverSalaryComparisonModal({
  isOpen,
  onClose,
  salaries,
  exchangeRates,
}: NaverSalaryComparisonModalProps) {
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [unit, setUnit] = useState<'만원' | '원'>('만원');
  const [compareAllYears, setCompareAllYears] = useState<boolean>(false);

  // 내 연봉 데이터에서 연도 목록 추출 및 최신 연도 찾기
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(salaries.map((s) => s.year))).sort(
      (a, b) => b.localeCompare(a)
    );
    return years;
  }, [salaries]);

  // 기본 연도 설정 (최신 연도)
  useEffect(() => {
    if (availableYears.length > 0 && !selectedYear) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // 선택된 연도의 내 연봉 계산 (KRW로 변환) 및 연차 추출
  const { mySalary, myYearsOfExperience } = useMemo(() => {
    if (!selectedYear || !exchangeRates) return { mySalary: 0, myYearsOfExperience: undefined };

    const yearSalaries = salaries.filter((s) => s.year === selectedYear);
    if (yearSalaries.length === 0) return { mySalary: 0, myYearsOfExperience: undefined };

    // 해당 연도의 총 연봉 합산 (KRW로 변환)
    const total = yearSalaries.reduce((sum, salary) => {
      if (salary.currency === 'KRW') {
        return sum + salary.amount;
      } else if (salary.currency === 'USD') {
        return sum + salary.amount * exchangeRates.USD_TO_KRW;
      } else if (salary.currency === 'EUR') {
        return sum + salary.amount * exchangeRates.EUR_TO_KRW;
      }
      return sum;
    }, 0);

    // 연차 추출 (첫 번째 연봉 항목의 연차 사용)
    const yearsOfExperience = yearSalaries[0]?.yearsOfExperience;

    return { mySalary: Math.floor(total), myYearsOfExperience: yearsOfExperience };
  }, [selectedYear, salaries, exchangeRates]);

  // 선택된 연도에 매핑된 연차 찾기
  const mappedYearsOfExperience = useMemo(() => {
    if (!selectedYear) return undefined;
    const yearSalaries = salaries.filter((s) => s.year === selectedYear);
    return yearSalaries[0]?.yearsOfExperience;
  }, [selectedYear, salaries]);

  // 통계 데이터 및 실제 표시 연도 계산
  const { filteredStats, actualDisplayYear, actualYearsOfExperience, yearWarning } = useMemo(() => {
    if (!selectedYear) {
      return { filteredStats: [], actualDisplayYear: selectedYear, actualYearsOfExperience: undefined, yearWarning: null };
    }

    let stats: NaverSalaryStats[] = [];
    let actualYear = selectedYear;
    let actualYears: number | undefined = undefined;
    let warning: string | null = null;

    if (compareAllYears) {
      // 체크박스 체크: 전체 통계 사용 (연차 무시)
      stats = getFilteredStats(selectedYear, 'TC');
    } else {
      // 체크박스 해제: 연차별 통계 사용
      if (mappedYearsOfExperience !== undefined) {
        stats = getFilteredStatsByYears(selectedYear, 'TC', mappedYearsOfExperience);
        actualYears = mappedYearsOfExperience;
        
        // 데이터가 없으면 가장 최신 연도로 대체
        if (stats.length === 0 && availableYears.length > 0) {
          const latestYear = availableYears[0];
          if (latestYear !== selectedYear) {
            // 최신 연도의 연차 찾기
            const latestYearSalaries = salaries.filter((s) => s.year === latestYear);
            const latestYearsOfExperience = latestYearSalaries[0]?.yearsOfExperience;
            
            if (latestYearsOfExperience !== undefined) {
              stats = getFilteredStatsByYears(latestYear, 'TC', latestYearsOfExperience);
              actualYear = latestYear;
              actualYears = latestYearsOfExperience;
              warning = `${selectedYear}년 데이터가 없어 ${latestYear}년 데이터(${latestYearsOfExperience}년차)를 표시합니다.`;
            }
          }
        }
      } else {
        // 연차가 없으면 전체 통계 사용
        stats = getFilteredStats(selectedYear, 'TC');
      }
    }

    return { filteredStats: stats, actualDisplayYear: actualYear, actualYearsOfExperience: actualYears, yearWarning: warning };
  }, [selectedYear, compareAllYears, mappedYearsOfExperience, availableYears, salaries]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">네이버 연봉 비교</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="닫기"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 필터 영역 */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                기준 연도
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                표시 단위
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUnit('만원')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    unit === '만원'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  만원
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('원')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    unit === '원'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  원
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={compareAllYears}
                onChange={(e) => setCompareAllYears(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                연차 구분없이 전체 비교
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-500 ml-6">
              체크 시 전체 raw 데이터 기준 통계와 비교합니다
            </p>
          </div>
          {mySalary > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              내 연봉 ({selectedYear}년):{' '}
              <span className="font-semibold text-gray-900">
                {formatCurrency(mySalary, unit)}
              </span>
              {actualYearsOfExperience !== undefined && (
                <span className="ml-2 text-gray-500">
                  ({actualYearsOfExperience}년차 기준)
                </span>
              )}
            </div>
          )}
        </div>

        {/* 본문 - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto p-6">
          {mySalary === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {selectedYear}년 연봉 데이터가 없습니다.
            </div>
          ) : filteredStats.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              해당 연도/범위의 네이버 연봉 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-8">
              {/* 조직별 연봉 분포 테이블 (연차별 또는 전체) */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  조직별 연봉 분포
                  {actualYearsOfExperience !== undefined && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({actualYearsOfExperience}년차 기준)
                    </span>
                  )}
                </h3>
                {yearWarning && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">{yearWarning}</p>
                  </div>
                )}
                {filteredStats.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
                    {selectedYear}년 {actualYearsOfExperience !== undefined ? `${actualYearsOfExperience}년차 ` : ''}데이터가 없습니다.
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <SalaryStatsTable
                      stats={filteredStats}
                      mySalary={mySalary}
                      unit={unit}
                    />
                  </div>
                )}
              </div>

              {/* 격차 테이블 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  내 연봉 대비 격차
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <SalaryGapTable
                    stats={filteredStats}
                    mySalary={mySalary}
                    unit={unit}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 하단 주석 및 닫기 버튼 */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-500 mb-4 space-y-1">
            <p>• 참고용 지표이며, 표본/범위에 따라 실제와 다를 수 있음</p>
            <p>• P25/P75는 25/75 퍼센타일</p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
