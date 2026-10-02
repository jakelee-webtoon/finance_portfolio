const assert = require('node:assert/strict');
const test = require('node:test');

require('sucrase/register/ts');

const Module = require('node:module');
const path = require('node:path');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request === 'server-only') {
    return path.join(__dirname, 'server-only-stub.cjs');
  }
  if (typeof request === 'string' && request.startsWith('@/')) {
    return originalResolveFilename.call(this, path.join(__dirname, '..', request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { parseAssistantStep, commandRequiresConfirmation } = require('../lib/assistantCommand.ts');
const { buildFinanceSnapshot } = require('../lib/assistantSnapshot.ts');
const { buildAssistantSummaryFromData } = require('../lib/assistantSummary.ts');
const { buildFinanceChatContext } = require('../lib/assistantChatContext.ts');
const { executeAssistantStep } = require('../lib/assistantExecutor.ts');
const { getLocalAssistantFallbackStep } = require('../lib/assistantFallback.ts');
const { removeUndefinedDeep } = require('../lib/financeRepository.ts');
const { geminiErrorResponse } = require('../lib/server/gemini.ts');

const baseEntity = {
  source_type: 'manual',
  as_of_date: '2026-10-01',
  last_modified_by: 'husband',
};

test('assistant command parser validates finance payloads', () => {
  assert.deepEqual(parseAssistantStep('query_cashflow', { month: '2026-10' }).action, 'query_cashflow');
  assert.deepEqual(parseAssistantStep('get_asset_review', {}).action, 'get_asset_review');
  assert.throws(() => parseAssistantStep('query_cashflow', { month: '202610' }), /YYYY-MM/);
  assert.throws(() => parseAssistantStep('create_budget', { title: '식비' }), /targetAmount/);
});

test('destructive and sensitive assistant actions require confirmation', () => {
  assert.equal(commandRequiresConfirmation(parseAssistantStep('update_budget', { id: 'b1', targetAmount: 200000 })), true);
  assert.equal(commandRequiresConfirmation(parseAssistantStep('categorize_transaction', { id: 'tx1', category: 'food' })), true);
  assert.equal(commandRequiresConfirmation(parseAssistantStep('query_budget', { month: '2026-10' })), false);
  assert.equal(commandRequiresConfirmation(parseAssistantStep('get_asset_review', {})), false);
});

test('finance snapshot calculates totals, savings rate, budgets, and alerts in code', () => {
  const ledgerEntries = [
    { ...baseEntity, id: 'income', date: '2026-10-01', month: '2026-10', type: 'income', category: 'salary', amount: 3000000, payment_method: 'transfer', owner: 'joint', is_fixed: true },
    { ...baseEntity, id: 'food', date: '2026-10-02', month: '2026-10', type: 'expense_variable', category: 'food', amount: 600000, payment_method: 'card', owner: 'joint', is_fixed: false, notes: '식비' },
    { ...baseEntity, id: 'rent', date: '2026-10-05', month: '2026-10', type: 'expense_fixed', category: 'fixed_expense', amount: 1000000, payment_method: 'transfer', owner: 'joint', is_fixed: true, subcategory: '월세' },
    { ...baseEntity, id: 'save', date: '2026-10-06', month: '2026-10', type: 'savings', category: 'savings', amount: 500000, payment_method: 'transfer', owner: 'joint', is_fixed: true },
  ];
  const monthlyPlans = [
    { ...baseEntity, id: 'budget-food', month: '2026-10', owner: 'joint', category: 'food', title: '식비', targetAmount: 500000, actualAmount: 600000, isCompleted: false },
  ];
  const snapshot = buildFinanceSnapshot({ month: '2026-10', ledgerEntries, monthlyPlans });

  assert.equal(snapshot.totals.income, 3000000);
  assert.equal(snapshot.totals.expense, 1600000);
  assert.equal(snapshot.totals.netCashflow, 900000);
  assert.equal(snapshot.totals.savingsRate, 16.7);
  assert.equal(snapshot.categories.find((item) => item.name === 'food').budgetUsedPercent, 120);
  assert.equal(snapshot.alerts.some((alert) => alert.code === 'over_budget'), true);
  assert.equal(snapshot.recentTransactions.length <= 15, true);
});

test('finance snapshot handles zero income savings rate', () => {
  const snapshot = buildFinanceSnapshot({ month: '2026-10', ledgerEntries: [], monthlyPlans: [] });
  assert.equal(snapshot.totals.savingsRate, null);
  assert.equal(snapshot.alerts[0].code, 'no_major_alerts');
});

test('assistant summary builds aggregate data mart without LLM', () => {
  const ledgerEntries = [
    { ...baseEntity, id: 'income', date: '2026-10-01', month: '2026-10', type: 'income', category: 'salary', amount: 4000000, payment_method: 'transfer', owner: 'joint', is_fixed: true },
    { ...baseEntity, id: 'food', date: '2026-10-02', month: '2026-10', type: 'expense_variable', category: 'food', amount: 700000, payment_method: 'card', owner: 'joint', is_fixed: false },
    { ...baseEntity, id: 'rent', date: '2026-10-05', month: '2026-10', type: 'expense_fixed', category: 'management_fee', amount: 1200000, payment_method: 'transfer', owner: 'joint', is_fixed: true, subcategory: '월세' },
    { ...baseEntity, id: 'save', date: '2026-10-06', month: '2026-10', type: 'savings', category: 'savings', amount: 500000, payment_method: 'transfer', owner: 'joint', is_fixed: true },
    { ...baseEntity, id: 'old-food', date: '2026-09-02', month: '2026-09', type: 'expense_variable', category: 'food', amount: 400000, payment_method: 'card', owner: 'joint', is_fixed: false },
  ];
  const monthlyPlans = [
    { ...baseEntity, id: 'budget-food', month: '2026-10', owner: 'joint', category: 'fixed_expense', title: '식비', targetAmount: 500000, actualAmount: 700000, isCompleted: false },
  ];
  const summary = buildAssistantSummaryFromData({
    state: { householdName: '우리집', baseMonth: '2026-10', scope: 'combined' },
    assets: [{ ...baseEntity, id: 'cash', name: '현금', category: 'cash', amount: 1000000, owner: 'joint', currency: 'KRW' }],
    liabilities: [{ ...baseEntity, id: 'loan', name: '대출', category: 'loan', amount: 500000, owner: 'joint', currency: 'KRW' }],
    holdings: [],
    ledgerEntries,
    monthlyPlans,
    now: new Date('2026-10-10T00:00:00+09:00'),
  });

  assert.equal(summary.aggregates.monthlyCashflow.length >= 6, true);
  assert.equal(summary.aggregates.monthlyCashflow.some((item) => item.month === '2026-10'), true);
  assert.equal(summary.aggregates.weeklyCashflow.length > 0, true);
  assert.equal(summary.aggregates.categorySpend.find((item) => item.category === '식비').deltaFromPrevious, 300000);
  assert.equal(summary.aggregates.budgetStatus.overBudget[0].overBy, 200000);
  assert.equal(summary.briefings.monthly.length > 0, true);
  assert.doesNotMatch(JSON.stringify(summary), /"name":/);
});

test('assistant context trims large transaction lists and avoids raw unlimited ledger', () => {
  const ledgerEntries = Array.from({ length: 80 }, (_, index) => ({
    ...baseEntity,
    id: `tx-${index}`,
    date: `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
    month: '2026-10',
    type: 'expense_variable',
    category: 'food',
    amount: 1000 + index,
    payment_method: 'card',
    owner: 'joint',
    is_fixed: false,
    notes: `매우 긴 거래 메모 ${index}`,
  }));
  const text = buildFinanceChatContext({
    state: { householdName: '우리집', baseMonth: '2026-10', scope: 'combined' },
    assets: [],
    liabilities: [],
    holdings: [],
    income: [],
    transactions: [],
    ledgerEntries,
    monthlyPlans: [],
  }, new Date('2026-10-10T00:00:00+09:00'), '최근 거래 보여줘');

  assert.ok(text.length <= 3600);
  assert.ok((text.match(/tx-/g) || []).length < 80);
});

test('repository serialization removes undefined before writes', () => {
  assert.deepEqual(removeUndefinedDeep({ a: 1, b: undefined, c: { d: undefined, e: 2 } }), { a: 1, c: { e: 2 } });
});

test('Gemini API key errors are normalized without exposing secrets', async () => {
  const response = geminiErrorResponse(new Error('GEMINI_API_KEY_MISSING'));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /GEMINI_API_KEY/);
  assert.doesNotMatch(body.error, /AIza|secret|token/i);
});

test('local assistant fallback handles monthly report requests without Gemini', () => {
  assert.equal(getLocalAssistantFallbackStep('월간 리포트 만들어줘 아주 심플하게').action, 'get_monthly_report');
  assert.equal(getLocalAssistantFallbackStep('자산구성 설명해주고 보강해야할것').action, 'get_asset_review');
  assert.equal(getLocalAssistantFallbackStep('이번 달 돈 어디서 많이 썼어?').action, 'summarize_spending');
  assert.equal(getLocalAssistantFallbackStep('그냥 잡담'), null);
});

test('assistant harness refuses unused cash income ledger tabs until data exists', async () => {
  const transactions = await executeAssistantStep({ action: 'query_transactions', payload: { month: '2026-10' } });
  assert.equal(transactions.results[0].kind, 'warning');
  assert.match(transactions.message, /가계부 탭에 거래가 없어/);

  const spending = await executeAssistantStep({ action: 'summarize_spending', payload: {} });
  assert.equal(spending.results[0].kind, 'warning');
  assert.match(spending.message, /가계부 탭을 아직 사용하지 않아/);

  const cashflow = await executeAssistantStep({ action: 'query_cashflow', payload: {} });
  assert.equal(cashflow.results[0].kind, 'warning');
  assert.match(cashflow.message, /현금\/수입\/가계부 탭을 아직 사용하지 않아/);
});
