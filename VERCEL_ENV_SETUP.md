# Vercel 환경 변수 설정 가이드

프로덕션 환경에서 Firebase를 사용하려면 Vercel에 환경 변수를 설정해야 합니다.

## 설정 방법

### 1. Vercel 대시보드 접속
1. https://vercel.com/dashboard 접속
2. `finance_portfolio` 프로젝트 선택

### 2. 환경 변수 설정
1. 프로젝트 설정 → **"Environment Variables"** (환경 변수) 탭 클릭
2. 다음 환경 변수들을 하나씩 추가:

#### 필수 Firebase 환경 변수들:

```
NEXT_PUBLIC_FIREBASE_API_KEY
값: AIzaSyCxHlb4LY0t_QgNQs99C6w9Mo-pbYHY1sM

NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
값: finance-portfolio-310cf.firebaseapp.com

NEXT_PUBLIC_FIREBASE_PROJECT_ID
값: finance-portfolio-310cf

NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
값: finance-portfolio-310cf.firebasestorage.app

NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
값: 260849761729

NEXT_PUBLIC_FIREBASE_APP_ID
값: 1:260849761729:web:134443612a118747ae8340

NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
값: G-QLELX2LZWH
```

### 3. 환경 변수 추가 단계
각 환경 변수마다:
1. **Key**: 위의 변수명 입력 (예: `NEXT_PUBLIC_FIREBASE_API_KEY`)
2. **Value**: 위의 값 입력
3. **Environment**: 
   - ✅ **Production** 체크 (필수)
   - ✅ **Preview** 체크 (선택, 테스트용)
   - ✅ **Development** 체크 (선택, 로컬 개발용)
4. **"Save"** 버튼 클릭

### 4. 배포 재실행
환경 변수를 추가한 후:
1. **"Redeploy"** 버튼 클릭
   - 또는 Git에 push하면 자동으로 재배포됩니다
2. 배포 완료 후 프로덕션 사이트에서 Firebase 연결 확인

## 확인 방법

### 1. 배포 로그 확인
- Vercel 대시보드 → Deployments → 최신 배포 → Build Logs
- 에러가 없으면 정상

### 2. 프로덕션 사이트에서 확인
1. 프로덕션 URL 접속
2. 브라우저 개발자 도구(F12) → Console
3. Firebase 초기화 에러가 없으면 정상

### 3. Firebase Console에서 확인
1. Firebase Console → Firestore Database
2. 프로덕션 사이트에서 데이터 추가/수정
3. Firebase에 데이터가 저장되는지 확인

## 주의사항

- ⚠️ **환경 변수 이름은 정확히 입력**해야 합니다 (대소문자 구분)
- ⚠️ **`NEXT_PUBLIC_` 접두사가 있는 변수만** 브라우저에서 접근 가능합니다
- ⚠️ 환경 변수 추가 후 **반드시 재배포**해야 적용됩니다
- ⚠️ Production 환경에만 체크하면 프로덕션에서만 사용됩니다

## 문제 해결

### 환경 변수가 적용되지 않는 경우
1. 환경 변수 이름 확인 (대소문자 정확히)
2. Production 환경에 체크했는지 확인
3. 재배포 실행
4. 브라우저 캐시 삭제 후 다시 시도

### Firebase 연결 에러가 발생하는 경우
1. Firebase Console → 프로젝트 설정 → 일반 → 앱 확인
2. 환경 변수 값이 정확한지 확인
3. Firestore 보안 규칙 확인 (규칙 탭에서 `allow read, write: if true;` 설정)
