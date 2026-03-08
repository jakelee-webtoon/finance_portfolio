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
  QuerySnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

// db가 null이면 함수들이 에러를 반환하도록 처리
// (런타임에만 체크, 빌드 시 에러 방지)
import { DashboardState, Asset, Income, Transaction, Portfolio, Liability, StockHolding, Apartment, Salary, LedgerEntry } from '@/types';

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
    console.log(`[Firestore] Dashboard State saved to Firebase: users/${userId}/settings/dashboard`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-dashboard-state', JSON.stringify(state));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-dashboard-state', JSON.stringify(state));
    console.error(`[Firestore] Failed to save Dashboard State:`, error);
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
    const firestore = db; // Type narrowing
    const batch = writeBatch(firestore);
    const collectionPath = getCollectionPath('assets');
    
    // 기존 Firestore 데이터 가져오기
    const existingQuery = query(collection(firestore, collectionPath));
    const existingSnapshot = await getDocs(existingQuery);
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(assets.map(asset => asset.id));
    
    // 삭제된 항목들을 Firestore에서 제거
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = doc(firestore, collectionPath, id);
        batch.delete(docRef);
      }
    });
    
    // 새로운/업데이트된 항목들을 저장
    assets.forEach(asset => {
      const docRef = doc(firestore, collectionPath, asset.id);
      const { id, ...data } = asset;
      
      // undefined 필드 제거 (Firestore는 undefined를 허용하지 않음)
      const cleanData: any = {};
      Object.keys(data).forEach(key => {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleanData[key] = value;
        }
      });
      
      batch.set(docRef, {
        ...cleanData,
        as_of_date: dateToTimestamp(cleanData.as_of_date),
      });
    });
    
    await batch.commit();
    console.log(`[Firestore] ${assets.length} Assets saved to Firebase (deleted ${existingIds.size - newIds.size}): ${getCollectionPath('assets')}`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-assets', JSON.stringify(assets));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-assets', JSON.stringify(assets));
    console.error(`[Firestore] Failed to save Assets:`, error);
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
    const firestore = db; // Type narrowing
    const batch = writeBatch(firestore);
    const collectionPath = getCollectionPath('stockHoldings');
    
    // 기존 Firestore 데이터 가져오기
    const existingQuery = query(collection(firestore, collectionPath));
    const existingSnapshot = await getDocs(existingQuery);
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(holdings.map(holding => holding.id));
    
    // 삭제된 항목들을 Firestore에서 제거
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = doc(firestore, collectionPath, id);
        batch.delete(docRef);
      }
    });
    
    // 새로운/업데이트된 항목들을 저장
    holdings.forEach(holding => {
      const docRef = doc(firestore, collectionPath, holding.id);
      const { id, ...data } = holding;
      
      // undefined 필드 제거 (Firestore는 undefined를 허용하지 않음)
      const cleanData: any = {};
      Object.keys(data).forEach(key => {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleanData[key] = value;
        }
      });
      
      batch.set(docRef, {
        ...cleanData,
        as_of_date: dateToTimestamp(cleanData.as_of_date),
      });
    });
    
    await batch.commit();
    console.log(`[Firestore] ${holdings.length} Stock Holdings saved to Firebase (deleted ${existingIds.size - newIds.size}): ${getCollectionPath('stockHoldings')}`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-stock-holdings', JSON.stringify(holdings));
    console.error(`[Firestore] Failed to save Stock Holdings:`, error);
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
    const firestore = db; // Type narrowing
    const batch = writeBatch(firestore);
    const collectionPath = getCollectionPath('salaries');
    
    // 기존 Firestore 데이터 가져오기
    const existingQuery = query(collection(firestore, collectionPath));
    const existingSnapshot = await getDocs(existingQuery);
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(salaries.map(salary => salary.id));
    
    // 삭제된 항목들을 Firestore에서 제거
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = doc(firestore, collectionPath, id);
        batch.delete(docRef);
      }
    });
    
    // 새로운/업데이트된 항목들을 저장
    salaries.forEach(salary => {
      const docRef = doc(firestore, collectionPath, salary.id);
      const { id, ...data } = salary;
      
      // undefined 필드 제거 (Firestore는 undefined를 허용하지 않음)
      const cleanData: any = {};
      Object.keys(data).forEach(key => {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleanData[key] = value;
        }
      });
      
      batch.set(docRef, cleanData);
    });
    
    await batch.commit();
    console.log(`[Firestore] ${salaries.length} Salaries saved to Firebase (deleted ${existingIds.size - newIds.size}): ${getCollectionPath('salaries')}`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-salaries', JSON.stringify(salaries));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-salaries', JSON.stringify(salaries));
    console.error(`[Firestore] Failed to save Salaries:`, error);
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
    const firestore = db; // Type narrowing
    const batch = writeBatch(firestore);
    const collectionPath = getCollectionPath('apartments');
    
    // 기존 Firestore 데이터 가져오기
    const existingQuery = query(collection(firestore, collectionPath));
    const existingSnapshot = await getDocs(existingQuery);
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(apartments.map(apartment => apartment.id));
    
    // 삭제된 항목들을 Firestore에서 제거
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = doc(firestore, collectionPath, id);
        batch.delete(docRef);
      }
    });
    
    // 새로운/업데이트된 항목들을 저장
    apartments.forEach(apartment => {
      const docRef = doc(firestore, collectionPath, apartment.id);
      const { id, ...data } = apartment;
      
      // undefined 필드 제거 (Firestore는 undefined를 허용하지 않음)
      const cleanData: any = {};
      Object.keys(data).forEach(key => {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleanData[key] = value;
        }
      });
      
      batch.set(docRef, {
        ...cleanData,
        as_of_date: dateToTimestamp(cleanData.as_of_date),
      });
    });
    
    await batch.commit();
    console.log(`[Firestore] ${apartments.length} Apartments saved to Firebase (deleted ${existingIds.size - newIds.size}): ${getCollectionPath('apartments')}`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-apartments', JSON.stringify(apartments));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-apartments', JSON.stringify(apartments));
    console.error(`[Firestore] Failed to save Apartments:`, error);
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
    const firestore = db; // Type narrowing
    const batch = writeBatch(firestore);
    const collectionPath = getCollectionPath('income');
    
    // 기존 Firestore 데이터 가져오기
    const existingQuery = query(collection(firestore, collectionPath));
    const existingSnapshot = await getDocs(existingQuery);
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(income.map(item => item.id));
    
    // 삭제된 항목들을 Firestore에서 제거
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = doc(firestore, collectionPath, id);
        batch.delete(docRef);
      }
    });
    
    // 새로운/업데이트된 항목들을 저장
    income.forEach(item => {
      const docRef = doc(firestore, collectionPath, item.id);
      const { id, ...data } = item;
      
      // undefined 필드 제거 (Firestore는 undefined를 허용하지 않음)
      const cleanData: any = {};
      Object.keys(data).forEach(key => {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleanData[key] = value;
        }
      });
      
      batch.set(docRef, {
        ...cleanData,
        as_of_date: dateToTimestamp(cleanData.as_of_date),
      });
    });
    
    await batch.commit();
    console.log(`[Firestore] ${income.length} Income saved to Firebase (deleted ${existingIds.size - newIds.size}): ${getCollectionPath('income')}`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-income', JSON.stringify(income));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-income', JSON.stringify(income));
    console.error(`[Firestore] Failed to save Income:`, error);
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}

// Liabilities
export async function getLiabilities(): Promise<Liability[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    const stored = localStorage.getItem('finance-liabilities');
    return stored ? JSON.parse(stored) : [];
  }
  
  try {
    const q = query(collection(db, getCollectionPath('liabilities')), orderBy('as_of_date', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      as_of_date: timestampToDate(doc.data().as_of_date).toISOString().split('T')[0],
    } as Liability));
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem('finance-liabilities');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function setLiabilities(liabilities: Liability[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-liabilities', JSON.stringify(liabilities));
    return;
  }
  
  try {
    const firestore = db; // Type narrowing
    const batch = writeBatch(firestore);
    const collectionPath = getCollectionPath('liabilities');
    
    // 기존 Firestore 데이터 가져오기
    const existingQuery = query(collection(firestore, collectionPath));
    const existingSnapshot = await getDocs(existingQuery);
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(liabilities.map(liability => liability.id));
    
    // 삭제된 항목들을 Firestore에서 제거
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = doc(firestore, collectionPath, id);
        batch.delete(docRef);
      }
    });
    
    // 새로운/업데이트된 항목들을 저장
    liabilities.forEach(liability => {
      const docRef = doc(firestore, collectionPath, liability.id);
      const { id, ...data } = liability;
      
      // undefined 필드 제거 (Firestore는 undefined를 허용하지 않음)
      const cleanData: any = {};
      Object.keys(data).forEach(key => {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleanData[key] = value;
        }
      });
      
      batch.set(docRef, {
        ...cleanData,
        as_of_date: dateToTimestamp(cleanData.as_of_date),
      });
    });
    
    await batch.commit();
    console.log(`[Firestore] ${liabilities.length} Liabilities saved to Firebase (deleted ${existingIds.size - newIds.size}): ${getCollectionPath('liabilities')}`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-liabilities', JSON.stringify(liabilities));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-liabilities', JSON.stringify(liabilities));
    console.error(`[Firestore] Failed to save Liabilities:`, error);
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}

// 가계부 항목
export async function getLedgerEntries(): Promise<LedgerEntry[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    const stored = localStorage.getItem('finance-ledger-entries');
    return stored ? JSON.parse(stored) : [];
  }
  
  try {
    const firestore = db; // Type narrowing
    const collectionPath = getCollectionPath('ledgerEntries');
    const q = query(collection(firestore, collectionPath), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: timestampToDate(doc.data().date).toISOString().split('T')[0],
      as_of_date: timestampToDate(doc.data().as_of_date).toISOString().split('T')[0],
    } as LedgerEntry));
  } catch (error) {
    // Fallback to localStorage
    const stored = localStorage.getItem('finance-ledger-entries');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function setLedgerEntries(entries: LedgerEntry[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!db) {
    localStorage.setItem('finance-ledger-entries', JSON.stringify(entries));
    return;
  }
  
  try {
    const firestore = db; // Type narrowing
    const batch = writeBatch(firestore);
    const collectionPath = getCollectionPath('ledgerEntries');
    
    // 기존 Firestore 데이터 가져오기
    const existingQuery = query(collection(firestore, collectionPath));
    const existingSnapshot = await getDocs(existingQuery);
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(entries.map(entry => entry.id));
    
    // 삭제된 항목들을 Firestore에서 제거
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = doc(firestore, collectionPath, id);
        batch.delete(docRef);
      }
    });
    
    // 새로운/업데이트된 항목들을 저장
    entries.forEach(entry => {
      const docRef = doc(firestore, collectionPath, entry.id);
      const { id, ...data } = entry;
      
      // undefined 필드 제거 (Firestore는 undefined를 허용하지 않음)
      const cleanData: any = {};
      Object.keys(data).forEach(key => {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleanData[key] = value;
        }
      });
      
      batch.set(docRef, {
        ...cleanData,
        date: dateToTimestamp(cleanData.date),
        as_of_date: dateToTimestamp(cleanData.as_of_date),
      });
    });
    
    await batch.commit();
    console.log(`[Firestore] ${entries.length} Ledger Entries saved to Firebase (deleted ${existingIds.size - newIds.size}): ${getCollectionPath('ledgerEntries')}`);
    
    // localStorage에도 저장 (fallback)
    localStorage.setItem('finance-ledger-entries', JSON.stringify(entries));
  } catch (error) {
    // 에러 발생 시 localStorage에만 저장
    localStorage.setItem('finance-ledger-entries', JSON.stringify(entries));
    console.error(`[Firestore] Failed to save Ledger Entries:`, error);
    // 에러를 다시 throw하여 마이그레이션 함수에서 감지할 수 있도록
    throw error;
  }
}
