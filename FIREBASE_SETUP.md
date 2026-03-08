# Firebase 연동 가이드

## 1단계: Firebase SDK 설치

터미널에서 실행:
```bash
npm install firebase
```

## 2단계: Firebase 콘솔에서 설정 가져오기

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택
3. 프로젝트 설정(톱니바퀴 아이콘) → 일반 탭
4. "내 앱" 섹션에서 웹 앱 추가(</> 아이콘)
5. 앱 닉네임 입력 후 등록
6. Firebase 구성 객체 복사 (아래와 같은 형태):
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

## 3단계: 환경 변수 파일 생성

프로젝트 루트에 `.env.local` 파일을 생성하고 다음 내용을 입력:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key-here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

**주의**: `.env.local` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.

## 4단계: Firestore 데이터베이스 생성

1. Firebase Console → Firestore Database
2. "데이터베이스 만들기" 클릭
3. 프로덕션 모드 선택 (나중에 테스트 모드로 변경 가능)
4. 위치 선택 (가장 가까운 리전 선택, 예: `asia-northeast3` (서울))
5. "사용 설정" 클릭

## 5단계: Firestore 보안 규칙 설정

Firestore Database → 규칙 탭에서 다음 규칙 설정:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자별 데이터 접근 제어
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 공개 데이터 (예: 환율, 주가 등)
    match /public/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## 6단계: Authentication 설정 (선택사항)

현재 비밀번호 인증을 사용 중이므로, Firebase Authentication은 나중에 추가할 수 있습니다.

1. Firebase Console → Authentication
2. "시작하기" 클릭
3. 원하는 로그인 제공업체 활성화 (예: 이메일/비밀번호)

## 7단계: 데이터 마이그레이션 준비

현재 `localStorage`에 저장된 데이터를 Firestore로 마이그레이션하는 작업이 필요합니다.

### 마이그레이션 순서:
1. Firestore 서비스 생성 (`lib/firestore.ts`)
2. 기존 `lib/store.ts`를 Firebase 기반으로 수정
3. 데이터 마이그레이션 스크립트 작성
4. 점진적으로 각 페이지에서 Firebase 사용

## 다음 단계

Firebase 설정이 완료되면 다음 작업을 진행합니다:
- Firestore 서비스 레이어 생성
- 기존 localStorage 기반 store를 Firebase로 교체
- 데이터 마이그레이션 스크립트 작성
