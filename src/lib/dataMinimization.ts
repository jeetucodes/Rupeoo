/**
 * Data Minimization Engine for Rupeo
 *
 * Enforces strict privacy boundaries before any data leaves the device:
 * 1. Defines canonical `toRemote(transaction)` and `fromRemote(remoteDoc, localExisting)` mappers.
 * 2. Allowed remote fields ONLY:
 *    - id, amount, type, category, date, payee, note, userNote, paymentMode, source, updatedAt
 * 3. NEVER uploads:
 *    - Account numbers or last 4 digits
 *    - UPI reference numbers (UTR)
 *    - Bank names
 *    - Original SMS / notification text (originalMessage stays on device ONLY)
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
  time?: string | null;
  payee: string | null;
  merchant_name?: string | null;
  note: string | null;
  userNote: string | null;
  description?: string | null;
  paymentMode: string;
  payment_mode?: string;
  source: 'auto' | 'manual';
  updatedAt: number;
}

export const ALLOWED_REMOTE_FIELDS = new Set([
  'id',
  'amount',
  'type',
  'category',
  'date',
  'time',
  'payee',
  'merchant_name',
  'note',
  'userNote',
  'description',
  'paymentMode',
  'payment_mode',
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
 * Normalizes payment mode to canonical values:
 * 'cash' | 'upi' | 'card' | 'netbanking' | 'other' | 'unknown'
 */
export function normalizePaymentMode(mode?: string | null): string {
  if (!mode || typeof mode !== 'string') return 'unknown';
  const clean = mode.trim().toLowerCase();
  if (!clean || clean === 'unknown' || clean === 'not set' || clean === 'none') {
    return 'unknown';
  }
  if (clean === 'cash' || clean === 'rokad') return 'cash';
  if (clean === 'upi' || clean === 'gpay' || clean === 'phonepe' || clean === 'paytm') return 'upi';
  if (clean === 'card' || clean === 'debit card' || clean === 'credit card') return 'card';
  if (clean === 'netbanking' || clean === 'net_banking' || clean === 'bank' || clean === 'transfer' || clean === 'neft' || clean === 'rtgs' || clean === 'imps') return 'netbanking';
  if (clean === 'other' || clean === 'others') return 'other';
  return clean.substring(0, 50);
}

/**
 * Formats a payment mode for UI display.
 * 'unknown' displays as "Not set" (user can edit).
 */
export function formatPaymentModeDisplay(mode?: string | null): string {
  if (!mode || mode === 'unknown') return 'Not set';
  const norm = normalizePaymentMode(mode);
  if (norm === 'cash') return 'Cash';
  if (norm === 'upi') return 'UPI';
  if (norm === 'card') return 'Card';
  if (norm === 'netbanking') return 'Net Banking';
  if (norm === 'other') return 'Other';
  return mode;
}

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
  cleaned = cleaned.replace(
    /\b(?:otp|one\s*time\s*password|verification\s*code|secret\s*pin|code)\s*(?:is|[:=-])?\s*\d{4,8}\b/gi,
    '[OTP REDACTED]'
  );

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

  const category =
    rawTx.category && typeof rawTx.category === 'string'
      ? rawTx.category.trim().substring(0, 50)
      : 'Others';

  const date = normalizeDateString(rawTx.date);

  // Payee / Merchant Name (sanitized, max 100 chars, no 9+ digit numbers)
  let payee: string | null = null;
  const rawPayee = rawTx.merchant_name || rawTx.payee || rawTx.merchant || rawTx.title;
  if (rawPayee && typeof rawPayee === 'string') {
    let cleanPayee = rawPayee.trim().substring(0, 100);
    // Redact 9+ digit numbers in payee names (e.g. accidental phone numbers)
    cleanPayee = cleanPayee.replace(/\b\d{9,20}\b/g, '[REDACTED]');
    payee = cleanPayee.length > 0 ? cleanPayee : null;
  }

  // User Note (user-typed only, stripped of all original alert texts & 9+ digit numbers)
  // NEVER include originalMessage
  const rawNote = rawTx.userNote || rawTx.user_note || rawTx.description || rawTx.note || rawTx.memo;
  const sanitizedNote = sanitizeNoteForRemote(rawNote);

  // Source ('auto' | 'manual')
  const rawSource = String(rawTx.source || '').toLowerCase();
  const isAuto =
    rawSource.includes('auto') ||
    rawSource.includes('sms') ||
    rawSource.includes('notification') ||
    String(id).startsWith('auto_') ||
    rawTx.status === 'auto_added';
  const source: 'auto' | 'manual' = isAuto ? 'auto' : 'manual';

  // Payment Mode mapping: cash / upi / card / netbanking / other
  // Default to "cash" ONLY if the user explicitly chose cash; otherwise keep chosen mode or 'unknown'
  // Auto-added transactions strictly default to 'upi'
  const rawPaymentMode = rawTx.paymentMode || rawTx.payment_mode || rawTx.mode || rawTx.channel;
  let paymentMode = normalizePaymentMode(rawPaymentMode);
  if (isAuto && paymentMode === 'unknown') {
    paymentMode = 'upi';
  }

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
    time: rawTx.time || null,
    payee,
    merchant_name: payee,
    note: sanitizedNote,
    userNote: sanitizedNote,
    description: sanitizedNote,
    paymentMode,
    payment_mode: paymentMode,
    source,
    updatedAt,
  };
}

/**
 * Canonical fromRemote mapper.
 * Restores a remote Firestore document into local representation, adhering to:
 * - Missing remote paymentMode -> "unknown", never silently "cash"
 * - NEVER overwrite a good local value with a missing remote value
 * - Reads both userNote, description and note (for backwards compatibility)
 * - Restores payee name into both merchant_name and payee
 * - Preserves on-device only originalMessage if present in local record
 */
export function fromRemote(
  remoteDoc: Record<string, any>,
  localExisting?: Record<string, any>
): Record<string, any> {
  if (!remoteDoc || typeof remoteDoc !== 'object') {
    throw new Error('fromRemote requires a remote document');
  }

  const id = String(remoteDoc.id || '').trim();
  const amount = Number(remoteDoc.amount) || 0;
  const type = String(remoteDoc.type || 'debit').toLowerCase();
  const category = remoteDoc.category || 'Others';
  const date = normalizeDateString(remoteDoc.date);

  // Payee / Merchant Name: check all remote aliases, fallback to localExisting
  const rawPayee =
    remoteDoc.payee ||
    remoteDoc.merchant_name ||
    remoteDoc.merchant ||
    remoteDoc.title ||
    localExisting?.merchant_name ||
    localExisting?.payee ||
    localExisting?.merchant ||
    null;
  const payee = typeof rawPayee === 'string' && rawPayee.trim().length > 0 ? rawPayee.trim() : null;

  // Note mapping: check all remote note aliases, fallback to localExisting
  const rawRemoteNote =
    remoteDoc.userNote ||
    remoteDoc.note ||
    remoteDoc.description ||
    remoteDoc.user_note ||
    remoteDoc.memo ||
    null;
  const rawLocalNote =
    localExisting?.userNote ||
    localExisting?.description ||
    localExisting?.note ||
    localExisting?.user_note ||
    null;
  const note = rawRemoteNote || rawLocalNote || null;

  // Payment Mode: check all remote aliases, preserve local if remote is missing/unknown
  const remoteModeRaw =
    remoteDoc.paymentMode ||
    remoteDoc.payment_mode ||
    remoteDoc.mode ||
    remoteDoc.channel;
  let payment_mode = 'unknown';

  const rawSource = String(remoteDoc.source || localExisting?.source || '').toLowerCase();
  const isAuto =
    rawSource.includes('auto') ||
    rawSource.includes('sms') ||
    rawSource.includes('notification') ||
    id.startsWith('auto_') ||
    remoteDoc.status === 'auto_added' ||
    localExisting?.status === 'auto_added';

  if (remoteModeRaw && remoteModeRaw !== 'unknown') {
    payment_mode = normalizePaymentMode(remoteModeRaw);
  } else if (localExisting && localExisting.payment_mode && localExisting.payment_mode !== 'unknown') {
    payment_mode = localExisting.payment_mode;
  } else if (localExisting && localExisting.paymentMode && localExisting.paymentMode !== 'unknown') {
    payment_mode = localExisting.paymentMode;
  } else if (isAuto) {
    payment_mode = 'upi';
  } else {
    payment_mode = 'unknown';
  }

  // Preserve local-only fields (never overwritten by remote)
  const originalMessage = localExisting?.originalMessage || localExisting?.rawText || null;
  const utr = localExisting?.utr || remoteDoc.utr || null;
  const ref_no = localExisting?.ref_no || remoteDoc.ref_no || null;
  const accountLast4 = localExisting?.accountLast4 || localExisting?.account_last4 || null;
  const bankName = localExisting?.bankName || localExisting?.bank_name || null;
  const sourceHash = localExisting?.sourceHash || null;
  const payKey = localExisting?.payKey || null;
  const receipt_image = localExisting?.receipt_image || localExisting?.receiptImage || remoteDoc.receipt_image || null;

  const source = remoteDoc.source || localExisting?.source || 'manual';
  const time = remoteDoc.time || localExisting?.time || null;
  const updatedAt = Number(remoteDoc.updatedAt || remoteDoc.updated_at) || Date.now();
  const created_at = Number(remoteDoc.created_at) || Number(localExisting?.created_at) || updatedAt;

  return {
    id,
    amount,
    type,
    category,
    date,
    time,
    merchant_name: payee,
    payee,
    merchant: payee,
    description: note,
    note,
    userNote: note,
    originalMessage,
    payment_mode,
    paymentMode: payment_mode,
    source,
    utr,
    ref_no,
    accountLast4,
    bankName,
    receipt_image,
    sourceHash,
    payKey,
    created_at,
    updatedAt,
    syncedAt: Date.now(),
    syncStatus: 'synced',
    deleted: 0,
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
