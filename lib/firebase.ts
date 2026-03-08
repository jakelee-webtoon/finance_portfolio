// Firebase 초기화 파일
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase 설정 (하드코딩)
const firebaseConfig = {
  apiKey: "AIzaSyCxHlb4LY0t_QgNQs99C6w9Mo-pbYHY1sM",
  authDomain: "finance-portfolio-310cf.firebaseapp.com",
  projectId: "finance-portfolio-310cf",
  storageBucket: "finance-portfolio-310cf.firebasestorage.app",
  messagingSenderId: "260849761729",
  appId: "1:260849761729:web:134443612a118747ae8340",
};

// Firebase 앱 초기화 (중복 초기화 방지)
let app: FirebaseApp | null = null;
if (typeof window !== 'undefined') {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
  }
}

// Firebase 서비스 초기화 (app이 null이면 에러 발생 가능하므로 타입 가드 필요)
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
export default app;
