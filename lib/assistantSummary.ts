import { buildFinanceSnapshot } from '@/lib/assistantSnapshot';
import { calculateFinancialSummary } from '@/lib/financialSummary';
import {
  getAssets,
  getAssistantSummaries,
  getDashboardState,
  getIncome,
  getLedgerEntries,
  getLiabilities,
  getMonthlyPlanEntries,
  getStockHoldings,
  upsertAssistantSummaries,
} from '@/lib/store';
import type { Asset, AssistantSummary, DashboardState, Income, LedgerEntry, Liability, MonthlyPlanEntry, StockHolding } from '@/types';

const ASSISTANT_EXCHANGE_RATES = {
  USD_TO_KRW: 1300,
  EUR_TO_KRW: 1300 / 0.92,
};

const CATEGORY_LABELS: Record<string, string> = {
  cash: '현금성',
  stocks: '주식/ETF',
  bonds: '채권',
  real_estate: '부동산',
  other: '기타',
  loan: '대출',
  credit_card: '카드',
  mortgage: '주택담보',
  transportation: '교통',
  management_fee: '관리비',
  communication: '통신',
  insurance: '보험',
  ott: '구독/OTT',
  interest: '이자',
  other_fixed: '기타 고정비',
  food: '식비',
  shopping_clothing: '의류 쇼핑',
  shopping_beauty: '뷰티 쇼핑',
  shopping_other: '기타 쇼핑',
  coffee: '카페',
  books: '도서',
  exhibition: '문화/전시',
  other_variable: '기타 변동비',
  salary: '급여',
  stock_profit: '투자수익',
  other_income: '기타수입',
  pension_insurance: '연금/보험저축',
  savings: '저축',
  travel_savings: '여행저축',
  isa: 'ISA',
  housing_subscription: '청약',
  other_savings: '기타저축',
};

function pct(amount: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((amount / total) * 1000) / 10;
}

function nullablePct(amount: number, total: number) {
  if (total <= 0) return null;
  return Math.round((amount / total) * 1000) / 10;
}

function krw(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}원`;
}

function linePercent(label: string, amount: number, total: number) {
  return `${CATEGORY_LABELS[label] ?? label} ${krw(amount)} (${pct(amount, total)}%)`;
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function weekStartKey(date: string) {
  const value = new Date(`${date}T00:00:00+09:00`);
  const day = value.getDay();
  value.setDate(value.getDate() - ((day + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function cashflowTotals(entries: LedgerEntry[]) {
  const income = entries.filter((entry) => entry.type === 'income').reduce((sum, entry) => sum + entry.amount, 0);
  const expense = entries.filter((entry) => entry.type === 'expense_fixed' || entry.type === 'expense_variable').reduce((sum, entry) => sum + entry.amount, 0);
  const savings = entries.filter((entry) => entry.type === 'savings').reduce((sum, entry) => sum + entry.amount, 0);
  return {
    income,
    expense,
    savings,
    netCashflow: income - expense - savings,
    savingsRate: nullablePct(savings, income),
  };
}

function previousMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  const total = year * 12 + value - 2;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function previousMonths(month: string, count: number) {
  const [year, value] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const total = year * 12 + value - count + index;
    const itemYear = Math.floor(total / 12);
    const itemMonth = (total % 12) + 1;
    return `${itemYear}-${String(itemMonth).padStart(2, '0')}`;
  });
}

function compactMerchant(entry: LedgerEntry) {
  return (entry.subcategory || entry.notes || entry.category).replace(/\s+/g, ' ').trim().slice(0, 40) || entry.category;
}

function buildAggregates(
  month: string,
  ledgerEntries: LedgerEntry[],
  monthlyPlans: MonthlyPlanEntry[],
  cashflow: ReturnType<typeof buildFinanceSnapshot>,
  counts: { assetCount: number; cashAssetCount: number; liabilityCount: number; holdingCount: number; incomeCount: number }
): AssistantSummary['aggregates'] {
  const monthsCovered = [...new Set([...previousMonths(month, 6), ...ledgerEntries.map((entry) => entry.month || monthKey(entry.date))])].sort();
  const monthlyCashflow = monthsCovered.map((entryMonth) => ({
    month: entryMonth,
    ...cashflowTotals(ledgerEntries.filter((entry) => (entry.month || monthKey(entry.date)) === entryMonth)),
  })).slice(-12);

  const weeks = new Map<string, LedgerEntry[]>();
  for (const entry of ledgerEntries.filter((item) => (item.month || monthKey(item.date)) === month)) {
    const key = weekStartKey(entry.date);
    weeks.set(key, [...(weeks.get(key) ?? []), entry]);
  }
  const weeklyCashflow = [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, entries]) => {
      const totals = cashflowTotals(entries);
      return {
        weekStart,
        weekEnd: addDays(weekStart, 6),
        income: totals.income,
        expense: totals.expense,
        savings: totals.savings,
        netCashflow: totals.netCashflow,
      };
    });

  const plans = monthlyPlans.filter((entry) => entry.month === month);
  const budgetByCategory = new Map<string, number>();
  for (const plan of plans) budgetByCategory.set(plan.category, (budgetByCategory.get(plan.category) ?? 0) + plan.targetAmount);
  const previousByCategory = new Map<string, number>();
  for (const entry of ledgerEntries.filter((item) => (item.month || monthKey(item.date)) === previousMonth(month) && (item.type === 'expense_fixed' || item.type === 'expense_variable'))) {
    previousByCategory.set(entry.category, (previousByCategory.get(entry.category) ?? 0) + entry.amount);
  }
  const categorySpend = cashflow.categories.map((entry) => {
    const budget = budgetByCategory.get(entry.name);
    const previousAmount = previousByCategory.get(entry.name);
    return {
      category: CATEGORY_LABELS[entry.name] ?? entry.name,
      amount: entry.spent,
      sharePercent: pct(entry.spent, cashflow.totals.expense),
      budget,
      budgetUsedPercent: budget ? pct(entry.spent, budget) : undefined,
      previousAmount,
      deltaFromPrevious: previousAmount === undefined ? undefined : entry.spent - previousAmount,
    };
  });
  const targetTotal = plans.reduce((sum, entry) => sum + entry.targetAmount, 0);
  const actualTotal = plans.reduce((sum, entry) => sum + (entry.actualAmount ?? 0), 0);
  const fixedEntries = ledgerEntries.filter((entry) => entry.month === month && entry.is_fixed && (entry.type === 'expense_fixed' || entry.type === 'savings'));
  const fixedAmount = fixedEntries.reduce((sum, entry) => sum + entry.amount, 0);

  return {
    dataQuality: {
      assetCount: counts.assetCount,
      cashAssetCount: counts.cashAssetCount,
      liabilityCount: counts.liabilityCount,
      holdingCount: counts.holdingCount,
      incomeCount: counts.incomeCount,
      ledgerEntryCount: ledgerEntries.length,
      currentMonthLedgerEntryCount: ledgerEntries.filter((entry) => (entry.month || monthKey(entry.date)) === month).length,
      planEntryCount: monthlyPlans.length,
      monthsCovered,
    },
    monthlyCashflow,
    weeklyCashflow,
    categorySpend,
    budgetStatus: {
      targetTotal,
      actualTotal,
      remaining: targetTotal - actualTotal,
      completedCount: plans.filter((entry) => entry.isCompleted).length,
      totalCount: plans.length,
      overBudget: plans
        .filter((entry) => (entry.actualAmount ?? 0) > entry.targetAmount)
        .map((entry) => ({ title: entry.title, category: CATEGORY_LABELS[entry.category] ?? entry.category, amount: entry.actualAmount ?? 0, budget: entry.targetAmount, overBy: (entry.actualAmount ?? 0) - entry.targetAmount }))
        .sort((a, b) => b.overBy - a.overBy)
        .slice(0, 8),
    },
    fixedCosts: {
      amount: fixedAmount,
      incomePercent: nullablePct(fixedAmount, cashflow.totals.income),
      items: fixedEntries
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 12)
        .map((entry) => ({ title: compactMerchant(entry), amount: entry.amount, category: CATEGORY_LABELS[entry.category] ?? entry.category })),
    },
    recurringPayments: cashflow.recurringPayments,
    upcomingBills: cashflow.upcomingBills,
    riskSignals: cashflow.alerts,
  };
}

function buildBriefings(summary: ReturnType<typeof calculateFinancialSummary>, cashflow: ReturnType<typeof buildFinanceSnapshot>, aggregates: AssistantSummary['aggregates']) {
  const topCategories = aggregates.categorySpend.slice(0, 3).map((entry) => `${entry.category} ${krw(entry.amount)} (${entry.sharePercent}%)`);
  const overBudget = aggregates.budgetStatus.overBudget.slice(0, 3).map((entry) => `${entry.title} ${krw(entry.overBy)} 초과`);
  const usesLedger = aggregates.dataQuality.currentMonthLedgerEntryCount > 0;
  return {
    monthly: usesLedger ? [
      `순자산은 ${krw(summary.netWorth)}이고 이번 달 순현금흐름은 ${krw(cashflow.totals.netCashflow)}입니다.`,
      `수입 ${krw(cashflow.totals.income)}, 지출 ${krw(cashflow.totals.expense)}, 저축 ${krw(cashflow.totals.savings)}입니다.`,
      `저축률은 ${cashflow.totals.savingsRate === null ? '계산 불가' : `${cashflow.totals.savingsRate}%`}입니다.`,
    ] : [
      '현금/수입/가계부 탭은 아직 사용 중이 아니라 월간 수입·지출·저축률은 계산하지 않습니다.',
      `자산/부채 기준 순자산은 ${krw(summary.netWorth)}입니다.`,
    ],
    spending: usesLedger && topCategories.length ? topCategories : ['가계부 탭 데이터가 없어 지출 패턴은 계산하지 않습니다.'],
    budget: [
      `월간플랜 목표 ${krw(aggregates.budgetStatus.targetTotal)}, 실적 ${krw(aggregates.budgetStatus.actualTotal)}, 잔여 ${krw(aggregates.budgetStatus.remaining)}입니다.`,
      overBudget.length ? `예산 초과: ${overBudget.join(' · ')}` : '예산 초과 항목은 계산되지 않았습니다.',
    ],
    cashflow: usesLedger ? [
      `고정비/저축성 반복 항목은 ${krw(aggregates.fixedCosts.amount)}로 수입 대비 ${aggregates.fixedCosts.incomePercent === null ? '계산 불가' : `${aggregates.fixedCosts.incomePercent}%`}입니다.`,
      aggregates.weeklyCashflow.length ? `최근 주차 순현금흐름: ${aggregates.weeklyCashflow.map((entry) => `${entry.weekStart} ${krw(entry.netCashflow)}`).slice(-4).join(' · ')}` : '주차별 현금흐름 데이터가 부족합니다.',
    ] : ['현금흐름은 가계부 또는 수입 데이터가 들어오면 자동으로 계산합니다.'],
    assets: [
      `자산 ${krw(summary.totalAssets)}, 부채 ${krw(summary.totalLiabilities)}, 순자산 ${krw(summary.netWorth)}입니다.`,
      `자산 데이터 ${aggregates.dataQuality.assetCount}건, 부채 ${aggregates.dataQuality.liabilityCount}건, 보유종목 ${aggregates.dataQuality.holdingCount}건 기준입니다.`,
    ],
  };
}

function buildIdeas(summary: ReturnType<typeof calculateFinancialSummary>, cashflow: ReturnType<typeof buildFinanceSnapshot>, aggregates: AssistantSummary['aggregates']) {
  const ideas: string[] = [];
  const cashAmount = summary.assetCategoryTotals.find((item) => item.category === 'cash' && !item.isOther)?.amount ?? 0;
  const stockAmount = summary.assetCategoryTotals.find((item) => item.category === 'stocks' && !item.isOther)?.amount ?? 0;
  const realEstateAmount = summary.assetCategoryTotals.find((item) => item.category === 'real_estate' && !item.isOther)?.amount ?? 0;
  const assetTotal = Math.max(summary.totalAssets, 1);
  const liabilityRatio = pct(summary.totalLiabilities, summary.totalAssets);

  if (pct(cashAmount, assetTotal) < 10) ideas.push('현금성 자산 비중이 낮습니다. 단기 지출·비상금 커버 기간을 먼저 확인하세요.');
  if (pct(stockAmount, assetTotal) > 60) ideas.push('주식/ETF 비중이 높습니다. 변동성 감내 범위와 리밸런싱 기준을 정해두는 것이 좋습니다.');
  if (pct(realEstateAmount, assetTotal) > 70) ideas.push('부동산 비중이 높습니다. 유동성 부족과 대출 상환 부담을 함께 점검하세요.');
  if (liabilityRatio > 40) ideas.push('자산 대비 부채 비율이 높습니다. 고금리 부채와 월 상환액을 우선순위로 분리해 보세요.');
  if (cashflow.totals.savingsRate !== null && cashflow.totals.savingsRate < 20) ideas.push('저축률이 낮은 편입니다. 고정비와 반복 결제부터 줄일 여지를 찾는 것이 현실적입니다.');
  if (aggregates.budgetStatus.overBudget.length) ideas.push('예산 초과 항목이 있습니다. 초과액이 큰 항목부터 다음 달 목표를 조정하거나 지출을 쪼개 보세요.');
  if (cashflow.alerts.some((alert) => alert.level === 'critical')) ideas.push('이번 달 critical 알림이 있습니다. 새 투자보다 현금흐름 안정화를 먼저 확인하세요.');
  if (!ideas.length) ideas.push('큰 위험 신호는 계산되지 않았습니다. 목표 비중을 정하고 월 1회 리밸런싱 여부만 점검해도 충분합니다.');

  return ideas.slice(0, 6);
}

export function buildAssistantSummaryFromData({
  state,
  assets,
  liabilities,
  holdings,
  income,
  ledgerEntries,
  monthlyPlans,
  now = new Date(),
}: {
  state: DashboardState;
  assets: Asset[];
  liabilities: Liability[];
  holdings: StockHolding[];
  income?: Income[];
  ledgerEntries: LedgerEntry[];
  monthlyPlans: MonthlyPlanEntry[];
  now?: Date;
}): AssistantSummary {
  const month = state.baseMonth || now.toISOString().slice(0, 7);
  const summary = calculateFinancialSummary({
    assets,
    liabilities,
    holdings,
    scope: state.scope,
    exchangeRates: ASSISTANT_EXCHANGE_RATES,
  });
  const cashflow = buildFinanceSnapshot({ month, ledgerEntries, monthlyPlans });
  const aggregates = buildAggregates(month, ledgerEntries, monthlyPlans, cashflow, {
    assetCount: assets.length,
    cashAssetCount: assets.filter((asset) => asset.category === 'cash').length,
    liabilityCount: liabilities.length,
    holdingCount: holdings.length,
    incomeCount: income?.length ?? 0,
  });
  const assetAllocation = summary.assetCategoryTotals
    .filter((item) => !item.isOther)
    .map((item) => ({ label: CATEGORY_LABELS[item.category] ?? item.category, amount: item.amount, percent: pct(item.amount, summary.totalAssets) }))
    .sort((a, b) => b.amount - a.amount);
  const liabilityAllocation = summary.liabilityCategoryTotals
    .map((item) => ({ label: CATEGORY_LABELS[item.category] ?? item.category, amount: item.amount, percent: pct(item.amount, summary.totalLiabilities) }))
    .sort((a, b) => b.amount - a.amount);
  const topAssets = assetAllocation.slice(0, 4).map((item) => linePercent(item.label, item.amount, summary.totalAssets));
  const topLiabilities = liabilityAllocation.slice(0, 3).map((item) => linePercent(item.label, item.amount, summary.totalLiabilities));
  const briefings = buildBriefings(summary, cashflow, aggregates);
  const highlights = [
    `순자산 ${krw(summary.netWorth)} = 자산 ${krw(summary.totalAssets)} - 부채 ${krw(summary.totalLiabilities)}`,
    topAssets.length ? `자산구성: ${topAssets.join(' · ')}` : '자산구성 데이터가 부족합니다.',
    topLiabilities.length ? `부채구성: ${topLiabilities.join(' · ')}` : '등록된 부채가 없거나 부채 데이터가 부족합니다.',
    `이번 달 현금흐름: 수입 ${krw(cashflow.totals.income)} · 지출 ${krw(cashflow.totals.expense)} · 순현금흐름 ${krw(cashflow.totals.netCashflow)}`,
    ...briefings.budget.slice(0, 2),
  ];
  const improvementIdeas = buildIdeas(summary, cashflow, aggregates);

  return {
    id: `finance-summary-${month}-${state.scope}`,
    month,
    scope: state.scope,
    generatedAt: now.toISOString(),
    summaryText: [...highlights, '개선 후보:', ...improvementIdeas.map((idea) => `- ${idea}`)].join('\n'),
    highlights,
    improvementIdeas,
    snapshot: {
      netWorth: summary.netWorth,
      totalAssets: summary.totalAssets,
      totalLiabilities: summary.totalLiabilities,
      assetAllocation,
      liabilityAllocation,
      cashflow: cashflow.totals,
      alerts: cashflow.alerts,
    },
    aggregates,
    briefings,
  };
}

export function buildAssistantSummary(now = new Date()): AssistantSummary {
  return buildAssistantSummaryFromData({
    state: getDashboardState(),
    assets: getAssets(),
    liabilities: getLiabilities(),
    holdings: getStockHoldings(),
    income: getIncome(),
    ledgerEntries: getLedgerEntries(),
    monthlyPlans: getMonthlyPlanEntries(),
    now,
  });
}

export function getCurrentAssistantSummary() {
  const state = getDashboardState();
  const month = state.baseMonth || new Date().toISOString().slice(0, 7);
  const id = `finance-summary-${month}-${state.scope}`;
  return getAssistantSummaries().find((summary) => summary.id === id);
}

export async function refreshAssistantSummary() {
  const summary = buildAssistantSummary();
  await upsertAssistantSummaries([summary]);
  return summary;
}
