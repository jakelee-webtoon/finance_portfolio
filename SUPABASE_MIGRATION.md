# Supabase 마이그레이션 가이드

Firebase에서 Supabase로 전환하는 단계별 가이드입니다.

## 1단계: Supabase 프로젝트 생성

1. [Supabase](https://supabase.com/) 접속 및 로그인
2. "New Project" 클릭
3. 프로젝트 정보 입력:
   - **Name**: `finance-portfolio`
   - **Database Password**: 강력한 비밀번호 설정 (저장해두세요!)
   - **Region**: `Northeast Asia (Seoul)` 또는 가장 가까운 리전
4. "Create new project" 클릭
5. 프로젝트 생성 완료 대기 (약 2분)

## 2단계: Vercel에서 Supabase 통합

1. Vercel 대시보드 → 프로젝트 → **Settings** → **Integrations**
2. "Browse Integrations" 클릭
3. "Supabase" 검색 및 선택
4. "Add Integration" 클릭
5. 프로젝트 선택: `finance-portfolio`
6. Supabase 프로젝트 연결:
   - Supabase 프로젝트 선택
   - 또는 "Create new Supabase project" 클릭
7. "Connect" 클릭

이렇게 하면 자동으로 환경 변수가 설정됩니다:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 사이드용)

## 3단계: Supabase 데이터베이스 스키마 생성

Supabase SQL Editor에서 다음 SQL 실행:

```sql
-- 사용자별 데이터를 저장할 테이블들

-- Dashboard State
CREATE TABLE IF NOT EXISTS dashboard_states (
  id TEXT PRIMARY KEY DEFAULT 'default',
  user_id TEXT DEFAULT 'default',
  household_name TEXT,
  base_month TEXT,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  owner TEXT NOT NULL,
  currency TEXT NOT NULL,
  source_type TEXT,
  as_of_date DATE,
  last_modified_by TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock Holdings
CREATE TABLE IF NOT EXISTS stock_holdings (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  symbol TEXT NOT NULL,
  name TEXT,
  quantity NUMERIC NOT NULL,
  purchase_price NUMERIC,
  current_price NUMERIC,
  owner TEXT,
  currency TEXT,
  exchange TEXT,
  source_type TEXT,
  as_of_date DATE,
  last_modified_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Salaries
CREATE TABLE IF NOT EXISTS salaries (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  year TEXT NOT NULL,
  amount TEXT NOT NULL,
  owner TEXT NOT NULL,
  currency TEXT NOT NULL,
  years_of_experience INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Apartments
CREATE TABLE IF NOT EXISTS apartments (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  apartment_name TEXT,
  address TEXT,
  dong TEXT,
  ho TEXT,
  area NUMERIC,
  floor INTEGER,
  build_year TEXT,
  purchase_price NUMERIC,
  purchase_date DATE,
  owner TEXT,
  currency TEXT,
  lawd_cd TEXT,
  source_type TEXT,
  as_of_date DATE,
  last_modified_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Income
CREATE TABLE IF NOT EXISTS income (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  source TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  owner TEXT NOT NULL,
  category TEXT,
  currency TEXT,
  period TEXT,
  source_type TEXT,
  as_of_date DATE,
  last_modified_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_user_id ON stock_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_salaries_user_id ON salaries(user_id);
CREATE INDEX IF NOT EXISTS idx_apartments_user_id ON apartments(user_id);
CREATE INDEX IF NOT EXISTS idx_income_user_id ON income(user_id);
```

## 4단계: Row Level Security (RLS) 설정

Supabase → Authentication → Policies에서 다음 정책 설정:

```sql
-- 모든 테이블에 대해 읽기/쓰기 허용 (개발용)
-- 프로덕션에서는 인증된 사용자만 접근하도록 변경 필요

ALTER TABLE dashboard_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE income ENABLE ROW LEVEL SECURITY;

-- 개발용: 모든 사용자에게 읽기/쓰기 허용
CREATE POLICY "Allow all operations" ON dashboard_states FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON assets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON stock_holdings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON salaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON apartments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON income FOR ALL USING (true) WITH CHECK (true);
```

## 5단계: 코드 수정

1. Supabase 클라이언트 라이브러리 설치
2. Firebase 코드를 Supabase로 교체
3. 데이터 마이그레이션 스크립트 작성

## 주의사항

- ⚠️ 현재 Firebase 데이터를 Supabase로 마이그레이션해야 합니다
- ⚠️ 코드 수정이 필요합니다 (Firebase → Supabase)
- ⚠️ 테스트 후 프로덕션 배포

## 다음 단계

코드 수정을 시작할까요?
