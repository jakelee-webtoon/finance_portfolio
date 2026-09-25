const assert = require('node:assert/strict');
const test = require('node:test');

require('sucrase/register/ts');

const {
  FIRESTORE_COLLECTIONS,
  planCollectionWrites,
} = require('../lib/persistenceConfig.ts');
const { parseStoredJson } = require('../lib/storageJson.ts');

test('every persisted finance area has one unique Firestore and local-storage mapping', () => {
  const expectedDateFields = {
    apartments: ['as_of_date'],
    assets: ['as_of_date'],
    income: ['as_of_date'],
    ledgerEntries: ['date', 'as_of_date'],
    liabilities: ['as_of_date'],
    monthlyPlanEntries: ['as_of_date'],
    salaries: [],
    stockHoldings: ['as_of_date'],
  };
  const entries = Object.entries(FIRESTORE_COLLECTIONS);

  assert.deepEqual(entries.map(([key]) => key).sort(), Object.keys(expectedDateFields));
  assert.equal(new Set(entries.map(([, config]) => config.collectionName)).size, entries.length);
  assert.equal(new Set(entries.map(([, config]) => config.storageKey)).size, entries.length);
  entries.forEach(([key, config]) => {
    assert.ok(config.collectionName.length > 0);
    assert.ok(config.storageKey.startsWith('finance-'));
    assert.ok(Array.isArray(config.dateFields));
    assert.deepEqual(config.dateFields, expectedDateFields[key]);
  });
});

test('Firestore collection plan deletes stale documents and keeps an exact delete count', () => {
  const plan = planCollectionWrites(
    ['keep', 'remove-a', 'remove-b'],
    [{ id: 'keep', value: 1 }, { id: 'new', value: 2 }]
  );
  const operations = plan.batches.flat();

  assert.equal(plan.deletedCount, 2);
  assert.equal(plan.savedCount, 2);
  assert.deepEqual(
    operations.filter((operation) => operation.type === 'delete').map((operation) => operation.id).sort(),
    ['remove-a', 'remove-b']
  );
  assert.deepEqual(
    operations.filter((operation) => operation.type === 'set').map((operation) => operation.id).sort(),
    ['keep', 'new']
  );
});

test('Firestore collection plan stays below the batch limit for large ledgers', () => {
  const items = Array.from({ length: 1_025 }, (_, index) => ({ id: `entry-${index}` }));
  const plan = planCollectionWrites([], items);

  assert.equal(plan.savedCount, 1_025);
  assert.equal(plan.batches.length, 3);
  assert.ok(plan.batches.every((batch) => batch.length <= 450));
  assert.equal(plan.batches.flat().length, 1_025);
});

test('Firestore collection plan resolves duplicate ids to the latest item', () => {
  const plan = planCollectionWrites([], [
    { id: 'same', value: 1 },
    { id: 'same', value: 2 },
  ]);
  const setOperations = plan.batches.flat().filter((operation) => operation.type === 'set');

  assert.equal(plan.savedCount, 1);
  assert.equal(setOperations.length, 1);
  assert.equal(setOperations[0].item.value, 2);
});

test('Firestore collection plan rejects invalid batch sizes', () => {
  assert.throws(() => planCollectionWrites([], [], 0), /between 1 and 500/);
  assert.throws(() => planCollectionWrites([], [], 501), /between 1 and 500/);
});

test('local cache parsing falls back safely when stored JSON is damaged', () => {
  const fallback = [{ id: 'fallback' }];

  assert.deepEqual(parseStoredJson(null, fallback), fallback);
  assert.deepEqual(parseStoredJson('{broken', fallback), fallback);
  assert.deepEqual(parseStoredJson('[{"id":"saved"}]', fallback), [{ id: 'saved' }]);
});
