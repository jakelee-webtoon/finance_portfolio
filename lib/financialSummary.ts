import { Asset, Liability, Scope, StockHolding } from '../types';
import { getHoldingCurrentValueKrw, isIsaEtfHolding, isStockHolding, toKrwAmount } from './investments';

export type ExchangeRates = Record<string, number>;

export interface CategoryTotal {
  category: string;
  amount: number;
  isOther: boolean;
}

export interface FinancialSummary {
  scopedAssets: Asset[];
  scopedLiabilities: Liability[];
  includedAssets: Asset[];
  otherAssetItems: Asset[];
  includedHoldings: StockHolding[];
  investmentAssetRows: Asset[];
  netWorthAssetRows: Asset[];
  totalAssets: number;
  otherAssets: number;
  totalLiabilities: number;
  netWorth: number;
  assetCategoryTotals: CategoryTotal[];
  liabilityCategoryTotals: Omit<CategoryTotal, 'isOther'>[];
}

type FinancialSummaryInput = {
  assets: Asset[];
  liabilities: Liability[];
  holdings: StockHolding[];
  scope: Scope;
  exchangeRates: ExchangeRates | null;
};

export function belongsToScope(
  owner: Asset['owner'] | Liability['owner'] | StockHolding['owner'],
  scope: Scope
): boolean {
  return scope === 'combined' || owner === scope || owner === 'joint';
}

export function isOtherAsset(asset: Asset): boolean {
  return asset.category === 'other' || asset.isOtherAsset === true;
}

/**
 * Holdings stored outside the asset collection and therefore added separately.
 * RSU/options are excluded because the RSU page already syncs them into assets.
 */
export function isStandaloneInvestmentHolding(holding: StockHolding): boolean {
  if (holding.type === 'rsu' || holding.type === 'option') return false;
  return isStockHolding(holding) || isIsaEtfHolding(holding);
}

function sumKrw<T extends { amount: number; currency: string }>(
  items: T[],
  exchangeRates: ExchangeRates
): number {
  return items.reduce((sum, item) => {
    if (!Number.isFinite(item.amount)) return sum;
    return sum + toKrwAmount(item.amount, item.currency, exchangeRates);
  }, 0);
}

function buildInvestmentAssetRows(
  holdings: StockHolding[],
  exchangeRates: ExchangeRates
): Asset[] {
  const grouped = new Map<string, Asset>();

  holdings.forEach((holding) => {
    const isIsa = isIsaEtfHolding(holding);
    const groupKey = `${isIsa ? 'isa' : 'stock'}-${holding.owner}`;
    const amount = getHoldingCurrentValueKrw(holding, exchangeRates);
    if (!Number.isFinite(amount)) return;

    const existing = grouped.get(groupKey);
    if (existing) {
      existing.amount += amount;
      if (holding.as_of_date > existing.as_of_date) {
        existing.as_of_date = holding.as_of_date;
        existing.last_modified_by = holding.last_modified_by;
      }
      return;
    }

    grouped.set(groupKey, {
      id: `summary-${groupKey}`,
      name: isIsa ? 'ISA ETF' : '일반 주식',
      category: 'stocks',
      amount,
      owner: holding.owner,
      currency: 'KRW',
      source_type: 'auto',
      as_of_date: holding.as_of_date,
      last_modified_by: holding.last_modified_by,
    });
  });

  const rawRows = Array.from(grouped.values());
  const rows = rawRows.map((asset) => ({
    ...asset,
    amount: Math.floor(asset.amount),
  }));
  const targetTotal = Math.floor(rawRows.reduce((sum, asset) => sum + asset.amount, 0));
  const roundedTotal = rows.reduce((sum, asset) => sum + asset.amount, 0);
  if (rows.length > 0) rows[0].amount += targetTotal - roundedTotal;
  return rows;
}

function reconcileCategoryTotals(
  totals: CategoryTotal[],
  target: number,
  isOther: boolean
): void {
  const matching = totals.filter((item) => item.isOther === isOther);
  if (matching.length === 0) return;
  const roundedTotal = matching.reduce((sum, item) => sum + item.amount, 0);
  const largest = matching.reduce((current, item) => item.amount > current.amount ? item : current);
  largest.amount += target - roundedTotal;
}

export function calculateFinancialSummary({
  assets,
  liabilities,
  holdings,
  scope,
  exchangeRates,
}: FinancialSummaryInput): FinancialSummary {
  const scopedAssets = assets.filter((asset) => belongsToScope(asset.owner, scope));
  const scopedLiabilities = liabilities.filter((liability) => belongsToScope(liability.owner, scope));
  const scopedHoldings = holdings.filter((holding) => belongsToScope(holding.owner, scope));
  const includedAssets = scopedAssets.filter((asset) => !isOtherAsset(asset));
  const otherAssetItems = scopedAssets.filter(isOtherAsset);
  const includedHoldings = scopedHoldings.filter(isStandaloneInvestmentHolding);

  if (!exchangeRates) {
    return {
      scopedAssets,
      scopedLiabilities,
      includedAssets,
      otherAssetItems,
      includedHoldings,
      investmentAssetRows: [],
      netWorthAssetRows: includedAssets,
      totalAssets: 0,
      otherAssets: 0,
      totalLiabilities: 0,
      netWorth: 0,
      assetCategoryTotals: [],
      liabilityCategoryTotals: [],
    };
  }

  const assetValue = sumKrw(includedAssets, exchangeRates);
  const investmentValue = includedHoldings.reduce((sum, holding) => {
    const value = getHoldingCurrentValueKrw(holding, exchangeRates);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const totalAssets = Math.floor(assetValue + investmentValue);
  const otherAssets = Math.floor(sumKrw(otherAssetItems, exchangeRates));
  const totalLiabilities = Math.floor(sumKrw(scopedLiabilities, exchangeRates));

  const assetCategories = new Map<string, { amount: number; isOther: boolean }>();
  scopedAssets.forEach((asset) => {
    if (!Number.isFinite(asset.amount)) return;
    const isOther = isOtherAsset(asset);
    const key = `${isOther ? 'other' : 'included'}:${asset.category}`;
    const current = assetCategories.get(key)?.amount || 0;
    assetCategories.set(key, {
      amount: current + toKrwAmount(asset.amount, asset.currency, exchangeRates),
      isOther,
    });
  });
  if (investmentValue !== 0) {
    const key = 'included:stocks';
    const current = assetCategories.get(key)?.amount || 0;
    assetCategories.set(key, { amount: current + investmentValue, isOther: false });
  }

  const liabilityCategories = new Map<string, number>();
  scopedLiabilities.forEach((liability) => {
    if (!Number.isFinite(liability.amount)) return;
    const current = liabilityCategories.get(liability.category) || 0;
    liabilityCategories.set(
      liability.category,
      current + toKrwAmount(liability.amount, liability.currency, exchangeRates)
    );
  });

  const investmentAssetRows = buildInvestmentAssetRows(includedHoldings, exchangeRates);
  const netWorthAssetRows = [...includedAssets, ...investmentAssetRows].sort(
    (a, b) =>
      toKrwAmount(b.amount, b.currency, exchangeRates) -
      toKrwAmount(a.amount, a.currency, exchangeRates)
  );

  const assetCategoryTotals = Array.from(assetCategories.entries()).map(([key, value]) => ({
    category: key.split(':')[1],
    amount: Math.floor(value.amount),
    isOther: value.isOther,
  }));
  reconcileCategoryTotals(assetCategoryTotals, totalAssets, false);
  reconcileCategoryTotals(assetCategoryTotals, otherAssets, true);

  const liabilityCategoryTotals = Array.from(liabilityCategories.entries()).map(([category, amount]) => ({
    category,
    amount: Math.floor(amount),
  }));
  if (liabilityCategoryTotals.length > 0) {
    const roundedTotal = liabilityCategoryTotals.reduce((sum, item) => sum + item.amount, 0);
    const largest = liabilityCategoryTotals.reduce(
      (current, item) => item.amount > current.amount ? item : current
    );
    largest.amount += totalLiabilities - roundedTotal;
  }

  return {
    scopedAssets,
    scopedLiabilities,
    includedAssets,
    otherAssetItems,
    includedHoldings,
    investmentAssetRows,
    netWorthAssetRows,
    totalAssets,
    otherAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    assetCategoryTotals,
    liabilityCategoryTotals,
  };
}
