import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary, Scope, LedgerEntry, MonthlyPlanEntry } from '@/types';
import { mockIncome, mockTransactions, mockPortfolios } from '@/data/mockData';

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
let firestoreFunctions: any = null;
const getFirestoreFunctions = async () => {
  if (!useFirebase()) return null;
  if (firestoreFunctions) return firestoreFunctions;
  
  try {
    firestoreFunctions = await import('./firestore');
    return firestoreFunctions;
  } catch (error) {
    return null;
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
      'finance-assets',
      'finance-stock-holdings',
      'finance-salaries',
      'finance-apartments',
      'finance-income',
      'finance-liabilities',
      'finance-ledger-entries',
      'finance-monthly-plan-entries',
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
        .then((assets: Asset[]) => updateUnchangedCache('finance-assets', assets))
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
          updateUnchangedCache('finance-stock-holdings', realHoldings);
        })
        .catch(() => undefined),
      firestore.getSalaries()
        .then((salaries: Salary[]) => updateUnchangedCache('finance-salaries', salaries))
        .catch(() => undefined),
      firestore.getApartments()
        .then((apartments: Apartment[]) => updateUnchangedCache('finance-apartments', apartments))
        .catch(() => undefined),
      firestore.getIncome()
        .then((income: Income[]) => updateUnchangedCache('finance-income', withoutMockIncome(income)))
        .catch(() => undefined),
      firestore.getLiabilities()
        .then((liabilities: Liability[]) => updateUnchangedCache('finance-liabilities', liabilities))
        .catch(() => undefined),
      firestore.getLedgerEntries()
        .then((entries: LedgerEntry[]) => updateUnchangedCache('finance-ledger-entries', entries))
        .catch(() => undefined),
      firestore.getMonthlyPlanEntries()
        .then((entries: MonthlyPlanEntry[]) => updateUnchangedCache('finance-monthly-plan-entries', entries))
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
    return JSON.parse(stored);
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
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-assets');
  return stored ? JSON.parse(stored) : [];
}

export async function setAssets(assets: Asset[]): Promise<void> {
  if (typeof window === 'undefined') return;

  localStorage.setItem('finance-assets', JSON.stringify(assets));

  if (useFirebase()) {
    try {
      const firestore = await getFirestoreFunctions();
      if (firestore) {
        await firestore.setAssets(assets);
      }
    } catch (error: unknown) {
      console.error('[Store] Failed to save Assets to Firebase:', error);
    }
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getIncome(): Income[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-income');
  if (!stored) return [];

  const income = withoutMockIncome(JSON.parse(stored));
  localStorage.setItem('finance-income', JSON.stringify(income));
  return income;
}

export async function setIncome(income: Income[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-income', JSON.stringify(income));
  if (useFirebase()) {
    try {
      const firestore = await getFirestoreFunctions();
      if (firestore) {
        await firestore.setIncome(income);
      }
    } catch (error: unknown) {
      console.error('[Store] Failed to save Income to Firebase:', error);
    }
  }
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
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-liabilities');
  return stored ? JSON.parse(stored) : [];
}

export async function setLiabilities(liabilities: Liability[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-liabilities', JSON.stringify(liabilities));
  if (useFirebase()) {
    try {
      const firestore = await getFirestoreFunctions();
      if (firestore) {
        await firestore.setLiabilities(liabilities);
      }
    } catch (error: unknown) {
      console.error('[Store] Failed to save Liabilities to Firebase:', error);
    }
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getStockHoldings(): StockHolding[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-stock-holdings');
  // 빈 배열도 유효한 데이터로 처리 (mock 데이터 반환하지 않음)
  if (stored === null) return [];
  const parsed = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed : [];
}

export async function setStockHoldings(holdings: StockHolding[]): Promise<void> {
  if (typeof window === 'undefined') return;

  localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));

  if (!useFirebase()) return;
  try {
    const firestore = await getFirestoreFunctions();
    if (firestore) {
      await firestore.setStockHoldings(holdings);
    }
  } catch (error: unknown) {
    console.error('[Store] Failed to save Stock Holdings to Firebase:', error);
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getApartments(): Apartment[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-apartments');
  return stored ? JSON.parse(stored) : [];
}

export async function setApartments(apartments: Apartment[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-apartments', JSON.stringify(apartments));
  if (useFirebase()) {
    try {
      const firestore = await getFirestoreFunctions();
      if (firestore) {
        await firestore.setApartments(apartments);
      }
    } catch (error: unknown) {
      console.error('[Store] Failed to save Apartments to Firebase:', error);
    }
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getSalaries(): Salary[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-salaries');
  return stored ? JSON.parse(stored) : [];
}

export async function setSalaries(salaries: Salary[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-salaries', JSON.stringify(salaries));
  if (useFirebase()) {
    try {
      const firestore = await getFirestoreFunctions();
      if (firestore) {
        await firestore.setSalaries(salaries);
      }
    } catch (error: unknown) {
      console.error('[Store] Failed to save Salaries to Firebase:', error);
    }
  }
}

// 가계부 항목
export function getLedgerEntries(): LedgerEntry[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-ledger-entries');
  return stored ? JSON.parse(stored) : [];
}

export async function setLedgerEntries(entries: LedgerEntry[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-ledger-entries', JSON.stringify(entries));
  if (useFirebase()) {
    try {
      const firestore = await getFirestoreFunctions();
      if (firestore) {
        await firestore.setLedgerEntries(entries);
      }
    } catch (error: unknown) {
      console.error('[Store] Failed to save Ledger Entries to Firebase:', error);
    }
  }
}

export function getMonthlyPlanEntries(): MonthlyPlanEntry[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-monthly-plan-entries');
  return stored ? JSON.parse(stored) : [];
}

export async function setMonthlyPlanEntries(entries: MonthlyPlanEntry[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-monthly-plan-entries', JSON.stringify(entries));
  if (useFirebase()) {
    try {
      const firestore = await getFirestoreFunctions();
      if (firestore) {
        await firestore.setMonthlyPlanEntries(entries);
      }
    } catch (error: unknown) {
      console.error('[Store] Failed to save Monthly Plan Entries to Firebase:', error);
    }
  }
}
