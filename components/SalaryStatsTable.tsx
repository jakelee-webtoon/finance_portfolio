'use client';

import { NaverSalaryStats, NaverOrg } from '@/types';
import { orgLabels, calculateComparison } from '@/lib/salaryComparison';
import { formatCurrency, formatPercentage, formatNumber } from '@/lib/salaryFormat';

interface SalaryStatsTableProps {
  stats: NaverSalaryStats[];
  mySalary: number;
  unit: '만원' | '원';
}

export default function SalaryStatsTable({
  stats,
  mySalary,
  unit,
}: SalaryStatsTableProps) {
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
              MIN
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              하위 25%
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              중위
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              평균
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              상위 25%
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              상위 10%
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              상위 5%
            </th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700 border-b">
              Max
            </th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700 border-b">
              내위치
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {comparisons.map((comp) => {
            const { stats: stat, medianGapPct, percentile } = comp;
            
            // P90, P95 계산 (P75와 Max 사이를 선형 보간)
            // P75 = 75%, Max = 100%로 가정하고 선형 보간
            const p90 = stat.p90 ?? Math.round(stat.p75 + (stat.max - stat.p75) * (90 - 75) / (100 - 75));
            const p95 = stat.p95 ?? Math.round(stat.p75 + (stat.max - stat.p75) * (95 - 75) / (100 - 75));
            
            return (
              <tr key={`${stat.org}-${stat.scope}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-medium">
                  {orgLabels[stat.org]}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatNumber(stat.min, unit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatNumber(stat.p25, unit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700 font-semibold">
                  {formatNumber(stat.median, unit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatNumber(stat.avg, unit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatNumber(stat.p75, unit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatNumber(p90, unit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatNumber(p95, unit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatNumber(stat.max, unit)}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`font-medium ${
                        medianGapPct >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      중위 대비 {formatPercentage(medianGapPct)}
                    </span>
                    {percentile && (
                      <span className="text-xs text-gray-500">({percentile})</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
