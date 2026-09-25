export const FIRESTORE_COLLECTIONS = {
  assets: {
    collectionName: 'assets',
    storageKey: 'finance-assets',
    label: 'Assets',
    dateFields: ['as_of_date'],
  },
  stockHoldings: {
    collectionName: 'stockHoldings',
    storageKey: 'finance-stock-holdings',
    label: 'Stock Holdings',
    dateFields: ['as_of_date'],
  },
  salaries: {
    collectionName: 'salaries',
    storageKey: 'finance-salaries',
    label: 'Salaries',
    dateFields: [],
  },
  apartments: {
    collectionName: 'apartments',
    storageKey: 'finance-apartments',
    label: 'Apartments',
    dateFields: ['as_of_date'],
  },
  income: {
    collectionName: 'income',
    storageKey: 'finance-income',
    label: 'Income',
    dateFields: ['as_of_date'],
  },
  liabilities: {
    collectionName: 'liabilities',
    storageKey: 'finance-liabilities',
    label: 'Liabilities',
    dateFields: ['as_of_date'],
  },
  ledgerEntries: {
    collectionName: 'ledgerEntries',
    storageKey: 'finance-ledger-entries',
    label: 'Ledger Entries',
    dateFields: ['date', 'as_of_date'],
  },
  monthlyPlanEntries: {
    collectionName: 'monthlyPlanEntries',
    storageKey: 'finance-monthly-plan-entries',
    label: 'Monthly Plan Entries',
    dateFields: ['as_of_date'],
  },
} as const;

export type FirestoreCollectionKey = keyof typeof FIRESTORE_COLLECTIONS;

export type CollectionWriteOperation<T extends { id: string }> =
  | { type: 'delete'; id: string }
  | { type: 'set'; id: string; item: T };

export function planCollectionWrites<T extends { id: string }>(
  existingIds: Iterable<string>,
  items: T[],
  maxBatchSize = 450
): { batches: CollectionWriteOperation<T>[][]; deletedCount: number; savedCount: number } {
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1 || maxBatchSize > 500) {
    throw new Error('maxBatchSize must be an integer between 1 and 500.');
  }

  const uniqueItems = new Map<string, T>();
  items.forEach((item) => uniqueItems.set(item.id, item));

  const operations: CollectionWriteOperation<T>[] = [];
  let deletedCount = 0;

  for (const id of existingIds) {
    if (!uniqueItems.has(id)) {
      operations.push({ type: 'delete', id });
      deletedCount += 1;
    }
  }

  uniqueItems.forEach((item, id) => {
    operations.push({ type: 'set', id, item });
  });

  const batches: CollectionWriteOperation<T>[][] = [];
  for (let index = 0; index < operations.length; index += maxBatchSize) {
    batches.push(operations.slice(index, index + maxBatchSize));
  }

  return { batches, deletedCount, savedCount: uniqueItems.size };
}
