# Firestore 보안 규칙 설정

Firebase에 데이터를 저장하려면 Firestore 보안 규칙을 설정해야 합니다.

## 설정 방법

1. Firebase Console → Firestore Database → "규칙" 탭으로 이동
2. 다음 규칙을 복사하여 붙여넣기:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 개발/테스트 모드: 모든 읽기/쓰기 허용 (주의: 프로덕션에서는 제한 필요)
    match /{document=**} {
      allow read, write: if true;
    }
    
    // 또는 사용자별 접근 제어 (나중에 인증 추가 시)
    // match /users/{userId}/{document=**} {
    //   allow read, write: if request.auth != null && request.auth.uid == userId;
    // }
  }
}
```

3. "게시" 버튼 클릭

## 주의사항

- 위 규칙은 **개발/테스트용**입니다. 모든 사용자가 모든 데이터에 접근할 수 있습니다.
- 프로덕션 환경에서는 Firebase Authentication을 추가하고 사용자별 접근 제어를 구현해야 합니다.

## 프로덕션 보안 규칙 예시

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 자신의 데이터에 접근
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
