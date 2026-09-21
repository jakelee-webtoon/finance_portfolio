'use client';

import { NaverSalaryStats, NaverOrg } from '@/types';
import { orgLabels, calculateComparison } from '@/lib/salaryComparison';
import { formatCurrency, formatPercentage, formatNumber } from '@/lib/salaryFormat';

interface SalaryGapTableProps {
  stats: NaverSalaryStats[];
  mySalary: number;
  unit: '만원' | '원';
}

export default function SalaryGapTable({
  stats,
  mySalary,
  unit,
}: SalaryGapTableProps) {
  const comparisons = stats.map((stat) => calculateComparison(mySalary, stat));

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {comparisons.map((comp) => {
          const { org, medianGapAmount, medianGapPct, p75Remaining, bandInOut } = comp;
          const gapTone = medianGapAmount >= 0 ? 'text-green-600' : 'text-red-600';

          return (
            <article key={`${org}-${comp.stats.scope}`} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="font-bold text-gray-900">{orgLabels[org]}</div>
                <span className={`rounded px-2 py-1 text-xs font-medium ${
                  bandInOut === 'IN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {bandInOut === 'IN' ? '밴드 내' : '밴드 외'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-gray-400">중위 대비 금액</div>
                  <div className={`mt-1 text-sm font-bold ${gapTone}`}>
                    {medianGapAmount >= 0 ? '+' : ''}{formatNumber(medianGapAmount, unit)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-gray-400">중위 대비 비율</div>
                  <div className={`mt-1 text-sm font-bold ${gapTone}`}>{formatPercentage(medianGapPct)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] font-semibold text-gray-400">상위 25%까지</div>
                  <div className={`mt-1 text-sm font-semibold ${p75Remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {p75Remaining > 0 ? formatNumber(p75Remaining, unit) : '달성'}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b">
              조직
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              Median 대비 (금액)
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              Median 대비 (%)
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              P75까지 남은 금액
            </th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 border-b">
              밴드 (P25~P75)
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {comparisons.map((comp) => {
            const {
              org,
              medianGapAmount,
              medianGapPct,
              p75Remaining,
              bandInOut,
            } = comp;
            return (
              <tr key={`${org}-${comp.stats.scope}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-medium">
                  {orgLabels[org]}
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    medianGapAmount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {medianGapAmount >= 0 ? '+' : ''}
                  {formatNumber(medianGapAmount, unit)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    medianGapPct >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatPercentage(medianGapPct)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {p75Remaining > 0 ? (
                    <span className="text-orange-600">
                      {formatNumber(p75Remaining, unit)}
                    </span>
                  ) : (
                    <span className="text-green-600">달성</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      bandInOut === 'IN'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {bandInOut === 'IN' ? '밴드 내' : '밴드 외'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
