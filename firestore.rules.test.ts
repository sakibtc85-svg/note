/**
 * Payload-First Security TDD Specification & Dirty Dozen Verification Suite
 * Validates all 12 adversarial payloads against the schema and invariants defined in firestore.rules.
 */

export interface SecurityTestPayload {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_PAYLOADS: SecurityTestPayload[] = [
  {
    id: 1,
    name: 'Unverified Email Spoof',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'create',
    auth: { uid: 'user_123', email_verified: false },
    payload: { ownerId: 'user_123', title: 'Test', status: 'active' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-Tenant Identity Spoofing',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'create',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'victim_uid_999', title: 'Spoofed Challenge', status: 'active' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Create',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'create',
    auth: { uid: 'user_123', email_verified: true },
    payload: { ownerId: 'user_123', title: 'Challenge', isVerifiedAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Update',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'update',
    auth: { uid: 'user_123', email_verified: true },
    payload: { ownerId: 'user_123', bonusScore: 99999 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Terminal State Mutation on Completed Challenge',
    collectionPath: '/challenges/ch_completed_01',
    operation: 'update',
    auth: { uid: 'user_123', email_verified: true },
    payload: { status: 'active', completedDays: [1, 2] },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable Field Tampering (createdAt / ownerId)',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'update',
    auth: { uid: 'user_123', email_verified: true },
    payload: { ownerId: 'other_user', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Client Clock Forgery (updatedAt != request.time)',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'create',
    auth: { uid: 'user_123', email_verified: true },
    payload: { ownerId: 'user_123', updatedAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned Subcollection Write (/logs without valid parent owner)',
    collectionPath: '/challenges/missing_parent/logs/day_1',
    operation: 'create',
    auth: { uid: 'user_123', email_verified: true },
    payload: { ownerId: 'user_123', challengeId: 'missing_parent', dayNumber: 1 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID Poisoning Attack (Invalid characters in Document ID)',
    collectionPath: '/challenges/invalid$id!@#',
    operation: 'create',
    auth: { uid: 'user_123', email_verified: true },
    payload: { ownerId: 'user_123' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Array Overflow Attack (completedDays > 30)',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'create',
    auth: { uid: 'user_123', email_verified: true },
    payload: {
      ownerId: 'user_123',
      completedDays: Array.from({ length: 45 }, (_, i) => i + 1),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on Whitelisted Key (title > 100 chars)',
    collectionPath: '/challenges/ch_valid_01',
    operation: 'update',
    auth: { uid: 'user_123', email_verified: true },
    payload: {
      title: 'A'.repeat(500),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized List Scraping on Notification Preferences',
    collectionPath: '/notificationPreferences',
    operation: 'list',
    auth: { uid: 'user_123', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
