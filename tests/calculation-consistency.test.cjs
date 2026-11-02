const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { transform } = require('sucrase');
require('sucrase/register/ts');

const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
  return originalResolve.call(this, request, parent, ...rest);
};
const calendar = require('../lib/calendar.ts');
const { buildFinanceSnapshot } = require('../lib/assistantSnapshot.ts');
const { buildAssistantSummaryFromData } = require('../lib/assistantSummary.ts');
const { buildFinanceChatContext } = require('../lib/assistantChatContext.ts');
const plans = require('../lib/monthlyPlans.ts');
const { buildMissingFixedEntries } = require('../lib/recurringLedger.ts');

const base = { source_type: 'manual', as_of_date: '2026-10-01', last_modified_by: 'husband' };
const bill = (id, extra = {}) => ({ ...base, id, date: '2026-09-10', month: '2026-09', type: 'expense_fixed', category: 'insurance', amount: 100, payment_method: 'transfer', owner: 'husband', is_fixed: true, ...extra });
const plan = extra => ({ ...base, id: 'p', month: '2026-10', owner: 'wife', category: 'saving', title: '저축(마통상환)', targetAmount: 100, isCompleted: true, ...extra });
const rateValues = (usd = 1600, eur = 1800) => ({ USD_TO_KRW: usd, EUR_TO_KRW: eur, KRW_TO_USD: 1 / usd, KRW_TO_EUR: 1 / eur, USD_TO_EUR: usd / eur, EUR_TO_USD: eur / usd });

test('calendar month/week boundaries are identical in Seoul, UTC and Los Angeles', () => {
  const program = `require('sucrase/register/ts'); const c=require('./lib/calendar.ts'); console.log(JSON.stringify([c.previousMonth('2026-01'),c.monthEnd('2026-10'),c.monthEnd('2028-02'),c.weekStartKey('2026-10-04'),c.weekStartKey('2026-10-05'),c.addDays('2026-09-28',6),c.seoulDate(new Date('2026-09-30T15:00:00Z'))]));`;
  for (const TZ of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
    const output = execFileSync(process.execPath, ['-e', program], { cwd: path.join(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), ['2025-12', '2026-10-31', '2028-02-29', '2026-09-28', '2026-10-05', '2026-10-04', '2026-10-01']);
  }
});

test('snapshot compares the true previous month and keeps bills due today in Seoul', () => {
  const snapshot = buildFinanceSnapshot({ month: '2026-10', ledgerEntries: [
    bill('sep'), bill('oct', { month: '2026-10', date: '2026-10-01', amount: 150 }),
    bill('aug', { month: '2026-08', date: '2026-08-01', amount: 999 }),
  ], monthlyPlans: [], now: new Date('2026-09-30T15:30:00Z') });
  assert.equal(snapshot.period.end, '2026-10-31');
  assert.equal(snapshot.categories[0].deltaFromPreviousPeriod, 50);
  assert.equal(snapshot.upcomingBills[0].dueDate, '2026-10-01');
});

test('explicit zero, partial actual, and legacy missing actual have one shared meaning', () => {
  assert.equal(plans.getPlanActualAmount(plan({ actualAmount: 0 })), 0);
  assert.equal(plans.getPlanActualAmount(plan({ actualAmount: 30 })), 30);
  assert.equal(plans.getPlanActualAmount(plan({})), 100);
  assert.equal(plans.getPlanActualAmount(plan({ isCompleted: false })), 0);
  assert.equal(plans.getPlanActualAmount(plan({ actualAmount: -1 })), 0);
});

test('annual targets use the existing 2026 launch period and full later years', () => {
  const cash = plans.MANAGED_PLAN_ITEMS.find(item => item.key === 'husband-cash');
  const saving = plans.MANAGED_PLAN_ITEMS.find(item => item.key === 'wife-saving');
  assert.equal(plans.getPlanAnnualTarget(cash, '2026'), 2700000);
  assert.equal(plans.getPlanAnnualTarget(saving, '2026'), 7300000);
  assert.equal(plans.getPlanAnnualTarget(cash, '2027'), 7200000);
  assert.equal(plans.getPlanAnnualTarget(saving, '2027'), 18000000);
});

test('legacy plan names remain visible and new plan IDs are deterministic', () => {
  assert.equal(plans.getManagedPlanItem(plan({ title: '저축/상환' })).key, 'wife-saving');
  assert.equal(plans.getManagedPlanItem(plan({ category: 'irregular_expense', title: '비정기지출 준비' })).key, 'wife-irregular');
  assert.equal(plans.getManagedPlanItem(plan({ planKey: 'wife-saving', title: '내 이름' })).key, 'wife-saving');
  assert.equal(plans.defaultPlanId('2026-10', 'wife-saving'), plans.defaultPlanId('2026-10', 'wife-saving'));
  assert.notEqual(plans.defaultPlanId('2026-11', 'wife-saving'), plans.defaultPlanId('2026-10', 'wife-saving'));
});

test('repeated bills are not recreated when their amount or identifying fields are edited', () => {
  const previous = bill('source');
  const first = buildMissingFixedEntries([previous], '2026-10', '2026-10-01', 'husband');
  const anotherDevice = buildMissingFixedEntries([previous], '2026-10', '2026-10-01', 'wife');
  assert.equal(first[0].id, anotherDevice[0].id);
  const edited = { ...first[0], amount: 200, owner: 'wife', subcategory: '변경', is_fixed: false };
  assert.equal(buildMissingFixedEntries([previous, edited], '2026-10', '2026-10-02', 'husband').length, 0);
  const next = buildMissingFixedEntries([previous, { ...first[0], amount: 200 }], '2026-11', '2026-11-01', 'husband');
  assert.equal(next[0].id, 'ledger-fixed-2026-11-source');
  assert.equal(next[0].amount, 200);
});

test('legacy fixed rows match without amount, one-to-one, and with transaction type retained', () => {
  const previous = [bill('one'), bill('two')];
  const legacy = bill('old-random-id', { month: '2026-10', date: '2026-10-01', amount: 200 });
  const missing = buildMissingFixedEntries([...previous, legacy], '2026-10', '2026-10-01', 'husband');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].id, 'ledger-fixed-2026-10-two');
  assert.equal(legacy.amount, 200);
  assert.equal(buildMissingFixedEntries([bill('saving', { type: 'savings' }), legacy], '2026-10', '2026-10-01', 'husband').length, 1);
});

function summaryData(extra = {}) {
  return { state: { householdName: '우리집', baseMonth: '2026-10', scope: 'combined' },
    assets: [], liabilities: [], holdings: [], income: [], transactions: [], ledgerEntries: [], monthlyPlans: [],
    now: new Date('2026-10-10T00:00:00+09:00'), exchangeRates: rateValues(), ...extra };
}

test('assistant values use supplied screen exchange rates instead of fixed 1300', () => {
  const data = summaryData({ assets: [
    { ...base, id: 'usd', name: 'USD', category: 'cash', amount: 10, currency: 'USD', owner: 'husband' },
    { ...base, id: 'eur', name: 'EUR', category: 'cash', amount: 2, currency: 'EUR', owner: 'wife' },
  ], liabilities: [{ ...base, id: 'loan', name: 'Loan', category: 'loan', amount: 1, currency: 'USD', owner: 'husband' }] });
  const summary = buildAssistantSummaryFromData(data);
  assert.equal(summary.snapshot.totalAssets, 19600);
  assert.equal(summary.snapshot.netWorth, 18000);
  const context = buildFinanceChatContext(data, data.now, '자산', data.exchangeRates);
  assert.match(context, /18,000원/);
  assert.match(context, /19,600원/);
});

test('assistant cashflow and plan totals follow the selected owner, including joint rows', () => {
  const data = summaryData({ state: { householdName: '우리집', baseMonth: '2026-10', scope: 'husband' },
    ledgerEntries: [bill('h', { month: '2026-10' }), bill('w', { month: '2026-10', owner: 'wife', amount: 999 }), bill('j', { month: '2026-10', owner: 'joint', amount: 50 })],
    monthlyPlans: [plan({ owner: 'husband', actualAmount: 0 }), plan({ id: 'legacy', owner: 'joint' }), plan({ id: 'wife', actualAmount: 999 })] });
  const summary = buildAssistantSummaryFromData(data);
  assert.equal(summary.snapshot.cashflow.expense, 150);
  assert.equal(summary.aggregates.budgetStatus.actualTotal, 100);
  assert.equal(summary.aggregates.budgetStatus.totalCount, 2);
});

test('assistant weekly ranges start Monday and end Sunday without UTC date shifts', () => {
  const summary = buildAssistantSummaryFromData(summaryData({ ledgerEntries: [
    bill('sun', { month: '2026-10', date: '2026-10-04' }), bill('mon', { month: '2026-10', date: '2026-10-05' }),
  ] }));
  assert.deepEqual(summary.aggregates.weeklyCashflow.map(week => [week.weekStart, week.weekEnd]), [
    ['2026-09-28', '2026-10-04'], ['2026-10-05', '2026-10-11'],
  ]);
});

function rateModule(fetch, options = {}) {
  const storage = new Map(options.storage || []);
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => {
    if (options.fullStorage) throw new Error('quota');
    storage.set(key, value);
  } };
  const mod = { exports: {} };
  const filename = path.join(__dirname, '../lib/exchangeRate.ts');
  vm.runInNewContext(transform(fs.readFileSync(filename, 'utf8'), { transforms: ['typescript', 'imports'] }).code,
    { module: mod, exports: mod.exports, fetch, window: {}, localStorage, Date, Number });
  return { rates: mod.exports, storage };
}

test('successful rates are shared by synchronous assistant summaries and cache quota is harmless', async () => {
  const { rates } = rateModule(async () => ({ ok: true, json: async () => rateValues() }), { fullStorage: true });
  assert.equal((await rates.getExchangeRates()).USD_TO_KRW, 1600);
  assert.equal(rates.getCachedExchangeRates().USD_TO_KRW, 1600);
  assert.equal(rates.getExchangeRateNotice(), '');
});

test('network failure retains the last valid rates and their original timestamp', async () => {
  const timestamp = Date.now() - 120000;
  const cached = JSON.stringify({ rates: rateValues(), timestamp, version: 2 });
  const { rates, storage } = rateModule(async () => { throw new Error('offline'); }, { storage: [['exchange-rate-cache', cached]] });
  assert.equal((await rates.getExchangeRates()).USD_TO_KRW, 1600);
  assert.match(rates.getExchangeRateNotice(), /마지막 저장/);
  assert.equal(JSON.parse(storage.get('exchange-rate-cache')).timestamp, timestamp);
});

test('missing or invalid rates use an explicitly labelled fallback on repeated failures', async () => {
  const { rates } = rateModule(async () => ({ ok: true, json: async () => ({ USD_TO_KRW: -1 }) }));
  for (let i = 0; i < 2; i++) {
    assert.equal((await rates.getExchangeRates()).USD_TO_KRW, 1300);
    assert.match(rates.getExchangeRateNotice(), /대체 환율/);
  }
});

test('concurrent rate callers share one request', async () => {
  let requests = 0; let release;
  const { rates } = rateModule(() => { requests++; return new Promise(resolve => { release = resolve; }); });
  const first = rates.getExchangeRates(); const second = rates.getExchangeRates();
  release({ ok: true, json: async () => rateValues() });
  assert.equal((await first).USD_TO_KRW, 1600);
  assert.equal((await second).USD_TO_KRW, 1600);
  assert.equal(requests, 1);
});

function rateRoute(fetch) {
  const mod = { exports: {} };
  const filename = path.join(__dirname, '../app/api/exchange-rate/route.ts');
  vm.runInNewContext(transform(fs.readFileSync(filename, 'utf8'), { transforms: ['typescript', 'imports'] }).code,
    { module: mod, exports: mod.exports, fetch, Date, Number, require: name => {
      assert.equal(name, 'next/server');
      return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } };
    } });
  return mod.exports;
}

test('rate API still tries its independent provider when Yahoo throws', async () => {
  const requests = [];
  const route = rateRoute(async url => {
    requests.push(url);
    if (requests.length === 1) throw new Error('Yahoo offline');
    return { ok: true, json: async () => ({ rates: { KRW: 1600, EUR: 0.9 } }) };
  });
  const response = await route.GET();
  assert.equal(requests.length, 2);
  assert.equal(response.status, 200);
  assert.equal(response.body.USD_TO_KRW, 1600);
});

test('rate API reports failure if both providers fail, instead of labelling fallback as live', async () => {
  let requests = 0;
  const response = await rateRoute(async () => { requests++; throw new Error('offline'); }).GET();
  assert.equal(requests, 2);
  assert.equal(response.status, 502);
});

test('successful Yahoo rate uses observed EUR rather than a fixed cross rate', async () => {
  const response = await rateRoute(async url => ({ ok: true, json: async () =>
    url.includes('yahoo') ? { chart: { result: [{ meta: { regularMarketPrice: 1600 } }] } } : { rates: { KRW: 1590, EUR: 0.8 } }
  })).GET();
  assert.equal(response.status, 200);
  assert.equal(response.body.USD_TO_KRW, 1600);
  assert.equal(response.body.USD_TO_EUR, 0.8);
  assert.equal(response.body.EUR_TO_KRW, 2000);
});

test('Yahoo alone cannot label an unavailable EUR rate as live', async () => {
  const response = await rateRoute(async url => {
    if (!url.includes('yahoo')) throw new Error('EUR unavailable');
    return { ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 1600 } }] } }) };
  }).GET();
  assert.equal(response.status, 502);
});
