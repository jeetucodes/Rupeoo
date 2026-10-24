import test from 'node:test';
import assert from 'node:assert';

/**
 * Pure TypeScript Rule Evaluator faithfully mirroring the exact logic in firestore.rules
 * to validate access control, data minimization, and cross-user isolation.
 */
interface SecurityContext {
  auth: {
    uid: string;
    token?: {
      email_verified?: boolean;
      grandfathered?: boolean;
      firebase?: { sign_in_provider?: string };
      admin?: boolean;
      email?: string;
    };
  } | null;
}

function evaluateSignedIn(ctx: SecurityContext): boolean {
  if (!ctx.auth) return false;
  const token = ctx.auth.token || {};
  return (
    token.email_verified === true ||
    token.grandfathered === true ||
    token.firebase?.sign_in_provider !== 'password'
  );
}

function evaluateIsValidTransaction(data: Record<string, any>): boolean {
  const allowedKeys = new Set([
    'id', 'amount', 'type', 'category', 'date', 'payee', 'note', 'userNote', 'paymentMode', 'source', 'updatedAt', 'created_at', 'updated_at'
  ]);
  const forbiddenKeys = [
    'ref_no', 'utr', 'accountLast4', 'account_last4', 'account_no',
    'bank_name', 'bank', 'raw_body', 'original_message', 'originalMessage', 'package_name',
    'notif_log', 'diagnostics', 'sourceHash', 'payKey'
  ];

  // 1. keys().hasOnly(...)
  for (const k of Object.keys(data)) {
    if (!allowedKeys.has(k)) return false;
  }

  // 2. !keys().hasAny(forbiddenKeys)
  for (const k of forbiddenKeys) {
    if (k in data) return false;
  }

  // 3. id validation
  if (typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 128) return false;

  // 4. amount validation
  if (typeof data.amount !== 'number' || data.amount < 0 || data.amount > 1000000000) return false;

  // 5. type validation
  if (typeof data.type !== 'string' || !['debit', 'credit', 'expense', 'income'].includes(data.type)) return false;

  // 6. category validation
  if (typeof data.category !== 'string' || data.category.length === 0 || data.category.length > 60) return false;

  // 7. date validation (YYYY-MM-DD, 10 chars)
  if (typeof data.date !== 'string' || data.date.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return false;

  // 8. payee validation
  if ('payee' in data && data.payee !== null && (typeof data.payee !== 'string' || data.payee.length > 100)) return false;

  // 9. note & userNote validation
  if ('note' in data && data.note !== null && (typeof data.note !== 'string' || data.note.length > 500)) return false;
  if ('userNote' in data && data.userNote !== null && (typeof data.userNote !== 'string' || data.userNote.length > 500)) return false;

  // 10. paymentMode validation
  if ('paymentMode' in data && data.paymentMode !== null && (typeof data.paymentMode !== 'string' || data.paymentMode.length > 50)) return false;

  // 11. source validation
  if ('source' in data && data.source !== null && (typeof data.source !== 'string' || !['auto', 'manual', 'statement'].includes(data.source))) return false;

  return true;
}

function evaluateTransactionRule(
  operation: 'read' | 'create' | 'update' | 'delete',
  pathUserId: string,
  ctx: SecurityContext,
  data?: Record<string, any>
): boolean {
  if (!evaluateSignedIn(ctx)) return false;
  if (ctx.auth?.uid !== pathUserId) return false; // Strictly isolated to owner

  if (operation === 'read' || operation === 'delete') {
    return true;
  }

  if (operation === 'create' || operation === 'update') {
    return data ? evaluateIsValidTransaction(data) : false;
  }

  return false;
}

test('Firestore Security Rules & Isolation Test Suite', async (t) => {
  const userA: SecurityContext = {
    auth: {
      uid: 'user_A_123',
      token: { email_verified: true },
    },
  };

  const userB: SecurityContext = {
    auth: {
      uid: 'user_B_456',
      token: { email_verified: true },
    },
  };

  const unauthenticated: SecurityContext = {
    auth: null,
  };

  const validTxData = {
    id: 'tx_valid_001',
    amount: 150.0,
    type: 'debit',
    category: 'Groceries',
    date: '2026-10-23',
    payee: 'Supermarket',
    note: 'Weekly essentials',
    source: 'manual',
    updatedAt: 1792600000000,
  };

  await t.test('1. User A can create valid minimized transaction in /users/user_A_123/transactions', () => {
    const allowed = evaluateTransactionRule('create', 'user_A_123', userA, validTxData);
    assert.strictEqual(allowed, true);
  });

  await t.test('2. User A can read and delete their own transaction', () => {
    assert.strictEqual(evaluateTransactionRule('read', 'user_A_123', userA), true);
    assert.strictEqual(evaluateTransactionRule('delete', 'user_A_123', userA), true);
  });

  await t.test('3. Cross-User Isolation: User B CANNOT read User A transactions', () => {
    const readAllowed = evaluateTransactionRule('read', 'user_A_123', userB);
    assert.strictEqual(readAllowed, false, 'User B must be DENIED access to User A records');
  });

  await t.test('4. Cross-User Isolation: User B CANNOT write to User A transactions', () => {
    const writeAllowed = evaluateTransactionRule('create', 'user_A_123', userB, validTxData);
    assert.strictEqual(writeAllowed, false, 'User B must be DENIED write access to User A records');
  });

  await t.test('5. Unauthenticated user CANNOT read or write any transactions', () => {
    assert.strictEqual(evaluateTransactionRule('read', 'user_A_123', unauthenticated), false);
    assert.strictEqual(evaluateTransactionRule('create', 'user_A_123', unauthenticated, validTxData), false);
  });

  await t.test('6. Rejects any document containing forbidden fields (ref_no, accountLast4, bank_name, raw_body)', () => {
    const forbiddenPayload = {
      ...validTxData,
      ref_no: '629584729104',
      accountLast4: '1234',
      bank_name: 'HDFC Bank',
    };

    const allowed = evaluateTransactionRule('create', 'user_A_123', userA, forbiddenPayload);
    assert.strictEqual(allowed, false, 'Payload with forbidden fields must be DENIED');
  });

  await t.test('7. Rejects invalid date format (requires YYYY-MM-DD)', () => {
    const badDatePayload = {
      ...validTxData,
      date: '23/10/2026', // Not YYYY-MM-DD
    };

    const allowed = evaluateTransactionRule('create', 'user_A_123', userA, badDatePayload);
    assert.strictEqual(allowed, false, 'Invalid date format must be DENIED');
  });

  await t.test('8. Rejects negative amount or unreasonable values', () => {
    const negativeAmount = {
      ...validTxData,
      amount: -50,
    };

    const allowed = evaluateTransactionRule('create', 'user_A_123', userA, negativeAmount);
    assert.strictEqual(allowed, false, 'Negative amount must be DENIED');
  });
});
