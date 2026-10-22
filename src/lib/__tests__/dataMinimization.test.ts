import test from 'node:test';
import assert from 'node:assert';
import {
  toRemote,
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
});
