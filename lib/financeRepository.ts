import {
  getAssets,
  getLedgerEntries,
  getLiabilities,
  getMonthlyPlanEntries,
  getStockHoldings,
  saveLedgerEntries,
  upsertMonthlyPlanEntries,
} from '@/lib/store';
import { removeUndefinedDeep } from '@/lib/persistenceConfig';
import type { Asset, LedgerEntry, Liability, MonthlyPlanEntry, StockHolding } from '@/types';

export type FinanceRepositorySnapshot = {
  assets: Asset[];
  liabilities: Liability[];
  holdings: StockHolding[];
  ledgerEntries: LedgerEntry[];
  monthlyPlans: MonthlyPlanEntry[];
};

export { removeUndefinedDeep };

export function getFinanceRepositorySnapshot(): FinanceRepositorySnapshot {
  return {
    assets: getAssets(),
    liabilities: getLiabilities(),
    holdings: getStockHoldings(),
    ledgerEntries: getLedgerEntries(),
    monthlyPlans: getMonthlyPlanEntries(),
  };
}

export function getMonthlyLedgerEntries(month: string) {
  return getLedgerEntries().filter((entry) => entry.month === month);
}

export async function updateLedgerEntry(entry: LedgerEntry) {
  if (!await saveLedgerEntries([removeUndefinedDeep(entry)])) throw new Error('서버 저장에 실패했습니다.');
}

export async function upsertBudget(entry: MonthlyPlanEntry) {
  if (!await upsertMonthlyPlanEntries([removeUndefinedDeep(entry)])) throw new Error('서버 저장에 실패했습니다.');
}
