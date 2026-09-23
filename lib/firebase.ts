import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const configuredAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const appAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_APP_DOMAIN
  || 'finance-jakeminji.vercel.app';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: configuredAuthDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  const isLocalhost = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';
  const runtimeConfig = {
    ...firebaseConfig,
    authDomain: isLocalhost || (appAuthDomain && window.location.hostname === appAuthDomain)
      ? window.location.host
      : configuredAuthDomain,
  };

  app = getApps()[0] ?? initializeApp(runtimeConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };

export async function configureAuthPersistence(): Promise<void> {
  if (auth) await setPersistence(auth, browserLocalPersistence);
}

export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error('Firebase 환경변수가 설정되지 않았습니다.');
  await configureAuthPersistence();
  await signInWithRedirect(auth, new GoogleAuthProvider());
}

export async function signOutFirebase(): Promise<void> {
  if (auth) await signOut(auth);
}

export default app;
