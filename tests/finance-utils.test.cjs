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
  getHoldingGainLossKrw,
  getHoldingPurchaseValueKrw,
  isIsaEtfHolding,
  isStockHolding,
  toKrwAmount,
} = require('../lib/investments.ts');

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
