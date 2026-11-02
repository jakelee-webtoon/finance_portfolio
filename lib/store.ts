import { buildRsuAssets, getRsuAssetIds } from '@/lib/rsuAssets';
import { seoulDate } from '@/lib/calendar';
import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary, Scope, LedgerEntry, MonthlyPlanEntry, AssistantSummary } from '@/types';
import { mockTransactions, mockPortfolios } from '@/data/mockData';
import { FIRESTORE_COLLECTIONS, applyItemChanges, stableData, type ItemChange, type FirestoreCollectionKey } from '@/lib/persistenceConfig';
import { parseStoredJson } from '@/lib/storageJson';

const STORAGE_KEY = 'finance-dashboard-state';

// Firebase 사용 여부 확인 (하드코딩된 경우 항상 true)
const useFirebase = (): boolean => {
  if (typeof window === 'undefined') return false;
  // 하드코딩된 경우 항상 Firebase 사용
  return true;
};

// Firebase 함수들을 동적으로 import (환경 변수가 없을 때 에러 방지)
type FirestoreModule = typeof import('./firestore');

let firestoreFunctions: FirestoreModule | null = null;
const getFirestoreFunctions = async (): Promise<FirestoreModule | null> => {
  if (!useFirebase()) return null;
  if (firestoreFunctions) return firestoreFunctions;
  
  try {
    firestoreFunctions = await import('./firestore');
    return firestoreFunctions;
  } catch (error) {
    return null;
  }
};

const readLocalJson = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  return parseStoredJson(localStorage.getItem(key), fallback);
};

const writeLocalJson = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

const PENDING_KEY = 'finance-pending-saves';
const PENDING_DASHBOARD_KEY = 'finance-pending-dashboard';
type PendingSaves = Partial<Record<FirestoreCollectionKey, ItemChange<any>[]>>;
export function getPendingSaves(): PendingSaves {
  return readLocalJson<PendingSaves>(PENDING_KEY, {});
}
export function getPendingSaveBackup() {
  return { collections: getPendingSaves(), dashboard: readLocalJson(PENDING_DASHBOARD_KEY, null) };
}
// Restore only the local journal. Upload still requires the explicit retry action.
export function restorePendingSaveBackup(value: unknown): Promise<boolean> {
  return serializeSave(async () => {
    try {
      const backup = value as ReturnType<typeof getPendingSaveBackup>;
      if (!backup || !backup.collections || typeof backup.collections !== 'object' || Array.isArray(backup.collections)) throw new Error('올바른 미저장 변경 백업이 아닙니다.');
      if (hasPendingSaves()) throw new Error('현재 미저장 변경을 먼저 저장하거나 내려받아 주세요.');
      const views = new Map<string, any[]>();
      for (const [key, changes] of Object.entries(backup.collections)) {
        if (!Object.prototype.hasOwnProperty.call(FIRESTORE_COLLECTIONS, key) || !Array.isArray(changes)) throw new Error('알 수 없는 백업 항목입니다.');
        for (const change of changes) {
          if (!change || typeof change.id !== 'string' || !change.id || change.id.includes('/') ||
              !['before', 'after'].every(field => {
                const item = change[field as 'before' | 'after'];
                return item === null || (typeof item === 'object' && !Array.isArray(item) && item.id === change.id);
              }) || (change.verifyOnly !== undefined && typeof change.verifyOnly !== 'boolean')) throw new Error('손상된 백업 항목입니다.');
          if (change.verifyOnly && stableData(change.before) !== stableData(change.after)) throw new Error('손상된 확인 항목입니다.');
        }
        const storageKey = FIRESTORE_COLLECTIONS[key as FirestoreCollectionKey].storageKey;
        views.set(storageKey, applyItemChanges(readLocalJson<any[]>(storageKey, []), changes.filter(change => !change.verifyOnly)));
      }
      const dashboard = backup.dashboard as DashboardState | null;
      if (dashboard && (typeof dashboard.householdName !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(dashboard.baseMonth) || !['combined', 'husband', 'wife'].includes(dashboard.scope))) throw new Error('손상된 설정 백업입니다.');
      writeLocalJson(PENDING_KEY, backup.collections);
      if (dashboard) writeLocalJson(PENDING_DASHBOARD_KEY, dashboard);
      for (const [key, items] of views) writeLocalJson(key, items);
      if (dashboard) writeLocalJson(STORAGE_KEY, dashboard);
      notifySaveStatus();
      return true;
    } catch (error) {
      notifySaveStatus(error instanceof Error ? error.message : '백업을 불러오지 못했습니다.');
      return false;
    }
  });
}
export function hasPendingSaves(): boolean {
  return !!localStorage.getItem(PENDING_DASHBOARD_KEY) || Object.values(getPendingSaves()).some(items => items && items.length > 0);
}
function notifySaveStatus(message = '') {
  window.dispatchEvent(new CustomEvent('financeSaveStatus', { detail: message }));
}
let saving = Promise.resolve();
function serializeSave(work: () => Promise<boolean>): Promise<boolean> {
  const result = saving.then(work, work);
  saving = result.then(() => undefined, () => undefined);
  return result;
}
async function flushPending(): Promise<boolean> {
  const pending = getPendingSaves();
  if (!Object.values(pending).some(changes => changes?.length)) return true;
  try {
    const firestore = await getFirestoreFunctions();
    if (!firestore) throw new Error('서버에 연결되지 않았습니다.');
    await firestore.savePendingChanges(pending);
    const latest = getPendingSaves();
    for (const key of Object.keys(pending) as FirestoreCollectionKey[]) {
      const changes = pending[key] || [];
      latest[key] = (latest[key] || []).filter(change => !changes.some(sent => stableData(sent) === stableData(change)));
      if (!latest[key]?.length) delete latest[key];
    }
    writeLocalJson(PENDING_KEY, latest);
    notifySaveStatus();
    return true;
  } catch (error) {
    notifySaveStatus(error instanceof Error ? error.message : '서버 저장에 실패했습니다.');
    return false;
  }
}

type CollectionUpdate = {
  key: FirestoreCollectionKey;
  items: any[];
  deletedIds?: string[];
  expectedItems?: any[];
  verifyItems?: any[];
};

// Stage every linked record in one durable journal before the first request.
// A closed tab can then retry the entire operation, never just its second half.
export function saveCollectionGroup(updates: CollectionUpdate[] | (() => CollectionUpdate[])): Promise<boolean> {
  return serializeSave(async () => {
    if (typeof window === 'undefined') return false;
    try {
      const pending = getPendingSaves();
      const views = new Map<FirestoreCollectionKey, any[]>();
      for (const update of typeof updates === 'function' ? updates() : updates) {
        const { key, items, deletedIds = [], expectedItems, verifyItems = [] } = update;
        const existing = views.get(key) || readLocalJson<any[]>(FIRESTORE_COLLECTIONS[key].storageKey, []);
        const expected = new Map((expectedItems || existing).map(item => [item.id, item]));
        const changes = new Map((pending[key] || []).map(change => [change.id, change]));
        const record = (id: string, after: any) => {
          const queued = changes.get(id);
          changes.set(id, { id, before: queued ? queued.before : expected.get(id) || null, after });
        };
        items.forEach(item => record(item.id, item));
        deletedIds.forEach(id => record(id, null));
        verifyItems.forEach(item => {
          if (!changes.has(item.id)) changes.set(item.id, { id: item.id, before: item, after: item, verifyOnly: true });
        });
        pending[key] = [...changes.values()];
        views.set(key, applyItemChanges(existing, [
          ...items.map(item => ({ id: item.id, before: null, after: item })),
          ...deletedIds.map(id => ({ id, before: null, after: null })),
        ]));
      }
      writeLocalJson(PENDING_KEY, pending);
      for (const [key, items] of views) writeLocalJson(FIRESTORE_COLLECTIONS[key].storageKey, items);
      notifySaveStatus();
      return await flushPending();
    } catch (error) {
      notifySaveStatus(error instanceof Error ? error.message : '로컬 저장에 실패했습니다.');
      return false;
    }
  });
}

export function saveCollectionItems<T extends { id: string }>(key: FirestoreCollectionKey, items: T[], deletedIds: string[] = [], expectedItems?: T[], check?: { key: FirestoreCollectionKey; items: { id: string }[] }): Promise<boolean> {
  const updates: CollectionUpdate[] = [{ key, items, deletedIds, expectedItems }];
  if (check) updates.push({ key: check.key, items: [], verifyItems: check.items });
  return saveCollectionGroup(updates);
}

export function saveApartmentWithAssets(apartment: Apartment, items: Asset[], expectedApartments: Apartment[], expectedAssets: Asset[]): Promise<boolean> {
  return saveCollectionGroup([
    { key: 'apartments', items: [apartment], expectedItems: expectedApartments },
    { key: 'assets', items, expectedItems: expectedAssets },
  ]);
}

export function saveAssetWithApartment(asset: Asset, apartment: Apartment, expectedAssets: Asset[], expectedApartments: Apartment[]): Promise<boolean> {
  return saveCollectionGroup([
    { key: 'assets', items: [asset], expectedItems: expectedAssets },
    { key: 'apartments', items: [apartment], expectedItems: expectedApartments },
  ]);
}

export function deleteApartmentWithAssets(id: string, assetIds: string[], expectedApartments: Apartment[], expectedAssets: Asset[]): Promise<boolean> {
  return saveCollectionGroup([
    { key: 'apartments', items: [], deletedIds: [id], expectedItems: expectedApartments },
    { key: 'assets', items: [], deletedIds: assetIds, expectedItems: expectedAssets },
  ]);
}

export function saveRsuHoldings(items: StockHolding[], deletedIds: string[], expectedHoldings: StockHolding[] | undefined, modifiedBy: 'husband' | 'wife'): Promise<boolean> {
  return saveCollectionGroup(() => {
    const holdings = getStockHoldings();
    const assets = getAssets();
    const next = applyItemChanges(holdings, [
      ...items.map(item => ({ id: item.id, before: null, after: item })),
      ...deletedIds.map(id => ({ id, before: null, after: null })),
    ]);
    const generated = buildRsuAssets([], next, { asOfDate: seoulDate(), modifiedBy });
    const changed = generated.flatMap(asset => {
      const previous = assets.find(item => item.id === asset.id);
      if (previous && previous.amount === asset.amount && previous.category === asset.category && previous.currency === asset.currency && previous.owner === asset.owner) return [];
      return [{ ...previous, ...asset }];
    });
    // Never prune an unrelated group merely because its source is absent from a
    // stale cache. Only groups represented by known sources may be replaced.
    const knownIds = new Set(getRsuAssetIds([...holdings, ...(expectedHoldings || [])]));
    const removed = assets.filter(asset => knownIds.has(asset.id) && !generated.some(item => item.id === asset.id)).map(asset => asset.id);
    return [
      { key: 'stockHoldings', items, deletedIds, expectedItems: expectedHoldings,
        verifyItems: holdings.filter(item => item.type === 'rsu' || item.type === 'option') },
      { key: 'assets', items: changed, deletedIds: removed, expectedItems: assets },
    ];
  });
}

export function retryPendingSaves(): Promise<boolean> {
  return serializeSave(async () => {
    let success = await flushPending();
    if (!await flushDashboard()) success = false;
    return success;
  });
}

async function flushDashboard(): Promise<boolean> {
  const pending = localStorage.getItem(PENDING_DASHBOARD_KEY);
  if (!pending) return true;
  try {
    const firestore = await getFirestoreFunctions();
    if (!firestore) throw new Error('서버에 연결되지 않았습니다.');
    await firestore.setDashboardState(JSON.parse(pending));
    if (localStorage.getItem(PENDING_DASHBOARD_KEY) === pending) localStorage.removeItem(PENDING_DASHBOARD_KEY);
    notifySaveStatus();
    return true;
  } catch (error) {
    notifySaveStatus(error instanceof Error ? error.message : '설정 저장에 실패했습니다.');
    return false;
  }
}

export async function discardPendingSaves(): Promise<boolean> {
  return serializeSave(async () => {
    const pending = getPendingSaves();
    const dashboard = localStorage.getItem(PENDING_DASHBOARD_KEY);
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_DASHBOARD_KEY);
    const success = await syncFromFirebase({ force: true });
    if (!success) {
      writeLocalJson(PENDING_KEY, pending);
      if (dashboard) localStorage.setItem(PENDING_DASHBOARD_KEY, dashboard);
      // Restore the user's local view after any partial reads.
      for (const key of Object.keys(pending) as FirestoreCollectionKey[]) {
        const config = FIRESTORE_COLLECTIONS[key];
        writeLocalJson(config.storageKey, applyItemChanges(readLocalJson(config.storageKey, []), pending[key] || []));
      }
      notifySaveStatus('서버 조회에 실패해 미저장 변경을 유지했습니다.');
    } else notifySaveStatus();
    return success;
  });
}

// Explicit IDs only: callers pass the actual edited/created records, never a whole snapshot.
export const saveAssets = (items: Asset[], deletedIds: string[] = [], expectedItems?: Asset[]) => saveCollectionItems('assets', items, deletedIds, expectedItems);
export const saveApartmentAssets = (apartment: Apartment, items: Asset[], expectedAssets: Asset[]) =>
  saveCollectionItems('assets', items, [], expectedAssets, { key: 'apartments', items: [apartment] });
export const saveAssetApartment = (asset: Asset, apartment: Apartment, expectedApartments: Apartment[]) =>
  saveCollectionItems('apartments', [apartment], [], expectedApartments, { key: 'assets', items: [asset] });
export const saveLiabilities = (items: Liability[], deletedIds: string[] = [], expectedItems?: Liability[]) => saveCollectionItems('liabilities', items, deletedIds, expectedItems);
export const saveStockHoldings = (items: StockHolding[], deletedIds: string[] = [], expectedItems?: StockHolding[]) => saveCollectionItems('stockHoldings', items, deletedIds, expectedItems);
export const saveLedgerEntries = (items: LedgerEntry[], deletedIds: string[] = [], expectedItems?: LedgerEntry[]) => saveCollectionItems('ledgerEntries', items, deletedIds, expectedItems);
export const saveApartments = (items: Apartment[], deletedIds: string[] = [], expectedItems?: Apartment[]) => saveCollectionItems('apartments', items, deletedIds, expectedItems);
export const saveIncome = (items: Income[], deletedIds: string[] = [], expectedItems?: Income[]) => saveCollectionItems('income', items, deletedIds, expectedItems);
export const saveSalaries = (items: Salary[], deletedIds: string[] = [], expectedItems?: Salary[]) => saveCollectionItems('salaries', items, deletedIds, expectedItems);

const FIREBASE_SYNC_TTL_MS = 30_000;
let firebaseSyncPromise: Promise<boolean> | null = null;
let lastFirebaseSyncAt = 0;

async function performFirebaseSync(): Promise<boolean> {
  if (typeof window === 'undefined' || !useFirebase()) return false;

  try {
    const firestore = await getFirestoreFunctions();
    if (!firestore) return false;

    const cacheKeys = [
      STORAGE_KEY,
      ...Object.values(FIRESTORE_COLLECTIONS).map(config => config.storageKey),
    ];
    const cacheSnapshot = new Map(cacheKeys.map((key) => [key, localStorage.getItem(key)]));
    const updateUnchangedCache = (key: string, value: unknown) => {
      if (key === STORAGE_KEY && localStorage.getItem(PENDING_DASHBOARD_KEY)) return;
      const collectionKey = (Object.keys(FIRESTORE_COLLECTIONS) as FirestoreCollectionKey[]).find(item => FIRESTORE_COLLECTIONS[item].storageKey === key);
      if (collectionKey && getPendingSaves()[collectionKey]?.length) return;
      if (localStorage.getItem(key) === cacheSnapshot.get(key)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    };

    const results = await Promise.allSettled([
      firestore.getDashboardState()
        .then((dashboardState: DashboardState) => updateUnchangedCache(STORAGE_KEY, dashboardState)),
      firestore.getAssets()
        .then((assets: Asset[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.assets.storageKey, assets)),
      firestore.getStockHoldings()
        .then((holdings: StockHolding[]) => {
          updateUnchangedCache(FIRESTORE_COLLECTIONS.stockHoldings.storageKey, holdings);
        }),
      firestore.getSalaries()
        .then((salaries: Salary[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.salaries.storageKey, salaries)),
      firestore.getApartments()
        .then((apartments: Apartment[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.apartments.storageKey, apartments)),
      firestore.getIncome()
        .then((income: Income[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.income.storageKey, income)),
      firestore.getLiabilities()
        .then((liabilities: Liability[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.liabilities.storageKey, liabilities)),
      firestore.getLedgerEntries()
        .then((entries: LedgerEntry[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.ledgerEntries.storageKey, entries)),
      firestore.getMonthlyPlanEntries()
        .then((entries: MonthlyPlanEntry[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.monthlyPlanEntries.storageKey, entries)),
      firestore.getAssistantSummaries()
        .then((summaries: AssistantSummary[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.assistantSummaries.storageKey, summaries)),
    ]);
    return results.every(result => result.status === 'fulfilled');
  } catch (error) {
    return false;
  }
}

// 캐시를 먼저 렌더링한 뒤 호출한다. 짧은 탭 이동 동안에는 같은 동기화 결과를 재사용한다.
export function syncFromFirebase(options: { force?: boolean } = {}): Promise<boolean> {
  if (typeof window === 'undefined' || !useFirebase()) return Promise.resolve(false);

  if (!options.force && Date.now() - lastFirebaseSyncAt < FIREBASE_SYNC_TTL_MS) {
    return Promise.resolve(true);
  }
  if (firebaseSyncPromise) return firebaseSyncPromise;

  firebaseSyncPromise = performFirebaseSync()
    .then(success => {
      if (success) lastFirebaseSyncAt = Date.now();
      return success;
    })
    .finally(() => {
      firebaseSyncPromise = null;
    });

  return firebaseSyncPromise;
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getDashboardState(): DashboardState {
  if (typeof window === 'undefined') {
    return {
      householdName: '우리집',
      baseMonth: seoulDate().slice(0, 7),
      scope: 'combined',
    };
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return readLocalJson(STORAGE_KEY, {
      householdName: '우리집',
      baseMonth: seoulDate().slice(0, 7),
      scope: 'combined',
    });
  }

  const defaultState: DashboardState = {
    householdName: '우리집',
    baseMonth: seoulDate().slice(0, 7),
    scope: 'combined',
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
  return defaultState;
}

export function setDashboardState(state: DashboardState): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  try {
    writeLocalJson(PENDING_DASHBOARD_KEY, state);
    writeLocalJson(STORAGE_KEY, state);
    notifySaveStatus();
    return serializeSave(flushDashboard);
  } catch (error) {
    notifySaveStatus('설정을 브라우저에 저장하지 못했습니다.');
    return Promise.resolve(false);
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getAssets(): Asset[] {
  return readLocalJson<Asset[]>(FIRESTORE_COLLECTIONS.assets.storageKey, []);
}

export async function setAssets(assets: Asset[]): Promise<void> {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getIncome(): Income[] {
  return readLocalJson<Income[]>(FIRESTORE_COLLECTIONS.income.storageKey, []);
}

export async function setIncome(income: Income[]): Promise<void> {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
}

export function getTransactions(): Transaction[] {
  if (typeof window === 'undefined') return mockTransactions;
  const stored = localStorage.getItem('finance-transactions');
  return stored ? JSON.parse(stored) : mockTransactions;
}

export async function setTransactions(transactions: Transaction[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-transactions', JSON.stringify(transactions));
  // Transactions는 현재 Firestore 컬렉션 미구현 — localStorage만 저장
}

export function getPortfolios(): Portfolio[] {
  if (typeof window === 'undefined') return mockPortfolios;
  const stored = localStorage.getItem('finance-portfolios');
  return stored ? JSON.parse(stored) : mockPortfolios;
}

export async function setPortfolios(portfolios: Portfolio[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-portfolios', JSON.stringify(portfolios));
  // Portfolios는 현재 Firestore 컬렉션 미구현 — localStorage만 저장
}

export function getLiabilities(): Liability[] {
  return readLocalJson<Liability[]>(FIRESTORE_COLLECTIONS.liabilities.storageKey, []);
}

export async function setLiabilities(liabilities: Liability[]): Promise<void> {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getStockHoldings(): StockHolding[] {
  const parsed = readLocalJson<unknown>(FIRESTORE_COLLECTIONS.stockHoldings.storageKey, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function setStockHoldings(holdings: StockHolding[]): Promise<void> {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getApartments(): Apartment[] {
  return readLocalJson<Apartment[]>(FIRESTORE_COLLECTIONS.apartments.storageKey, []);
}

export async function setApartments(apartments: Apartment[]): Promise<void> {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getSalaries(): Salary[] {
  return readLocalJson<Salary[]>(FIRESTORE_COLLECTIONS.salaries.storageKey, []);
}

export async function setSalaries(salaries: Salary[]): Promise<void> {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
}

// 가계부 항목
export function getLedgerEntries(): LedgerEntry[] {
  return readLocalJson<LedgerEntry[]>(FIRESTORE_COLLECTIONS.ledgerEntries.storageKey, []);
}

export async function setLedgerEntries(entries: LedgerEntry[]): Promise<void> {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
}

export function getMonthlyPlanEntries(): MonthlyPlanEntry[] {
  return readLocalJson<MonthlyPlanEntry[]>(FIRESTORE_COLLECTIONS.monthlyPlanEntries.storageKey, []);
}

export function upsertMonthlyPlanEntries(entries: MonthlyPlanEntry[], expectedEntries?: MonthlyPlanEntry[]): Promise<boolean> {
  return saveCollectionItems('monthlyPlanEntries', entries, [], expectedEntries);
}

export function getAssistantSummaries(): AssistantSummary[] {
  return readLocalJson<AssistantSummary[]>(FIRESTORE_COLLECTIONS.assistantSummaries.storageKey, []);
}

export function upsertAssistantSummaries(summaries: AssistantSummary[]): Promise<boolean> {
  return saveCollectionItems('assistantSummaries', summaries);
}
