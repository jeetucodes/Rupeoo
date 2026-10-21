import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore: getReactNativePersistence is provided by React Native platform bundle of firebase/auth but not declared in standard d.ts
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore, Firestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warn, error } from '@/lib/logger';

const firebaseConfig = {
  apiKey: "AIzaSyAy0P_i2ywT_jpF_leDU-oo3juR1Pu9VJE",
  authDomain: "paisewaise-e545e.firebaseapp.com",
  projectId: "paisewaise-e545e",
  storageBucket: "paisewaise-e545e.firebasestorage.app",
  messagingSenderId: "26927139619",
  appId: "1:26927139619:android:e0cace3a90101a2b02da96"
};

let app: any;
if (getApps().length > 0) {
  app = getApp();
} else {
  app = initializeApp(firebaseConfig);
}

let auth: any;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (err: any) {
    if (err.code === 'auth/already-initialized') {
      auth = getAuth(app);
    } else {
      error('Firebase Auth Persistence Init Error:', err);
      // Ensure we still have an auth object to prevent immediate crashes, but warn heavily
      auth = getAuth(app); 
    }
  }
}

export { auth };

let dbInstance: Firestore;
try {
  dbInstance = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : ({} as Firestore);
} catch (firestoreErr) {
  try {
    dbInstance = app ? getFirestore(app) : ({} as Firestore);
  } catch {
    error('Firestore init error:', firestoreErr);
    dbInstance = {} as Firestore;
  }
}
export const db = dbInstance;

let storageInstance: any = null;
try {
  // Dynamically import or initialize getStorage
  const { getStorage } = require('firebase/storage');
  storageInstance = app ? getStorage(app) : null;
} catch (storageErr) {
  warn('Firebase Storage init warning:', storageErr);
  storageInstance = null;
}
export const storage = storageInstance;

let functionsInstance: any = null;
try {
  const { getFunctions } = require('firebase/functions');
  functionsInstance = app ? getFunctions(app) : null;
} catch (functionsErr) {
  warn('Firebase Functions init warning:', functionsErr);
  functionsInstance = null;
}
export const functions = functionsInstance;
