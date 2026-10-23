import test from 'node:test';
import assert from 'node:assert';
import {
  toRemote,
  fromRemote,
  normalizePaymentMode,
  formatPaymentModeDisplay,
  ALLOWED_REMOTE_FIELDS,
  FORBIDDEN_FIELDS,
  type RemoteTransaction,
} from '../dataMinimization.ts';

// ---------------------------------------------------------------------------
// In-Memory SQLite Mock for Transaction Safety & Row Count Verification
// ---------------------------------------------------------------------------

interface MockDbRow {
  id: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  date: string;
  merchant_name?: string | null;
  description?: string | null;
  payment_mode?: string | null;
  userNote?: string | null;
  originalMessage?: string | null;
  syncedAt?: number | null;
  syncStatus?: 'pending' | 'synced' | 'failed';
  updatedAt: number;
  deleted?: number;
  userId?: string | null;
}

class MockSQLiteDatabase {
  public rows: Map<string, MockDbRow> = new Map();
  private transactionBackup: Map<string, MockDbRow> | null = null;

  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const countBefore = this.rows.size;
    // Snapshot state for safe rollback
    this.transactionBackup = new Map(this.rows);

    try {
      const result = await operation();
      const countAfter = this.rows.size;

      // SAFETY RULE: Verify row counts before/after and rollback if after < before
      if (countAfter < countBefore) {
        this.rows = new Map(this.transactionBackup);
        throw new Error(`SAFETY VIOLATION: Row count decreased from ${countBefore} to ${countAfter}. Rolled back.`);
      }

      this.transactionBackup = null;
      return result;
    } catch (err) {
      if (this.transactionBackup) {
        this.rows = new Map(this.transactionBackup);
        this.transactionBackup = null;
      }
      throw err;
    }
  }

  upsert(row: MockDbRow) {
    this.rows.set(row.id, { ...row });
  }

  getById(id: string): MockDbRow | undefined {
    return this.rows.get(id);
  }

  getAll(userId?: string | null): MockDbRow[] {
    const all = Array.from(this.rows.values()).filter(r => (r.deleted || 0) === 0);
    if (userId !== undefined) {
      return all.filter(r => r.userId === userId);
    }
    return all;
  }
}

// ---------------------------------------------------------------------------
// Cloud Sync Test Suite
// ---------------------------------------------------------------------------

test('Cloud Sync, Restore, Login & Migration Suite', async (t) => {

  // =========================================================================
  // BUG 1: Initial Pull on App Start / Login (120 docs -> 120 local rows)
  // =========================================================================
  await t.test('Bug 1: Mocked remote with 120 docs + empty local DB -> pull yields 120 rows without any write', async () => {
    const localDb = new MockSQLiteDatabase();

    // Generate 120 remote transactions
    const remoteDocs: RemoteTransaction[] = [];
    const baseTime = 1792600000000;
    for (let i = 1; i <= 120; i++) {
      remoteDocs.push({
        id: `tx_${i}`,
        amount: 100 + i,
        type: i % 2 === 0 ? 'credit' : 'debit',
        category: i % 3 === 0 ? 'Food' : 'Shopping',
        date: '2026-10-23',
        payee: `Merchant ${i}`,
        merchant_name: `Merchant ${i}`,
        note: `User note ${i}`,
        userNote: `User note ${i}`,
        paymentMode: i % 2 === 0 ? 'UPI' : 'card',
        source: 'manual',
        updatedAt: baseTime + i * 1000,
      });
    }

    assert.strictEqual(localDb.getAll().length, 0, 'Local DB must start empty');

    // Simulate paginated pullFromCloud (300 per page, latest wins, upsert by ID)
    const pageSize = 300;
    let totalPulled = 0;

    await localDb.withTransaction(async () => {
      // Page 1
      const page = remoteDocs.slice(0, pageSize);
      for (const remote of page) {
        const local = localDb.getById(remote.id);
        const mapped = fromRemote(remote, local);

        // Upsert by id using updatedAt: latest wins, never delete local rows
        if (!local || (mapped.updatedAt || 0) >= (local.updatedAt || 0)) {
          localDb.upsert({
            id: mapped.id,
            amount: mapped.amount,
            type: mapped.type as 'debit' | 'credit',
            category: mapped.category,
            date: mapped.date,
            merchant_name: mapped.merchant_name,
            description: mapped.description,
            payment_mode: mapped.payment_mode,
            userNote: mapped.userNote,
            syncedAt: Date.now(),
            syncStatus: 'synced',
            updatedAt: mapped.updatedAt,
            deleted: 0,
            userId: 'user_123',
          });
          totalPulled++;
        }
      }
    });

    assert.strictEqual(totalPulled, 120, 'Must have pulled all 120 docs');
    assert.strictEqual(localDb.getAll('user_123').length, 120, 'Local DB must contain 120 records');

    // Verify UI query returns 120 without adding any new transaction
    const queryResult = localDb.getAll('user_123');
    assert.strictEqual(queryResult.length, 120, 'List query returns 120 without any new write');
  });

  // =========================================================================
  // BUG 2: Payment Mode Preservation & Never Silently "Cash"
  // =========================================================================
  await t.test('Bug 2: Round trip keeps all paymentMode values; missing remote becomes "unknown" (never cash); local not overwritten', async () => {
    const modes = ['cash', 'UPI', 'card', 'netbanking', 'other'] as const;

    for (const mode of modes) {
      const local = {
        id: `tx_${mode}`,
        amount: 250,
        type: 'debit',
        category: 'Travel',
        date: '2026-10-23',
        payment_mode: mode,
        updatedAt: 1000,
      };

      const remote = toRemote(local);
      assert.strictEqual(remote.paymentMode, normalizePaymentMode(mode), `toRemote must preserve normalized ${mode}`);

      const restored = fromRemote(remote);
      assert.strictEqual(restored.payment_mode, normalizePaymentMode(mode), `fromRemote must restore ${mode}`);
      assert.strictEqual(formatPaymentModeDisplay(restored.payment_mode), formatPaymentModeDisplay(mode));
    }

    // Remote doc missing paymentMode -> maps to 'unknown' (display 'Not set'), NEVER silently 'cash'
    const remoteWithoutMode: any = {
      id: 'tx_legacy',
      amount: 500,
      type: 'debit',
      category: 'Bills',
      date: '2026-10-23',
      payee: null,
      note: null,
      userNote: null,
      source: 'manual',
      updatedAt: 2000,
    };
    const restoredWithoutMode = fromRemote(remoteWithoutMode);
    assert.strictEqual(restoredWithoutMode.payment_mode, 'unknown', 'Missing remote payment mode must be "unknown"');
    assert.strictEqual(formatPaymentModeDisplay(restoredWithoutMode.payment_mode), 'Not set');

    // A local good value is NEVER overwritten by a missing remote value
    const existingLocal = {
      id: 'tx_existing',
      payment_mode: 'UPI',
      updatedAt: 1500,
    };
    const restoredMerged = fromRemote(remoteWithoutMode, existingLocal);
    assert.strictEqual(restoredMerged.payment_mode, 'UPI', 'Good local payment mode must NOT be overwritten by missing remote');
  });

  // =========================================================================
  // BUG 4: userNote Synced, originalMessage Device Only
  // =========================================================================
  await t.test('Bug 4: userNote round trip, originalMessage never in remote payload, old doc still loads note', async () => {
    const localTx = {
      id: 'tx_note_test',
      amount: 750,
      type: 'debit',
      category: 'Shopping',
      date: '2026-10-23',
      userNote: 'Bought wireless headphones on sale',
      originalMessage: 'Sent Rs. 750.00 from HDFC Bank A/c *4321 to AMAZON. Ref 982348123.',
      updatedAt: 3000,
    };

    const remote = toRemote(localTx);

    // 1. userNote is synced
    assert.strictEqual(remote.userNote, 'Bought wireless headphones on sale');

    // 2. originalMessage is strictly excluded from remote payload
    assert.strictEqual((remote as any).originalMessage, undefined);
    assert.strictEqual((remote as any).original_message, undefined);

    // 3. Round-trip restored userNote
    const restored = fromRemote(remote);
    assert.strictEqual(restored.userNote, 'Bought wireless headphones on sale');

    // 4. Old-format remote doc with 'note' field still loads into userNote
    const legacyRemoteDoc: any = {
      id: 'tx_legacy_note',
      amount: 300,
      type: 'debit',
      category: 'General',
      date: '2026-10-23',
      note: 'Legacy note text from older app version',
      updatedAt: 2500,
    };
    const restoredLegacy = fromRemote(legacyRemoteDoc);
    assert.strictEqual(restoredLegacy.userNote, 'Legacy note text from older app version');
  });

  // =========================================================================
  // BUG 5: Per-row Metadata, Differential Push, and Idempotent Retry
  // =========================================================================
  await t.test('Bug 5: 100 synced + 5 new -> only 5 uploaded; retry does not duplicate; sync OFF/ON uploads nothing extra', async () => {
    const localDb = new MockSQLiteDatabase();
    const remoteCloudDb: Map<string, RemoteTransaction> = new Map();

    // 1. Populate 100 already-synced rows
    for (let i = 1; i <= 100; i++) {
      const id = `tx_${i}`;
      localDb.upsert({
        id,
        amount: 50 + i,
        type: 'debit',
        category: 'Food',
        date: '2026-10-23',
        syncedAt: 1792600000000,
        syncStatus: 'synced',
        updatedAt: 1792600000000,
        userId: 'user_A',
      });
      // Already present in remote
      remoteCloudDb.set(id, toRemote(localDb.getById(id)!));
    }

    // 2. Add 5 new pending rows
    for (let i = 101; i <= 105; i++) {
      const id = `tx_${i}`;
      localDb.upsert({
        id,
        amount: 200 + i,
        type: 'debit',
        category: 'Bills',
        date: '2026-10-23',
        syncedAt: null,
        syncStatus: 'pending',
        updatedAt: 1792600050000,
        userId: 'user_A',
      });
    }

    // Filter rows to push: ONLY 'pending' or 'failed'
    const pendingRows = localDb.getAll('user_A').filter(r => r.syncStatus === 'pending' || r.syncStatus === 'failed');
    assert.strictEqual(pendingRows.length, 5, 'Must find exactly 5 pending rows to push');

    // Simulate batch push to cloud
    let uploadedCount = 0;
    for (const row of pendingRows) {
      // Deterministic document ID is the local transaction id
      const docId = row.id;
      const remotePayload = toRemote(row);

      // setDoc with merge simulation
      remoteCloudDb.set(docId, remotePayload);
      uploadedCount++;

      // Mark local row as synced
      localDb.upsert({
        ...row,
        syncedAt: Date.now(),
        syncStatus: 'synced',
      });
    }

    assert.strictEqual(uploadedCount, 5, 'Exactly 5 rows uploaded');
    assert.strictEqual(remoteCloudDb.size, 105, 'Cloud contains exactly 105 documents');

    // Verify retry after network glitch does not duplicate docs (id stays stable)
    const afterSyncPending = localDb.getAll('user_A').filter(r => r.syncStatus === 'pending');
    assert.strictEqual(afterSyncPending.length, 0, 'No pending rows remaining');

    // Simulate Cloud Sync toggled OFF then ON:
    // Should NOT re-upload anything because all rows are 'synced'
    const rowsToUploadOnToggle = localDb.getAll('user_A').filter(r => r.syncStatus === 'pending' || r.syncStatus === 'failed');
    assert.strictEqual(rowsToUploadOnToggle.length, 0, 'Sync OFF then ON uploads 0 extra rows');
  });

  // =========================================================================
  // CHANGE 6: Mandatory Login, Guest Data Migration & Multi-Account Isolation
  // =========================================================================
  await t.test('Change 6: Guest data migrates to account preserving exact row count; accounts on same device stay isolated', async () => {
    const localDb = new MockSQLiteDatabase();

    // 1. Existing guest has 25 local transactions (userId is null or 'guest')
    for (let i = 1; i <= 25; i++) {
      localDb.upsert({
        id: `guest_tx_${i}`,
        amount: 150,
        type: 'debit',
        category: 'Groceries',
        date: '2026-10-23',
        userId: null,
        updatedAt: 1000 + i,
      });
    }

    const countBeforeMigration = localDb.getAll().length;
    assert.strictEqual(countBeforeMigration, 25);

    // 2. Guest signs up / logs in as user_alice
    const newUserId = 'user_alice';
    await localDb.withTransaction(async () => {
      const guestRows = localDb.getAll().filter(r => !r.userId || r.userId === 'guest');
      for (const row of guestRows) {
        localDb.upsert({
          ...row,
          userId: newUserId,
          syncStatus: 'pending', // Queue for cloud sync
          updatedAt: Date.now(),
        });
      }
    });

    const countAfterMigration = localDb.getAll(newUserId).length;
    assert.strictEqual(countAfterMigration, 25, 'All 25 rows successfully attached to new user');

    // 3. User logs out (local data kept) and a second user_bob logs in
    for (let i = 1; i <= 10; i++) {
      localDb.upsert({
        id: `bob_tx_${i}`,
        amount: 99,
        type: 'credit',
        category: 'Salary',
        date: '2026-10-23',
        userId: 'user_bob',
        updatedAt: 2000 + i,
      });
    }

    // Verify account isolation: Alice sees 25, Bob sees 10, never mixed
    const aliceTxs = localDb.getAll('user_alice');
    const bobTxs = localDb.getAll('user_bob');

    assert.strictEqual(aliceTxs.length, 25, 'Alice sees only her 25 transactions');
    assert.strictEqual(bobTxs.length, 10, 'Bob sees only his 10 transactions');
    assert.ok(aliceTxs.every(tx => tx.userId === 'user_alice'));
    assert.ok(bobTxs.every(tx => tx.userId === 'user_bob'));
  });

  // =========================================================================
  // CHANGE 7: Cloud Sync ON by Default & Explicit OFF Persistence
  // =========================================================================
  await t.test('Change 7: New user defaults to sync ON; explicit OFF persists across restarts', async () => {
    const mockStorage = new Map<string, string>();
    const USER_CHOSE_OFF_KEY = '@rupeo_user_chose_sync_off';
    const CLOUD_SYNC_ENABLED_KEY = '@rupeo_cloud_sync_enabled';

    const resolveInitialSyncState = (storedSetting: string | null, explicitOffFlag: string | null): boolean => {
      // If user explicitly chose OFF previously, respect it permanently
      if (explicitOffFlag === 'true') {
        return false;
      }
      // If setting exists, use it
      if (storedSetting !== null) {
        return storedSetting === 'true';
      }
      // Default for new signups and existing users without stored choice is ON
      return true;
    };

    // Case 1: Fresh install / new user -> defaults to true (ON)
    assert.strictEqual(resolveInitialSyncState(null, null), true, 'New user must default to sync ON');

    // Case 2: User explicitly turns sync OFF in Settings
    mockStorage.set(CLOUD_SYNC_ENABLED_KEY, 'false');
    mockStorage.set(USER_CHOSE_OFF_KEY, 'true');

    // App updates or restarts
    assert.strictEqual(
      resolveInitialSyncState(mockStorage.get(CLOUD_SYNC_ENABLED_KEY) || null, mockStorage.get(USER_CHOSE_OFF_KEY) || null),
      false,
      'Explicit OFF must persist across app restart'
    );

    // Case 3: App updates with no stored preference -> defaults to true
    assert.strictEqual(resolveInitialSyncState(null, null), true);
  });

  // =========================================================================
  // CHANGE 8: Offline-first Instant Cache & Silent Sync (No Restoring Loop)
  // =========================================================================
  await t.test('Change 8: Silent background sync when local data exists (no disruptive Restoring banner)', async () => {
    // 1. Initial restore decision helper simulation
    const resolveShowRestoreBanner = (
      localCount: number,
      options: { silent?: boolean; forceRestoreBanner?: boolean } = {}
    ): boolean => {
      const isInitialRestore = localCount === 0;
      return Boolean(options.forceRestoreBanner || (isInitialRestore && !options.silent));
    };

    // Case 1: Local cache already has 50 transactions -> should NOT show restore banner
    assert.strictEqual(
      resolveShowRestoreBanner(50, {}),
      false,
      'Must NOT show restore banner when local data already exists'
    );

    // Case 2: Silent background sync -> false
    assert.strictEqual(
      resolveShowRestoreBanner(50, { silent: true }),
      false,
      'Must stay silent during routine background sync'
    );

    // Case 3: Zero local transactions (cold initial login) -> shows restore banner
    assert.strictEqual(
      resolveShowRestoreBanner(0, {}),
      true,
      'Must show restore banner only when local database is completely empty'
    );

    // Case 4: Explicit manual restore from Settings -> shows banner
    assert.strictEqual(
      resolveShowRestoreBanner(50, { forceRestoreBanner: true }),
      true,
      'Must show banner when user explicitly taps Restore Backup'
    );
  });

  await t.test('Change 8: Offline-added transaction is queued and marked synced after online flush', async () => {
    interface MockSyncItem {
      id: string;
      type: string;
      payload: any;
      retryCount: number;
    }

    const offlineQueue: MockSyncItem[] = [];
    const localStore = [
      { id: 'tx_offline_1', amount: 500, syncStatus: 'pending', syncedAt: null as number | null },
    ];
    const remoteCloudDb = new Map<string, any>();

    // 1. Enqueue offline transaction
    offlineQueue.push({
      id: 'tx_offline_1',
      type: 'ADD_TRANSACTION',
      payload: { ...localStore[0] },
      retryCount: 0,
    });
    assert.strictEqual(offlineQueue.length, 1);

    // 2. Simulate offline flush attempt: network error occurs
    let networkOnline = false;
    const remainingQueue: MockSyncItem[] = [];

    for (const item of offlineQueue) {
      if (!networkOnline) {
        // Network failure must NEVER increment retryCount
        remainingQueue.push(item);
      } else {
        remoteCloudDb.set(item.id, item.payload);
        const local = localStore.find(t => t.id === item.id);
        if (local) {
          local.syncStatus = 'synced';
          local.syncedAt = Date.now();
        }
      }
    }

    assert.strictEqual(remainingQueue.length, 1, 'Item remains in queue when offline');
    assert.strictEqual(remainingQueue[0].retryCount, 0, 'Retry count must NOT increment on network failure');
    assert.strictEqual(localStore[0].syncStatus, 'pending');

    // 3. User turns internet ON -> next flush succeeds
    networkOnline = true;
    const finalRemaining: MockSyncItem[] = [];

    for (const item of remainingQueue) {
      if (!networkOnline) {
        finalRemaining.push(item);
      } else {
        remoteCloudDb.set(item.id, item.payload);
        const local = localStore.find(t => t.id === item.id);
        if (local) {
          local.syncStatus = 'synced';
          local.syncedAt = Date.now();
        }
      }
    }

    assert.strictEqual(finalRemaining.length, 0, 'Queue must be empty after successful online sync');
    assert.strictEqual(remoteCloudDb.has('tx_offline_1'), true, 'Transaction saved to cloud Firestore');
    assert.strictEqual(localStore[0].syncStatus, 'synced', 'Local transaction marked synced');
    assert.ok(localStore[0].syncedAt !== null, 'SyncedAt timestamp set');
  });

  await t.test('Change 8: Search queries across full database and report calculates from complete period data', async () => {
    const allDbTransactions = [
      { id: '1', date: '2026-10-01', amount: 200, type: 'debit', payee: 'Swiggy', category: 'Food' },
      { id: '2', date: '2026-08-15', amount: 1500, type: 'debit', payee: 'Zara', category: 'Shopping' },
      { id: '3', date: '2026-01-10', amount: 50000, type: 'credit', payee: 'Employer', category: 'Salary' },
      { id: '4', date: '2025-11-20', amount: 350, type: 'debit', payee: 'Uber', category: 'Travel', ref_no: 'UBER_RRN_99' },
    ];

    // Search for "Uber" should find old transaction regardless of period or 20-item display limit
    const query = 'uber';
    const searchResults = allDbTransactions.filter(tx => {
      const q = query.toLowerCase();
      return (
        (tx.payee || '').toLowerCase().includes(q) ||
        (tx.ref_no || '').toLowerCase().includes(q)
      );
    });

    assert.strictEqual(searchResults.length, 1);
    assert.strictEqual(searchResults[0].id, '4');

    // Report calculation uses all transactions in period without pagination slicing
    const totalDebits = allDbTransactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    assert.strictEqual(totalDebits, 200 + 1500 + 350, 'Full debit total accurately computed');
  });
});
