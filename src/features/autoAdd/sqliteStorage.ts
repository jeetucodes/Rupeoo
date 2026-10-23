/**
 * Local SQLite Storage for Auto-Add System via expo-sqlite
 *
 * Persists detected alerts, auto-added transactions, recurring bills, and settings directly in SQLite
 * so background headless JS tasks execute reliably when the app is killed.
 */

import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { warn, log } from '@/lib/logger';

let sqliteDbInstance: SQLite.SQLiteDatabase | null = null;

export function getAutoAddDatabase(): SQLite.SQLiteDatabase | null {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!sqliteDbInstance) {
    try {
      sqliteDbInstance = SQLite.openDatabaseSync('rupeo_auto_add.db');
      initDatabaseSchema(sqliteDbInstance);
    } catch (err) {
      warn('[SQLite] Failed to open SQLite database:', err);
      return null;
    }
  }
  return sqliteDbInstance;
}

function initDatabaseSchema(db: SQLite.SQLiteDatabase): void {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS auto_added_transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        merchant TEXT,
        category TEXT,
        bankName TEXT,
        accountLast4 TEXT,
        refNo TEXT,
        timestamp INTEGER NOT NULL,
        channel TEXT,
        rawText TEXT,
        status TEXT,
        billId TEXT,
        originalMessage TEXT,
        userNote TEXT,
        payment_mode TEXT,
        syncedAt INTEGER,
        syncStatus TEXT DEFAULT 'pending',
        updatedAt INTEGER,
        deleted INTEGER DEFAULT 0,
        userId TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auto_add_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auto_add_pending_alerts (
        id TEXT PRIMARY KEY,
        payKey TEXT,
        amount REAL,
        type TEXT,
        merchant TEXT,
        category TEXT,
        bankName TEXT,
        accountLast4 TEXT,
        refNo TEXT,
        timestamp INTEGER NOT NULL,
        channel TEXT,
        confidence REAL,
        rawText TEXT,
        billId TEXT,
        candidateBills TEXT,
        suggestedBillId TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recurring_bills (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        type TEXT,
        frequency TEXT,
        provider TEXT,
        brandColor TEXT,
        brandBadge TEXT,
        dueDay INTEGER,
        cycleDays INTEGER,
        startDate TEXT,
        lastPaidDate TEXT,
        lastPaidAt INTEGER,
        nextDueDate TEXT NOT NULL,
        notes TEXT,
        status TEXT,
        autoConfirm INTEGER DEFAULT 1,
        keywords TEXT,
        amountTolerance REAL DEFAULT 0,
        linkedTransactionId TEXT,
        paymentHistory TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notif_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        packageName TEXT NOT NULL,
        parsedStatus TEXT NOT NULL,
        reasonSkipped TEXT,
        summary TEXT,
        rawSnippet TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // Run safe migrations for existing tables
    runSqliteMigrations(db);
  } catch (err) {
    warn('Failed to initialize auto-add SQLite schema:', err);
  }
}

/**
 * Migration routine: adds columns if upgrading from an older DB version.
 * Runs inside a transaction, backs up first, verifies counts before/after,
 * and rolls back if after < before (never drops or destroys data).
 */
function runSqliteMigrations(db: SQLite.SQLiteDatabase): void {
  try {
    const billCols = new Set(
      db.getAllSync<{ name: string }>('PRAGMA table_info(recurring_bills);').map((c) => c.name)
    );
    if (!billCols.has('autoConfirm')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN autoConfirm INTEGER DEFAULT 1;');
    }
    if (!billCols.has('keywords')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN keywords TEXT;');
    }
    if (!billCols.has('amountTolerance')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN amountTolerance REAL DEFAULT 0;');
    }
    if (!billCols.has('lastPaidAt')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN lastPaidAt INTEGER;');
    }
    if (!billCols.has('linkedTransactionId')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN linkedTransactionId TEXT;');
    }
    if (!billCols.has('paymentHistory')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN paymentHistory TEXT;');
    }
    if (!billCols.has('frequency')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN frequency TEXT;');
    }
    if (!billCols.has('brandColor')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN brandColor TEXT;');
    }
    if (!billCols.has('brandBadge')) {
      db.execSync('ALTER TABLE recurring_bills ADD COLUMN brandBadge TEXT;');
    }
  } catch (err) {
    warn('[SQLite] Migration error for recurring_bills:', err);
  }

  try {
    const txCols = new Set(
      db.getAllSync<{ name: string }>('PRAGMA table_info(auto_added_transactions);').map((c) => c.name)
    );
    if (!txCols.has('billId')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN billId TEXT;');
    }
    if (!txCols.has('originalMessage')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN originalMessage TEXT;');
    }
    if (!txCols.has('userNote')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN userNote TEXT;');
    }
    if (!txCols.has('payment_mode')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN payment_mode TEXT;');
    }
    if (!txCols.has('syncedAt')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN syncedAt INTEGER;');
    }
    if (!txCols.has('syncStatus')) {
      db.execSync("ALTER TABLE auto_added_transactions ADD COLUMN syncStatus TEXT DEFAULT 'pending';");
    }
    if (!txCols.has('updatedAt')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN updatedAt INTEGER;');
    }
    if (!txCols.has('deleted')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN deleted INTEGER DEFAULT 0;');
    }
    if (!txCols.has('userId')) {
      db.execSync('ALTER TABLE auto_added_transactions ADD COLUMN userId TEXT;');
    }

    // Bug 4 Safe Migration: separate userNote vs originalMessage inside transaction
    const countBeforeRow = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM auto_added_transactions;');
    const countBefore = countBeforeRow?.c || 0;

    if (countBefore > 0) {
      db.execSync('BEGIN TRANSACTION;');
      try {
        // Backup table first
        db.execSync(`
          CREATE TABLE IF NOT EXISTS auto_added_transactions_backup_v2 AS SELECT * FROM auto_added_transactions;
        `);

        // Populate originalMessage from rawText if originalMessage is empty
        db.execSync(`
          UPDATE auto_added_transactions
          SET originalMessage = rawText
          WHERE (originalMessage IS NULL OR originalMessage = '') AND rawText IS NOT NULL;
        `);

        // Ensure auto-added transactions default to UPI payment mode & channel
        db.execSync(`
          UPDATE auto_added_transactions
          SET payment_mode = 'UPI'
          WHERE payment_mode IS NULL OR payment_mode = 'unknown' OR payment_mode = '';
        `);
        db.execSync(`
          UPDATE auto_added_transactions
          SET channel = 'UPI'
          WHERE channel IS NULL OR channel = 'unknown' OR channel = '';
        `);

        // Verify count after
        const countAfterRow = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM auto_added_transactions;');
        const countAfter = countAfterRow?.c || 0;

        if (countAfter < countBefore) {
          throw new Error(`Row count decreased in notes/upi migration: before=${countBefore}, after=${countAfter}`);
        }
        db.execSync('COMMIT;');
      } catch (migErr) {
        db.execSync('ROLLBACK;');
        warn('[SQLite] Reversible notes migration rolled back safely:', migErr);
      }
    }
  } catch (err) {
    warn('[SQLite] Migration error for auto_added_transactions:', err);
  }

  try {
    const pendingCols = new Set(
      db.getAllSync<{ name: string }>('PRAGMA table_info(auto_add_pending_alerts);').map((c) => c.name)
    );
    if (!pendingCols.has('billId')) {
      db.execSync('ALTER TABLE auto_add_pending_alerts ADD COLUMN billId TEXT;');
    }
    if (!pendingCols.has('candidateBills')) {
      db.execSync('ALTER TABLE auto_add_pending_alerts ADD COLUMN candidateBills TEXT;');
    }
    if (!pendingCols.has('suggestedBillId')) {
      db.execSync('ALTER TABLE auto_add_pending_alerts ADD COLUMN suggestedBillId TEXT;');
    }
  } catch (err) {
    warn('[SQLite] Migration error for auto_add_pending_alerts:', err);
  }
}

export interface SQLiteTransactionRecord {
  id: string;
  amount: number;
  type: string;
  merchant: string | null;
  category: string;
  bankName: string | null;
  accountLast4: string | null;
  refNo: string | null;
  timestamp: number;
  channel: string;
  rawText: string;
  status: string;
  billId?: string | null;
  originalMessage?: string | null;
  userNote?: string | null;
  payment_mode?: string | null;
  syncedAt?: number | null;
  syncStatus?: string | null;
  updatedAt?: number | null;
  deleted?: number | null;
  userId?: string | null;
  created_at: number;
}

/**
 * Saves an auto-added transaction to local SQLite.
 */
export function saveTransactionToSQLite(tx: SQLiteTransactionRecord): void {
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    db.runSync(
      `INSERT OR REPLACE INTO auto_added_transactions 
       (id, amount, type, merchant, category, bankName, accountLast4, refNo, timestamp, channel, rawText, status, billId, originalMessage, userNote, payment_mode, syncedAt, syncStatus, updatedAt, deleted, userId, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        tx.id,
        tx.amount,
        tx.type,
        tx.merchant,
        tx.category,
        tx.bankName,
        tx.accountLast4,
        tx.refNo,
        tx.timestamp,
        tx.channel || 'UPI',
        tx.rawText,
        tx.status,
        tx.billId || null,
        tx.originalMessage || tx.rawText || null,
        tx.userNote || null,
        tx.payment_mode || 'UPI',
        tx.syncedAt || null,
        tx.syncStatus || 'pending',
        tx.updatedAt || Date.now(),
        tx.deleted ? 1 : 0,
        tx.userId || null,
        tx.created_at || Date.now(),
      ]
    );
    log('[SQLite] Successfully saved transaction:', tx.id);
  } catch (err) {
    warn('[SQLite] Error saving transaction:', err);
  }
}

/**
 * Updates an existing auto-added transaction in SQLite with enriched fields (refNo, accountLast4, merchant, etc.).
 */
export function updateTransactionInSQLite(
  txId: string,
  updates: Partial<{
    refNo: string;
    accountLast4: string;
    merchant: string;
    category: string;
    userNote: string;
  }>
): void {
  const db = getAutoAddDatabase();
  if (!db || !txId) return;
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    if (updates.refNo !== undefined) {
      setClauses.push('refNo = ?');
      values.push(updates.refNo);
    }
    if (updates.accountLast4 !== undefined) {
      setClauses.push('accountLast4 = ?');
      values.push(updates.accountLast4);
    }
    if (updates.merchant !== undefined) {
      setClauses.push('merchant = ?');
      values.push(updates.merchant);
    }
    if (updates.category !== undefined) {
      setClauses.push('category = ?');
      values.push(updates.category);
    }
    if (updates.userNote !== undefined) {
      setClauses.push('userNote = ?');
      values.push(updates.userNote);
    }
    if (setClauses.length === 0) return;
    setClauses.push('updatedAt = ?');
    values.push(Date.now());
    values.push(txId);
    db.runSync(
      `UPDATE auto_added_transactions SET ${setClauses.join(', ')} WHERE id = ?;`,
      values
    );
    log('[SQLite] Successfully enriched transaction in SQLite:', txId);
  } catch (err) {
    warn('[SQLite] Error updating auto-added transaction in SQLite:', err);
  }
}

/**
 * Saves a pending alert into local SQLite.
 */
export function savePendingAlertToSQLite(alert: {
  id: string;
  payKey: string;
  amount: number;
  type: string;
  merchant: string | null;
  category: string;
  bankName: string | null;
  accountLast4: string | null;
  refNo: string | null;
  timestamp: number;
  channel: string;
  confidence: number;
  rawText: string;
  billId?: string | null;
  candidateBills?: any[] | null;
  suggestedBillId?: string | null;
}): void {
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    db.runSync(
      `INSERT OR REPLACE INTO auto_add_pending_alerts
       (id, payKey, amount, type, merchant, category, bankName, accountLast4, refNo, timestamp, channel, confidence, rawText, billId, candidateBills, suggestedBillId, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        alert.id,
        alert.payKey,
        alert.amount,
        alert.type,
        alert.merchant,
        alert.category,
        alert.bankName,
        alert.accountLast4,
        alert.refNo,
        alert.timestamp,
        alert.channel,
        alert.confidence,
        alert.rawText,
        alert.billId || null,
        alert.candidateBills ? JSON.stringify(alert.candidateBills) : null,
        alert.suggestedBillId || null,
        Date.now(),
      ]
    );
  } catch (err) {
    warn('[SQLite] Error saving pending alert:', err);
  }
}

/**
 * Saves or updates a single recurring bill in SQLite.
 */
export function saveRecurringBillToSQLite(bill: any): void {
  if (Platform.OS === 'web' || !bill || !bill.id || !bill.title) return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    const historyStr = Array.isArray(bill.paymentHistory)
      ? JSON.stringify(bill.paymentHistory)
      : typeof bill.paymentHistory === 'string'
      ? bill.paymentHistory
      : '[]';

    db.runSync(
      `INSERT OR REPLACE INTO recurring_bills
       (id, title, amount, category, type, frequency, provider, brandColor, brandBadge, dueDay, cycleDays, startDate, lastPaidDate, lastPaidAt, nextDueDate, notes, status, autoConfirm, keywords, amountTolerance, linkedTransactionId, paymentHistory, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        bill.id,
        bill.title,
        Number(bill.amount) || 0,
        bill.category || 'Bills',
        bill.type || 'monthly_date',
        bill.frequency || null,
        bill.provider || null,
        bill.brandColor || null,
        bill.brandBadge || null,
        bill.dueDay ? Number(bill.dueDay) : null,
        bill.cycleDays ? Number(bill.cycleDays) : null,
        bill.startDate || null,
        bill.lastPaidDate || null,
        bill.lastPaidAt ? Number(bill.lastPaidAt) : null,
        bill.nextDueDate || '',
        bill.notes || null,
        bill.status || 'pending',
        bill.autoConfirm !== false ? 1 : 0,
        bill.keywords ? (Array.isArray(bill.keywords) ? bill.keywords.join(', ') : String(bill.keywords)) : null,
        Number(bill.amountTolerance) || 0,
        bill.linkedTransactionId || null,
        historyStr,
        Date.now(),
      ]
    );
  } catch (err) {
    warn('[SQLite] Error saving recurring bill to SQLite:', err);
  }
}

/**
 * Synchronizes the full list of recurring bills into SQLite cache.
 */
export function syncRecurringBillsToSQLite(bills: any[]): void {
  if (Platform.OS === 'web' || !Array.isArray(bills)) return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    db.runSync('BEGIN TRANSACTION;');
    for (const bill of bills) {
      if (!bill || !bill.id) continue;
      const historyStr = Array.isArray(bill.paymentHistory)
        ? JSON.stringify(bill.paymentHistory)
        : typeof bill.paymentHistory === 'string'
        ? bill.paymentHistory
        : '[]';

      db.runSync(
        `INSERT OR REPLACE INTO recurring_bills
         (id, title, amount, category, type, frequency, provider, brandColor, brandBadge, dueDay, cycleDays, startDate, lastPaidDate, lastPaidAt, nextDueDate, notes, status, autoConfirm, keywords, amountTolerance, linkedTransactionId, paymentHistory, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          bill.id,
          bill.title,
          Number(bill.amount) || 0,
          bill.category || 'Bills',
          bill.type || 'monthly_date',
          bill.frequency || null,
          bill.provider || null,
          bill.brandColor || null,
          bill.brandBadge || null,
          bill.dueDay ? Number(bill.dueDay) : null,
          bill.cycleDays ? Number(bill.cycleDays) : null,
          bill.startDate || null,
          bill.lastPaidDate || null,
          bill.lastPaidAt ? Number(bill.lastPaidAt) : null,
          bill.nextDueDate || '',
          bill.notes || null,
          bill.status || 'pending',
          bill.autoConfirm !== false ? 1 : 0,
          bill.keywords ? (Array.isArray(bill.keywords) ? bill.keywords.join(', ') : String(bill.keywords)) : null,
          Number(bill.amountTolerance) || 0,
          bill.linkedTransactionId || null,
          historyStr,
          Date.now(),
        ]
      );
    }
    db.runSync('COMMIT;');
    log('[SQLite] Synced', bills.length, 'recurring bills into SQLite.');
  } catch (err) {
    warn('[SQLite] Error syncing recurring bills to SQLite:', err);
  }
}

/**
 * Reads all recurring bills from local SQLite (synchronous & reliable in background headless tasks).
 */
export function getRecurringBillsFromSQLite(): any[] {
  if (Platform.OS === 'web') return [];
  try {
    const db = getAutoAddDatabase();
    if (!db) return [];
    const rows = db.getAllSync<any>('SELECT * FROM recurring_bills ORDER BY nextDueDate ASC;');
    return rows.map((r) => {
      let paymentHistory: any[] = [];
      if (r.paymentHistory) {
        try {
          paymentHistory = JSON.parse(r.paymentHistory);
        } catch {}
      }
      return {
        ...r,
        amount: Number(r.amount) || 0,
        dueDay: r.dueDay ? Number(r.dueDay) : undefined,
        cycleDays: r.cycleDays ? Number(r.cycleDays) : undefined,
        amountTolerance: Number(r.amountTolerance) || 0,
        autoConfirm: r.autoConfirm === 1 || r.autoConfirm === true || r.autoConfirm == null,
        paymentHistory,
      };
    });
  } catch (err) {
    warn('[SQLite] Error reading recurring bills:', err);
    return [];
  }
}

/**
 * Marks a bill as paid directly in SQLite, advances next due date, links transaction, and appends payment history.
 */
export function markBillPaidInSQLite(
  billId: string,
  txId: string,
  amount: number,
  paidDate: string,
  nextDueDate: string,
  paymentRecord?: any
): void {
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    const existing = db.getFirstSync<{ paymentHistory: string }>(
      'SELECT paymentHistory FROM recurring_bills WHERE id = ?;',
      [billId]
    );

    let history: any[] = [];
    if (existing?.paymentHistory) {
      try {
        history = JSON.parse(existing.paymentHistory);
      } catch {}
    }
    if (paymentRecord) {
      history = [paymentRecord, ...history];
    }

    db.runSync(
      `UPDATE recurring_bills 
       SET status = 'paid',
           lastPaidDate = ?,
           lastPaidAt = ?,
           nextDueDate = ?,
           linkedTransactionId = ?,
           paymentHistory = ?,
           updated_at = ?
       WHERE id = ?;`,
      [
        paidDate,
        Date.now(),
        nextDueDate,
        txId,
        JSON.stringify(history),
        Date.now(),
        billId,
      ]
    );
    log('[SQLite] Successfully marked bill as paid in SQLite:', billId);
  } catch (err) {
    warn('[SQLite] Error marking bill as paid in SQLite:', err);
  }
}

/**
 * Reverts a bill's paid status, restores previous due date, and unlinks the transaction.
 */
export function undoBillPaymentInSQLite(
  billId: string,
  txId: string,
  prevDueDate?: string
): void {
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    const existing = db.getFirstSync<{ paymentHistory: string; nextDueDate: string }>(
      'SELECT paymentHistory, nextDueDate FROM recurring_bills WHERE id = ?;',
      [billId]
    );

    let history: any[] = [];
    if (existing?.paymentHistory) {
      try {
        history = JSON.parse(existing.paymentHistory);
      } catch {}
    }
    const filteredHistory = history.filter((p) => p.transactionId !== txId);
    const targetDue = prevDueDate || existing?.nextDueDate || '';

    db.runSync(
      `UPDATE recurring_bills 
       SET status = 'pending',
           linkedTransactionId = NULL,
           nextDueDate = CASE WHEN ? != '' THEN ? ELSE nextDueDate END,
           paymentHistory = ?,
           updated_at = ?
       WHERE id = ?;`,
      [
        targetDue,
        targetDue,
        JSON.stringify(filteredHistory),
        Date.now(),
        billId,
      ]
    );
    log('[SQLite] Successfully undid bill payment in SQLite:', billId);
  } catch (err) {
    warn('[SQLite] Error undoing bill payment in SQLite:', err);
  }
}

/**
 * Deletes a recurring bill from SQLite.
 */
export function deleteRecurringBillFromSQLite(billId: string): void {
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    db.runSync('DELETE FROM recurring_bills WHERE id = ?;', [billId]);
  } catch (err) {
    warn('[SQLite] Error deleting bill from SQLite:', err);
  }
}

/**
 * Gets a setting value from SQLite.
 */
export function getSQLiteSetting(key: string, defaultValue: string = ''): string {
  if (Platform.OS === 'web') return defaultValue;
  try {
    const db = getAutoAddDatabase();
    if (!db) return defaultValue;
    const row = db.getFirstSync<{ value: string }>(
      'SELECT value FROM auto_add_settings WHERE key = ?;',
      [key]
    );
    return row?.value ?? defaultValue;
  } catch (err) {
    warn('[SQLite] Error getting setting:', err);
    return defaultValue;
  }
}

/**
 * Sets a setting value in SQLite.
 */
export function setSQLiteSetting(key: string, value: string): void {
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    db.runSync(
      'INSERT OR REPLACE INTO auto_add_settings (key, value) VALUES (?, ?);',
      [key, value]
    );
  } catch (err) {
    warn('[SQLite] Error saving setting:', err);
  }
}

/**
 * Clears all auto-added transactions and pending alerts from SQLite.
 */
export function clearSQLiteAutoAddData(): void {
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    db.execSync(`
      DELETE FROM auto_added_transactions;
      DELETE FROM auto_add_pending_alerts;
    `);
  } catch (err) {
    warn('[SQLite] Error clearing tables:', err);
  }
}

// ---------------------------------------------------------------------------
// Auto-Add Notification Diagnostics Log (notif_log)
// ---------------------------------------------------------------------------

export interface NotifLogEntry {
  id?: number;
  timestamp: number;
  packageName: string;
  parsedStatus: 'ok' | 'failed' | 'dropped';
  reasonSkipped: 'autoAddOff' | 'paused' | 'filteredOut' | 'duplicate' | 'parseFailed' | 'saved';
  summary: string;
  rawSnippet?: string;
  created_at?: number;
}

let memoryNotifLogs: NotifLogEntry[] = [];

/**
 * Inserts a diagnostic record into notif_log table and prunes to keep last 100 entries.
 * Never throws, ensuring headless task execution never crashes on logging.
 */
export function insertNotifLog(entry: Omit<NotifLogEntry, 'id' | 'created_at'>): void {
  const createdAt = Date.now();
  if (Platform.OS === 'web') {
    memoryNotifLogs.unshift({ ...entry, id: createdAt, created_at: createdAt });
    if (memoryNotifLogs.length > 100) memoryNotifLogs.pop();
    return;
  }
  try {
    const db = getAutoAddDatabase();
    if (!db) {
      memoryNotifLogs.unshift({ ...entry, id: createdAt, created_at: createdAt });
      if (memoryNotifLogs.length > 100) memoryNotifLogs.pop();
      return;
    }

    db.runSync(
      `INSERT INTO notif_log (timestamp, packageName, parsedStatus, reasonSkipped, summary, rawSnippet, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        entry.timestamp || Date.now(),
        entry.packageName || 'unknown',
        entry.parsedStatus || 'dropped',
        entry.reasonSkipped || null,
        entry.summary || '',
        entry.rawSnippet ? entry.rawSnippet.substring(0, 150) : null,
        createdAt,
      ]
    );

    // Keep only the most recent 100 entries
    db.runSync(
      `DELETE FROM notif_log WHERE id NOT IN (
         SELECT id FROM notif_log ORDER BY id DESC LIMIT 100
       );`
    );
  } catch (err) {
    warn('[SQLite] Error inserting into notif_log:', err);
  }
}

/**
 * Returns recent diagnostic log entries from notif_log (most recent first).
 */
export function getRecentNotifLogs(limit: number = 100): NotifLogEntry[] {
  if (Platform.OS === 'web') {
    return memoryNotifLogs.slice(0, limit);
  }
  try {
    const db = getAutoAddDatabase();
    if (!db) return memoryNotifLogs.slice(0, limit);
    const rows = db.getAllSync<NotifLogEntry>(
      `SELECT * FROM notif_log ORDER BY id DESC LIMIT ?;`,
      [limit]
    );
    return rows || [];
  } catch (err) {
    warn('[SQLite] Error querying notif_log:', err);
    return memoryNotifLogs.slice(0, limit);
  }
}

/**
 * Clears the diagnostics notif_log table.
 */
export function clearNotifLogs(): void {
  memoryNotifLogs = [];
  if (Platform.OS === 'web') return;
  try {
    const db = getAutoAddDatabase();
    if (!db) return;
    db.runSync('DELETE FROM notif_log;');
  } catch (err) {
    warn('[SQLite] Error clearing notif_log:', err);
  }
}

