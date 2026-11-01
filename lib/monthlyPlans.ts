import type { MonthlyPlanEntry, PlanCategory } from '../types';

// An explicitly entered zero is an actual zero. Only old rows without an actual
// amount use the completion checkbox as a fallback.
export function getPlanActualAmount(entry: MonthlyPlanEntry): number {
  return Math.max(0, entry.actualAmount ?? (entry.isCompleted ? entry.targetAmount : 0));
}

export const MANAGED_PLAN_ITEMS = [
  { key: 'husband-investment', owner: 'husband', category: 'investment', title: '투자', monthlyTarget: 1_000_000 },
  { key: 'husband-cash', owner: 'husband', category: 'cash_reserve', title: '현금 모으기', monthlyTarget: 300_000 },
  { key: 'husband-mortgage', owner: 'husband', category: 'fixed_expense', title: '주담대 원리금', monthlyTarget: 3_000_000 },
  { key: 'wife-saving', owner: 'wife', category: 'saving', title: '저축(마통상환)', monthlyTarget: 1_500_000 },
  { key: 'wife-irregular', owner: 'wife', category: 'irregular_expense', title: '비정기 지출 모으기', monthlyTarget: 500_000 },
  { key: 'wife-living-cost', owner: 'wife', category: 'fixed_expense', title: '생활비', monthlyTarget: 2_000_000 },
] as const satisfies ReadonlyArray<{
  key: string; owner: 'husband' | 'wife'; category: PlanCategory; title: string; monthlyTarget: number;
}>;

export function getManagedPlanItem(entry: MonthlyPlanEntry) {
  return MANAGED_PLAN_ITEMS.find(item => entry.planKey === item.key || (
    entry.owner === item.owner && entry.category === item.category &&
    (entry.title === item.title ||
      (item.key === 'wife-saving' && entry.title === '저축/상환') ||
      (item.key === 'wife-irregular' && entry.title === '비정기지출 준비'))
  ));
}

export function getPlanMonthlyTarget(item: (typeof MANAGED_PLAN_ITEMS)[number], month: string): number {
  if (item.key === 'husband-cash' && month >= '2026-09') return 600_000;
  if (item.key === 'wife-saving' && month === '2026-08') return 1_300_000;
  return item.monthlyTarget;
}

export function getPlanAnnualTarget(item: (typeof MANAGED_PLAN_ITEMS)[number], year: string): number {
  const firstMonth = year === '2026' ? 8 : 1;
  return Array.from({ length: 13 - firstMonth }, (_, i) => `${year}-${String(i + firstMonth).padStart(2, '0')}`)
    .reduce((sum, month) => sum + getPlanMonthlyTarget(item, month), 0);
}

export function defaultPlanId(month: string, key: string): string {
  return `plan-${month}-${key}`;
}
