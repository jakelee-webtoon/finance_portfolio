export type SourceType = 'manual' | 'auto';
export type Scope = 'combined' | 'husband' | 'wife';

export interface BaseEntity {
  source_type: SourceType;
  as_of_date: string; // YYYY-MM-DD
  last_modified_by: 'husband' | 'wife';
}

export interface Asset extends BaseEntity {
  id: string;
  name: string;
  category: 'cash' | 'stocks' | 'bonds' | 'real_estate' | 'other';
  amount: number;
  owner: 'husband' | 'wife' | 'joint';
  currency: string;
  notes?: string; // 비고/내용
}

export interface Liability extends BaseEntity {
  id: string;
  name: string;
  category: 'loan' | 'credit_card' | 'mortgage' | 'other';
  amount: number;
  owner: 'husband' | 'wife' | 'joint';
  currency: string;
}

export interface Income extends BaseEntity {
  id: string;
  source: string;
  amount: number;
  owner: 'husband' | 'wife' | 'joint';
  category: 'salary' | 'bonus' | 'investment' | 'other';
  currency: string;
  period: 'monthly' | 'yearly' | 'one-time';
}

export interface Transaction extends BaseEntity {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  owner: 'husband' | 'wife' | 'joint';
  currency: string;
}

export interface Portfolio extends BaseEntity {
  id: string;
  name: string;
  total_value: number;
  owner: 'husband' | 'wife' | 'joint';
  currency: string;
  assets: string[]; // Asset IDs
}

export interface StockHolding extends BaseEntity {
  id: string;
  symbol: string; // 주식 심볼 (예: AAPL, 005930)
  name: string; // 주식명
  quantity: number; // 보유 수량
  purchasePrice: number; // 매수 가격
  currentPrice?: number; // 현재 가격 (API에서 가져옴)
  owner: 'husband' | 'wife' | 'joint';
  currency: string;
  exchange: 'KRX' | 'NASDAQ' | 'NYSE' | 'other'; // 거래소
  type?: 'stock' | 'rsu' | 'option'; // 주식 유형 (기본값: 'stock')
  // RSU 관련 필드
  vestedQuantity?: number; // 베스팅된 수량 (RSU)
  totalQuantity?: number; // 전체 수량 (RSU)
  vestingDate?: string; // 베스팅 예정일 (YYYY-MM-DD)
  // 옵션 관련 필드
  strikePrice?: number; // 행사 가격 (옵션)
  expiryDate?: string; // 만료일 (YYYY-MM-DD) (옵션)
}

export interface Apartment extends BaseEntity {
  id: string;
  apartmentName: string; // 아파트명
  address: string; // 주소 (법정동)
  dong: string; // 동
  ho: string; // 호수
  area: number; // 전용면적 (㎡)
  floor: number; // 층수
  buildYear: string; // 건축년도
  purchasePrice: number; // 매수 가격
  purchaseDate: string; // 매수일 (YYYY-MM-DD)
  currentPrice?: number; // 현재 시세 (API에서 가져옴)
  currentPriceDate?: string; // 시세 기준일
  owner: 'husband' | 'wife' | 'joint';
  currency: string;
  lawdCd?: string; // 지역코드 (예: 11680 = 강남구)
}

export interface Salary extends BaseEntity {
  id: string;
  year: string; // YYYY
  amount: number; // 연봉 금액
  owner: 'husband' | 'wife' | 'joint';
  currency: string;
  yearsOfExperience?: number; // 연차 (년)
  notes?: string; // 비고/내용
}

export interface DashboardState {
  householdName: string;
  baseMonth: string; // YYYY-MM
  scope: Scope;
}

// 네이버 연봉 비교 관련 타입
export type NaverOrg = 'NAVER_HQ' | 'WEBTOON' | 'CLOUD' | 'FINANCIAL' | 'LABS' | 'JET';
export type SalaryScope = 'TC' | 'BASE';

export interface NaverSalaryStats {
  year: string;
  org: NaverOrg;
  scope: SalaryScope;
  yearsOfExperience?: number; // 연차 (년) - undefined면 전체 통계
  min: number; // 원 단위
  p25: number; // 원 단위
  median: number; // 원 단위
  avg: number; // 원 단위
  p75: number; // 원 단위
  p90?: number; // 원 단위 (상위 10%)
  p95?: number; // 원 단위 (상위 5%)
  max: number; // 원 단위
  n: number; // 샘플 수
}
