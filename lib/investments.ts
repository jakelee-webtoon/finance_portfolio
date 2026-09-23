import { StockHolding } from '@/types';

export const ISA_ANNUAL_CONTRIBUTION_LIMIT = 20_000_000;
export const ISA_TOTAL_CONTRIBUTION_LIMIT = 100_000_000;
export const ISA_BASIC_TAX_FREE_LIMIT = 2_000_000;
export const ISA_PREFERENTIAL_TAX_FREE_LIMIT = 4_000_000;
export const ISA_SEPARATE_TAX_RATE = 0.099;

export function isStockHolding(holding: StockHolding): boolean {
  return !holding.type || holding.type === 'stock';
}

export function isIsaEtfHolding(holding: StockHolding): boolean {
  return holding.type === 'etf' || holding.accountType === 'isa';
}

export function toKrwAmount(amount: number, currency: string | undefined, exchangeRates: Record<string, number> | null): number {
  if (!Number.isFinite(amount)) return 0;
  if (!exchangeRates) return amount;
  if (currency === 'USD') return amount * exchangeRates.USD_TO_KRW;
  if (currency === 'EUR') return amount * exchangeRates.EUR_TO_KRW;
  return amount;
}

export function getHoldingCurrentValueKrw(holding: StockHolding, exchangeRates: Record<string, number> | null): number {
  const currentPrice = holding.currentPrice ?? holding.purchasePrice;
  return toKrwAmount(currentPrice * holding.quantity, holding.currency || 'KRW', exchangeRates);
}

export function getHoldingPurchaseValueKrw(holding: StockHolding, exchangeRates: Record<string, number> | null): number {
  return toKrwAmount(holding.purchasePrice * holding.quantity, holding.currency || 'KRW', exchangeRates);
}

export function getHoldingGainLossKrw(holding: StockHolding, exchangeRates: Record<string, number> | null): number {
  return getHoldingCurrentValueKrw(holding, exchangeRates) - getHoldingPurchaseValueKrw(holding, exchangeRates);
}

export interface EtfCategoryPerformance {
  category: NonNullable<StockHolding['etfCategory']>;
  label: string;
  currentValue: number;
  purchaseValue: number;
  gainLoss: number;
  returnPct: number;
  allocationPct: number;
  holdingsCount: number;
}

export function getEtfCategoryPerformance(
  holdings: StockHolding[],
  exchangeRates: Record<string, number> | null
): EtfCategoryPerformance[] {
  if (!exchangeRates) return [];

  const totals = holdings.reduce((acc, holding) => {
    const category = holding.etfCategory || 'other';
    const currentValue = getHoldingCurrentValueKrw(holding, exchangeRates);
    const purchaseValue = getHoldingPurchaseValueKrw(holding, exchangeRates);

    if (!acc[category]) {
      acc[category] = {
        category,
        label: getEtfCategoryLabel(category),
        currentValue: 0,
        purchaseValue: 0,
        gainLoss: 0,
        returnPct: 0,
        allocationPct: 0,
        holdingsCount: 0,
      };
    }

    acc[category].currentValue += currentValue;
    acc[category].purchaseValue += purchaseValue;
    acc[category].gainLoss += currentValue - purchaseValue;
    acc[category].holdingsCount += 1;
    return acc;
  }, {} as Record<NonNullable<StockHolding['etfCategory']>, EtfCategoryPerformance>);

  const totalCurrentValue = Object.values(totals).reduce((sum, row) => sum + row.currentValue, 0);

  return Object.values(totals)
    .map((row) => ({
      ...row,
      returnPct: row.purchaseValue > 0 ? (row.gainLoss / row.purchaseValue) * 100 : 0,
      allocationPct: totalCurrentValue > 0 ? (row.currentValue / totalCurrentValue) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.gainLoss) - Math.abs(a.gainLoss));
}

export function getEtfCategoryLabel(category?: StockHolding['etfCategory']): string {
  const labels: Record<string, string> = {
    sp500: 'S&P500',
    nasdaq100: '나스닥100',
    dividend: '배당',
    bond: '채권',
    domestic_index: '국내지수',
    sector: '섹터',
    other: '기타',
  };
  return labels[category || 'other'] || '기타';
}

export function getProviderLabel(provider?: StockHolding['provider']): string {
  return provider || '기타';
}

export function getOwnerLabel(owner: StockHolding['owner']): string {
  const labels: Record<string, string> = {
    husband: '남편',
    wife: '아내',
    joint: '공동',
  };
  return labels[owner] || owner;
}

export function formatKrw(value: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(Math.floor(value))}원`;
}
