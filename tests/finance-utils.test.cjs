const assert = require('node:assert/strict');
const test = require('node:test');

require('sucrase/register/ts');

const {
  calculateComparison,
  calculateTopPercentile,
} = require('../lib/salaryComparison.ts');
const {
  formatCurrency,
  formatNumber,
  formatPercentage,
} = require('../lib/salaryFormat.ts');
const {
  getHoldingCurrentValueKrw,
  getEtfCategoryPerformance,
  getHoldingGainLossKrw,
  getHoldingPurchaseValueKrw,
  isIsaEtfHolding,
  isStockHolding,
  toKrwAmount,
} = require('../lib/investments.ts');
const {
  calculateFinancialSummary,
  isStandaloneInvestmentHolding,
} = require('../lib/financialSummary.ts');
const { buildRsuAssets } = require('../lib/rsuAssets.ts');

const salaryStats = {
  year: '2025',
  org: 'NAVER_HQ',
  scope: 'TC',
  min: 50_000_000,
  p25: 80_000_000,
  median: 100_000_000,
  avg: 105_000_000,
  p75: 130_000_000,
  max: 200_000_000,
  n: 100,
};

test('salary formatting keeps Korean currency conventions', () => {
  assert.equal(formatCurrency(12_345_678, '만원'), '1,235만원');
  assert.equal(formatCurrency(12_345_678, '원'), '12,345,678원');
  assert.equal(formatNumber(12_345_678, '만원'), '1,235');
  assert.equal(formatPercentage(12.345), '+12.3%');
  assert.equal(formatPercentage(-12.345, 2), '-12.35%');
});

test('salary comparison reports gaps and band membership', () => {
  const comparison = calculateComparison(110_000_000, salaryStats);

  assert.equal(comparison.medianGapAmount, 10_000_000);
  assert.ok(Math.abs(comparison.medianGapPct - 10) < Number.EPSILON * 64);
  assert.equal(comparison.p75Remaining, 20_000_000);
  assert.equal(comparison.bandInOut, 'IN');
  assert.equal(comparison.percentile, '상위 41.7%');
});

test('top percentile is monotonic and handles collapsed ranges', () => {
  assert.equal(calculateTopPercentile(50_000_000, salaryStats), 100);
  assert.equal(calculateTopPercentile(80_000_000, salaryStats), 75);
  assert.equal(calculateTopPercentile(100_000_000, salaryStats), 50);
  assert.equal(calculateTopPercentile(130_000_000, salaryStats), 25);
  assert.equal(calculateTopPercentile(200_000_000, salaryStats), 0);

  const collapsedStats = {
    min: 100,
    p25: 100,
    median: 100,
    p75: 100,
    max: 100,
  };
  assert.equal(Number.isNaN(calculateTopPercentile(100, collapsedStats)), false);
});

test('investment helpers classify holdings and convert to KRW', () => {
  const rates = { USD_TO_KRW: 1350, EUR_TO_KRW: 1450 };
  const holding = {
    id: 'aapl',
    symbol: 'AAPL',
    name: 'Apple',
    quantity: 10,
    purchasePrice: 100,
    currentPrice: 120,
    owner: 'husband',
    currency: 'USD',
    exchange: 'NASDAQ',
    source_type: 'manual',
    as_of_date: '2026-09-15',
    last_modified_by: 'husband',
  };

  assert.equal(isStockHolding(holding), true);
  assert.equal(isIsaEtfHolding({ ...holding, type: 'etf' }), true);
  assert.equal(toKrwAmount(10, 'USD', rates), 13_500);
  assert.equal(getHoldingPurchaseValueKrw(holding, rates), 1_350_000);
  assert.equal(getHoldingCurrentValueKrw(holding, rates), 1_620_000);
  assert.equal(getHoldingGainLossKrw(holding, rates), 270_000);
});

test('ETF category performance groups ISA holdings by category', () => {
  const rates = { USD_TO_KRW: 1350, EUR_TO_KRW: 1450 };
  const baseHolding = {
    id: 'base',
    symbol: '360750',
    name: 'TIGER 미국S&P500',
    quantity: 10,
    purchasePrice: 10_000,
    currentPrice: 11_000,
    owner: 'joint',
    currency: 'KRW',
    exchange: 'KRX',
    type: 'etf',
    accountType: 'isa',
    source_type: 'manual',
    as_of_date: '2026-09-15',
    last_modified_by: 'husband',
  };

  const rows = getEtfCategoryPerformance([
    { ...baseHolding, id: 'sp500-1', etfCategory: 'sp500' },
    { ...baseHolding, id: 'sp500-2', etfCategory: 'sp500', quantity: 5, purchasePrice: 20_000, currentPrice: 19_000 },
    { ...baseHolding, id: 'nasdaq-1', etfCategory: 'nasdaq100', purchasePrice: 10_000, currentPrice: 12_000 },
  ], rates);

  const sp500 = rows.find((row) => row.category === 'sp500');
  const nasdaq = rows.find((row) => row.category === 'nasdaq100');

  assert.equal(rows.length, 2);
  assert.equal(sp500.label, 'S&P500');
  assert.equal(sp500.currentValue, 205_000);
  assert.equal(sp500.purchaseValue, 200_000);
  assert.equal(sp500.gainLoss, 5_000);
  assert.equal(sp500.holdingsCount, 2);
  assert.equal(nasdaq.gainLoss, 20_000);
  assert.ok(Math.abs(nasdaq.returnPct - 20) < Number.EPSILON * 64);
});

const baseEntity = {
  source_type: 'manual',
  as_of_date: '2026-09-23',
  last_modified_by: 'husband',
};

test('financial summary applies one shared asset and net-worth equation', () => {
  const rates = { USD_TO_KRW: 1_000, EUR_TO_KRW: 1_500 };
  const assets = [
    { ...baseEntity, id: 'cash', name: '현금', category: 'cash', amount: 1_000, owner: 'joint', currency: 'KRW' },
    { ...baseEntity, id: 'usd', name: '달러', category: 'cash', amount: 2, owner: 'husband', currency: 'USD' },
    { ...baseEntity, id: 'car', name: '자동차', category: 'other', amount: 500, owner: 'joint', currency: 'KRW' },
  ];
  const liabilities = [
    { ...baseEntity, id: 'loan', name: '대출', category: 'loan', amount: 300, owner: 'joint', currency: 'KRW' },
    { ...baseEntity, id: 'foreign-loan', name: '외화대출', category: 'loan', amount: 1, owner: 'husband', currency: 'USD' },
  ];
  const holdings = [
    { ...baseEntity, id: 'isa', symbol: '360750', name: 'ISA ETF', quantity: 2, purchasePrice: 90, currentPrice: 100, owner: 'husband', currency: 'KRW', exchange: 'KRX', type: 'etf', accountType: 'isa' },
    { ...baseEntity, id: 'stock', symbol: '005930', name: '일반 주식', quantity: 3, purchasePrice: 40, currentPrice: 50, owner: 'joint', currency: 'KRW', exchange: 'KRX', type: 'stock' },
    { ...baseEntity, id: 'rsu', symbol: 'WBTN', name: 'RSU', quantity: 999, purchasePrice: 0, currentPrice: 100, owner: 'husband', currency: 'USD', exchange: 'NASDAQ', type: 'rsu' },
  ];

  const summary = calculateFinancialSummary({ assets, liabilities, holdings, scope: 'combined', exchangeRates: rates });

  assert.equal(summary.totalAssets, 3_350);
  assert.equal(summary.otherAssets, 500);
  assert.equal(summary.totalLiabilities, 1_300);
  assert.equal(summary.netWorth, 2_050);
  assert.equal(summary.includedHoldings.length, 2);
  assert.equal(summary.investmentAssetRows.reduce((sum, row) => sum + row.amount, 0), 350);
  assert.equal(summary.assetCategoryTotals.find((item) => item.category === 'stocks' && !item.isOther).amount, 350);
  assert.equal(summary.assetCategoryTotals.filter((item) => !item.isOther).reduce((sum, item) => sum + item.amount, 0), summary.totalAssets);
  assert.equal(summary.liabilityCategoryTotals.reduce((sum, item) => sum + item.amount, 0), summary.totalLiabilities);
});

test('financial summary reconciles fractional currency conversions to exact displayed totals', () => {
  const rates = { USD_TO_KRW: 1.5, EUR_TO_KRW: 1.5 };
  const holdings = [
    { ...baseEntity, id: 'h', symbol: 'A', name: 'A', quantity: 1, purchasePrice: 1, owner: 'husband', currency: 'USD', exchange: 'NASDAQ', type: 'stock' },
    { ...baseEntity, id: 'w', symbol: 'B', name: 'B', quantity: 1, purchasePrice: 1, owner: 'wife', currency: 'USD', exchange: 'NASDAQ', type: 'stock' },
  ];
  const summary = calculateFinancialSummary({ assets: [], liabilities: [], holdings, scope: 'combined', exchangeRates: rates });

  assert.equal(summary.totalAssets, 3);
  assert.equal(summary.investmentAssetRows.reduce((sum, item) => sum + item.amount, 0), 3);
  assert.equal(summary.assetCategoryTotals.reduce((sum, item) => sum + item.amount, 0), 3);
});

test('financial summary applies owner scope and legacy other-asset flags', () => {
  const rates = { USD_TO_KRW: 1_000, EUR_TO_KRW: 1_500 };
  const assets = [
    { ...baseEntity, id: 'husband', name: '남편', category: 'cash', amount: 100, owner: 'husband', currency: 'KRW' },
    { ...baseEntity, id: 'wife', name: '아내', category: 'cash', amount: 200, owner: 'wife', currency: 'KRW' },
    { ...baseEntity, id: 'joint', name: '공동', category: 'cash', amount: 300, owner: 'joint', currency: 'KRW' },
    { ...baseEntity, id: 'legacy-other', name: '기타', category: 'cash', amount: 400, owner: 'husband', currency: 'KRW', isOtherAsset: true },
  ];
  const holdings = [
    { ...baseEntity, id: 'wife-isa', symbol: 'ETF', name: '아내 ISA', quantity: 1, purchasePrice: 50, owner: 'wife', currency: 'KRW', exchange: 'KRX', type: 'etf', accountType: 'isa' },
  ];

  const husband = calculateFinancialSummary({ assets, liabilities: [], holdings, scope: 'husband', exchangeRates: rates });
  const wife = calculateFinancialSummary({ assets, liabilities: [], holdings, scope: 'wife', exchangeRates: rates });

  assert.equal(husband.totalAssets, 400);
  assert.equal(husband.otherAssets, 400);
  assert.equal(wife.totalAssets, 550);
});

test('standalone holdings exclude RSU and options already synced to assets', () => {
  assert.equal(isStandaloneInvestmentHolding({ type: 'stock' }), true);
  assert.equal(isStandaloneInvestmentHolding({ type: 'etf' }), true);
  assert.equal(isStandaloneInvestmentHolding({ type: 'rsu' }), false);
  assert.equal(isStandaloneInvestmentHolding({ type: 'option' }), false);
  assert.equal(isStandaloneInvestmentHolding({ type: 'rsu', accountType: 'isa' }), false);
});

test('current price zero is respected instead of falling back to purchase price', () => {
  const holding = {
    ...baseEntity,
    id: 'zero',
    symbol: 'ZERO',
    name: 'Zero',
    quantity: 10,
    purchasePrice: 100,
    currentPrice: 0,
    owner: 'joint',
    currency: 'KRW',
    exchange: 'KRX',
  };
  assert.equal(getHoldingCurrentValueKrw(holding, { USD_TO_KRW: 1_000, EUR_TO_KRW: 1_500 }), 0);
});

test('RSU asset rebuild removes stale rows and keeps owners separate', () => {
  const assets = [
    { ...baseEntity, id: 'cash', name: '현금', category: 'cash', amount: 100, owner: 'joint', currency: 'KRW' },
    { ...baseEntity, id: 'asset-rsu-old-vested', name: 'RSU (vested)', category: 'stocks', amount: 999, owner: 'joint', currency: 'USD' },
  ];
  const holdingBase = {
    ...baseEntity,
    symbol: 'WBTN',
    name: 'WEBTOON',
    quantity: 0,
    purchasePrice: 0,
    currentPrice: 10,
    currency: 'USD',
    exchange: 'NASDAQ',
    type: 'rsu',
  };
  const rebuilt = buildRsuAssets(assets, [
    { ...holdingBase, id: 'h', owner: 'husband', totalQuantity: 2, vestingDate: '2026-01-01' },
    { ...holdingBase, id: 'w', owner: 'wife', totalQuantity: 3, vestingDate: '2027-01-01' },
  ], { asOfDate: '2026-09-23', modifiedBy: 'husband' });

  assert.equal(rebuilt.filter((asset) => asset.id.startsWith('asset-rsu-')).length, 2);
  assert.equal(rebuilt.find((asset) => asset.owner === 'husband').amount, 20);
  assert.equal(rebuilt.find((asset) => asset.owner === 'husband').category, 'stocks');
  assert.equal(rebuilt.find((asset) => asset.owner === 'wife').amount, 30);
  assert.equal(rebuilt.find((asset) => asset.owner === 'wife').category, 'other');

  const cleared = buildRsuAssets(rebuilt, [], { asOfDate: '2026-09-23', modifiedBy: 'husband' });
  assert.deepEqual(cleared.map((asset) => asset.id), ['cash']);
});
