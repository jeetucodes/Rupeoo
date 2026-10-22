/**
 * Local SQLite Storage for Auto-Add System via expo-sqlite
 *
 * Persists detected alerts, auto-added transactions, and settings directly in SQLite
 * so background headless JS tasks execute reliably when the app is killed.
 */

import * as SQLite from 'expo-sqlite';
import { warn, log } from '@/lib/logger';

let sqliteDbInstance: SQLite.SQLiteDatabase | null = null;

export function getAutoAddDatabase(): SQLite.SQLiteDatabase {
  if (!sqliteDbInstance) {
    sqliteDbInstance = SQLite.openDatabaseSync('rupeo_auto_add.db');
    initDatabaseSchema(sqliteDbInstance);
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
        created_at INTEGER NOT NULL
      );
    `);
  } catch (err) {
    warn('Failed to initialize auto-add SQLite schema:', err);
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
  created_at: number;
}

/**
 * Saves an auto-added transaction to local SQLite.
 */
export function saveTransactionToSQLite(tx: SQLiteTransactionRecord): void {
  try {
    const db = getAutoAddDatabase();
    db.runSync(
      `INSERT OR REPLACE INTO auto_added_transactions 
       (id, amount, type, merchant, category, bankName, accountLast4, refNo, timestamp, channel, rawText, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
        tx.channel,
        tx.rawText,
        tx.status,
        tx.created_at || Date.now(),
      ]
    );
    log('[SQLite] Successfully saved transaction:', tx.id);
  } catch (err) {
    warn('[SQLite] Error saving transaction:', err);
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
}): void {
  try {
    const db = getAutoAddDatabase();
    db.runSync(
      `INSERT OR REPLACE INTO auto_add_pending_alerts
       (id, payKey, amount, type, merchant, category, bankName, accountLast4, refNo, timestamp, channel, confidence, rawText, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
        Date.now(),
      ]
    );
  } catch (err) {
    warn('[SQLite] Error saving pending alert:', err);
  }
}

/**
 * Gets a setting value from SQLite.
 */
export function getSQLiteSetting(key: string, defaultValue: string = ''): string {
  try {
    const db = getAutoAddDatabase();
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
  try {
    const db = getAutoAddDatabase();
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
  try {
    const db = getAutoAddDatabase();
    db.execSync(`
      DELETE FROM auto_added_transactions;
      DELETE FROM auto_add_pending_alerts;
    `);
  } catch (err) {
    warn('[SQLite] Error clearing tables:', err);
  }
}
