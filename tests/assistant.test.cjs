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
const { buildFinanceChatContext } = require('../lib/assistantChatContext.ts');
const { removeUndefinedDeep } = require('../lib/financeRepository.ts');
const { geminiErrorResponse } = require('../lib/server/gemini.ts');

const baseEntity = {
  source_type: 'manual',
  as_of_date: '2026-10-01',
  last_modified_by: 'husband',
};

test('assistant command parser validates finance payloads', () => {
  assert.deepEqual(parseAssistantStep('query_cashflow', { month: '2026-10' }).action, 'query_cashflow');
  assert.throws(() => parseAssistantStep('query_cashflow', { month: '202610' }), /YYYY-MM/);
  assert.throws(() => parseAssistantStep('create_budget', { title: '식비' }), /targetAmount/);
});

test('destructive and sensitive assistant actions require confirmation', () => {
  assert.equal(commandRequiresConfirmation(parseAssistantStep('update_budget', { id: 'b1', targetAmount: 200000 })), true);
  assert.equal(commandRequiresConfirmation(parseAssistantStep('categorize_transaction', { id: 'tx1', category: 'food' })), true);
  assert.equal(commandRequiresConfirmation(parseAssistantStep('query_budget', { month: '2026-10' })), false);
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
