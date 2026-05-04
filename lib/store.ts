import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary, Scope, LedgerEntry } from '@/types';
import { mockAssets, mockIncome, mockTransactions, mockPortfolios, mockLiabilities, mockStockHoldings, mockApartments } from '@/data/mockData';

const STORAGE_KEY = 'finance-dashboard-state';

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

// Firebase에서 데이터를 가져와서 localStorage에 동기화하는 초기화 함수
export async function syncFromFirebase(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!useFirebase()) return;
  
  try {
    const firestore = await getFirestoreFunctions();
    if (!firestore) return;
    
    // Dashboard State
    try {
      const dashboardState = await firestore.getDashboardState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboardState));
    } catch (error) {
      // 에러 무시
    }
    
    // Assets
    try {
      const assets = await firestore.getAssets();
      if (assets.length > 0) {
        localStorage.setItem('finance-assets', JSON.stringify(assets));
      }
    } catch (error) {
      // 에러 무시
    }
    
    // Stock Holdings
    try {
      const holdings = await firestore.getStockHoldings();
      console.log(`[syncFromFirebase] Fetched ${holdings.length} stock holdings from Firebase`);
      
      // Mock 데이터 필터링 (ID, 심볼, 이름, 수량으로 체크)
      const realHoldings = holdings.filter((holding: StockHolding) => {
        if (holding.id === 'stock-1' || holding.id === 'stock-2' || holding.id === 'stock-3') {
          return false;
        }
        if (holding.symbol === '005930' && holding.name === '삼성전자' && holding.quantity === 50 && holding.purchasePrice === 60000) {
          return false;
        }
        if (holding.symbol === '035720' && holding.name === '카카오' && holding.quantity === 20 && holding.purchasePrice === 75000) {
          return false;
        }
        if (holding.symbol === 'AAPL' && holding.name === 'Apple Inc.' && holding.quantity === 10 && holding.purchasePrice === 150) {
          return false;
        }
        return true;
      });

      // Firestore 스냅샷을 단일 소스로 사용 (로컬·원격 병합 제거)
      // 병합 시 "리모트에만 있는 항목"을 다시 붙이면, 로컬에서 삭제한 직후/일시적 지연에서 삭제분이 부활하는 문제가 생김
      localStorage.setItem('finance-stock-holdings', JSON.stringify(realHoldings));
      console.log(`[syncFromFirebase] Stock holdings from Firebase: ${realHoldings.length} items (local merge disabled)`);
    } catch (error) {
      console.error('[syncFromFirebase] Failed to sync stock holdings:', error);
      // 에러 발생 시 기존 localStorage 데이터 유지
      const existing = localStorage.getItem('finance-stock-holdings');
      if (!existing) {
        localStorage.setItem('finance-stock-holdings', JSON.stringify([]));
      }
    }
    
    // Salaries
    try {
      const salaries = await firestore.getSalaries();
      if (salaries.length > 0) {
        localStorage.setItem('finance-salaries', JSON.stringify(salaries));
      }
    } catch (error) {
      // 에러 무시
    }
    
    // Apartments
    try {
      const apartments = await firestore.getApartments();
      if (apartments.length > 0) {
        localStorage.setItem('finance-apartments', JSON.stringify(apartments));
      }
    } catch (error) {
      // 에러 무시
    }
    
    // Income
    try {
      const income = await firestore.getIncome();
      if (income.length > 0) {
        localStorage.setItem('finance-income', JSON.stringify(income));
      }
    } catch (error) {
      // 에러 무시
    }
    
    // Liabilities
    try {
      const liabilities = await firestore.getLiabilities();
      if (liabilities.length > 0) {
        localStorage.setItem('finance-liabilities', JSON.stringify(liabilities));
      }
    } catch (error) {
      // 에러 무시
    }
    
    // Ledger Entries
    try {
      const ledgerEntries = await firestore.getLedgerEntries();
      // 빈 배열도 저장 (mock 데이터 방지)
      localStorage.setItem('finance-ledger-entries', JSON.stringify(ledgerEntries));
    } catch (error) {
      // 에러 발생 시에도 빈 배열 저장 (mock 데이터 방지)
      localStorage.setItem('finance-ledger-entries', JSON.stringify([]));
    }
  } catch (error) {
    // 전체 에러 무시 (Firebase 연결 실패 시 localStorage만 사용)
  }
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
  if (typeof window === 'undefined') return mockAssets;
  const stored = localStorage.getItem('finance-assets');
  return stored ? JSON.parse(stored) : mockAssets;
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
  if (typeof window === 'undefined') return mockIncome;
  const stored = localStorage.getItem('finance-income');
  return stored ? JSON.parse(stored) : mockIncome;
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
  if (typeof window === 'undefined') return mockLiabilities;
  const stored = localStorage.getItem('finance-liabilities');
  return stored ? JSON.parse(stored) : mockLiabilities;
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
  if (typeof window === 'undefined') return mockApartments;
  const stored = localStorage.getItem('finance-apartments');
  return stored ? JSON.parse(stored) : mockApartments;
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
