import { seoulDate } from '@/lib/calendar';
// Firestore 데이터베이스 서비스 레이어
import { 
  collection, 
  doc, 
  getDocFromServer as getDoc,
  getDocsFromServer as getDocs,
  setDoc, 
  query,
  orderBy,
  Timestamp,
  writeBatch,
  runTransaction,
  type Firestore
} from 'firebase/firestore';
import { db } from './firebase';
import {
  FIRESTORE_COLLECTIONS,
  type FirestoreCollectionKey,
  type ItemChange,
  assertItemWrite,
  mergeCollectionItems,
  planCollectionUpserts,
  removeUndefinedDeep,
} from './persistenceConfig';
import { parseStoredJson } from './storageJson';

// db가 null이면 함수들이 에러를 반환하도록 처리
// (런타임에만 체크, 빌드 시 에러 방지)
import { DashboardState, Asset, Income, Liability, StockHolding, Apartment, Salary, LedgerEntry, MonthlyPlanEntry, AssistantSummary } from '@/types';

type FirestoreEntity = { id: string };

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

const readLocalStorage = <T>(key: string, fallback: T): T => {
  return parseStoredJson(localStorage.getItem(key), fallback);
};

const writeLocalStorage = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

const stripUndefinedFields = <T extends FirestoreEntity>(item: T): Record<string, unknown> => {
  const data = { ...item } as Record<string, unknown>;
  delete data.id;
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
};

const prepareFirestoreData = <T extends FirestoreEntity>(
  item: T,
  dateFields: readonly string[] = []
): Record<string, unknown> => {
  const data = stripUndefinedFields(item);

  dateFields.forEach(field => {
    const value = data[field];
    if (typeof value === 'string' || value instanceof Date) {
      data[field] = dateToTimestamp(value);
    }
  });

  return removeUndefinedDeep(data);
};

const upsertCollection = async <T extends FirestoreEntity>(
  firestore: Firestore,
  collectionPath: string,
  items: T[],
  dateFields: readonly string[] = []
): Promise<void> => {
  const plan = planCollectionUpserts(items);

  for (const operations of plan.batches) {
    const batch = writeBatch(firestore);
    operations.forEach(operation => {
      if (operation.type !== 'set') return;
      const documentRef = doc(firestore, collectionPath, operation.id);
      batch.set(documentRef, prepareFirestoreData(operation.item, dateFields));
    });
    await batch.commit();
  }
};

const saveCollection = async <T extends FirestoreEntity>(
  items: T[],
  options: {
    collectionName: string;
    storageKey: string;
    label: string;
    dateFields?: readonly string[];
  }
): Promise<void> => {
  throw new Error('전체 목록 교체 저장은 비활성화되었습니다. 항목별 저장을 사용해주세요.');
};

// Dashboard State
export async function getDashboardState(): Promise<DashboardState> {
  if (typeof window === 'undefined') {
    return {
      householdName: '우리집',
      baseMonth: seoulDate().slice(0, 7),
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
      baseMonth: seoulDate().slice(0, 7),
      scope: 'combined',
    };
    return defaultState;
  } catch (error) {
    throw error;
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
    throw new Error('자산 서버 조회에 실패했습니다.');
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
    throw new Error('자산 서버 조회에 실패했습니다.');
  }
}

export async function setAssets(assets: Asset[]): Promise<void> {
  await saveCollection(assets, FIRESTORE_COLLECTIONS.assets);
}

// Stock Holdings
export async function getStockHoldings(): Promise<StockHolding[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
  
  try {
    // orderBy 없이 모든 데이터 가져오기 (as_of_date가 없는 데이터도 포함)
    const q = query(collection(db, getCollectionPath('stockHoldings')));
    const querySnapshot = await getDocs(q);
    const holdings = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        as_of_date: data.as_of_date ? timestampToDate(data.as_of_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      } as StockHolding;
    });
    
    // as_of_date 기준으로 정렬 (클라이언트 사이드)
    holdings.sort((a, b) => {
      const dateA = new Date(a.as_of_date).getTime();
      const dateB = new Date(b.as_of_date).getTime();
      return dateB - dateA; // 내림차순
    });
    
    console.log(`[Firestore] getStockHoldings: ${holdings.length}개 (RSU/Options: ${holdings.filter(h => h.type === 'rsu' || h.type === 'option').length}개)`);
    
    return holdings;
  } catch (error) {
    console.error('[Firestore] Failed to get stock holdings:', error);
    // Fallback to localStorage
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setStockHoldings(holdings: StockHolding[]): Promise<void> {
  await saveCollection(holdings, FIRESTORE_COLLECTIONS.stockHoldings);
}

// Salaries
export async function getSalaries(): Promise<Salary[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
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
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setSalaries(salaries: Salary[]): Promise<void> {
  await saveCollection(salaries, FIRESTORE_COLLECTIONS.salaries);
}

// Apartments
export async function getApartments(): Promise<Apartment[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
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
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setApartments(apartments: Apartment[]): Promise<void> {
  await saveCollection(apartments, FIRESTORE_COLLECTIONS.apartments);
}

// Income
export async function getIncome(): Promise<Income[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
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
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setIncome(income: Income[]): Promise<void> {
  await saveCollection(income, FIRESTORE_COLLECTIONS.income);
}

// Liabilities
export async function getLiabilities(): Promise<Liability[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
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
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setLiabilities(liabilities: Liability[]): Promise<void> {
  await saveCollection(liabilities, FIRESTORE_COLLECTIONS.liabilities);
}

// 가계부 항목
export async function getLedgerEntries(): Promise<LedgerEntry[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
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
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setLedgerEntries(entries: LedgerEntry[]): Promise<void> {
  await saveCollection(entries, FIRESTORE_COLLECTIONS.ledgerEntries);
}

// 월간 계획
export async function getMonthlyPlanEntries(): Promise<MonthlyPlanEntry[]> {
  if (typeof window === 'undefined') return [];
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }

  try {
    const firestore = db;
    const collectionPath = getCollectionPath('monthlyPlanEntries');
    const q = query(collection(firestore, collectionPath), orderBy('month', 'desc'));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      as_of_date: timestampToDate(doc.data().as_of_date).toISOString().split('T')[0],
    } as MonthlyPlanEntry));
  } catch (error) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setMonthlyPlanEntries(entries: MonthlyPlanEntry[]): Promise<void> {
  if (typeof window === 'undefined') return;
  const config = FIRESTORE_COLLECTIONS.monthlyPlanEntries;
  const existing = readLocalStorage<MonthlyPlanEntry[]>(config.storageKey, []);
  writeLocalStorage(config.storageKey, mergeCollectionItems(existing, entries));

  if (!db) {
    return;
  }

  try {
    const collectionPath = getCollectionPath(config.collectionName);
    await upsertCollection(db, collectionPath, entries, config.dateFields);
    console.log(`[Firestore] ${entries.length} ${config.label} upserted to Firebase: ${collectionPath}`);
  } catch (error) {
    console.error(`[Firestore] Failed to upsert ${config.label}:`, error);
    throw error;
  }
}

export async function getAssistantSummaries(): Promise<AssistantSummary[]> {
  if (typeof window === 'undefined') return [];
  const config = FIRESTORE_COLLECTIONS.assistantSummaries;
  if (!db) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }

  try {
    const firestore = db;
    const collectionPath = getCollectionPath(config.collectionName);
    const q = query(collection(firestore, collectionPath), orderBy('generatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as AssistantSummary));
  } catch (error) {
    throw new Error('서버 자료를 불러오지 못했습니다.');
  }
}

export async function setAssistantSummaries(summaries: AssistantSummary[]): Promise<void> {
  if (typeof window === 'undefined' || summaries.length === 0) return;
  const config = FIRESTORE_COLLECTIONS.assistantSummaries;
  const existing = readLocalStorage<AssistantSummary[]>(config.storageKey, []);
  writeLocalStorage(config.storageKey, mergeCollectionItems(existing, summaries));

  if (!db) return;
  try {
    const collectionPath = getCollectionPath(config.collectionName);
    await upsertCollection(db, collectionPath, summaries, config.dateFields);
    console.log(`[Firestore] ${summaries.length} ${config.label} upserted to Firebase: ${collectionPath}`);
  } catch (error) {
    console.error(`[Firestore] Failed to upsert ${config.label}:`, error);
    throw error;
  }
}

export async function savePendingChanges(pending: Partial<Record<FirestoreCollectionKey, ItemChange<any>[]>>): Promise<void> {
  if (!db) throw new Error('서버에 연결되지 않았습니다.');
  const firestore = db;
  const changes = (Object.keys(pending) as FirestoreCollectionKey[]).flatMap(key =>
    (pending[key] || []).map(change => ({ key, change }))
  );
  if (changes.length > 450) throw new Error('미저장 항목이 450개를 초과해 저장을 중단했습니다. 변경을 백업한 뒤 항목을 나누어 확인해주세요.');
  if (changes.length > 0) {
    const chunk = changes;
    await runTransaction(firestore, async transaction => {
      const refs = chunk.map(({ key, change }) => doc(firestore, getCollectionPath(FIRESTORE_COLLECTIONS[key].collectionName), change.id));
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      chunk.forEach(({ key, change }, index) => {
        const config = FIRESTORE_COLLECTIONS[key];
        const snapshot = snapshots[index];
        const current = snapshot.exists() ? snapshot.data() : null;
        const before = change.before ? prepareFirestoreData(change.before, config.dateFields) : null;
        const after = change.after ? prepareFirestoreData(change.after, config.dateFields) : null;
        // Older holdings may have no date; the reader supplies a display default.
        if (current && before && !('as_of_date' in current)) delete before.as_of_date;
        const comparable = (value: Record<string, unknown> | null) => {
          if (!value) return null;
          const normalized = { ...value };
          config.dateFields.forEach(field => {
            if (normalized[field] != null) normalized[field] = timestampToDate(normalized[field]).toISOString().slice(0, 10);
          });
          return normalized;
        };
        assertItemWrite(comparable(current), comparable(before), comparable(after));
        if (change.verifyOnly) return;
        if (after) transaction.set(snapshot.ref, after);
        else transaction.delete(snapshot.ref);
      });
    });
  }
}
