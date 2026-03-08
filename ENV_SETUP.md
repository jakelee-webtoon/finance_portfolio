# 환경 변수 설정 가이드

## 1. Firebase 콘솔에서 설정 값 가져오기

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. `finance-portfolio` 프로젝트 선택
3. 프로젝트 설정(톱니바퀴 아이콘) → 일반 탭
4. "내 앱" 섹션에서 웹 앱 추가(</> 아이콘) 클릭
5. 앱 닉네임 입력 (예: "finance-portfolio-web")
6. "앱 등록" 클릭
7. Firebase 구성 객체 복사

## 2. .env.local 파일 생성

프로젝트 루트 디렉토리에 `.env.local` 파일을 생성하고 다음 내용을 입력:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=여기에-api-key-입력
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=여기에-auth-domain-입력
NEXT_PUBLIC_FIREBASE_PROJECT_ID=여기에-project-id-입력
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=여기에-storage-bucket-입력
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=여기에-sender-id-입력
NEXT_PUBLIC_FIREBASE_APP_ID=여기에-app-id-입력
```

**예시:**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAbc123...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=finance-portfolio-310cf.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=finance-portfolio-310cf
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=finance-portfolio-310cf.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

## 3. Firestore 데이터베이스 생성

1. Firebase Console → Firestore Database
2. "데이터베이스 만들기" 클릭
3. **프로덕션 모드** 선택 (나중에 테스트 모드로 변경 가능)
4. 위치 선택: `asia-northeast3` (서울) 또는 가장 가까운 리전
5. "사용 설정" 클릭

## 4. Firestore 보안 규칙 설정

Firestore Database → 규칙 탭에서 다음 규칙 설정:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자별 데이터 접근 제어
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 임시: 모든 사용자가 읽기/쓰기 가능 (개발 단계)
    // TODO: 인증 추가 후 위의 규칙으로 변경
    match /users/{userId}/{document=**} {
      allow read, write: if true;
    }
  }
}
```

**주의**: 개발 단계에서는 모든 사용자가 접근 가능하도록 설정했습니다. 프로덕션 배포 전에 인증 기반 규칙으로 변경해야 합니다.

## 5. 개발 서버 재시작

환경 변수를 변경한 후에는 개발 서버를 재시작해야 합니다:

```bash
# 서버 중지 (Ctrl+C)
# 서버 재시작
npm run dev
```

## 완료!

이제 Firebase 연동이 완료되었습니다. 

- 데이터는 localStorage와 Firebase에 동시에 저장됩니다
- Firebase 연결이 실패해도 localStorage에서 데이터를 가져올 수 있습니다
- 환경 변수가 설정되지 않으면 localStorage만 사용합니다
