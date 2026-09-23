# Firebase 인증 설정

이 프로젝트는 Google OAuth와 Firestore 허용 이메일 목록을 함께 사용합니다.
로그인만 성공해도 데이터에 접근할 수 있는 구조가 아니며, Firestore의 허용 목록과
보안 규칙을 모두 통과해야 합니다.

## 1. 환경변수

Firebase Console의 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성에서 값을 확인합니다.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=finance-portfolio-310cf.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=finance-portfolio-310cf
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=finance-portfolio-310cf.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

로컬에서는 위 설정만 사용합니다. 프로덕션에서 redirect 로그인을 같은 도메인으로
처리하려면 실제 호스트 이름도 추가합니다.

```env
NEXT_PUBLIC_FIREBASE_APP_DOMAIN=finance-jakeminji.vercel.app
```

호스트 이름만 입력하며 `https://`와 경로는 넣지 않습니다.

## 2. Google 로그인 활성화

1. Firebase Console → Authentication → 로그인 방법으로 이동합니다.
2. Google 제공업체를 활성화합니다.
3. 프로젝트 지원 이메일을 선택하고 저장합니다.
4. Authentication → 설정 → 승인된 도메인에 `localhost`와 실제 배포 도메인을 등록합니다.

Google 로그인은 redirect 방식이며, 앱 복귀 시 Firebase redirect 결과를 명시적으로
확인한 뒤 로그인 상태와 Firestore 허용 목록을 검사합니다.

Vercel에서는 앱 도메인을 Firebase `authDomain`으로 사용하며, `next.config.js`가
`/__/auth/*` 요청을 Firebase 인증 도우미로 프록시합니다. Google Cloud Console의
Firebase 자동 생성 웹 OAuth 클라이언트에 다음 URI를 등록합니다.

```text
https://finance-jakeminji.vercel.app/__/auth/handler
```

## 3. 허용 이메일 등록

Firestore Console에서 다음 문서를 생성합니다. 이메일 문서 ID는 소문자로 입력합니다.

```text
workspaces/finance/allowedEmails/{Google 이메일}
```

문서 필드:

```text
enabled: true (boolean)
```

예를 들어 `wife@example.com`을 허용하려면
`workspaces/finance/allowedEmails/wife@example.com` 문서를 만듭니다. 부부 두 계정을
사용할 경우 이메일별로 문서를 하나씩 만듭니다.

## 4. Firestore 규칙 게시

저장소의 `firestore.rules` 내용을 Firebase Console → Firestore Database → 규칙에
붙여 넣고 게시합니다. Firebase CLI를 사용하는 경우 다음 명령으로 배포할 수 있습니다.

```bash
firebase deploy --only firestore:rules
```

현재 규칙은 기존 데이터가 저장된 `users/default/**` 경로만 허용된 Google 계정에
개방합니다. 그 외 경로는 모두 거부합니다.

## 5. 프로덕션 redirect 설정

`next.config.js`는 `/__/auth/*`를 Firebase Auth 핸들러로 전달합니다. 프로덕션에서
`NEXT_PUBLIC_FIREBASE_APP_DOMAIN`을 설정했다면 Google Cloud Console의 Firebase 자동
생성 웹 OAuth 클라이언트에 다음 승인된 리디렉션 URI를 추가합니다.

```text
https://finance-jakeminji.vercel.app/__/auth/handler
```

환경변수 변경 후에는 개발 서버를 재시작하거나 Vercel을 재배포해야 합니다.

## 현재 데이터 경로

이번 단계에서는 기존 데이터 이동을 하지 않습니다.

```text
users/default/settings/dashboard
users/default/assets/*
users/default/stockHoldings/*
users/default/.../*
```

Google 로그인과 Firestore 규칙이 안정적으로 동작하는 것을 확인한 다음, 별도 단계에서
기존 `default` 경로와 로컬 비밀번호 관련 레거시 데이터를 정리합니다.
