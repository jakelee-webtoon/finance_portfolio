import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary, Scope, LedgerEntry, MonthlyPlanEntry } from '@/types';
import { mockIncome, mockTransactions, mockPortfolios } from '@/data/mockData';
import { FIRESTORE_COLLECTIONS } from '@/lib/persistenceConfig';
import { parseStoredJson } from '@/lib/storageJson';

const STORAGE_KEY = 'finance-dashboard-state';

const isMockIncomeItem = (income: Income): boolean => {
  return mockIncome.some(mock =>
    income.id === mock.id &&
    income.source === mock.source &&
    income.amount === mock.amount &&
    income.owner === mock.owner &&
    income.category === mock.category
  );
};

const withoutMockIncome = (income: Income[]): Income[] => income.filter(item => !isMockIncomeItem(item));

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

const persistCollection = async <T>(
  storageKey: string,
  value: T,
  label: string,
  saveToFirestore: (firestore: FirestoreModule) => Promise<void>
): Promise<void> => {
  if (typeof window === 'undefined') return;
  writeLocalJson(storageKey, value);
  if (!useFirebase()) return;

  try {
    const firestore = await getFirestoreFunctions();
    if (firestore) await saveToFirestore(firestore);
  } catch (error: unknown) {
    console.error(`[Store] Failed to save ${label} to Firebase:`, error);
  }
};

const FIREBASE_SYNC_TTL_MS = 30_000;
let firebaseSyncPromise: Promise<void> | null = null;
let lastFirebaseSyncAt = 0;

async function performFirebaseSync(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!useFirebase()) return;

  try {
    const firestore = await getFirestoreFunctions();
    if (!firestore) return;

    const cacheKeys = [
      STORAGE_KEY,
      ...Object.values(FIRESTORE_COLLECTIONS).map(config => config.storageKey),
    ];
    const cacheSnapshot = new Map(cacheKeys.map((key) => [key, localStorage.getItem(key)]));
    const updateUnchangedCache = (key: string, value: unknown) => {
      if (localStorage.getItem(key) === cacheSnapshot.get(key)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    };

    await Promise.all([
      firestore.getDashboardState()
        .then((dashboardState: DashboardState) => updateUnchangedCache(STORAGE_KEY, dashboardState))
        .catch(() => undefined),
      firestore.getAssets()
        .then((assets: Asset[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.assets.storageKey, assets))
        .catch(() => undefined),
      firestore.getStockHoldings()
        .then((holdings: StockHolding[]) => {
          const realHoldings = holdings.filter((holding) => {
            if (holding.id === 'stock-1' || holding.id === 'stock-2' || holding.id === 'stock-3') return false;
            if (holding.symbol === '005930' && holding.name === '삼성전자' && holding.quantity === 50 && holding.purchasePrice === 60000) return false;
            if (holding.symbol === '035720' && holding.name === '카카오' && holding.quantity === 20 && holding.purchasePrice === 75000) return false;
            if (holding.symbol === 'AAPL' && holding.name === 'Apple Inc.' && holding.quantity === 10 && holding.purchasePrice === 150) return false;
            return true;
          });
          updateUnchangedCache(FIRESTORE_COLLECTIONS.stockHoldings.storageKey, realHoldings);
        })
        .catch(() => undefined),
      firestore.getSalaries()
        .then((salaries: Salary[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.salaries.storageKey, salaries))
        .catch(() => undefined),
      firestore.getApartments()
        .then((apartments: Apartment[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.apartments.storageKey, apartments))
        .catch(() => undefined),
      firestore.getIncome()
        .then((income: Income[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.income.storageKey, withoutMockIncome(income)))
        .catch(() => undefined),
      firestore.getLiabilities()
        .then((liabilities: Liability[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.liabilities.storageKey, liabilities))
        .catch(() => undefined),
      firestore.getLedgerEntries()
        .then((entries: LedgerEntry[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.ledgerEntries.storageKey, entries))
        .catch(() => undefined),
      firestore.getMonthlyPlanEntries()
        .then((entries: MonthlyPlanEntry[]) => updateUnchangedCache(FIRESTORE_COLLECTIONS.monthlyPlanEntries.storageKey, entries))
        .catch(() => undefined),
    ]);
  } catch (error) {
    // 전체 에러 무시 (Firebase 연결 실패 시 localStorage만 사용)
  }
}

// 캐시를 먼저 렌더링한 뒤 호출한다. 짧은 탭 이동 동안에는 같은 동기화 결과를 재사용한다.
export function syncFromFirebase(options: { force?: boolean } = {}): Promise<void> {
  if (typeof window === 'undefined' || !useFirebase()) return Promise.resolve();

  if (!options.force && Date.now() - lastFirebaseSyncAt < FIREBASE_SYNC_TTL_MS) {
    return Promise.resolve();
  }
  if (firebaseSyncPromise) return firebaseSyncPromise;

  firebaseSyncPromise = performFirebaseSync()
    .then(() => {
      lastFirebaseSyncAt = Date.now();
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
      baseMonth: new Date().toISOString().slice(0, 7),
      scope: 'combined',
    };
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return readLocalJson(STORAGE_KEY, {
      householdName: '우리집',
      baseMonth: new Date().toISOString().slice(0, 7),
      scope: 'combined',
    });
  }

  const defaultState: DashboardState = {
    householdName: '우리집',
    baseMonth: new Date().toISOString().slice(0, 7),
    scope: 'combined',
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
  return defaultState;
}

export function setDashboardState(state: DashboardState): void {
  if (typeof window === 'undefined') return;
  
  // localStorage에 저장
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  
  // Firebase 사용 가능하면 백그라운드에서 Firebase에 저장 (비동기)
  if (useFirebase()) {
    getFirestoreFunctions().then(firestore => {
      if (firestore) {
        firestore.setDashboardState(state).catch(() => {
          // 에러 무시 (이미 localStorage에 저장됨)
        });
      }
    }).catch(() => {
      // 에러 무시
    });
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getAssets(): Asset[] {
  return readLocalJson<Asset[]>(FIRESTORE_COLLECTIONS.assets.storageKey, []);
}

export async function setAssets(assets: Asset[]): Promise<void> {
  await persistCollection(FIRESTORE_COLLECTIONS.assets.storageKey, assets, 'Assets', firestore => firestore.setAssets(assets));
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getIncome(): Income[] {
  const income = withoutMockIncome(readLocalJson<Income[]>(FIRESTORE_COLLECTIONS.income.storageKey, []));
  if (typeof window === 'undefined') return income;
  writeLocalJson(FIRESTORE_COLLECTIONS.income.storageKey, income);
  return income;
}

export async function setIncome(income: Income[]): Promise<void> {
  await persistCollection(FIRESTORE_COLLECTIONS.income.storageKey, income, 'Income', firestore => firestore.setIncome(income));
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
  await persistCollection(FIRESTORE_COLLECTIONS.liabilities.storageKey, liabilities, 'Liabilities', firestore => firestore.setLiabilities(liabilities));
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getStockHoldings(): StockHolding[] {
  const parsed = readLocalJson<unknown>(FIRESTORE_COLLECTIONS.stockHoldings.storageKey, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function setStockHoldings(holdings: StockHolding[]): Promise<void> {
  await persistCollection(FIRESTORE_COLLECTIONS.stockHoldings.storageKey, holdings, 'Stock Holdings', firestore => firestore.setStockHoldings(holdings));
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getApartments(): Apartment[] {
  return readLocalJson<Apartment[]>(FIRESTORE_COLLECTIONS.apartments.storageKey, []);
}

export async function setApartments(apartments: Apartment[]): Promise<void> {
  await persistCollection(FIRESTORE_COLLECTIONS.apartments.storageKey, apartments, 'Apartments', firestore => firestore.setApartments(apartments));
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getSalaries(): Salary[] {
  return readLocalJson<Salary[]>(FIRESTORE_COLLECTIONS.salaries.storageKey, []);
}

export async function setSalaries(salaries: Salary[]): Promise<void> {
  await persistCollection(FIRESTORE_COLLECTIONS.salaries.storageKey, salaries, 'Salaries', firestore => firestore.setSalaries(salaries));
}

// 가계부 항목
export function getLedgerEntries(): LedgerEntry[] {
  return readLocalJson<LedgerEntry[]>(FIRESTORE_COLLECTIONS.ledgerEntries.storageKey, []);
}

export async function setLedgerEntries(entries: LedgerEntry[]): Promise<void> {
  await persistCollection(FIRESTORE_COLLECTIONS.ledgerEntries.storageKey, entries, 'Ledger Entries', firestore => firestore.setLedgerEntries(entries));
}

export function getMonthlyPlanEntries(): MonthlyPlanEntry[] {
  return readLocalJson<MonthlyPlanEntry[]>(FIRESTORE_COLLECTIONS.monthlyPlanEntries.storageKey, []);
}

export async function setMonthlyPlanEntries(entries: MonthlyPlanEntry[]): Promise<void> {
  await persistCollection(FIRESTORE_COLLECTIONS.monthlyPlanEntries.storageKey, entries, 'Monthly Plan Entries', firestore => firestore.setMonthlyPlanEntries(entries));
}
