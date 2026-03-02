import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary, Scope } from '@/types';
import { mockAssets, mockIncome, mockTransactions, mockPortfolios, mockLiabilities, mockStockHoldings, mockApartments } from '@/data/mockData';

const STORAGE_KEY = 'finance-dashboard-state';

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

export function setDashboardState(state: DashboardState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getAssets(): Asset[] {
  if (typeof window === 'undefined') return mockAssets;
  const stored = localStorage.getItem('finance-assets');
  return stored ? JSON.parse(stored) : mockAssets;
}

export function setAssets(assets: Asset[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-assets', JSON.stringify(assets));
}

export function getIncome(): Income[] {
  if (typeof window === 'undefined') return mockIncome;
  const stored = localStorage.getItem('finance-income');
  return stored ? JSON.parse(stored) : mockIncome;
}

export function setIncome(income: Income[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-income', JSON.stringify(income));
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

export function getStockHoldings(): StockHolding[] {
  if (typeof window === 'undefined') return mockStockHoldings;
  const stored = localStorage.getItem('finance-stock-holdings');
  return stored ? JSON.parse(stored) : mockStockHoldings;
}

export function setStockHoldings(holdings: StockHolding[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
}

export function getApartments(): Apartment[] {
  if (typeof window === 'undefined') return mockApartments;
  const stored = localStorage.getItem('finance-apartments');
  return stored ? JSON.parse(stored) : mockApartments;
}

export function setApartments(apartments: Apartment[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-apartments', JSON.stringify(apartments));
}

export function getSalaries(): Salary[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('finance-salaries');
  return stored ? JSON.parse(stored) : [];
}

export function setSalaries(salaries: Salary[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('finance-salaries', JSON.stringify(salaries));
}
