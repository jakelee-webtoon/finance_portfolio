import { calculateFinancialSummary } from '@/lib/financialSummary';
import { buildFinanceSnapshot } from '@/lib/assistantSnapshot';
import {
  getAssets,
  getDashboardState,
  getLedgerEntries,
  getLiabilities,
  getMonthlyPlanEntries,
  getStockHoldings,
  setLedgerEntries,
  upsertMonthlyPlanEntries,
} from '@/lib/store';
import type { LedgerEntry, MonthlyPlanEntry, PlanCategory, Scope } from '@/types';
import type { AssistantOutcome, AssistantResult, AssistantStep, AssistantView } from '@/lib/assistantCommand';
import { assistantPayloadString } from '@/lib/assistantCommand';

const VIEW_PATHS: Record<AssistantView, string> = {
  dashboard: '/dashboard',
  portfolio: '/portfolio',
  'monthly-plan': '/monthly-plan',
  cash: '/cash',
  income: '/income',
  ledger: '/ledger',
  stocks: '/stocks',
  isa: '/isa',
  rsu: '/rsu',
  apartment: '/apartment',
  salary: '/salary',
  other: '/other',
};

const PLAN_CATEGORIES = new Set<PlanCategory>([
  'income',
  'fixed_expense',
  'saving',
  'investment',
  'irregular_expense',
  'cash_reserve',
  'allowance',
  'debt_repayment',
]);

function krw(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}원`;
}

function baseMonth(payload: Record<string, unknown>) {
  return assistantPayloadString(payload, 'month', false) || getDashboardState().baseMonth;
}

function ownerFilter(payload: Record<string, unknown>): Scope | 'joint' {
  const owner = assistantPayloadString(payload, 'owner', false);
  if (owner === 'husband' || owner === 'wife' || owner === 'joint') return owner;
  return getDashboardState().scope;
}

function ledgerForPeriod(month: string) {
  return getLedgerEntries().filter((entry) => entry.month === month);
}

function snapshotForMonth(month: string) {
  return buildFinanceSnapshot({
    month,
    ledgerEntries: getLedgerEntries(),
    monthlyPlans: getMonthlyPlanEntries(),
  });
}

function result(kind: AssistantResult['kind'], title: string, detail?: string, items?: AssistantResult['items'], target?: AssistantView): AssistantResult {
  return { kind, title, detail, items, target };
}

function ownerMatches(entryOwner: 'husband' | 'wife' | 'joint', owner: Scope | 'joint') {
  return owner === 'combined' || entryOwner === owner || entryOwner === 'joint';
}

function matchBudget(plans: MonthlyPlanEntry[], payload: Record<string, unknown>) {
  const id = assistantPayloadString(payload, 'id', false);
  const title = assistantPayloadString(payload, 'title', false);
  if (id) return plans.find((entry) => entry.id === id);
  if (!title) return undefined;
  const normalized = title.replace(/\s/g, '');
  return plans.find((entry) => entry.title.replace(/\s/g, '').includes(normalized));
}

function resolveLedgerId(rawId: string) {
  const month = getDashboardState().baseMonth;
  const snapshot = snapshotForMonth(month);
  return snapshot.recentTransactions.find((entry) => entry.ref === rawId)?.id ?? rawId;
}

export function previewAssistantStep(step: AssistantStep) {
  switch (step.action) {
    case 'delete_budget': {
      const target = assistantPayloadString(step.payload, 'title', false) || assistantPayloadString(step.payload, 'id', false);
      return `월간플랜 항목 “${target}”을 삭제할까요? 삭제성 작업이라 확인이 필요합니다.`;
    }
    case 'categorize_transaction':
      return `거래 ${assistantPayloadString(step.payload, 'id')}의 카테고리를 “${assistantPayloadString(step.payload, 'category')}”로 바꿀까요?`;
    default:
      return '이 작업을 실행할까요?';
  }
}

export async function executeAssistantStep(step: AssistantStep): Promise<AssistantOutcome> {
  switch (step.action) {
    case 'query_transactions': {
      const month = baseMonth(step.payload);
      const limit = typeof step.payload.limit === 'number' ? Math.min(50, Math.max(1, step.payload.limit)) : 10;
      const entries = ledgerForPeriod(month).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
      return {
        message: `${month} 거래 ${entries.length}건을 찾았습니다.`,
        results: [result('list', `${month} 거래 내역`, `${entries.length}건`, entries.map((entry) => ({
          title: `${entry.date} · ${entry.category}`,
          detail: `${entry.type} · ${krw(entry.amount)}${entry.notes ? ` · ${entry.notes}` : ''}`,
        })), 'ledger')],
      };
    }
    case 'get_finance_summary': {
      const month = baseMonth(step.payload);
      const snapshot = snapshotForMonth(month);
      return {
        message: `${month} 재무상태를 점검했습니다.`,
        results: [result('report', `${month} 재무상태 점검`, `순현금흐름 ${krw(snapshot.totals.netCashflow)} · 저축률 ${snapshot.totals.savingsRate ?? '계산 불가'}%`, [
          { title: '수입', detail: krw(snapshot.totals.income) },
          { title: '지출', detail: krw(snapshot.totals.expense) },
          { title: 'Top spending', detail: snapshot.categories.slice(0, 3).map((item) => `${item.name} ${krw(item.spent)}`).join(' · ') || '없음' },
          { title: '위험 신호', detail: snapshot.alerts.map((item) => item.message).join(' / ') },
        ], 'dashboard')],
      };
    }
    case 'summarize_spending': {
      const month = baseMonth(step.payload);
      const entries = ledgerForPeriod(month).filter((entry) => entry.type === 'expense_fixed' || entry.type === 'expense_variable');
      const byCategory = new Map<string, number>();
      for (const entry of entries) byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
      const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
      return {
        message: `${month} 지출은 ${krw(total)}입니다.`,
        results: [result('summary', `${month} 지출 요약`, `총 ${krw(total)} · ${entries.length}건`, [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({
          title: category,
          detail: krw(amount),
        })), 'ledger')],
      };
    }
    case 'query_budget': {
      const month = baseMonth(step.payload);
      const owner = ownerFilter(step.payload);
      const plans = getMonthlyPlanEntries().filter((entry) => entry.month === month && ownerMatches(entry.owner, owner));
      const target = plans.reduce((sum, entry) => sum + entry.targetAmount, 0);
      const actual = plans.reduce((sum, entry) => sum + (entry.actualAmount ?? 0), 0);
      return {
        message: `${month} 월간플랜은 ${plans.length}개입니다.`,
        results: [result('budget', `${month} 월간플랜`, `목표 ${krw(target)} · 실적 ${krw(actual)} · 완료 ${plans.filter((entry) => entry.isCompleted).length}/${plans.length}`, plans.map((entry) => ({
          title: `${entry.id} · ${entry.title}`,
          detail: `${entry.owner} · 목표 ${krw(entry.targetAmount)} · 실적 ${krw(entry.actualAmount ?? 0)}${entry.isCompleted ? ' · 완료' : ''}`,
        })), 'monthly-plan')],
      };
    }
    case 'create_budget': {
      const state = getDashboardState();
      const month = baseMonth(step.payload);
      const categoryValue = assistantPayloadString(step.payload, 'category', false);
      const category = PLAN_CATEGORIES.has(categoryValue as PlanCategory) ? categoryValue as PlanCategory : 'fixed_expense';
      const ownerValue = ownerFilter(step.payload);
      const owner = ownerValue === 'combined' || ownerValue === 'joint' ? 'joint' : ownerValue;
      const entry: MonthlyPlanEntry = {
        id: `assistant-plan-${month}-${Date.now()}`,
        month,
        owner,
        category,
        title: assistantPayloadString(step.payload, 'title'),
        targetAmount: Number(step.payload.targetAmount),
        actualAmount: 0,
        isCompleted: false,
        notes: 'Finance Assistant에서 추가',
        source_type: 'manual',
        as_of_date: new Date().toISOString().slice(0, 10),
        last_modified_by: state.scope === 'wife' ? 'wife' : 'husband',
      };
      await upsertMonthlyPlanEntries([entry]);
      return {
        message: `월간플랜에 ${entry.title}을 추가했습니다.`,
        results: [result('budget', '월간플랜 추가', `${entry.title} · 목표 ${krw(entry.targetAmount)}`, undefined, 'monthly-plan')],
      };
    }
    case 'update_budget': {
      const plans = getMonthlyPlanEntries();
      const entry = matchBudget(plans.filter((item) => item.month === baseMonth(step.payload)), step.payload);
      if (!entry) throw new Error('수정할 월간플랜 항목을 찾지 못했습니다.');
      const updated: MonthlyPlanEntry = {
        ...entry,
        targetAmount: typeof step.payload.targetAmount === 'number' ? step.payload.targetAmount : entry.targetAmount,
        actualAmount: typeof step.payload.actualAmount === 'number' ? step.payload.actualAmount : entry.actualAmount,
        isCompleted: typeof step.payload.completed === 'boolean' ? step.payload.completed : entry.isCompleted,
        as_of_date: new Date().toISOString().slice(0, 10),
      };
      await upsertMonthlyPlanEntries([updated]);
      return {
        message: `${entry.title}을 수정했습니다.`,
        results: [result('budget', '월간플랜 수정', `${updated.title} · 목표 ${krw(updated.targetAmount)} · 실적 ${krw(updated.actualAmount ?? 0)}`, undefined, 'monthly-plan')],
      };
    }
    case 'delete_budget': {
      throw new Error('월간플랜 삭제는 아직 안전 실행기로 연결하지 않았습니다. 수동으로 확인 후 화면에서 삭제해 주세요.');
    }
    case 'categorize_transaction': {
      const id = resolveLedgerId(assistantPayloadString(step.payload, 'id'));
      const category = assistantPayloadString(step.payload, 'category');
      const entries = getLedgerEntries();
      let found = false;
      const next = entries.map((entry): LedgerEntry => {
        if (entry.id !== id) return entry;
        found = true;
        return { ...entry, category: category as LedgerEntry['category'], as_of_date: new Date().toISOString().slice(0, 10) };
      });
      if (!found) throw new Error('거래를 찾지 못했습니다.');
      await setLedgerEntries(next);
      return {
        message: `거래 카테고리를 ${category}로 변경했습니다.`,
        results: [result('info', '거래 카테고리 변경', `${id} → ${category}`, undefined, 'ledger')],
      };
    }
    case 'query_accounts': {
      const state = getDashboardState();
      const owner = ownerFilter(step.payload);
      const summary = calculateFinancialSummary({
        assets: getAssets(),
        liabilities: getLiabilities(),
        holdings: getStockHoldings(),
        scope: owner === 'joint' ? state.scope : owner,
        exchangeRates: null,
      });
      return {
        message: `계정 요약을 조회했습니다.`,
        results: [result('account', '계정 요약', `자산 ${krw(summary.totalAssets)} · 부채 ${krw(summary.totalLiabilities)} · 순자산 ${krw(summary.netWorth)}`, [
          { title: '자산', detail: krw(summary.totalAssets) },
          { title: '부채', detail: krw(summary.totalLiabilities) },
          { title: '순자산', detail: krw(summary.netWorth) },
        ], 'portfolio')],
      };
    }
    case 'query_cashflow': {
      const month = baseMonth(step.payload);
      const snapshot = snapshotForMonth(month);
      return {
        message: `${month} 현금흐름을 계산했습니다.`,
        results: [result('cashflow', `${month} 현금흐름`, `순현금흐름 ${krw(snapshot.totals.netCashflow)} · 저축률 ${snapshot.totals.savingsRate ?? '계산 불가'}%`, [
          { title: '수입', detail: krw(snapshot.totals.income) },
          { title: '지출', detail: krw(snapshot.totals.expense) },
          { title: '알림', detail: snapshot.alerts[0]?.message ?? '특이사항 없음' },
        ], 'ledger')],
      };
    }
    case 'get_monthly_report': {
      const month = baseMonth(step.payload);
      const snapshot = snapshotForMonth(month);
      const plans = getMonthlyPlanEntries().filter((entry) => entry.month === month);
      const actualPlan = plans.reduce((sum, entry) => sum + (entry.actualAmount ?? 0), 0);
      return {
        message: `${month} 월간 리포트입니다.`,
        results: [result('report', `${month} 월간 리포트`, `수입 ${krw(snapshot.totals.income)} · 지출 ${krw(snapshot.totals.expense)} · 저축률 ${snapshot.totals.savingsRate ?? '계산 불가'}%`, [
          { title: '월간플랜 완료', detail: `${plans.filter((entry) => entry.isCompleted).length}/${plans.length}` },
          { title: '플랜 실적', detail: krw(actualPlan) },
          { title: 'Top spending', detail: snapshot.categories.slice(0, 3).map((item) => `${item.name} ${krw(item.spent)}`).join(' · ') || '없음' },
          { title: '반복 결제', detail: `${snapshot.recurringPayments.length}건` },
          { title: '위험 신호', detail: snapshot.alerts.map((item) => item.message).join(' / ') },
        ], 'dashboard')],
      };
    }
    case 'add_transaction_memo': {
      const id = resolveLedgerId(assistantPayloadString(step.payload, 'id'));
      const memo = assistantPayloadString(step.payload, 'memo');
      const entries = getLedgerEntries();
      let found = false;
      const next = entries.map((entry): LedgerEntry => {
        if (entry.id !== id) return entry;
        found = true;
        return { ...entry, notes: memo, as_of_date: new Date().toISOString().slice(0, 10) };
      });
      if (!found) throw new Error('거래를 찾지 못했습니다.');
      await setLedgerEntries(next);
      return {
        message: '거래 메모를 추가했습니다.',
        results: [result('info', '거래 메모 추가', `${id} · ${memo}`, undefined, 'ledger')],
      };
    }
    case 'open_view': {
      const view = assistantPayloadString(step.payload, 'view') as AssistantView;
      return {
        message: `${view} 화면을 열었습니다.`,
        navigated: true,
        results: [{ kind: 'navigation', title: '화면 이동', detail: VIEW_PATHS[view], target: view }],
      };
    }
  }
}

export function assistantViewPath(view: AssistantView) {
  return VIEW_PATHS[view];
}
