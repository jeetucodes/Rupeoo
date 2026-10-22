import test from 'node:test';
import assert from 'node:assert';
import {
  computeNotifHash,
  checkCrossChannelDuplicate,
  recordRecentPayment,
  isNotifAlreadyProcessed,
  markNotifProcessed,
  resetAutoAddDedupeHistory,
  CROSS_CHANNEL_TTL_MS,
  NO_REF_MATCH_WINDOW_MS,
} from '../dedupe.ts';

test('Auto-Add Deduplication Robustness Suite', async (t) => {
  // Reset cache before starting
  await resetAutoAddDedupeHistory();

  await t.test('1. Same friend, same amount, 3 payments with different UPI refs within 5 mins -> 3 distinct transactions', async () => {
    await resetAutoAddDedupeHistory();
    const baseTime = 1792600000000;
    const friendAmount = 500.0;
    const pkg = 'com.google.android.apps.nbu.paisa.user'; // GPay

    // Payment 1: UPI Ref 111111111111
    const p1Check = await checkCrossChannelDuplicate(friendAmount, 'expense', baseTime, pkg, '111111111111');
    assert.strictEqual(p1Check.isDuplicate, false);
    await recordRecentPayment(friendAmount, 'expense', baseTime, pkg, 'tx_1', '111111111111');

    // Payment 2: 2 minutes later, UPI Ref 222222222222
    const time2 = baseTime + 2 * 60 * 1000;
    const p2Check = await checkCrossChannelDuplicate(friendAmount, 'expense', time2, pkg, '222222222222');
    assert.strictEqual(p2Check.isDuplicate, false, 'Payment 2 must NOT be deduped (different UPI ref)');
    await recordRecentPayment(friendAmount, 'expense', time2, pkg, 'tx_2', '222222222222');

    // Payment 3: 4 minutes later, UPI Ref 333333333333
    const time3 = baseTime + 4 * 60 * 1000;
    const p3Check = await checkCrossChannelDuplicate(friendAmount, 'expense', time3, pkg, '333333333333');
    assert.strictEqual(p3Check.isDuplicate, false, 'Payment 3 must NOT be deduped (different UPI ref)');
    await recordRecentPayment(friendAmount, 'expense', time3, pkg, 'tx_3', '333333333333');

    // Also verify Layer 1 hashes are distinct because postTime is exact (not rounded)
    const hash1 = computeNotifHash(pkg, 'Paid Rs 500 to Rahul', baseTime);
    const hash2 = computeNotifHash(pkg, 'Paid Rs 500 to Rahul', time2);
    const hash3 = computeNotifHash(pkg, 'Paid Rs 500 to Rahul', time3);
    assert.notStrictEqual(hash1, hash2);
    assert.notStrictEqual(hash2, hash3);
    assert.notStrictEqual(hash1, hash3);
  });

  await t.test('2. SMS + GPay notification for the same payment (same ref) -> 1 transaction', async () => {
    await resetAutoAddDedupeHistory();
    const baseTime = 1792600000000;
    const amount = 350.0;
    const upiRef = '629584729104';

    // Event A: GPay notification arrives first
    const gpayPkg = 'com.google.android.apps.nbu.paisa.user';
    const gpayCheck = await checkCrossChannelDuplicate(amount, 'expense', baseTime, gpayPkg, upiRef);
    assert.strictEqual(gpayCheck.isDuplicate, false);
    await recordRecentPayment(amount, 'expense', baseTime, gpayPkg, 'tx_gpay_1', upiRef);

    // Event B: Bank SMS arrives 15 seconds later with same ref from SMS app
    const smsPkg = 'com.google.android.apps.messaging';
    const smsTime = baseTime + 15000;
    const smsCheck = await checkCrossChannelDuplicate(amount, 'expense', smsTime, smsPkg, upiRef);
    assert.strictEqual(smsCheck.isDuplicate, true, 'SMS should cross-dedupe with GPay payment having same UPI ref');
    assert.strictEqual(smsCheck.existingTxId, 'tx_gpay_1');
  });

  await t.test('3. Same text posted twice by same app with different postTime and no ref -> keep both unless identical sbn key', async () => {
    await resetAutoAddDedupeHistory();
    const pkg = 'com.phonepe.app';
    const text = 'Payment of Rs 100 successful';
    const t1 = 1792600000000;
    const t2 = 1792600030000; // 30s later

    // Layer 1: Different postTimes produce different hashes
    const hashA = computeNotifHash(pkg, text, t1, 'sbn_key_1');
    const hashB = computeNotifHash(pkg, text, t2, 'sbn_key_2');
    assert.notStrictEqual(hashA, hashB);

    // Identical sbn key & postTime produce identical hash
    const hashA_duplicate = computeNotifHash(pkg, text, t1, 'sbn_key_1');
    assert.strictEqual(hashA, hashA_duplicate);

    // Layer 2: Same package NEVER cross-dedupes
    await recordRecentPayment(100, 'expense', t1, pkg, 'tx_phonepe_1', null);
    const checkSameApp = await checkCrossChannelDuplicate(100, 'expense', t2, pkg, null);
    assert.strictEqual(checkSameApp.isDuplicate, false, 'Same package must NEVER cross-dedupe');
  });

  await t.test('4. Cross-source matching with no ref on one side -> matches within 2 mins, keeps separate beyond 2 mins', async () => {
    await resetAutoAddDedupeHistory();
    const baseTime = 1792600000000;
    const amount = 250;
    const bankPkg = 'com.bank.app';
    const smsPkg = 'com.google.android.apps.messaging';

    // Bank alert has no ref
    await recordRecentPayment(amount, 'expense', baseTime, bankPkg, 'tx_bank_1', null);

    // SMS arrives 90 seconds later (within 2 min window) -> dedupes
    const check90s = await checkCrossChannelDuplicate(amount, 'expense', baseTime + 90000, smsPkg, null);
    assert.strictEqual(check90s.isDuplicate, true);

    // SMS arrives 3 minutes later (beyond 2 min window) -> does NOT dedupe
    const check3m = await checkCrossChannelDuplicate(amount, 'expense', baseTime + 180000, smsPkg, null);
    assert.strictEqual(check3m.isDuplicate, false);
  });

  await t.test('5. TTL expires after 10 minutes -> no cross-channel dedupe across distant events', async () => {
    await resetAutoAddDedupeHistory();
    const baseTime = 1792600000000;
    const amount = 750;
    const ref = '999888777666';

    await recordRecentPayment(amount, 'expense', baseTime, 'com.app.a', 'tx_old', ref);

    // 11 minutes later (TTL is 10 minutes)
    const after11m = baseTime + 11 * 60 * 1000;
    const checkExpired = await checkCrossChannelDuplicate(amount, 'expense', after11m, 'com.app.b', ref);
    assert.strictEqual(checkExpired.isDuplicate, false, 'Events older than 10 minutes must not cross-dedupe');
  });
});
