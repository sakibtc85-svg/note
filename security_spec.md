# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Authentication & Email Verification Invariant**: Every read and write operation requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Ownership Invariant**: Every `Challenge`, `HabitLog`, and `NotificationPreference` document is strictly owned by `ownerId == request.auth.uid`. Users can never read, list, create, update, or delete records belonging to another UID.
3. **Master Gate Relational Sync Invariant**: A `HabitLog` document at `/challenges/{challengeId}/logs/{logId}` can only be created, read (`get`), updated, or deleted if the parent `/challenges/{challengeId}` document exists and its `ownerId == request.auth.uid`, and `incoming().challengeId == challengeId`.
4. **Terminal State Locking Invariant**: Once a `Challenge` document transitions to `status == 'completed'`, no subsequent updates are permitted (`existing().status != 'completed'`).
5. **Temporal & Immutable Field Invariant**:
   - On `create`: `createdAt == request.time` and `updatedAt == request.time`.
   - On `update`: `createdAt == existing().createdAt`, `ownerId == existing().ownerId`, and `updatedAt == request.time`.
6. **Strict Schema & Volumetric Bounds**:
   - All document IDs (`challengeId`, `logId`, `userId`) must match `^[a-zA-Z0-9_\-]+$` and `.size() <= 128`.
   - All arrays (`habits`, `completedDays`, `completedHabitIds`) are bounded in size and element type-checked.
   - No shadow fields are permitted (`keys().hasAll(...)` and `keys().hasOnly(...)` on create, plus `affectedKeys().hasOnly(...)` on action-based updates).

---

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Spoof**: Authenticated token with `email_verified: false` attempting to create a `Challenge`.
2. **Cross-Tenant Identity Spoofing**: Creating `/challenges/ch_1` where `ownerId` is set to `"victim_uid_999"` instead of `request.auth.uid`.
3. **Shadow Field Injection (Create)**: Creating `/challenges/ch_1` with an undeclared field `isAdmin: true`.
4. **Shadow Field Injection (Update)**: Updating `/challenges/ch_1` with `affectedKeys` containing an undeclared `bonusPoints: 9999`.
5. **Terminal State Mutation**: Attempting to update `completedDays` or `title` on a `Challenge` whose current `status` is already `'completed'`.
6. **Immutable Field Tampering**: Updating a `Challenge` while modifying `createdAt` or `ownerId`.
7. **Client Clock Forgery**: Creating or updating a `Challenge` or `HabitLog` with a forged past/future `updatedAt` timestamp (`updatedAt != request.time`).
8. **Orphaned Subcollection Write**: Creating `/challenges/non_existent_id/logs/day_1` where the parent challenge does not exist or belongs to another user.
9. **ID Poisoning / Resource Exhaustion**: Creating a document with a 500-character ID or special characters (`../admin`).
10. **Array Overflow Attack**: Passing 100 items in `completedDays` (exceeding max 30) or `habits` (exceeding max 8).
11. **Value Poisoning on Whitelisted Update Key**: Updating `title` with a 10,000-character string or a boolean instead of a 1..100 char string.
12. **Unauthorized List Scraping**: Running a collection-wide `list` query on `/challenges` without filtering by `ownerId == request.auth.uid`.

---

## 3. Red Team Audit & Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning | Value Poisoning | Query Trust | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/challenges/{challengeId}` | Blocked (`ownerId == request.auth.uid` + immutable) | Blocked (`existing().status != 'completed'` terminal lock) | Blocked (`isValidId` + string/list `.size()` bounds) | Blocked (`isValidChallenge(incoming())` wraps all updates) | Blocked (`resource.data.ownerId == request.auth.uid`) | PASS |
| `/challenges/{challengeId}/logs/{logId}` | Blocked (Parent Master Gate `get()` + `ownerId == request.auth.uid`) | N/A (Daily log entries are editable while parent is active) | Blocked (`isValidId` + reflectionNote `<= 500`) | Blocked (`isValidHabitLog(incoming(), challengeId)` wraps updates) | Blocked (`resource.data.ownerId == request.auth.uid`, zero `get()` in `list`) | PASS |
| `/notificationPreferences/{userId}` | Blocked (`userId == request.auth.uid` + `ownerId == request.auth.uid`) | N/A | Blocked (`isValidId(userId)` + strict regex time bounds) | Blocked (`isValidNotificationPreference` wraps updates) | `list` denied (single document `get` only) | PASS |
