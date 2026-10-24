import test from 'node:test';
import assert from 'node:assert';
import { cleanOriginalMessage, formatTransactionNote, getDisplayTransactionNote, DEFAULT_SMS_SETTINGS } from '../smsSettings.ts';
import { getFriendlySenderName, isPackageAllowed } from '../../features/autoAdd/filter.ts';
import { checkCrossChannelDuplicate, recordRecentPayment, resetAutoAddDedupeHistory } from '../../features/autoAdd/dedupe.ts';

test('Auto-Add Direct Add & Clean Note Tests', async (t) => {
  await t.test('1. cleanOriginalMessage strips com.google.android.apps.messaging and legacy headers', () => {
    const raw = 'Imported from SMS · com.google.android.apps.messaging · Sent Rs. 450.00 from HDFC Bank A/C *1234 to ZOMATO on 21-OCT-26 via UPI Ref 629584729104.';
    const cleaned = cleanOriginalMessage(raw);

    assert.ok(!cleaned.includes('google.android'), 'Must not contain google.android');
    assert.ok(!cleaned.includes('com.google.android.apps.messaging'), 'Must not contain package name');
    assert.ok(!cleaned.includes('Imported from SMS'), 'Must not contain legacy prefix');
    assert.ok(cleaned.includes('Sent Rs. 450.00 from HDFC Bank'), 'Must retain the core financial message');
  });

  await t.test('2. cleanOriginalMessage strips google.andriod typo and multiline package headers', () => {
    const raw = 'com.google.android.apps.messaging\ngoogle.andriod\nPaid Rs 150 to Swiggy via UPI';
    const cleaned = cleanOriginalMessage(raw);

    assert.ok(!cleaned.includes('google.android'));
    assert.ok(!cleaned.includes('google.andriod'));
    assert.strictEqual(cleaned, 'Paid Rs 150 to Swiggy via UPI');
  });

  await t.test('3. formatTransactionNote formats cleanly with "Original Message:" header and masks account numbers', () => {
    const raw = 'Dear Customer, Rs 1,500.00 debited from A/C 9876543210 on 22-OCT-26 to RELIANCE SMART. UTR 429581948291.';
    const note = formatTransactionNote('HDFC Bank', raw, {
      saveOriginalInNote: true,
      maskAccountNumbers: true,
    });

    assert.ok(note);
    assert.ok(note.startsWith('Original Message:\n'), 'Header must be Original Message:');
    assert.ok(!note.includes('9876543210'), 'Full account number must be masked');
    assert.ok(note.includes('******3210'), 'Last 4 digits must be preserved with masking');
    assert.ok(!note.includes('google.android'), 'No google.android in note');
  });

  await t.test('4. formatTransactionNote returns null if saveOriginalInNote is explicitly false', () => {
    const raw = 'Paid Rs 200';
    const note = formatTransactionNote('Bank', raw, {
      saveOriginalInNote: false,
    });
    assert.strictEqual(note, null);
  });

  await t.test('5. DEFAULT_SMS_SETTINGS defaults saveOriginalInNote to true', () => {
    assert.strictEqual(DEFAULT_SMS_SETTINGS.saveOriginalInNote, true);
    assert.strictEqual(DEFAULT_SMS_SETTINGS.autoAddEnabled, true);
    assert.strictEqual(DEFAULT_SMS_SETTINGS.reviewBeforeAdding, false);
  });

  await t.test('6. getFriendlySenderName returns clean brand names, never package names', () => {
    const gpayName = getFriendlySenderName('com.google.android.apps.nbu.paisa.user');
    assert.strictEqual(gpayName, 'Google Pay');

    const phonePeName = getFriendlySenderName('com.phonepe.app');
    assert.strictEqual(phonePeName, 'PhonePe');

    const paytmName = getFriendlySenderName('net.one97.paytm');
    assert.strictEqual(paytmName, 'Paytm');

    const kotakName = getFriendlySenderName('com.msf.kbank.mobile');
    assert.strictEqual(kotakName, 'Kotak Bank');

    const smsNameWithDlt = getFriendlySenderName('com.google.android.apps.messaging', 'VK-HDFCBK');
    assert.strictEqual(smsNameWithDlt, 'VK-HDFCBK');

    const smsNameGeneric = getFriendlySenderName('com.google.android.apps.messaging', 'Messages');
    assert.strictEqual(smsNameGeneric, 'Bank SMS');
  });

  await t.test('7. getDisplayTransactionNote formats receipt note under "Original Message:" without package name', () => {
    const legacy = 'Imported from SMS ·\ncom.google.android.apps.messaging ·\nAX-KOTAKB-S Received Rs.1.00 in your Kotak Bank AC 0741 from JITENDRA YADAV on 22-10-26.UPI Ref:********2025 Jio';
    const display = getDisplayTransactionNote(legacy);

    assert.ok(!display.includes('com.google.android.apps.messaging'), 'Must not have package name');
    assert.ok(!display.includes('Imported from SMS'), 'Must not have Imported from SMS');
    assert.ok(display.startsWith('Original Message:\n'), 'Must start with Original Message:');
    assert.ok(display.includes('AX-KOTAKB-S Received Rs.1.00 in your Kotak Bank AC 0741'), 'Preserves bank message content');
  });

  await t.test('8. isPackageAllowed catches bank apps before SMS', () => {
    // Official Bank Apps
    assert.strictEqual(isPackageAllowed('com.msf.kbank.mobile'), true);
    assert.strictEqual(isPackageAllowed('com.kotak.mobile'), true);
    assert.strictEqual(isPackageAllowed('com.snapwork.hdfc'), true);
    assert.strictEqual(isPackageAllowed('com.hdfcbank.payzapp'), true);
    assert.strictEqual(isPackageAllowed('com.csam.icici.bank.imobile'), true);
    assert.strictEqual(isPackageAllowed('com.sbi.SBIFreedomPlus'), true);
    assert.strictEqual(isPackageAllowed('money.super.app'), true);
    assert.strictEqual(isPackageAllowed('org.indyfin.slice'), true);

    // Generic Banking package regex
    assert.strictEqual(isPackageAllowed('com.punjabnationalbank.upi'), true);

    // Non-banking apps must be rejected
    assert.strictEqual(isPackageAllowed('com.instagram.android'), false);
    assert.strictEqual(isPackageAllowed('com.google.android.youtube'), false);
  });

  await t.test('9. Cross-channel deduplication drops SMS if Bank App already pushed first', async () => {
    await resetAutoAddDedupeHistory();
    const t0 = 1730000000000;

    // 1. Bank App (e.g. Kotak Bank) pushes alert first at t0
    await recordRecentPayment(100.0, 'expense', t0, 'com.msf.kbank.mobile', 'tx_kotak_1', 'REF123456', '0741');

    // 2. SMS arrives 3 minutes later (within 6 min dedupe window)
    const tSms = t0 + 3 * 60 * 1000;
    const dupCheck = await checkCrossChannelDuplicate(
      100.0,
      'expense',
      tSms,
      'com.google.android.apps.messaging',
      'REF123456',
      '0741'
    );

    assert.strictEqual(dupCheck.isDuplicate, true, 'SMS must be recognized as duplicate of bank app notification');
    assert.strictEqual(dupCheck.existingTxId, 'tx_kotak_1');

    // 3. Different payment must NOT be considered duplicate
    const diffCheck = await checkCrossChannelDuplicate(
      250.0,
      'expense',
      tSms,
      'com.google.android.apps.messaging',
      'REF999999',
      '0741'
    );
    assert.strictEqual(diffCheck.isDuplicate, false, 'Different amount/ref must not be duplicate');
  });

  await t.test('10. Auto-added transaction without payment mode strictly defaults to UPI (toRemote)', async () => {
    const { toRemote } = await import('../dataMinimization.ts');
    const autoTx = {
      id: 'auto_1730000000000_abcde',
      amount: 450,
      type: 'debit',
      category: 'Food',
      date: '2026-10-23',
      source: 'notification_listener',
      merchant_name: 'Zomato',
    };

    const remote = toRemote(autoTx);
    assert.strictEqual(remote.paymentMode, 'upi', 'Auto-added transaction must default to upi payment mode');
    assert.strictEqual(remote.payment_mode, 'upi');
  });

  await t.test('11. Auto-added transaction restored from cloud defaults to upi if mode missing (fromRemote)', async () => {
    const { fromRemote } = await import('../dataMinimization.ts');
    const remoteDoc = {
      id: 'auto_1730000000000_abcde',
      amount: 450,
      type: 'debit',
      category: 'Food',
      date: '2026-10-23',
      source: 'auto',
      payee: 'Swiggy',
    };

    const restored = fromRemote(remoteDoc);
    assert.strictEqual(restored.payment_mode, 'upi', 'Auto-added remote doc must restore as upi');
  });
});
