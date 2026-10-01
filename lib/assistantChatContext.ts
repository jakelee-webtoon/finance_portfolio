import { calculateFinancialSummary } from '@/lib/financialSummary';
import { buildFinanceSnapshot } from '@/lib/assistantSnapshot';
import { getCurrentAssistantSummary } from '@/lib/assistantSummary';
import { getAssets, getDashboardState, getIncome, getLedgerEntries, getLiabilities, getMonthlyPlanEntries, getStockHoldings, getTransactions } from '@/lib/store';
import type { Asset, DashboardState, Income, LedgerEntry, Liability, MonthlyPlanEntry, StockHolding, Transaction } from '@/types';

export type FinanceAssistantData = {
  state: DashboardState;
  assets: Asset[];
  liabilities: Liability[];
  holdings: StockHolding[];
  income: Income[];
  transactions: Transaction[];
  ledgerEntries: LedgerEntry[];
  monthlyPlans: MonthlyPlanEntry[];
};

const MAX_CHARACTERS = 3600;
const ASSISTANT_EXCHANGE_RATES = {
  USD_TO_KRW: 1300,
  EUR_TO_KRW: 1300 / 0.92,
};

function krw(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}원`;
}

function monthOf(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function byAmountDesc<T extends { amount: number }>(a: T, b: T) {
  return b.amount - a.amount;
}

function trimText(lines: string[]) {
  let output = lines.filter(Boolean).join('\n');
  while (output.length > MAX_CHARACTERS && lines.length > 10) {
    lines.splice(Math.max(8, lines.length - 2), 1);
    output = lines.filter(Boolean).join('\n');
  }
  return output.length > MAX_CHARACTERS ? `${output.slice(0, MAX_CHARACTERS - 40)}\n- 일부 항목 생략` : output;
}

export function collectFinanceAssistantData(): FinanceAssistantData {
  return {
    state: getDashboardState(),
    assets: getAssets(),
    liabilities: getLiabilities(),
    holdings: getStockHoldings(),
    income: getIncome(),
    transactions: getTransactions(),
    ledgerEntries: getLedgerEntries(),
    monthlyPlans: getMonthlyPlanEntries(),
  };
}

export function buildFinanceChatContext(data = collectFinanceAssistantData(), now = new Date(), userMessage = '') {
  const baseMonth = data.state.baseMonth || monthOf(now);
  const scope = data.state.scope;
  const snapshot = buildFinanceSnapshot({
    month: baseMonth,
    ledgerEntries: data.ledgerEntries,
    monthlyPlans: data.monthlyPlans,
  });
  const summary = calculateFinancialSummary({
    assets: data.assets,
    liabilities: data.liabilities,
    holdings: data.holdings,
    scope,
    exchangeRates: ASSISTANT_EXCHANGE_RATES,
  });
  const assistantSummary = getCurrentAssistantSummary();
  const ledgerThisMonth = data.ledgerEntries.filter((entry) => entry.month === baseMonth);
  const expenses = ledgerThisMonth.filter((entry) => entry.type === 'expense_fixed' || entry.type === 'expense_variable');
  const income = ledgerThisMonth.filter((entry) => entry.type === 'income');
  const savings = ledgerThisMonth.filter((entry) => entry.type === 'savings');
  const spendingByCategory = new Map<string, number>();
  for (const entry of expenses) spendingByCategory.set(entry.category, (spendingByCategory.get(entry.category) ?? 0) + entry.amount);
  const plans = data.monthlyPlans.filter((entry) => entry.month === baseMonth && (scope === 'combined' || entry.owner === scope));
  const overBudget = plans
    .filter((entry) => (entry.actualAmount ?? 0) > entry.targetAmount)
    .sort((a, b) => ((b.actualAmount ?? 0) - b.targetAmount) - ((a.actualAmount ?? 0) - a.targetAmount));
  const recentLedger = [...data.ledgerEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, /거래|내역|최근/.test(userMessage) ? 12 : 6);
  const recurring = data.ledgerEntries.filter((entry) => entry.is_fixed).slice(0, 8);

  const lines = [
    `현재: ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(now)} · 기준월 ${baseMonth} · 범위 ${scope}`,
    '[storedAssistantSummary · Firestore/local · 코드 계산 요약]',
    assistantSummary ? assistantSummary.summaryText : '- 저장된 assistant summary 없음. 필요한 경우 tool로 먼저 조회/계산하세요.',
    '[financeSnapshot · 코드 계산값]',
    JSON.stringify(snapshot),
    '[순자산 요약]',
    `- 총 자산 ${krw(summary.totalAssets)} · 총 부채 ${krw(summary.totalLiabilities)} · 순자산 ${krw(summary.netWorth)}`,
    `- 투자성 자산 ${krw(summary.investmentAssetRows.reduce((sum, row) => sum + row.amount, 0))} · 기타 제외 자산 ${krw(summary.otherAssets)}`,
    '[이번 달 흐름]',
    `- 수입 ${krw(income.reduce((sum, entry) => sum + entry.amount, 0))} · 지출 ${krw(expenses.reduce((sum, entry) => sum + entry.amount, 0))} · 저축 ${krw(savings.reduce((sum, entry) => sum + entry.amount, 0))}`,
    ...[...spendingByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category, amount]) => `- 지출 ${category}: ${krw(amount)}`),
    '[월간플랜]',
    `- 항목 ${plans.length}개 · 완료 ${plans.filter((entry) => entry.isCompleted).length}개 · 목표 ${krw(plans.reduce((sum, entry) => sum + entry.targetAmount, 0))} · 실적 ${krw(plans.reduce((sum, entry) => sum + (entry.actualAmount ?? 0), 0))}`,
    ...overBudget.slice(0, 5).map((entry) => `- 초과 ${entry.id} ${entry.title}: ${krw((entry.actualAmount ?? 0) - entry.targetAmount)} 초과`),
    '[최근 거래]',
    ...recentLedger.map((entry) => `- ${entry.id} ${entry.date} ${entry.type} ${entry.category} ${krw(entry.amount)}${entry.notes ? ` · ${entry.notes.slice(0, 40)}` : ''}`),
    '[반복/고정 항목]',
    ...recurring.map((entry) => `- ${entry.date} ${entry.category} ${krw(entry.amount)}${entry.notes ? ` · ${entry.notes.slice(0, 40)}` : ''}`),
    '[계정 요약]',
    ...[...data.assets].sort(byAmountDesc).slice(0, 6).map((asset) => `- 자산 ${asset.name} ${asset.category} ${asset.owner} ${asset.currency} ${krw(asset.amount)}`),
    ...[...data.liabilities].sort(byAmountDesc).slice(0, 6).map((liability) => `- 부채 ${liability.name} ${liability.category} ${liability.owner} ${liability.currency} ${krw(liability.amount)}`),
    `- 주식/ETF/RSU 보유 ${data.holdings.length}개 (상세 원문·계좌번호·토큰은 제공하지 않음)`,
  ];

  return trimText(lines);
}
