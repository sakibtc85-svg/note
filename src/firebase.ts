import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Synchronized validation constants from firebase-blueprint.json
export const VALIDATION_RULES = {
  ID_PATTERN: /^[a-zA-Z0-9_-]{1,128}$/,
  DATE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  TIME_PATTERN: /^[0-2][0-9]:[0-5][0-9]$/,
  MAX_TITLE_LENGTH: 100,
  MAX_SUBTITLE_LENGTH: 240,
  MAX_NOTE_LENGTH: 500,
  MAX_HABITS_COUNT: 8,
  MAX_HABIT_STRING_LENGTH: 160,
  ALLOWED_CATEGORIES: ['Mindfulness', 'Fitness', 'Deep Work', 'Nutrition', 'Reading', 'Custom'] as const,
  ALLOWED_QUOTE_THEMES: ['Stoic Discipline', 'Atomic Systems', 'Mindful Presence', 'Peak Endurance'] as const,
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot as required
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'item_1';
}

export function sanitizeTime(rawTime: string, fallback = '08:00'): string {
  return VALIDATION_RULES.TIME_PATTERN.test(rawTime) ? rawTime : fallback;
}

export function sanitizeDate(rawDate: string): string {
  if (VALIDATION_RULES.DATE_PATTERN.test(rawDate)) return rawDate;
  return new Date().toISOString().slice(0, 10);
}
