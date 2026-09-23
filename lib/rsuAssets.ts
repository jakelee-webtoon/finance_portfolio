import { Asset, StockHolding } from '../types';

type SyncRsuAssetsOptions = {
  asOfDate: string;
  modifiedBy: 'husband' | 'wife';
};

function idSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '-');
}

/**
 * Rebuilds auto-generated RSU assets from the holdings source of truth.
 * Existing generated rows are removed first, so deleting the last holding
 * cannot leave a stale asset behind.
 */
export function buildRsuAssets(
  assets: Asset[],
  holdings: StockHolding[],
  { asOfDate, modifiedBy }: SyncRsuAssetsOptions
): Asset[] {
  const manualAssets = assets.filter((asset) => !asset.id.startsWith('asset-rsu-'));
  const grouped = new Map<string, {
    stockName: string;
    owner: StockHolding['owner'];
    currency: string;
    holdings: StockHolding[];
  }>();

  holdings
    .filter((holding) => holding.type === 'rsu' || holding.type === 'option')
    .forEach((holding) => {
      const stockName = holding.name || holding.symbol;
      const currency = holding.currency ||
        (holding.exchange === 'NASDAQ' || holding.exchange === 'NYSE' ? 'USD' : 'KRW');
      const key = `${stockName}\u0000${holding.owner}\u0000${currency}`;
      const group = grouped.get(key);
      if (group) {
        group.holdings.push(holding);
      } else {
        grouped.set(key, { stockName, owner: holding.owner, currency, holdings: [holding] });
      }
    });

  const generatedAssets: Asset[] = [];

  grouped.forEach(({ stockName, owner, currency, holdings: groupedHoldings }) => {
    let vestedValue = 0;
    let unvestedValue = 0;

    groupedHoldings.forEach((holding) => {
      if (holding.isRealized) return;
      const currentPrice = holding.currentPrice ?? 0;
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

      let value = 0;
      if (holding.type === 'rsu' && holding.totalQuantity !== undefined) {
        value = currentPrice * holding.totalQuantity;
      } else if (holding.type === 'option' && holding.strikePrice !== undefined) {
        value = Math.max(0, currentPrice - holding.strikePrice) * holding.quantity;
      } else {
        value = currentPrice * holding.quantity;
      }
      if (!Number.isFinite(value) || value <= 0) return;

      const isVested = !holding.vestingDate || holding.vestingDate <= asOfDate;
      if (isVested) vestedValue += value;
      else unvestedValue += value;
    });

    const idBase = `asset-rsu-${idSegment(stockName)}-${owner}-${currency}`;
    const addAsset = (kind: 'vested' | 'unvested', amount: number) => {
      if (amount <= 0) return;
      generatedAssets.push({
        id: `${idBase}-${kind}`,
        name: kind === 'vested' ? 'RSU (vested)' : 'RSU (unvested)',
        category: kind === 'vested' ? 'stocks' : 'other',
        amount: Math.floor(amount),
        owner,
        currency,
        source_type: 'auto',
        as_of_date: asOfDate,
        last_modified_by: modifiedBy,
      });
    };

    addAsset('vested', vestedValue);
    addAsset('unvested', unvestedValue);
  });

  return [...manualAssets, ...generatedAssets];
}
