import test from 'node:test';
import assert from 'node:assert';
import {
  toRemote,
  fromRemote,
  validateRemotePayload,
  sanitizeNoteForRemote,
  FORBIDDEN_FIELDS,
  ALLOWED_REMOTE_FIELDS,
} from '../dataMinimization.ts';

test('Data Minimization & toRemote Mapper Suite', async (t) => {
  await t.test('1. Canonical toRemote contains ONLY the allowed remote fields', () => {
    const rawTx = {
      id: 'tx_123',
      amount: 450.5,
      type: 'debit',
      category: 'Food',
      date: '2026-10-23',
      merchant_name: 'Swiggy',
      description: 'Dinner with friends',
      source: 'auto',
      updatedAt: 1792600000000,
      // Forbidden fields that should be completely dropped:
      account_last4: '1234',
      accountLast4: '1234',
      bank_name: 'HDFC Bank',
      bank: 'HDFC',
      ref_no: '629584729104',
      utr: '629584729104',
      package_name: 'com.google.android.apps.nbu.paisa.user',
      original_message: 'Sent Rs 450.50 from HDFC Bank A/c *1234 to SWIGGY. Ref: 629584729104.',
      sourceHash: 'sha256_mock_hash',
      payKey: 'paykey_123',
      notif_log: 'diagnostic_info',
    };

    const remote = toRemote(rawTx);

    // Verify all keys on remote object are strictly within allowed set
    const remoteKeys = Object.keys(remote);
    for (const key of remoteKeys) {
      assert.ok(
        ALLOWED_REMOTE_FIELDS.has(key),
        `Key '${key}' is not allowed in remote payload!`
      );
    }

    // Verify NONE of the forbidden fields exist on remote
    for (const forbidden of FORBIDDEN_FIELDS) {
      assert.strictEqual(
        (remote as any)[forbidden],
        undefined,
        `Forbidden field '${forbidden}' was not stripped!`
      );
    }

    // Verify validation passes
    const validation = validateRemotePayload(remote);
    assert.strictEqual(validation.valid, true, `Validation errors: ${validation.violations.join(', ')}`);
    assert.strictEqual(remote.id, 'tx_123');
    assert.strictEqual(remote.amount, 450.5);
    assert.strictEqual(remote.type, 'debit');
    assert.strictEqual(remote.category, 'Food');
    assert.strictEqual(remote.payee, 'Swiggy');
    assert.strictEqual(remote.note, 'Dinner with friends');
    assert.strictEqual(remote.source, 'auto');
  });

  await t.test('2. Strips "Original Message:" blocks and notification headers from notes', () => {
    const rawNote = `Chai and biscuits
Original Message:
Paid Rs. 20.00 to CHAI POINT on A/C *9876 via UPI/629584729104.`;

    const sanitized = sanitizeNoteForRemote(rawNote);
    assert.strictEqual(sanitized, 'Chai and biscuits');
    assert.ok(!sanitized?.includes('Original Message'));
    assert.ok(!sanitized?.includes('CHAI POINT'));
    assert.ok(!sanitized?.includes('629584729104'));
  });

  await t.test('3. Redacts 9+ digit numbers (phone numbers, account numbers, UTRs) from note and payee', () => {
    const rawTx = {
      id: 'tx_phone_leak',
      amount: 100,
      type: 'debit',
      category: 'Others',
      date: '2026-10-23',
      merchant_name: 'Sent to 9876543210',
      description: 'Call 9876543210 or check ref 629584729104',
      source: 'manual',
    };

    const remote = toRemote(rawTx);

    // 9+ digit phone number in payee redacted
    assert.ok(!remote.payee?.includes('9876543210'));
    assert.ok(remote.payee?.includes('[REDACTED]'));

    // 9+ digit phone number and UTR in note redacted
    assert.ok(!remote.note?.includes('9876543210'));
    assert.ok(!remote.note?.includes('629584729104'));
    assert.ok(remote.note?.includes('[NUMBER REDACTED]'));

    // Validation passes with no 9+ digit numbers
    const validation = validateRemotePayload(remote);
    assert.strictEqual(validation.valid, true);
  });

  await t.test('4. Redacts OTP patterns from notes', () => {
    const noteWithOtp = 'Payment note. Your secret OTP is 482910 for transaction';
    const sanitized = sanitizeNoteForRemote(noteWithOtp);
    assert.ok(!sanitized?.includes('482910'));
    assert.ok(sanitized?.includes('[OTP REDACTED]'));
  });

  await t.test('5. validateRemotePayload FAILS if payload contains forbidden keys', () => {
    const badPayload = {
      id: 'tx_bad',
      amount: 50,
      type: 'debit',
      category: 'Food',
      date: '2026-10-23',
      payee: 'Store',
      note: 'Snacks',
      source: 'manual',
      updatedAt: 123456789,
      // Forbidden leak:
      ref_no: '629584729104',
      accountLast4: '1234',
    };

    const result = validateRemotePayload(badPayload);
    assert.strictEqual(result.valid, false);
    assert.ok(result.violations.length >= 2);
  });

  await t.test('6. validateRemotePayload FAILS if raw 9+ digit number appears in payload strings', () => {
    const unredactedPayload = {
      id: 'tx_bad_2',
      amount: 50,
      type: 'debit',
      category: 'Food',
      date: '2026-10-23',
      payee: 'Store 9876543210',
      note: 'Unredacted UTR 629584729104',
      source: 'manual',
      updatedAt: 123456789,
    };

    const result = validateRemotePayload(unredactedPayload);
    assert.strictEqual(result.valid, false);
    assert.ok(result.violations.some((v) => v.includes('9+ digit sequence')));
  });

  await t.test('7. Round trip keeps all paymentMode values (Bug 2)', () => {
    const modes = ['cash', 'upi', 'card', 'netbanking', 'other'];
    for (const mode of modes) {
      const local = {
        id: `tx_${mode}`,
        amount: 250,
        type: 'debit',
        category: 'Shopping',
        date: '2026-10-23',
        payment_mode: mode,
        userNote: `Paid via ${mode}`,
      };
      const remote = toRemote(local);
      assert.strictEqual(remote.paymentMode, mode);

      const restored = fromRemote(remote, local);
      assert.strictEqual(restored.payment_mode, mode);
    }
  });

  await t.test('8. Missing remote paymentMode defaults to "unknown", NEVER silently "cash" (Bug 2)', () => {
    const remoteDoc = {
      id: 'tx_missing_mode',
      amount: 100,
      type: 'debit',
      category: 'Food',
      date: '2026-10-23',
      // No paymentMode provided
    };
    const restored = fromRemote(remoteDoc);
    assert.strictEqual(restored.payment_mode, 'unknown');
    assert.strictEqual(restored.paymentMode, 'unknown');
    assert.notStrictEqual(restored.payment_mode, 'cash');
  });

  await t.test('9. Local paymentMode is NEVER overwritten by a missing remote value (Bug 2)', () => {
    const local = {
      id: 'tx_preserve_local',
      amount: 500,
      type: 'debit',
      category: 'Fuel',
      date: '2026-10-23',
      payment_mode: 'card',
      originalMessage: 'Local saved alert text',
    };
    const remoteDoc = {
      id: 'tx_preserve_local',
      amount: 500,
      type: 'debit',
      category: 'Fuel',
      date: '2026-10-23',
      // Missing paymentMode and originalMessage in remote doc
    };
    const restored = fromRemote(remoteDoc, local);
    assert.strictEqual(restored.payment_mode, 'card', 'Local card payment mode must be preserved');
    assert.strictEqual(restored.originalMessage, 'Local saved alert text', 'Local originalMessage must be preserved');
  });

  await t.test('10. userNote round trip; originalMessage NEVER in remote payload (Bug 4)', () => {
    const txWithAlert = {
      id: 'tx_notes_test',
      amount: 150,
      type: 'debit',
      category: 'Food',
      date: '2026-10-23',
      userNote: 'Self lunch expense',
      originalMessage: 'Auto-detected SMS: Sent Rs 150 to Burger King from A/C 9988',
      rawText: 'Auto-detected SMS: Sent Rs 150 to Burger King from A/C 9988',
      accountLast4: '9988',
    };

    const remote = toRemote(txWithAlert);
    assert.strictEqual(remote.userNote, 'Self lunch expense');
    assert.strictEqual((remote as any).originalMessage, undefined);
    assert.strictEqual((remote as any).rawText, undefined);
    assert.strictEqual((remote as any).accountLast4, undefined);

    const validation = validateRemotePayload(remote);
    assert.strictEqual(validation.valid, true);

    const restored = fromRemote(remote, txWithAlert);
    assert.strictEqual(restored.userNote, 'Self lunch expense');
    assert.strictEqual(restored.originalMessage, 'Auto-detected SMS: Sent Rs 150 to Burger King from A/C 9988');
  });

  await t.test('11. Old-format doc with only "note" still loads into userNote (Bug 4)', () => {
    const oldRemoteDoc = {
      id: 'tx_old_doc',
      amount: 75,
      type: 'debit',
      category: 'Travel',
      date: '2026-10-23',
      note: 'Auto rickshaw ride',
      // Old doc had no "userNote" key
    };
    const restored = fromRemote(oldRemoteDoc);
    assert.strictEqual(restored.userNote, 'Auto rickshaw ride');
    assert.strictEqual(restored.note, 'Auto rickshaw ride');
  });

  await t.test('12. parseAmount safely handles numbers, strings with commas/currency, and fallbacks', async () => {
    const { parseAmount } = await import('../dataMinimization.ts');
    assert.strictEqual(parseAmount(1200), 1200);
    assert.strictEqual(parseAmount('1,500.50'), 1500.5);
    assert.strictEqual(parseAmount('₹ 2,000'), 2000);
    assert.strictEqual(parseAmount(' -450 '), 450);
    assert.strictEqual(parseAmount(null), 0);
    assert.strictEqual(parseAmount(undefined), 0);
    assert.strictEqual(parseAmount('abc'), 0);
  });

  await t.test('13. fromRemote NEVER overwrites a valid local transaction amount with 0 or missing remote amount', () => {
    const local = {
      id: 'tx_keep_amount',
      amount: 1500,
      type: 'debit',
      category: 'Rent',
      date: '2026-10-25',
      merchant_name: 'Landlord',
    };

    // Remote doc missing amount or having 0
    const remoteWithZero = {
      id: 'tx_keep_amount',
      amount: 0,
      type: 'debit',
      category: 'Rent',
      date: '2026-10-25',
    };
    const restoredZero = fromRemote(remoteWithZero, local);
    assert.strictEqual(restoredZero.amount, 1500, 'Must preserve local amount 1500 when remote is 0');

    const remoteMissingAmt = {
      id: 'tx_keep_amount',
      type: 'debit',
      category: 'Rent',
      date: '2026-10-25',
    };
    const restoredMissing = fromRemote(remoteMissingAmt, local);
    assert.strictEqual(restoredMissing.amount, 1500, 'Must preserve local amount 1500 when remote is missing');
  });

  await t.test('14. toRemote correctly parses string and formatted amounts without turning them into 0', () => {
    const txWithFormattedAmount = {
      id: 'tx_formatted_amt',
      amount: '2,500.00',
      type: 'debit',
      category: 'Shopping',
      date: '2026-10-25',
    };
    const remote = toRemote(txWithFormattedAmount);
    assert.strictEqual(remote.amount, 2500, 'toRemote must parse formatted string amount 2,500.00 into number 2500');
  });
});

