import {
  getAssets,
  getLedgerEntries,
  getLiabilities,
  getMonthlyPlanEntries,
  getStockHoldings,
  setLedgerEntries,
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
  const entries = getLedgerEntries();
  await setLedgerEntries(entries.map((item) => item.id === entry.id ? removeUndefinedDeep(entry) : item));
}

export async function upsertBudget(entry: MonthlyPlanEntry) {
  await upsertMonthlyPlanEntries([removeUndefinedDeep(entry)]);
}
