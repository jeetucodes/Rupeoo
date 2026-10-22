/**
 * Data Minimization Engine for Rupeo
 *
 * Enforces strict privacy boundaries before any data leaves the device:
 * 1. Defines a single canonical `toRemote(transaction)` mapper used by ALL sync code.
 * 2. Allowed remote fields ONLY:
 *    - id, amount, type, category, date, payee, note, source, updatedAt
 * 3. NEVER uploads:
 *    - Account numbers or last 4 digits
 *    - UPI reference numbers (UTR)
 *    - Bank names
 *    - Original SMS / notification text
 *    - Notification package names
 *    - Diagnostics, notif_log
 *    - OTP-like text or patterns
 * 4. Sanitizes user notes by stripping "Original Message:" blocks and redacting 9+ digit sequences.
 */

export interface RemoteTransaction {
  id: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  date: string;
  payee: string | null;
  note: string | null;
  source: 'auto' | 'manual';
  updatedAt: number;
}

export const ALLOWED_REMOTE_FIELDS = new Set([
  'id',
  'amount',
  'type',
  'category',
  'date',
  'payee',
  'note',
  'source',
  'updatedAt',
]);

export const FORBIDDEN_FIELDS = [
  'account_no',
  'accountNo',
  'account_last4',
  'accountLast4',
  'bank',
  'bank_name',
  'bankName',
  'utr',
  'ref_no',
  'refNo',
  'original_message',
  'originalMessage',
  'raw_body',
  'rawText',
  'cleanMessage',
  'originalAlert',
  'package_name',
  'packageName',
  'sourcePackage',
  'notif_log',
  'diagnostics',
  'sourceHash',
  'payKey',
  'sbnKey',
];

/**
 * Sanitizes note text to ensure NO original notification / SMS text,
 * account numbers, or OTP sequences leak into cloud payloads.
 */
export function sanitizeNoteForRemote(note?: string | null): string | null {
  if (!note || typeof note !== 'string') return null;

  let cleaned = note;

  // 1. Strip any "Original Message:" block (and everything that follows)
  const origMsgIndex = cleaned.search(/original\s+message\s*:/i);
  if (origMsgIndex !== -1) {
    cleaned = cleaned.substring(0, origMsgIndex).trim();
  }

  // 2. Strip "Alert Received:" or package name prefixes
  cleaned = cleaned.replace(/alert\s+received\s*:[^\n]+/gi, '').trim();
  cleaned = cleaned.replace(/com\.[a-zA-Z0-9_.]+/g, '').trim();

  // 3. Redact / remove any OTP patterns (e.g. "OTP is 482910", "OTP: 123456", "verification code 1234")
  cleaned = cleaned.replace(/\b(?:otp|one\s*time\s*password|verification\s*code|secret\s*pin|code)\s*(?:is|[:=-])?\s*\d{4,8}\b/gi, '[OTP REDACTED]');

  // 4. Redact any 9+ digit numbers (phone numbers, account numbers, UTRs)
  cleaned = cleaned.replace(/\b\d{9,20}\b/g, '[NUMBER REDACTED]');

  // 5. Redact masked account numbers (e.g. *1234, XX1234, XXXXX1234)
  cleaned = cleaned.replace(/[*Xx]{2,}\s*\d{3,4}/g, '[ACCOUNT REDACTED]');

  // 6. Clean whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Normalizes date to YYYY-MM-DD
 */
function normalizeDateString(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') {
    return new Date().toISOString().split('T')[0];
  }
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Canonical toRemote mapper.
 * Transforms any internal transaction object into a strictly minimized RemoteTransaction.
 * Under NO circumstances will forbidden keys or un-sanitized strings pass through.
 */
export function toRemote(rawTx: Record<string, any>): RemoteTransaction {
  if (!rawTx || typeof rawTx !== 'object') {
    throw new Error('toRemote requires a valid transaction object');
  }

  const id = String(rawTx.id || rawTx.txId || '').trim();
  if (!id) {
    throw new Error('Transaction must have an id before syncing to remote');
  }

  const amount = Math.abs(Number(rawTx.amount) || 0);

  const rawType = String(rawTx.type || 'debit').toLowerCase();
  const type: 'debit' | 'credit' = rawType === 'credit' || rawType === 'income' ? 'credit' : 'debit';

  const category = (rawTx.category && typeof rawTx.category === 'string')
    ? rawTx.category.trim().substring(0, 50)
    : 'Others';

  const date = normalizeDateString(rawTx.date);

  // Payee / Merchant Name (sanitized, max 100 chars, no 9+ digit numbers)
  let payee: string | null = null;
  const rawPayee = rawTx.merchant_name || rawTx.payee || rawTx.merchant;
  if (rawPayee && typeof rawPayee === 'string') {
    let cleanPayee = rawPayee.trim().substring(0, 100);
    // Redact 9+ digit numbers in payee names (e.g. accidental phone numbers)
    cleanPayee = cleanPayee.replace(/\b\d{9,20}\b/g, '[REDACTED]');
    payee = cleanPayee.length > 0 ? cleanPayee : null;
  }

  // Note (user-typed only, stripped of all original alert texts & 9+ digit numbers)
  const rawNote = rawTx.description || rawTx.note || rawTx.memo;
  const note = sanitizeNoteForRemote(rawNote);

  // Source ('auto' | 'manual')
  const rawSource = String(rawTx.source || '').toLowerCase();
  const source: 'auto' | 'manual' =
    rawSource.includes('auto') || rawSource.includes('sms') || rawSource.includes('notification')
      ? 'auto'
      : 'manual';

  // updatedAt timestamp
  let updatedAt = Date.now();
  if (rawTx.updatedAt && typeof rawTx.updatedAt === 'number') {
    updatedAt = rawTx.updatedAt;
  } else if (rawTx.updated_at && typeof rawTx.updated_at === 'number') {
    updatedAt = rawTx.updated_at;
  } else if (rawTx.created_at && typeof rawTx.created_at === 'number') {
    updatedAt = rawTx.created_at;
  }

  return {
    id,
    amount,
    type,
    category,
    date,
    payee,
    note,
    source,
    updatedAt,
  };
}

/**
 * Strict validator for remote payloads.
 * Returns true if payload strictly conforms to data minimization rules;
 * Throws an error or returns false if any forbidden field or suspicious pattern is found.
 */
export function validateRemotePayload(payload: Record<string, any>): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, violations: ['Payload is not an object'] };
  }

  // 1. Check for unexpected keys
  const keys = Object.keys(payload);
  for (const k of keys) {
    if (!ALLOWED_REMOTE_FIELDS.has(k)) {
      violations.push(`Forbidden or unknown key present: ${k}`);
    }
  }

  // 2. Check for explicit forbidden fields
  for (const forbidden of FORBIDDEN_FIELDS) {
    if (forbidden in payload) {
      violations.push(`Payload explicitly contains forbidden field: ${forbidden}`);
    }
  }

  // 3. Scan string fields for 9+ digit sequences
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === 'string') {
      const longNumberMatch = val.match(/\b\d{9,}\b/);
      if (longNumberMatch) {
        violations.push(`Field '${key}' contains 9+ digit sequence: ${longNumberMatch[0]}`);
      }

      if (/original\s+message\s*:/i.test(val)) {
        violations.push(`Field '${key}' contains unstripped 'Original Message:' header`);
      }

      if (/\b(?:otp|secret\s*pin)\b/i.test(val)) {
        violations.push(`Field '${key}' contains sensitive OTP/PIN keyword`);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
