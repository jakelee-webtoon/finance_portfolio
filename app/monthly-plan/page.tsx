'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { MANAGED_PLAN_ITEMS, getPlanMonthlyTarget, getPlanAnnualTarget, getManagedPlanItem, getPlanActualAmount, defaultPlanId } from '@/lib/monthlyPlans';
import { seoulDate } from '@/lib/calendar';
import MobileHelp from '@/components/MobileHelp';
import { DashboardState, MonthlyPlanEntry, PlanCategory } from '@/types';
import {
  getDashboardState,
  getMonthlyPlanEntries,
  upsertMonthlyPlanEntries,
  syncFromFirebase,
} from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { formatKrw } from '@/lib/investments';

const ANNUAL_ACTUAL_COLORS = ['#0088fe', '#00bfa5', '#f59e0b', '#6366f1', '#a855f7', '#f43f5e'];

const GOAL_PLAN_KEYS = new Set([
  'husband-investment',
  'husband-cash',
  'wife-saving',
  'wife-irregular',
]);

export default function MonthlyPlanPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlanEntry[]>([]);
  const [hasLoadedMonthlyPlans, setHasLoadedMonthlyPlans] = useState(false);

  useEffect(() => {
    if (isAuthenticated !== true) return;

    const loadData = async () => {
      await syncFromFirebase({ force: true });
      setState(getDashboardState());
      setMonthlyPlans(getMonthlyPlanEntries());
      setHasLoadedMonthlyPlans(true);
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
    const actual = currentMonthPlans.reduce((sum, entry) => sum + getPlanActualAmount(entry), 0);
    const completed = currentMonthPlans.filter((entry) => entry.isCompleted).length;
    const completionRate = currentMonthPlans.length > 0 ? (completed / currentMonthPlans.length) * 100 : 0;

    return { target, actual, completed, completionRate, remaining: target - actual };
  }, [currentMonthPlans]);

  const annualProgress = useMemo(() => {
    if (!state?.baseMonth) return [];
    const year = state.baseMonth.slice(0, 4);
    const visibleItems = MANAGED_PLAN_ITEMS.filter((item) =>
      GOAL_PLAN_KEYS.has(item.key) &&
      (state.scope === 'combined' || item.owner === state.scope)
    );

    return visibleItems.map((item) => {
      const matchingEntries = monthlyPlans.filter(entry =>
        entry.month.startsWith(`${year}-`) && getManagedPlanItem(entry)?.key === item.key
      );
      const annualTarget = getPlanAnnualTarget(item, year);
      const actual = matchingEntries.reduce((sum, entry) => sum + getPlanActualAmount(entry), 0);
      const pct = annualTarget > 0 ? Math.min(100, (actual / annualTarget) * 100) : 0;
      const currentEntry = matchingEntries.find((entry) => entry.month === state.baseMonth);
      return {
        ...item,
        title: currentEntry?.title || item.title,
        annualTarget,
        actual,
        pct,
        remaining: Math.max(0, annualTarget - actual),
      };
    });
  }, [monthlyPlans, state]);

  const annualActuals = useMemo(() => {
    if (!state?.baseMonth) return [];
    const year = state.baseMonth.slice(0, 4);
    return MANAGED_PLAN_ITEMS.map((item, index) => {
      const entries = monthlyPlans.filter((entry) =>
        entry.month.startsWith(`${year}-`) && getManagedPlanItem(entry)?.key === item.key
      );
      return {
        key: item.key,
        owner: item.owner,
        name: `${getOwnerLabel(item.owner)} · ${entries.find((entry) => entry.month === state.baseMonth)?.title || item.title}`,
        actual: entries.reduce((sum, entry) => sum + getPlanActualAmount(entry), 0),
        color: ANNUAL_ACTUAL_COLORS[index],
      };
    }).filter((item) => state.scope === 'combined' || item.owner === state.scope);
  }, [monthlyPlans, state]);
  const annualActualTotal = annualActuals.reduce((sum, item) => sum + item.actual, 0);

  const createDefaultMonthlyPlan = useCallback(async () => {
    if (!hasLoadedMonthlyPlans || !state?.baseMonth) return;
    const today = seoulDate();
    const currentUser: 'husband' | 'wife' = state.scope === 'wife' ? 'wife' : 'husband';
    const missingEntries: MonthlyPlanEntry[] = MANAGED_PLAN_ITEMS
      .filter(item => !monthlyPlans.some(entry =>
        entry.month === state.baseMonth &&
        (entry.planKey === item.key || (
          entry.owner === item.owner &&
          entry.category === item.category &&
          getManagedPlanItem(entry)?.key === item.key
        ))
      ))
      .map((entry) => {
        const { owner, category, title } = entry;
        const monthlyTarget = getPlanMonthlyTarget(entry, state.baseMonth);
        return {
          id: defaultPlanId(state.baseMonth, entry.key),
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
      });

    if (missingEntries.length === 0) return;
    const nextEntries = [...monthlyPlans, ...missingEntries];
    setMonthlyPlans(nextEntries);
    await upsertMonthlyPlanEntries(missingEntries, monthlyPlans);
  }, [hasLoadedMonthlyPlans, monthlyPlans, state]);

  const updateMonthlyPlanEntry = useCallback(async (id: string, patch: Partial<MonthlyPlanEntry>) => {
    if (!hasLoadedMonthlyPlans) return;
    const today = seoulDate();
    const currentUser: 'husband' | 'wife' = state?.scope === 'wife' ? 'wife' : 'husband';
    let updatedEntry: MonthlyPlanEntry | undefined;
    const nextEntries = monthlyPlans.map((entry) => {
      if (entry.id !== id) return entry;
      updatedEntry = { ...entry, ...patch, as_of_date: today, last_modified_by: currentUser };
      return updatedEntry;
    });
    if (!updatedEntry) return;
    setMonthlyPlans(nextEntries);
    await upsertMonthlyPlanEntries([updatedEntry], monthlyPlans);
  }, [hasLoadedMonthlyPlans, monthlyPlans, state?.scope]);

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

  if (!state || !hasLoadedMonthlyPlans) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="px-3 py-4 sm:p-6">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-w-0 max-w-[100vw] overflow-x-clip bg-gray-50">
      <div className="min-w-0 px-3 py-4 sm:p-6">
        <div className="mx-auto max-w-7xl min-w-0">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">월간플랜</h1>
              <MobileHelp label="월간플랜 기준">
                {state.baseMonth} 기준 투자, 저축, 현금 확보 실행표입니다.
              </MobileHelp>
            </div>
            <p className="mt-1 hidden text-sm text-gray-500 md:block">{state.baseMonth} 기준 투자, 저축, 현금 확보 실행표</p>
          </div>

          <div className="mobile-metrics grid grid-cols-12 gap-4 mb-6">
            <CompactMetric label="월간 목표" value={formatKrw(planSummary.target)} />
            <CompactMetric label="월간 실적" value={formatKrw(planSummary.actual)} />
            <CompactMetric label="완료율" value={`${planSummary.completionRate.toFixed(0)}%`} />
            <CompactMetric label="남은 실행 금액" value={formatKrw(planSummary.remaining)} tone={planSummary.remaining <= 0 ? 'green' : 'rose'} />
          </div>

          <div className="grid min-w-0 grid-cols-12 items-start gap-6">
            <div className="col-span-12 min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:col-span-8">
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
                  <p className="text-xs text-gray-400 mt-2">종한: 투자, 현금 모으기, 주담대 원리금 · 민지: 저축(마통상환), 비정기 지출 모으기, 생활비</p>
                </div>
              ) : (
                <div className="grid min-w-0 grid-cols-1 gap-4 p-5 md:grid-cols-2">
                  {visiblePlanOwners.map((owner) => (
                    <MonthlyOwnerPlanCard
                      key={owner}
                      owner={owner}
                      entries={currentMonthPlans.filter((entry) => entry.owner === owner)}
                      onToggle={(entry) => updateMonthlyPlanEntry(entry.id, {
                        isCompleted: !entry.isCompleted,
                        actualAmount: !entry.isCompleted ? entry.targetAmount : entry.actualAmount,
                      })}
                      onAmountChange={(entry, field, amount) => updateMonthlyPlanEntry(entry.id, { [field]: amount })}
                      onTitleChange={(entry, title) => updateMonthlyPlanEntry(entry.id, {
                        title,
                        planKey: entry.planKey || getManagedPlanItem(entry)?.key,
                      })}
                      onNotesChange={(entry, notes) => updateMonthlyPlanEntry(entry.id, { notes })}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-12 min-w-0 space-y-6 lg:col-span-4">
            <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{state.baseMonth.slice(0, 4)} 목표 진행</h2>
                  <p className="text-xs text-gray-500 mt-1">{state.baseMonth.startsWith('2026-') ? '8~12월' : '1~12월'} 목표 기준 · 선택 연도 실적 합산</p>
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
            <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm" aria-labelledby="annual-actuals-title">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-6">
                <h2 id="annual-actuals-title" className="text-lg font-bold text-gray-900">{state.baseMonth.slice(0, 4)} 연간 실적</h2>
                <span className="text-xs font-medium text-gray-400">항목별 비중</span>
              </div>
              <p className="mt-2 px-5 text-xs text-gray-400">1월~12월에 입력한 실적 기준</p>
              <div className="p-5">
                {annualActualTotal > 0 ? (
                  <div className="relative my-5 h-72 w-full" role="img" aria-label="연간 실적 항목별 비중. 상세 금액과 비중은 아래 목록에 표시됩니다.">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={annualActuals.filter((item) => item.actual > 0)} dataKey="actual" nameKey="name" cx="50%" cy="50%" innerRadius="53%" outerRadius="73%" paddingAngle={3} stroke="#fff" strokeWidth={2} labelLine={false}
                          label={({ cx, cy, midAngle, outerRadius, percent, fill }) => {
                            if (percent < 0.04) return null;
                            const angle = -midAngle * Math.PI / 180;
                            const radius = outerRadius + 16;
                            return <text x={cx + radius * Math.cos(angle)} y={cy + radius * Math.sin(angle)} fill={fill} textAnchor={Math.cos(angle) >= 0 ? 'start' : 'end'} dominantBaseline="central" fontSize={12} fontWeight={600}>{(percent * 100).toFixed(0)}%</text>;
                          }}>
                          {annualActuals.filter((item) => item.actual > 0).map((item) => (
                            <Cell key={item.key} fill={item.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 8px 28px rgba(0,0,0,0.10)' }}
                          formatter={(value: number, name: string) => [formatKrw(value), name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-gray-400">연간 총실적</span>
                      <span className="mt-1 text-xl font-bold text-gray-900">
                        {new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(annualActualTotal)}원
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-gray-400">실적을 입력하면 연간 파이그래프가 표시됩니다.</div>
                )}
                <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-4">
                  {annualActuals.map((item) => (
                    <li key={item.key} className="flex min-w-0 items-start gap-2 text-xs">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <div>
                          <div className="font-medium" style={{ color: item.color }}>{item.name}</div>
                          <div className="mt-1 text-gray-500">{formatKrw(item.actual)} · {(annualActualTotal > 0 ? item.actual / annualActualTotal * 100 : 0).toFixed(1)}%</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
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
  onTitleChange,
  onNotesChange,
}: {
  owner: 'husband' | 'wife';
  entries: MonthlyPlanEntry[];
  onToggle: (entry: MonthlyPlanEntry) => void;
  onAmountChange: (entry: MonthlyPlanEntry, field: 'targetAmount' | 'actualAmount', amount: number) => void;
  onTitleChange: (entry: MonthlyPlanEntry, title: string) => void;
  onNotesChange: (entry: MonthlyPlanEntry, notes: string) => void;
}) {
  const ownerEntries = [...entries].sort((a, b) => getPlanCategoryOrder(a.category) - getPlanCategoryOrder(b.category));
  const target = ownerEntries.reduce((sum, entry) => sum + entry.targetAmount, 0);
  const actual = ownerEntries.reduce((sum, entry) => sum + getPlanActualAmount(entry), 0);
  const completed = ownerEntries.filter((entry) => entry.isCompleted).length;
  const completionRate = ownerEntries.length > 0 ? (completed / ownerEntries.length) * 100 : 0;

  return (
    <div className="min-w-0 max-w-full rounded-xl border border-gray-100 bg-gray-50/40 p-4">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">{getOwnerLabel(owner)} 월간 플랜</h3>
          <p className="text-xs text-gray-500">{formatKrw(actual)} / {formatKrw(target)}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-bold text-blue-600 ring-1 ring-gray-100">
          {completionRate.toFixed(0)}%
        </span>
      </div>
      <div className="space-y-2">
        {ownerEntries.map((entry) => (
          <div key={entry.id} className="min-w-0 rounded-lg bg-white p-3 ring-1 ring-gray-100">
            <div className="flex min-w-0 items-start gap-3">
              <input
                type="checkbox"
                checked={entry.isCompleted}
                onChange={() => onToggle(entry)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    defaultValue={entry.title}
                    aria-label={`${getOwnerLabel(owner)} 플랜 항목명`}
                    onBlur={(event) => {
                      const title = event.target.value.trim();
                      if (!title) {
                        event.target.value = entry.title;
                        return;
                      }
                      if (title !== entry.title) onTitleChange(entry, title);
                    }}
                    className="min-w-0 flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-gray-800 outline-none hover:border-gray-200 focus:border-blue-400"
                  />
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                    {getPlanCategoryLabel(entry.category)}
                  </span>
                </div>
                <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                  <AmountInput
                    label="목표"
                    value={entry.targetAmount}
                    onCommit={(amount) => onAmountChange(entry, 'targetAmount', amount)}
                  />
                  <AmountInput
                    label="실적"
                    value={getPlanActualAmount(entry)}
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
  const [draft, setDraft] = useState(formatAmountInput(value));

  useEffect(() => {
    setDraft(formatAmountInput(value));
  }, [value]);

  const commit = () => {
    const amount = parseAmountInput(draft);
    setDraft(formatAmountInput(amount));
    if (amount !== value) onCommit(amount);
  };

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^0-9]/g, '');
            setDraft(digits ? formatAmountInput(Number(digits)) : '');
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="monthly-amount-input w-full rounded-md border border-gray-200 px-3 py-2 pr-8 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <span className="monthly-amount-suffix pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">원</span>
      </div>
    </label>
  );
}

function parseAmountInput(value: string): number {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function formatAmountInput(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.max(0, Math.floor(value)));
}

function CompactMetric({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'green' | 'rose' }) {
  const toneClass = tone === 'green' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-gray-900';
  return (
    <div className="col-span-12 min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:col-span-6 lg:col-span-3">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={`mt-2 min-w-0 text-lg font-bold sm:text-2xl ${toneClass}`}>{value}</div>
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
    investment: 1,
    cash_reserve: 2,
    saving: 3,
    irregular_expense: 4,
    fixed_expense: 5,
    allowance: 6,
    debt_repayment: 7,
  };
  return order[category];
}

function isManagedPlanEntry(entry: MonthlyPlanEntry): boolean {
  return getManagedPlanItem(entry) != null;
}

function getOwnerLabel(owner: string): string {
  const labels: Record<string, string> = {
    husband: '종한',
    wife: '민지',
    joint: '공동',
  };
  return labels[owner] || owner;
}
