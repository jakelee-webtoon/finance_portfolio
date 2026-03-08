// localStorage 데이터를 Firebase로 마이그레이션하는 스크립트
import { DashboardState, Asset, StockHolding, Salary, Apartment, Income } from '@/types';
import { mockAssets, mockIncome, mockStockHoldings, mockApartments } from '@/data/mockData';
import * as firestore from './firestore';

// Mock 데이터인지 확인하는 헬퍼 함수
const isMockData = (item: any, mockItems: any[]): boolean => {
  return mockItems.some(mock => {
    // ID로 비교
    if (mock.id && item.id && mock.id === item.id) return true;
    // 주요 필드로 비교
    if (mock.name && item.name && mock.name === item.name) {
      if (mock.amount && item.amount && mock.amount === item.amount) return true;
    }
    return false;
  });
};

export async function migrateToFirebase(): Promise<{
  success: boolean;
  migrated: string[];
  errors: string[];
}> {
  const migrated: string[] = [];
  const errors: string[] = [];

  try {
    // Firebase 사용 가능 여부 확인
    if (typeof window === 'undefined') {
      return { success: false, migrated: [], errors: ['브라우저 환경에서만 실행 가능합니다'] };
    }

    const hasFirebaseConfig = !!(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    );

    if (!hasFirebaseConfig) {
      return { success: false, migrated: [], errors: ['Firebase 설정이 없습니다. .env.local 파일을 확인하세요'] };
    }

    // 1. Dashboard State 마이그레이션
    try {
      const stored = localStorage.getItem('finance-dashboard-state');
      if (stored) {
        const dashboardState: DashboardState = JSON.parse(stored);
        await firestore.setDashboardState(dashboardState);
        migrated.push('Dashboard State');
      }
    } catch (error) {
      errors.push(`Dashboard State: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 2. Assets 마이그레이션 (Mock 데이터 제외)
    try {
      const stored = localStorage.getItem('finance-assets');
      if (stored) {
        const assets: Asset[] = JSON.parse(stored);
        // Mock 데이터 제외
        const realAssets = assets.filter(asset => !isMockData(asset, mockAssets));
        if (realAssets.length > 0) {
          await firestore.setAssets(realAssets);
          migrated.push(`Assets (${realAssets.length}개, Mock ${assets.length - realAssets.length}개 제외)`);
        } else if (assets.length > 0) {
          migrated.push(`Assets (${assets.length}개 모두 Mock 데이터로 제외됨)`);
        }
      }
    } catch (error) {
      errors.push(`Assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 3. Stock Holdings 마이그레이션 (Mock 데이터 제외)
    try {
      const stored = localStorage.getItem('finance-stock-holdings');
      if (stored) {
        const holdings: StockHolding[] = JSON.parse(stored);
        // Mock 데이터 제외
        const realHoldings = holdings.filter(holding => !isMockData(holding, mockStockHoldings));
        if (realHoldings.length > 0) {
          await firestore.setStockHoldings(realHoldings);
          migrated.push(`Stock Holdings (${realHoldings.length}개, Mock ${holdings.length - realHoldings.length}개 제외)`);
        } else if (holdings.length > 0) {
          migrated.push(`Stock Holdings (${holdings.length}개 모두 Mock 데이터로 제외됨)`);
        }
      }
    } catch (error) {
      errors.push(`Stock Holdings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 4. Salaries 마이그레이션
    try {
      const stored = localStorage.getItem('finance-salaries');
      if (stored) {
        const salaries: Salary[] = JSON.parse(stored);
        if (salaries.length > 0) {
          await firestore.setSalaries(salaries);
          migrated.push(`Salaries (${salaries.length}개)`);
        }
      }
    } catch (error) {
      errors.push(`Salaries: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 5. Apartments 마이그레이션 (Mock 데이터 제외)
    try {
      const stored = localStorage.getItem('finance-apartments');
      if (stored) {
        const apartments: Apartment[] = JSON.parse(stored);
        // Mock 데이터 제외
        const realApartments = apartments.filter(apt => !isMockData(apt, mockApartments));
        if (realApartments.length > 0) {
          await firestore.setApartments(realApartments);
          migrated.push(`Apartments (${realApartments.length}개, Mock ${apartments.length - realApartments.length}개 제외)`);
        } else if (apartments.length > 0) {
          migrated.push(`Apartments (${apartments.length}개 모두 Mock 데이터로 제외됨)`);
        }
      }
    } catch (error) {
      errors.push(`Apartments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 6. Income 마이그레이션 (Mock 데이터 제외)
    try {
      const stored = localStorage.getItem('finance-income');
      if (stored) {
        const income: Income[] = JSON.parse(stored);
        // Mock 데이터 제외
        const realIncome = income.filter(item => !isMockData(item, mockIncome));
        if (realIncome.length > 0) {
          await firestore.setIncome(realIncome);
          migrated.push(`Income (${realIncome.length}개, Mock ${income.length - realIncome.length}개 제외)`);
        } else if (income.length > 0) {
          migrated.push(`Income (${income.length}개 모두 Mock 데이터로 제외됨)`);
        }
      }
    } catch (error) {
      errors.push(`Income: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 7. Transactions 마이그레이션 (있는 경우)
    try {
      const stored = localStorage.getItem('finance-transactions');
      if (stored) {
        const transactions = JSON.parse(stored);
        if (transactions.length > 0) {
          // Transactions는 firestore에 함수가 없으므로 나중에 추가 가능
          migrated.push(`Transactions (${transactions.length}개 - 저장 함수 필요)`);
        }
      }
    } catch (error) {
      errors.push(`Transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: errors.length === 0,
      migrated,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      migrated,
      errors: [...errors, `마이그레이션 실패: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}
