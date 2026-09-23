# Firestore 보안 규칙

실제 규칙은 저장소 루트의 `firestore.rules`가 기준입니다.

## 적용 순서

1. Firebase Authentication에서 Google 로그인을 활성화합니다.
2. `workspaces/finance/allowedEmails/{소문자 이메일}` 문서를 생성합니다.
3. 문서에 `enabled: true` 불리언 필드를 추가합니다.
4. `firestore.rules`를 Firestore Rules에 게시합니다.
5. 허용 계정과 비허용 계정으로 각각 접근을 확인합니다.

허용 이메일 문서는 로그인한 사용자가 자신의 문서만 조회할 수 있고, 앱에서는 생성,
목록 조회, 수정, 삭제할 수 없습니다. 허용 목록 변경은 Firebase Console 또는 신뢰할 수
있는 관리자 환경에서만 수행합니다.

현재 규칙은 레거시 데이터가 있는 `users/default/**`만 보호합니다. 사용자 UID 기반 경로로
데이터를 이전하기 전까지 `firebase_user_id` 값을 임의로 설정하면 해당 경로 접근은
거부됩니다.
