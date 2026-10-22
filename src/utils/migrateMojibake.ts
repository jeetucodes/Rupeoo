/**
 * One-time migration to clean up broken mojibake encoding in stored data.
 * Checks and fixes:
 *  - AsyncStorage (@rupeo_offline_txs_*, @rupeo_offline_categories_*, @rupeo_bills_*, @rupeo_settings_*)
 *  - SQLite (auto_added_transactions, auto_add_pending_alerts, recurring_bills)
 *
 * Runs only once per device installation using the '@rupeo_mojibake_migrated_v1' flag.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getAutoAddDatabase } from '../features/autoAdd/sqliteStorage.ts';
import { warn, log } from '../lib/logger.ts';
import { RUPEE_SYMBOL, cleanMojibakeString, cleanMojibakeRecursive } from './mojibake.ts';

export { RUPEE_SYMBOL, cleanMojibakeString, cleanMojibakeRecursive };

const MIGRATION_FLAG_KEY = '@rupeo_mojibake_migrated_v1';

export async function runMojibakeMigration(): Promise<boolean> {
  try {
    const alreadyRun = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (alreadyRun === 'true') {
      return false; // Migration already completed
    }

    log('[Migration] Starting one-time mojibake data repair migration...');

    // 1. Repair AsyncStorage
    const allKeys = await AsyncStorage.getAllKeys();
    const relevantKeys = allKeys.filter((k) =>
      k.startsWith('@rupeo_offline_txs_') ||
      k.startsWith('@rupeo_offline_categories_') ||
      k.startsWith('@rupeo_bills_') ||
      k.startsWith('@rupeo_udhar_') ||
      k.startsWith('@rupeo_settings_')
    );

    for (const key of relevantKeys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const cleaned = cleanMojibakeString(raw);
          if (cleaned !== raw) {
            await AsyncStorage.setItem(key, cleaned);
            log(`[Migration] Repaired mojibake in AsyncStorage key: ${key}`);
          }
        }
      } catch (err) {
        warn(`[Migration] Failed to repair AsyncStorage key ${key}:`, err);
      }
    }

    // 2. Repair SQLite (Android/iOS only)
    if (Platform.OS !== 'web') {
      try {
        const db = getAutoAddDatabase();
        if (db) {
          db.execSync(`
            UPDATE auto_added_transactions
            SET rawText = REPLACE(REPLACE(rawText, '\u00E2\u201A\u00B9', '\u20B9'), '\u00E2,\u00B9', '\u20B9'),
                merchant = REPLACE(REPLACE(merchant, '\u00E2\u201A\u00B9', '\u20B9'), '\u00E2,\u00B9', '\u20B9')
            WHERE rawText LIKE '%\u00E2%' OR merchant LIKE '%\u00E2%';

            UPDATE auto_add_pending_alerts
            SET rawText = REPLACE(REPLACE(rawText, '\u00E2\u201A\u00B9', '\u20B9'), '\u00E2,\u00B9', '\u20B9')
            WHERE rawText LIKE '%\u00E2%';

            UPDATE recurring_bills
            SET title = REPLACE(REPLACE(title, '\u00E2\u201A\u00B9', '\u20B9'), '\u00E2,\u00B9', '\u20B9')
            WHERE title LIKE '%\u00E2%';
          `);
          log('[Migration] Repaired mojibake in SQLite tables');
        }
      } catch (sqlErr) {
        warn('[Migration] SQLite repair notice:', sqlErr);
      }
    }

    // Mark migration completed
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    log('[Migration] Mojibake repair migration completed successfully');
    return true;
  } catch (err) {
    warn('[Migration] runMojibakeMigration error:', err);
    return false;
  }
}
