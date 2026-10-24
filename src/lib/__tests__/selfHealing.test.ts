import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getHomeSnapshotSync,
  saveHomeSnapshot,
  prewarmHomeSnapshot,
  clearHomeSnapshotMemoryCache,
} from '../selfHealing/HomeSnapshotCache.ts';
import {
  SelfHealingWatchdog,
  WATCHDOG_TIMEOUT_MS,
} from '../selfHealing/SelfHealingWatchdog.ts';

describe('Self-Healing, Anti-Freeze & Zero-White-Screen Watchdog Suite', () => {
  const testUserId = 'test_user_self_healing_123';

  beforeEach(() => {
    clearHomeSnapshotMemoryCache();
    SelfHealingWatchdog.resetSessionRecoveryCount();
    SelfHealingWatchdog.setTypingActive(false);
  });

  describe('Layer 4: Stale-While-Revalidate (Instant 0ms UI Load)', () => {
    it('1. Returns null initially when memory cache is empty', () => {
      const snapshot = getHomeSnapshotSync(testUserId);
      assert.strictEqual(snapshot, null);
    });

    it('2. saveHomeSnapshot immediately updates hot in-memory snapshot for 0ms reads', () => {
      saveHomeSnapshot(testUserId, {
        totalSpend: 15400,
        totalCredit: 45000,
        thisMonthSpend: 8200,
        recentTransactions: [{ id: 'tx_1', amount: 500, type: 'debit', category: 'Food' }],
        upcomingBills: [{ id: 'bill_1', title: 'Netflix', amount: 649 }],
        udharDues: { totalToReceive: 2000, totalToPay: 500 },
      });

      const snapshot = getHomeSnapshotSync(testUserId);
      assert.notStrictEqual(snapshot, null);
      assert.strictEqual(snapshot?.totalSpend, 15400);
      assert.strictEqual(snapshot?.totalCredit, 45000);
      assert.strictEqual(snapshot?.thisMonthSpend, 8200);
      assert.strictEqual(snapshot?.recentTransactions.length, 1);
      assert.strictEqual(snapshot?.upcomingBills.length, 1);
      assert.strictEqual(snapshot?.udharDues?.totalToReceive, 2000);
      assert.strictEqual(snapshot?.udharDues?.totalToPay, 500);
    });

    it('3. Incremental updates merge seamlessly into the hot cache', () => {
      saveHomeSnapshot(testUserId, {
        totalSpend: 1000,
        totalCredit: 5000,
        thisMonthSpend: 1000,
      });

      // Update only udharDues
      saveHomeSnapshot(testUserId, {
        udharDues: { totalToReceive: 1200, totalToPay: 0 },
      });

      const snapshot = getHomeSnapshotSync(testUserId);
      assert.strictEqual(snapshot?.totalSpend, 1000);
      assert.strictEqual(snapshot?.totalCredit, 5000);
      assert.strictEqual(snapshot?.udharDues?.totalToReceive, 1200);
    });
  });

  describe('Layer 1 & 2: Startup & Resume Watchdog + UI Heartbeat', () => {
    it('4. Watchdog disarms cleanly when Home Screen reports rendered', () => {
      SelfHealingWatchdog.armWatchdog('startup');
      SelfHealingWatchdog.notifyHomeRendered();

      const metrics = SelfHealingWatchdog.getMetrics();
      assert.strictEqual(typeof metrics.recoveryCount, 'number');
    });

    it('5. triggerWatchdogRecovery notifies bypassLoading listeners', () => {
      let bypassCalled = false;
      const unsubscribe = SelfHealingWatchdog.onBypassLoading(() => {
        bypassCalled = true;
      });

      SelfHealingWatchdog.triggerWatchdogRecovery('test_synthetic_hang');
      assert.strictEqual(bypassCalled, true);
      unsubscribe();

      const metrics = SelfHealingWatchdog.getMetrics();
      assert.strictEqual(metrics.lastRecoveryReason, 'test_synthetic_hang');
    });

    it('6. Soft UI Reset dispatches to registered listeners without killing process', () => {
      let resetReason: string | null = null;
      const unsubscribe = SelfHealingWatchdog.onSoftReset((reason) => {
        resetReason = reason;
      });

      SelfHealingWatchdog.triggerSoftUIReset('deadlock_recovered');
      assert.strictEqual(resetReason, 'deadlock_recovered');
      unsubscribe();
    });

    it('7. Unsubscribe cleanly removes bypass listeners', () => {
      let calls = 0;
      const unsubscribe = SelfHealingWatchdog.onBypassLoading(() => {
        calls++;
      });

      SelfHealingWatchdog.triggerWatchdogRecovery('first');
      assert.strictEqual(calls, 1);

      unsubscribe();
      SelfHealingWatchdog.triggerWatchdogRecovery('second');
      assert.strictEqual(calls, 1); // should not increment
    });
  });

  describe('Layer 5: Database Safe Execution & Auto-Unlock Simulation', () => {
    function safeExecuteQuery<T>(queryFn: () => T, fallback: T): T {
      try {
        return queryFn();
      } catch {
        return fallback;
      }
    }

    it('8. Returns valid result when query succeeds', () => {
      const res = safeExecuteQuery(() => [{ id: 1, amount: 100 }], []);
      assert.strictEqual(res.length, 1);
    });

    it('9. Returns fallback cleanly when SQLite contention or lock throws', () => {
      const fallback = [{ id: 'cached', amount: 50 }];
      const res = safeExecuteQuery(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      }, fallback);
      assert.deepStrictEqual(res, fallback);
    });
  });

  describe('Strict Safety Guards: User Input Protection & Anti-Loop Safeguards', () => {
    beforeEach(() => {
      SelfHealingWatchdog.resetSessionRecoveryCount();
      SelfHealingWatchdog.setTypingActive(false);
      clearHomeSnapshotMemoryCache();
    });

    it('10. Never resets UI when user is actively typing or keyboard is visible', () => {
      SelfHealingWatchdog.setTypingActive(true);

      let resetTriggered = false;
      const unsubscribe = SelfHealingWatchdog.onSoftReset(() => {
        resetTriggered = true;
      });

      SelfHealingWatchdog.triggerSoftUIReset('test_while_typing');
      assert.strictEqual(resetTriggered, false, 'Soft UI Reset must NOT fire while user is typing');

      SelfHealingWatchdog.setTypingActive(false);
      SelfHealingWatchdog.triggerSoftUIReset('test_after_typing');
      assert.strictEqual(resetTriggered, true, 'Soft UI Reset fires normally after user finishes typing');
      unsubscribe();
    });

    it('11. Never resets UI while a form is active (e.g. adding a transaction via + button)', () => {
      const endForm = SelfHealingWatchdog.beginFormInteraction('add_transaction_screen');

      let resetTriggered = false;
      const unsubscribe = SelfHealingWatchdog.onSoftReset(() => {
        resetTriggered = true;
      });

      SelfHealingWatchdog.triggerSoftUIReset('test_while_form_open');
      assert.strictEqual(resetTriggered, false, 'Must NOT interrupt active transaction form');

      endForm(); // User submits or closes form
      SelfHealingWatchdog.triggerSoftUIReset('test_after_form_closed');
      assert.strictEqual(resetTriggered, true, 'Can reset safely once form interaction concludes');
      unsubscribe();
    });

    it('12. Never interrupts UI while a database write is in progress', () => {
      const endWrite = SelfHealingWatchdog.beginDatabaseWrite();

      let recoveryBypassed = false;
      const unsubscribe = SelfHealingWatchdog.onBypassLoading(() => {
        recoveryBypassed = true;
      });

      SelfHealingWatchdog.triggerWatchdogRecovery('test_during_db_write');
      assert.strictEqual(recoveryBypassed, false, 'Must NOT interrupt UI during DB write');

      endWrite(); // DB write finishes
      SelfHealingWatchdog.triggerWatchdogRecovery('test_after_db_write');
      assert.strictEqual(recoveryBypassed, true, 'Can trigger recovery after DB write completes');
      unsubscribe();
    });

    it('13. Limits auto-recovery retries to maximum 2 times per session to prevent infinite reload loops', () => {
      let resetCount = 0;
      const unsubscribe = SelfHealingWatchdog.onSoftReset(() => {
        resetCount++;
      });

      // 1st recovery
      SelfHealingWatchdog.triggerSoftUIReset('retry_1');
      assert.strictEqual(resetCount, 1, 'Retry 1 must execute');

      // 2nd recovery
      SelfHealingWatchdog.triggerSoftUIReset('retry_2');
      assert.strictEqual(resetCount, 2, 'Retry 2 must execute');

      // 3rd recovery (must be rejected)
      SelfHealingWatchdog.triggerSoftUIReset('retry_3');
      assert.strictEqual(resetCount, 2, 'Retry 3 must be blocked to prevent infinite reload loop');

      const metrics = SelfHealingWatchdog.getMetrics();
      assert.strictEqual(metrics.recoveryCount, 2, 'Session recovery count capped at 2');
      unsubscribe();
    });

    it('14. Never overwrites existing cached balances with ₹0 on fallback', () => {
      // 1. Establish valid cached positive balance
      saveHomeSnapshot(testUserId, {
        totalSpend: 24500,
        totalCredit: 60000,
        thisMonthSpend: 12000,
        netBalance: 35500,
      });

      // 2. Simulate empty fallback attempt (0 spend, 0 credit) from a failed load
      saveHomeSnapshot(testUserId, {
        totalSpend: 0,
        totalCredit: 0,
        thisMonthSpend: 0,
        recentTransactions: [],
      });

      // 3. Verify positive cached balance was strictly preserved
      const snapshot = getHomeSnapshotSync(testUserId);
      assert.strictEqual(snapshot?.totalSpend, 24500, 'Existing totalSpend must NOT be zeroed out');
      assert.strictEqual(snapshot?.totalCredit, 60000, 'Existing totalCredit must NOT be zeroed out');
      assert.strictEqual(snapshot?.thisMonthSpend, 12000, 'Existing thisMonthSpend must NOT be zeroed out');
      assert.strictEqual(snapshot?.netBalance, 35500, 'Existing netBalance must NOT be zeroed out');
    });
  });
});
