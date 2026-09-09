'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import { DashboardState, MonthlyPlanEntry, PlanCategory } from '@/types';
import {
  getDashboardState,
  getMonthlyPlanEntries,
  setMonthlyPlanEntries,
  syncFromFirebase,
} from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { formatKrw } from '@/lib/investments';

const MANAGED_PLAN_ITEMS = [
  {
    key: 'husband-investment',
    owner: 'husband',
    category: 'investment',
    title: '투자',
    monthlyTarget: 1_000_000,
    annualTarget: 5_000_000,
  },
  {
    key: 'husband-cash',
    owner: 'husband',
    category: 'cash_reserve',
    title: '현금 모으기',
    monthlyTarget: 300_000,
    annualTarget: 1_500_000,
  },
  {
    key: 'wife-saving',
    owner: 'wife',
    category: 'saving',
    title: '저축(마통상환)',
    monthlyTarget: 1_500_000,
    annualTarget: 7_500_000,
  },
  {
    key: 'wife-irregular',
    owner: 'wife',
    category: 'irregular_expense',
    title: '비정기 지출 모으기',
    monthlyTarget: 500_000,
    annualTarget: 2_500_000,
  },
] as const satisfies ReadonlyArray<{
  key: string;
  owner: 'husband' | 'wife';
  category: PlanCategory;
  title: string;
  monthlyTarget: number;
  annualTarget: number;
}>;

export default function MonthlyPlanPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlanEntry[]>([]);

  useEffect(() => {
    if (isAuthenticated !== true) return;

    const loadData = async () => {
      await syncFromFirebase();
      setState(getDashboardState());
      setMonthlyPlans(getMonthlyPlanEntries());
    };

    loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    const handleStateChange = () => setState(getDashboardState());
    window.addEventListener('dashboardStateChanged', handleStateChange);
    window.addEventListener('storage', handleStateChange);
    return () => {
      window.removeEventListener('dashboardStateChanged', handleStateChange);
      window.removeEventListener('storage', handleStateChange);
    };
  }, []);

  useEffect(() => {
    if (!state?.baseMonth) return;

    const ensureManagedEntries = async () => {
      const today = new Date().toISOString().split('T')[0];
      const currentUser: 'husband' | 'wife' = state.scope === 'wife' ? 'wife' : 'husband';
      let changed = false;
      const nextEntries = [...monthlyPlans];

      MANAGED_PLAN_ITEMS.forEach((item, index) => {
        const existingIndex = nextEntries.findIndex((entry) =>
          entry.month === state.baseMonth &&
          (entry.planKey === item.key ||
            (
              entry.owner === item.owner &&
              entry.category === item.category &&
              (entry.title === item.title || isLegacyManagedPlanEntry(entry, item))
            ))
        );

        if (existingIndex >= 0) {
          const existing = nextEntries[existingIndex];
          const shouldResetTarget =
            !existing.planKey ||
            (item.key === 'husband-cash' && existing.targetAmount === 600_000) ||
            existing.title !== item.title;

          if (shouldResetTarget) {
            nextEntries[existingIndex] = {
              ...existing,
              planKey: item.key,
              title: item.title,
              targetAmount: item.monthlyTarget,
              notes: existing.notes || '',
              as_of_date: today,
              last_modified_by: currentUser,
            };
            changed = true;
          }
          return;
        }

        nextEntries.push({
          id: `plan-${state.baseMonth}-${index}-${Date.now()}`,
          planKey: item.key,
          owner: item.owner,
          category: item.category,
          title: item.title,
          month: state.baseMonth,
          targetAmount: item.monthlyTarget,
          actualAmount: 0,
          isCompleted: false,
          notes: '',
          source_type: 'manual',
          as_of_date: today,
          last_modified_by: currentUser,
        });
        changed = true;
      });

      if (changed) {
        setMonthlyPlans(nextEntries);
        await setMonthlyPlanEntries(nextEntries);
      }
    };

    ensureManagedEntries();
  }, [monthlyPlans, state]);

  const currentMonthPlans = useMemo(() => {
    if (!state?.baseMonth) return [];
    const monthEntries = monthlyPlans
      .filter((entry) => entry.month === state.baseMonth)
      .filter(isManagedPlanEntry);
    if (state.scope === 'combined') return monthEntries;
    return monthEntries.filter((entry) => entry.owner === state.scope);
  }, [monthlyPlans, state]);

  const visiblePlanOwners = useMemo(() => {
    if (!state || state.scope === 'combined') return ['husband', 'wife'] as const;
    return [state.scope] as const;
  }, [state]);

  const planSummary = useMemo(() => {
    const target = currentMonthPlans.reduce((sum, entry) => sum + entry.targetAmount, 0);
    const actual = currentMonthPlans.reduce((sum, entry) => sum + (entry.actualAmount ?? 0), 0);
    const completed = currentMonthPlans.filter((entry) => entry.isCompleted).length;
    const completionRate = currentMonthPlans.length > 0 ? (completed / currentMonthPlans.length) * 100 : 0;

    return { target, actual, completed, completionRate, remaining: target - actual };
  }, [currentMonthPlans]);

  const annualProgress = useMemo(() => {
    if (!state?.baseMonth) return [];
    const year = state.baseMonth.slice(0, 4);
    const visibleItems = MANAGED_PLAN_ITEMS.filter((item) => state.scope === 'combined' || item.owner === state.scope);

    return visibleItems.map((item) => {
      const matchingEntries = monthlyPlans.filter((entry) =>
        entry.month.startsWith(year) &&
        (entry.planKey === item.key ||
          (
            entry.owner === item.owner &&
            entry.category === item.category &&
            entry.title === item.title
          ))
      );
      const actual = matchingEntries.reduce((sum, entry) => {
        if ((entry.actualAmount ?? 0) > 0) return sum + (entry.actualAmount ?? 0);
        return sum + (entry.isCompleted ? entry.targetAmount : 0);
      }, 0);
      const pct = item.annualTarget > 0 ? Math.min(100, (actual / item.annualTarget) * 100) : 0;
      return { ...item, actual, pct, remaining: Math.max(0, item.annualTarget - actual) };
    });
  }, [monthlyPlans, state]);

  const createDefaultMonthlyPlan = useCallback(async () => {
    if (!state?.baseMonth) return;
    const today = new Date().toISOString().split('T')[0];
    const currentUser: 'husband' | 'wife' = state.scope === 'wife' ? 'wife' : 'husband';
    const template = MANAGED_PLAN_ITEMS;

    const nextEntries: MonthlyPlanEntry[] = [
      ...monthlyPlans.filter((entry) => entry.month !== state.baseMonth || !isManagedPlanEntry(entry)),
      ...template.map((entry, index) => {
        const { owner, category, title, monthlyTarget } = entry;
        return {
          id: `plan-${state.baseMonth}-${index}-${Date.now()}`,
          planKey: entry.key,
          owner,
          category,
          title,
          month: state.baseMonth,
          targetAmount: monthlyTarget,
          actualAmount: 0,
          isCompleted: false,
          notes: '',
          source_type: 'manual' as const,
          as_of_date: today,
          last_modified_by: currentUser,
        };
      }),
    ];

    setMonthlyPlans(nextEntries);
    await setMonthlyPlanEntries(nextEntries);
  }, [monthlyPlans, state]);

  const updateMonthlyPlanEntry = useCallback(async (id: string, patch: Partial<MonthlyPlanEntry>) => {
    const today = new Date().toISOString().split('T')[0];
    const currentUser: 'husband' | 'wife' = state?.scope === 'wife' ? 'wife' : 'husband';
    const nextEntries = monthlyPlans.map((entry) =>
      entry.id === id ? { ...entry, ...patch, as_of_date: today, last_modified_by: currentUser } : entry
    );
    setMonthlyPlans(nextEntries);
    await setMonthlyPlanEntries(nextEntries);
  }, [monthlyPlans, state?.scope]);

  if (isAuthenticated !== true) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <Navigation />
        <div className="p-6">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <Navigation />
      <div className="px-3 py-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">월간플랜</h1>
            <p className="text-sm text-gray-500 mt-1">{state.baseMonth} 기준 투자, 저축, 현금 확보 실행표</p>
          </div>

          <div className="grid grid-cols-12 gap-4 mb-6">
            <CompactMetric label="월간 목표" value={formatKrw(planSummary.target)} />
            <CompactMetric label="월간 실적" value={formatKrw(planSummary.actual)} />
            <CompactMetric label="완료율" value={`${planSummary.completionRate.toFixed(0)}%`} />
            <CompactMetric label="남은 실행 금액" value={formatKrw(planSummary.remaining)} tone={planSummary.remaining <= 0 ? 'green' : 'rose'} />
          </div>

          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">이번 달 실행 계획</h2>
                  <p className="text-xs text-gray-500 mt-1">종한/민지별 목표와 완료 여부를 관리합니다.</p>
                </div>
                {currentMonthPlans.length === 0 ? (
                  <button
                    type="button"
                    onClick={createDefaultMonthlyPlan}
                    className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                  >
                    월간 플랜 만들기
                  </button>
                ) : (
                  <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                    완료 {planSummary.completed}/{currentMonthPlans.length}
                  </div>
                )}
              </div>

              {currentMonthPlans.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-gray-500">시트의 월별 실행표 구조를 앱용 템플릿으로 시작합니다.</p>
                  <p className="text-xs text-gray-400 mt-2">종한: 투자, 현금 모으기 · 민지: 저축(마통상환), 비정기 지출 모으기</p>
                </div>
              ) : (
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visiblePlanOwners.map((owner) => (
                    <MonthlyOwnerPlanCard
                      key={owner}
                      owner={owner}
                      entries={currentMonthPlans.filter((entry) => entry.owner === owner)}
                      onToggle={(entry) => updateMonthlyPlanEntry(entry.id, {
                        isCompleted: !entry.isCompleted,
                        actualAmount: !entry.isCompleted && (entry.actualAmount ?? 0) === 0 ? entry.targetAmount : entry.actualAmount,
                      })}
                      onAmountChange={(entry, field, amount) => updateMonthlyPlanEntry(entry.id, { [field]: amount })}
                      onNotesChange={(entry, notes) => updateMonthlyPlanEntry(entry.id, { notes })}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">2026 목표 진행</h2>
                  <p className="text-xs text-gray-500 mt-1">8월부터 12월까지 항목별 달성률</p>
                </div>
              </div>
              <div className="p-5">
                {annualProgress.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">월간 플랜을 만들면 연간 달성률이 표시됩니다.</div>
                ) : (
                  <div className="space-y-5">
                    {annualProgress.map((goal) => (
                      <div key={goal.key} className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-gray-900">{getOwnerLabel(goal.owner)} · {goal.title}</div>
                            <div className="text-xs text-gray-500">
                              {formatKrw(goal.actual)} / {formatKrw(goal.annualTarget)} · 잔여 {formatKrw(goal.remaining)}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{goal.pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${goal.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthlyOwnerPlanCard({
  owner,
  entries,
  onToggle,
  onAmountChange,
  onNotesChange,
}: {
  owner: 'husband' | 'wife';
  entries: MonthlyPlanEntry[];
  onToggle: (entry: MonthlyPlanEntry) => void;
  onAmountChange: (entry: MonthlyPlanEntry, field: 'targetAmount' | 'actualAmount', amount: number) => void;
  onNotesChange: (entry: MonthlyPlanEntry, notes: string) => void;
}) {
  const ownerEntries = [...entries].sort((a, b) => getPlanCategoryOrder(a.category) - getPlanCategoryOrder(b.category));
  const target = ownerEntries.reduce((sum, entry) => sum + entry.targetAmount, 0);
  const actual = ownerEntries.reduce((sum, entry) => sum + (entry.actualAmount ?? 0), 0);
  const completed = ownerEntries.filter((entry) => entry.isCompleted).length;
  const completionRate = ownerEntries.length > 0 ? (completed / ownerEntries.length) * 100 : 0;

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{getOwnerLabel(owner)} 월간 플랜</h3>
          <p className="text-xs text-gray-500">{formatKrw(actual)} / {formatKrw(target)}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-bold text-blue-600 ring-1 ring-gray-100">
          {completionRate.toFixed(0)}%
        </span>
      </div>
      <div className="space-y-2">
        {ownerEntries.map((entry) => (
          <div key={entry.id} className="rounded-lg bg-white p-3 ring-1 ring-gray-100">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={entry.isCompleted}
                onChange={() => onToggle(entry)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{entry.title}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                    {getPlanCategoryLabel(entry.category)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <AmountInput
                    label="목표"
                    value={entry.targetAmount}
                    onCommit={(amount) => onAmountChange(entry, 'targetAmount', amount)}
                  />
                  <AmountInput
                    label="실적"
                    value={entry.actualAmount ?? 0}
                    onCommit={(amount) => onAmountChange(entry, 'actualAmount', amount)}
                  />
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-gray-500">비고</span>
                  <input
                    type="text"
                    defaultValue={entry.notes || ''}
                    onBlur={(event) => onNotesChange(entry, event.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="메모를 입력하세요"
                  />
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AmountInput({ label, value, onCommit }: { label: string; value: number; onCommit: (amount: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span>
      <div className="relative">
        <input
          type="number"
          min="0"
          step="10000"
          defaultValue={value}
          onBlur={(event) => onCommit(Number(event.target.value || 0))}
          className="w-full rounded-md border border-gray-200 px-3 py-2 pr-8 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">원</span>
      </div>
    </label>
  );
}

function CompactMetric({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'green' | 'rose' }) {
  const toneClass = tone === 'green' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-gray-900';
  return (
    <div className="col-span-12 sm:col-span-6 lg:col-span-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tracking-tight ${toneClass}`}>{value}</div>
    </div>
  );
}

function getPlanCategoryLabel(category: PlanCategory): string {
  const labels: Record<PlanCategory, string> = {
    income: '수입',
    fixed_expense: '고정비',
    saving: '저축/상환',
    investment: '투자',
    irregular_expense: '비정기지출',
    cash_reserve: '현금',
    allowance: '용돈',
    debt_repayment: '부채상환',
  };
  return labels[category];
}

function getPlanCategoryOrder(category: PlanCategory): number {
  const order: Record<PlanCategory, number> = {
    income: 0,
    fixed_expense: 1,
    investment: 2,
    saving: 3,
    cash_reserve: 4,
    irregular_expense: 5,
    allowance: 6,
    debt_repayment: 7,
  };
  return order[category];
}

function isManagedPlanEntry(entry: MonthlyPlanEntry): boolean {
  return MANAGED_PLAN_ITEMS.some((item) =>
    entry.planKey === item.key ||
    (
      item.owner === entry.owner &&
      item.category === entry.category &&
      item.title === entry.title
    )
  );
}

function isLegacyManagedPlanEntry(entry: MonthlyPlanEntry, item: (typeof MANAGED_PLAN_ITEMS)[number]): boolean {
  return (
    (item.key === 'wife-saving' && entry.owner === 'wife' && entry.category === 'saving' && entry.title === '저축/상환') ||
    (item.key === 'wife-irregular' && entry.owner === 'wife' && entry.category === 'irregular_expense' && entry.title === '비정기지출 준비')
  );
}

function getOwnerLabel(owner: string): string {
  const labels: Record<string, string> = {
    husband: '종한',
    wife: '민지',
    joint: '공동',
  };
  return labels[owner] || owner;
}
