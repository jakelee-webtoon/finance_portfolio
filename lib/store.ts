import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary, Scope } from '@/types';
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
      // 빈 배열도 저장 (mock 데이터 방지)
      localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
    } catch (error) {
      // 에러 무시
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

export function setAssets(assets: Asset[]): void {
  if (typeof window === 'undefined') return;
  
  // localStorage에 저장
  localStorage.setItem('finance-assets', JSON.stringify(assets));
  
  // Firebase 사용 가능하면 백그라운드에서 Firebase에 저장 (비동기)
  if (useFirebase()) {
    getFirestoreFunctions().then(firestore => {
      if (firestore) {
        firestore.setAssets(assets).catch((error: unknown) => {
          // 에러 로깅 (디버깅용)
          console.error('[Store] Failed to save Assets to Firebase:', error);
          // 에러 무시 (이미 localStorage에 저장됨)
        });
      } else {
        console.warn('[Store] Firestore functions not available');
      }
    }).catch((error: unknown) => {
      console.error('[Store] Failed to load Firestore functions:', error);
    });
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getIncome(): Income[] {
  if (typeof window === 'undefined') return mockIncome;
  const stored = localStorage.getItem('finance-income');
  return stored ? JSON.parse(stored) : mockIncome;
}

export function setIncome(income: Income[]): void {
  if (typeof window === 'undefined') return;
  
  // localStorage에 저장
  localStorage.setItem('finance-income', JSON.stringify(income));
  
  // Firebase 사용 가능하면 백그라운드에서 Firebase에 저장 (비동기)
  if (useFirebase()) {
    getFirestoreFunctions().then(firestore => {
      if (firestore) {
        firestore.setIncome(income).catch((error: unknown) => {
          // 에러 무시 (이미 localStorage에 저장됨)
          console.error('[Store] Failed to save Income to Firebase:', error);
        });
      }
    }).catch((error: unknown) => {
      // 에러 무시
      console.error('[Store] Failed to load Firestore functions:', error);
    });
  }
}

export function getTransactions(): Transaction[] {
  if (typeof window === 'undefined') return mockTransactions;
  const stored = localStorage.getItem('finance-transactions');
  return stored ? JSON.parse(stored) : mockTransactions;
}

export function setTransactions(transactions: Transaction[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-transactions', JSON.stringify(transactions));
}

export function getPortfolios(): Portfolio[] {
  if (typeof window === 'undefined') return mockPortfolios;
  const stored = localStorage.getItem('finance-portfolios');
  return stored ? JSON.parse(stored) : mockPortfolios;
}

export function setPortfolios(portfolios: Portfolio[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-portfolios', JSON.stringify(portfolios));
}

export function getLiabilities(): Liability[] {
  if (typeof window === 'undefined') return mockLiabilities;
  const stored = localStorage.getItem('finance-liabilities');
  return stored ? JSON.parse(stored) : mockLiabilities;
}

export function setLiabilities(liabilities: Liability[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-liabilities', JSON.stringify(liabilities));
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

export function setStockHoldings(holdings: StockHolding[]): void {
  if (typeof window === 'undefined') return;
  
  // localStorage에 저장
  localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
  
  // Firebase 사용 가능하면 백그라운드에서 Firebase에 저장 (비동기)
  if (useFirebase()) {
    getFirestoreFunctions().then(firestore => {
      if (firestore) {
        firestore.setStockHoldings(holdings).catch((error: unknown) => {
          // 에러 무시 (이미 localStorage에 저장됨)
          console.error('[Store] Failed to save Stock Holdings to Firebase:', error);
        });
      }
    }).catch((error: unknown) => {
      // 에러 무시
      console.error('[Store] Failed to load Firestore functions:', error);
    });
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getApartments(): Apartment[] {
  if (typeof window === 'undefined') return mockApartments;
  const stored = localStorage.getItem('finance-apartments');
  return stored ? JSON.parse(stored) : mockApartments;
}

export function setApartments(apartments: Apartment[]): void {
  if (typeof window === 'undefined') return;
  
  // localStorage에 저장
  localStorage.setItem('finance-apartments', JSON.stringify(apartments));
  
  // Firebase 사용 가능하면 백그라운드에서 Firebase에 저장 (비동기)
  if (useFirebase()) {
    getFirestoreFunctions().then(firestore => {
      if (firestore) {
        firestore.setApartments(apartments).catch((error: unknown) => {
          // 에러 무시 (이미 localStorage에 저장됨)
          console.error('[Store] Failed to save Apartments to Firebase:', error);
        });
      }
    }).catch((error: unknown) => {
      // 에러 무시
      console.error('[Store] Failed to load Firestore functions:', error);
    });
  }
}

// 동기 버전 (기존 코드 호환성 유지 - 기본 export)
export function getSalaries(): Salary[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-salaries');
  return stored ? JSON.parse(stored) : [];
}

export function setSalaries(salaries: Salary[]): void {
  if (typeof window === 'undefined') return;
  
  // localStorage에 저장
  localStorage.setItem('finance-salaries', JSON.stringify(salaries));
  
  // Firebase 사용 가능하면 백그라운드에서 Firebase에 저장 (비동기)
  if (useFirebase()) {
    getFirestoreFunctions().then(firestore => {
      if (firestore) {
        firestore.setSalaries(salaries).catch((error: unknown) => {
          // 에러 무시 (이미 localStorage에 저장됨)
          console.error('[Store] Failed to save Salaries to Firebase:', error);
        });
      }
    }).catch((error: unknown) => {
      // 에러 무시
      console.error('[Store] Failed to load Firestore functions:', error);
    });
  }
}
