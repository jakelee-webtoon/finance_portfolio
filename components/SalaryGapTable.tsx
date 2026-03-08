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
    <div className="overflow-x-auto">
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
  );
}
