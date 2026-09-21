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

  const getPercentiles = (stat: NaverSalaryStats) => ({
    p90: stat.p90 ?? Math.round(stat.p75 + (stat.max - stat.p75) * (90 - 75) / (100 - 75)),
    p95: stat.p95 ?? Math.round(stat.p75 + (stat.max - stat.p75) * (95 - 75) / (100 - 75)),
  });

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {comparisons.map((comp) => {
          const { stats: stat, medianGapPct, percentile } = comp;
          const { p90, p95 } = getPercentiles(stat);
          const values = [
            ['MIN', stat.min],
            ['하위 25%', stat.p25],
            ['중위', stat.median],
            ['평균', stat.avg],
            ['상위 25%', stat.p75],
            ['상위 10%', p90],
            ['상위 5%', p95],
            ['MAX', stat.max],
          ] as const;

          return (
            <article key={`${stat.org}-${stat.scope}`} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="font-bold text-gray-900">{orgLabels[stat.org]}</div>
                <div className={`text-right text-sm font-semibold ${medianGapPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <div>중위 대비 {formatPercentage(medianGapPct)}</div>
                  {percentile && <div className="mt-0.5 text-xs font-normal text-gray-500">{percentile}</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {values.map(([label, value]) => (
                  <div key={label}>
                    <div className="text-[11px] font-semibold text-gray-400">{label}</div>
                    <div className={`mt-1 text-sm text-gray-700 ${label === '중위' ? 'font-bold' : 'font-medium'}`}>
                      {formatNumber(value, unit)}
                    </div>
                  </div>
                ))}
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
            
            const { p90, p95 } = getPercentiles(stat);
            
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
    </>
  );
}
