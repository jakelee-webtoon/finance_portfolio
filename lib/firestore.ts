// Firestore 데이터베이스 서비스 레이어
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from './firebase';

// db가 null이면 함수들이 에러를 반환하도록 처리
// (런타임에만 체크, 빌드 시 에러 방지)
import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary } from '@/types';

// 사용자 ID 가져오기 (현재는 단일 사용자 가정, 나중에 인증 추가)
const getUserId = (): string => {
  // TODO: Firebase Auth에서 사용자 ID 가져오기
  // 현재는 'default' 사용
  if (typeof window !== 'undefined') {
    const userId = localStorage.getItem('firebase_user_id') || 'default';
    return userId;
  }
  return 'default';
};

// 컬렉션 경로 헬퍼
const getCollectionPath = (collectionName: string): string => {
  const userId = getUserId();
  return `users/${userId}/${collectionName}`;
};

// Firestore 타임스탬프를 Date로 변환
const timestampToDate = (timestamp: any): Date => {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  if (timestamp?.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return new Date(timestamp);
};

// Date를 Firestore 타임스탬프로 변환
const dateToTimestamp = (date: string | Date): Timestamp => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return Timestamp.fromDate(dateObj);
};

// Dashboard State
export async function getDashboardState(): Promise<DashboardState> {
  if (typeof window === 'undefined') {
    return {
      householdName: '우리집',
      baseMonth: new Date().toISOString().slice(0, 7),
      scope: 'combined',
    };
  }

  if (!db) {
    throw new Error('Firebase is not initialized. Please check your environment variables.');
  }

  try {
    const userId = getUserId();
    const docRef = doc(db, `users/${userId}/settings`, 'dashboard');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as DashboardState;
    }
    
    // 기본값 생성
    const defaultState: DashboardState = {
      householdName: '우리집',
      baseMonth: new Date().toISOString().slice(0, 7),
      scope: 'combined',
    };
    await setDoc(docRef, defaultState);
    return defaultState;
  } catch (error) {
    // 에러 발생 시 localStorage에서 가져오기 (fallback)
    const stored = localStorage.getItem('finance-dashboard-state');
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      householdName: '우리집',
      baseMonth: new Date().toISOString().slice(0, 7),
      scope: 'combined',
    };
  }
}

export async function setDashboardState(state: DashboardState): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-dashboard-state', JSON.stringify(state));
    throw new Error('Firebase is not initialized. Please check your environment variables.');
  }
  
  try {
    const userId = getUserId();
    const docRef = doc(db, `users/${userId}/settings`, 'dashboard');
    await setDoc(docRef, state);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-dashboard-state', JSON.stringify(state));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-dashboard-state', JSON.stringify(state));
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}

// Assets
export async function getAssets(): Promise<Asset[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    const stored = localStorage.getItem('finance-assets');
    return stored ? JSON.parse(stored) : [];
  }
  
  try {
    const q = query(collection(db, getCollectionPath('assets')), orderBy('as_of_date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      as_of_date: timestampToDate(doc.data().as_of_date).toISOString().split('T')[0],
    } as Asset));
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem('finance-assets');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function setAssets(assets: Asset[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-assets', JSON.stringify(assets));
    return;
  }
  
  try {
    const batch: Promise<void>[] = [];
    const firestore = db; // Type narrowing
    assets.forEach(asset => {
      const docRef = doc(firestore, getCollectionPath('assets'), asset.id);
      const { id, ...data } = asset;
      batch.push(setDoc(docRef, {
        ...data,
        as_of_date: dateToTimestamp(data.as_of_date),
      }));
    });
    await Promise.all(batch);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-assets', JSON.stringify(assets));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-assets', JSON.stringify(assets));
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}

// Stock Holdings
export async function getStockHoldings(): Promise<StockHolding[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    const stored = localStorage.getItem('finance-stock-holdings');
    return stored ? JSON.parse(stored) : [];
  }
  
  try {
    const q = query(collection(db, getCollectionPath('stockHoldings')), orderBy('as_of_date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      as_of_date: timestampToDate(doc.data().as_of_date).toISOString().split('T')[0],
    } as StockHolding));
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem('finance-stock-holdings');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function setStockHoldings(holdings: StockHolding[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
    return;
  }
  
  try {
    const batch: Promise<void>[] = [];
    const firestore = db; // Type narrowing
    holdings.forEach(holding => {
      const docRef = doc(firestore, getCollectionPath('stockHoldings'), holding.id);
      const { id, ...data } = holding;
      batch.push(setDoc(docRef, {
        ...data,
        as_of_date: dateToTimestamp(data.as_of_date),
      }));
    });
    await Promise.all(batch);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}

// Salaries
export async function getSalaries(): Promise<Salary[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    const stored = localStorage.getItem('finance-salaries');
    return stored ? JSON.parse(stored) : [];
  }
  
  try {
    const q = query(collection(db, getCollectionPath('salaries')), orderBy('year', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Salary));
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem('finance-salaries');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function setSalaries(salaries: Salary[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-salaries', JSON.stringify(salaries));
    return;
  }
  
  try {
    const batch: Promise<void>[] = [];
    const firestore = db; // Type narrowing
    salaries.forEach(salary => {
      const docRef = doc(firestore, getCollectionPath('salaries'), salary.id);
      const { id, ...data } = salary;
      batch.push(setDoc(docRef, data));
    });
    await Promise.all(batch);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-salaries', JSON.stringify(salaries));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-salaries', JSON.stringify(salaries));
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}

// Apartments
export async function getApartments(): Promise<Apartment[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    const stored = localStorage.getItem('finance-apartments');
    return stored ? JSON.parse(stored) : [];
  }
  
  try {
    const q = query(collection(db, getCollectionPath('apartments')), orderBy('as_of_date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      as_of_date: timestampToDate(doc.data().as_of_date).toISOString().split('T')[0],
    } as Apartment));
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem('finance-apartments');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function setApartments(apartments: Apartment[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-apartments', JSON.stringify(apartments));
    return;
  }
  
  try {
    const batch: Promise<void>[] = [];
    const firestore = db; // Type narrowing
    apartments.forEach(apartment => {
      const docRef = doc(firestore, getCollectionPath('apartments'), apartment.id);
      const { id, ...data } = apartment;
      batch.push(setDoc(docRef, {
        ...data,
        as_of_date: dateToTimestamp(data.as_of_date),
      }));
    });
    await Promise.all(batch);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-apartments', JSON.stringify(apartments));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-apartments', JSON.stringify(apartments));
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}

// Income
export async function getIncome(): Promise<Income[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    const stored = localStorage.getItem('finance-income');
    return stored ? JSON.parse(stored) : [];
  }
  
  try {
    const q = query(collection(db, getCollectionPath('income')), orderBy('as_of_date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      as_of_date: timestampToDate(doc.data().as_of_date).toISOString().split('T')[0],
    } as Income));
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem('finance-income');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function setIncome(income: Income[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-income', JSON.stringify(income));
    return;
  }
  
  try {
    const batch: Promise<void>[] = [];
    const firestore = db; // Type narrowing
    income.forEach(item => {
      const docRef = doc(firestore, getCollectionPath('income'), item.id);
      const { id, ...data } = item;
      batch.push(setDoc(docRef, {
        ...data,
        as_of_date: dateToTimestamp(data.as_of_date),
      }));
    });
    await Promise.all(batch);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-income', JSON.stringify(income));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-income', JSON.stringify(income));
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}
