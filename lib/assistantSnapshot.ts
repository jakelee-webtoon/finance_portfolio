import type { LedgerEntry, MonthlyPlanEntry } from '@/types';

export type FinanceSnapshot = {
  period: { start: string; end: string; label: string };
  totals: {
    income: number;
    expense: number;
    savings: number;
    netCashflow: number;
    savingsRate: number | null;
  };
  accounts: {
    totalBalance?: number;
    count: number;
    byType: Array<{ type: string; balance?: number; count: number }>;
  };
  categories: Array<{
    categoryId?: string;
    name: string;
    spent: number;
    budget?: number;
    budgetUsedPercent?: number;
    deltaFromPreviousPeriod?: number;
  }>;
  recurringPayments: Array<{ merchant: string; amount: number; cadence: string; nextDate?: string; categoryName?: string }>;
  upcomingBills: Array<{ title: string; amount: number; dueDate: string }>;
  recentTransactions: Array<{
    ref: string;
    id: string;
    date: string;
    merchant?: string;
    description: string;
    amount: number;
    direction: 'income' | 'expense' | 'transfer';
    categoryName?: string;
  }>;
  alerts: Array<{ level: 'info' | 'warning' | 'critical'; code: string; message: string }>;
};

function monthEnd(month: string) {
  const [year, value] = month.split('-').map(Number);
  return new Date(year, value, 0).toISOString().slice(0, 10);
}

function compactMerchant(entry: LedgerEntry) {
  return (entry.subcategory || entry.notes || entry.category).replace(/\s+/g, ' ').trim().slice(0, 40) || entry.category;
}

function previousMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  return new Date(year, value - 2, 1).toISOString().slice(0, 7);
}

function pct(part: number, whole: number) {
  if (whole <= 0) return undefined;
  return Math.round((part / whole) * 1000) / 10;
}

export function buildFinanceSnapshot({
  month,
  ledgerEntries,
  monthlyPlans,
}: {
  month: string;
  ledgerEntries: LedgerEntry[];
  monthlyPlans: MonthlyPlanEntry[];
}): FinanceSnapshot {
  const monthLedger = ledgerEntries.filter((entry) => entry.month === month);
  const previousLedger = ledgerEntries.filter((entry) => entry.month === previousMonth(month));
  const incomeTotal = monthLedger
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expenseEntries = monthLedger.filter((entry) => entry.type === 'expense_fixed' || entry.type === 'expense_variable');
  const expenseTotal = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const savingsTotal = monthLedger
    .filter((entry) => entry.type === 'savings')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const netCashflow = incomeTotal - expenseTotal - savingsTotal;
  const savingsRate = incomeTotal > 0 ? Math.round((savingsTotal / incomeTotal) * 1000) / 10 : null;

  const budgetByCategory = new Map<string, number>();
  for (const plan of monthlyPlans.filter((entry) => entry.month === month)) {
    budgetByCategory.set(plan.category, (budgetByCategory.get(plan.category) ?? 0) + plan.targetAmount);
  }
  const spendByCategory = new Map<string, number>();
  for (const entry of expenseEntries) {
    spendByCategory.set(entry.category, (spendByCategory.get(entry.category) ?? 0) + entry.amount);
  }
  const previousSpendByCategory = new Map<string, number>();
  for (const entry of previousLedger.filter((item) => item.type === 'expense_fixed' || item.type === 'expense_variable')) {
    previousSpendByCategory.set(entry.category, (previousSpendByCategory.get(entry.category) ?? 0) + entry.amount);
  }
  const categories = [...spendByCategory.entries()]
    .map(([category, amount]) => {
      const budget = budgetByCategory.get(category);
      const previous = previousSpendByCategory.get(category);
      return {
        categoryId: category,
        name: category,
        spent: amount,
        budget,
        budgetUsedPercent: budget ? pct(amount, budget) : undefined,
        deltaFromPreviousPeriod: previous === undefined ? undefined : amount - previous,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const recurringPayments = monthLedger
    .filter((entry) => entry.is_fixed && (entry.type === 'expense_fixed' || entry.type === 'savings'))
    .map((entry) => ({ merchant: compactMerchant(entry), amount: entry.amount, cadence: 'monthly' }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12);

  const today = new Date().toISOString().slice(0, 10);
  const upcomingBills = monthLedger
    .filter((entry) => entry.is_fixed && entry.date >= today && (entry.type === 'expense_fixed' || entry.type === 'savings'))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)
    .map((entry) => ({ title: compactMerchant(entry), amount: entry.amount, dueDate: entry.date }));

  const recentTransactions = [...monthLedger]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15)
    .map((entry, index) => ({
      ref: `tx${index + 1}`,
      id: entry.id,
      date: entry.date,
      merchant: entry.subcategory,
      description: entry.notes || entry.subcategory || entry.category,
      amount: entry.amount,
      direction: entry.type === 'income' ? 'income' as const : entry.type === 'savings' ? 'transfer' as const : 'expense' as const,
      categoryName: entry.category,
    }));

  const alerts: FinanceSnapshot['alerts'] = [];
  if (incomeTotal === 0 && expenseTotal > 0) {
    alerts.push({ level: 'warning', code: 'missing_income', message: '이번 달 수입 데이터 없이 지출만 기록되어 있습니다.' });
  }
  if (netCashflow < 0) {
    alerts.push({ level: 'critical', code: 'negative_cashflow', message: `이번 달 순현금흐름이 ${Math.abs(netCashflow).toLocaleString('ko-KR')}원 적자입니다.` });
  }
  if (incomeTotal > 0 && savingsRate !== null && savingsRate < 10) {
    alerts.push({ level: 'warning', code: 'low_savings_rate', message: `저축률이 ${savingsRate}%로 낮은 편입니다.` });
  }
  for (const item of categories) {
    if (item.budget && item.spent > item.budget) {
      alerts.push({ level: 'warning', code: 'over_budget', message: `${item.name} 지출이 예산을 ${(item.spent - item.budget).toLocaleString('ko-KR')}원 초과했습니다.` });
    }
  }
  if (!alerts.length) alerts.push({ level: 'info', code: 'no_major_alerts', message: '큰 위험 신호는 계산되지 않았습니다.' });

  return {
    period: { start: `${month}-01`, end: monthEnd(month), label: month },
    totals: { income: incomeTotal, expense: expenseTotal, savings: savingsTotal, netCashflow, savingsRate },
    accounts: { count: 0, byType: [] },
    categories,
    recurringPayments,
    upcomingBills,
    recentTransactions,
    alerts: alerts.slice(0, 8),
  };
}
