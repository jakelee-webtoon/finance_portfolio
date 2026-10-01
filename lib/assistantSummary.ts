import { buildFinanceSnapshot } from '@/lib/assistantSnapshot';
import { calculateFinancialSummary } from '@/lib/financialSummary';
import {
  getAssets,
  getAssistantSummaries,
  getDashboardState,
  getLedgerEntries,
  getLiabilities,
  getMonthlyPlanEntries,
  getStockHoldings,
  upsertAssistantSummaries,
} from '@/lib/store';
import type { AssistantSummary } from '@/types';

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
};

function pct(amount: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((amount / total) * 1000) / 10;
}

function krw(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}원`;
}

function linePercent(label: string, amount: number, total: number) {
  return `${CATEGORY_LABELS[label] ?? label} ${krw(amount)} (${pct(amount, total)}%)`;
}

function buildIdeas(summary: ReturnType<typeof calculateFinancialSummary>, cashflow: ReturnType<typeof buildFinanceSnapshot>) {
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
  if (cashflow.alerts.some((alert) => alert.level === 'critical')) ideas.push('이번 달 critical 알림이 있습니다. 새 투자보다 현금흐름 안정화를 먼저 확인하세요.');
  if (!ideas.length) ideas.push('큰 위험 신호는 계산되지 않았습니다. 목표 비중을 정하고 월 1회 리밸런싱 여부만 점검해도 충분합니다.');

  return ideas.slice(0, 5);
}

export function buildAssistantSummary(now = new Date()): AssistantSummary {
  const state = getDashboardState();
  const month = state.baseMonth || now.toISOString().slice(0, 7);
  const summary = calculateFinancialSummary({
    assets: getAssets(),
    liabilities: getLiabilities(),
    holdings: getStockHoldings(),
    scope: state.scope,
    exchangeRates: ASSISTANT_EXCHANGE_RATES,
  });
  const cashflow = buildFinanceSnapshot({
    month,
    ledgerEntries: getLedgerEntries(),
    monthlyPlans: getMonthlyPlanEntries(),
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
  const highlights = [
    `순자산 ${krw(summary.netWorth)} = 자산 ${krw(summary.totalAssets)} - 부채 ${krw(summary.totalLiabilities)}`,
    topAssets.length ? `자산구성: ${topAssets.join(' · ')}` : '자산구성 데이터가 부족합니다.',
    topLiabilities.length ? `부채구성: ${topLiabilities.join(' · ')}` : '등록된 부채가 없거나 부채 데이터가 부족합니다.',
    `이번 달 현금흐름: 수입 ${krw(cashflow.totals.income)} · 지출 ${krw(cashflow.totals.expense)} · 순현금흐름 ${krw(cashflow.totals.netCashflow)}`,
  ];
  const improvementIdeas = buildIdeas(summary, cashflow);

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
  };
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
