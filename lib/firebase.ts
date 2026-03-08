// Firebase 초기화 파일
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase 설정
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase 앱 초기화 (중복 초기화 방지)
// 환경 변수가 없으면 빈 객체로 초기화 (에러 방지)
let app: FirebaseApp | null = null;
if (
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  typeof window !== 'undefined'
) {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
  } catch (error) {
    // Firebase 초기화 실패 시 무시 (환경 변수가 없을 때)
    console.warn('Firebase initialization failed:', error);
  }
}

// Firebase 서비스 초기화 (app이 null이면 에러 발생 가능하므로 타입 가드 필요)
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
export default app;
