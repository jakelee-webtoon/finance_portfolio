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
  if (!exchangeRates) return amount;
  if (currency === 'USD') return amount * exchangeRates.USD_TO_KRW;
  if (currency === 'EUR') return amount * exchangeRates.EUR_TO_KRW;
  return amount;
}

export function getHoldingCurrentValueKrw(holding: StockHolding, exchangeRates: Record<string, number> | null): number {
  const currentPrice = holding.currentPrice || holding.purchasePrice;
  return toKrwAmount(currentPrice * holding.quantity, holding.currency || 'KRW', exchangeRates);
}

export function getHoldingPurchaseValueKrw(holding: StockHolding, exchangeRates: Record<string, number> | null): number {
  return toKrwAmount(holding.purchasePrice * holding.quantity, holding.currency || 'KRW', exchangeRates);
}

export function getHoldingGainLossKrw(holding: StockHolding, exchangeRates: Record<string, number> | null): number {
  return getHoldingCurrentValueKrw(holding, exchangeRates) - getHoldingPurchaseValueKrw(holding, exchangeRates);
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
