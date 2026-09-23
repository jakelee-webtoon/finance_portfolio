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

저장소 루트의 `firestore.rules`를 Firestore Database → 규칙 탭에 게시합니다.
허용 이메일 문서 생성과 Google OAuth 설정은 `FIREBASE_SETUP.md`를 따릅니다.

공개 규칙인 `allow read, write: if true`는 개발 환경에서도 사용하지 않습니다.

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
- 환경 변수가 설정되지 않으면 로그인 화면에서 설정 오류를 표시합니다
