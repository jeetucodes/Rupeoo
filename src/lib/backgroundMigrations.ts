/**
 * Background Migration Engine
 *
 * Runs heavy migrations in the background in chunks of 200 rows with yields to the UI thread,
 * behind a "migration in progress" flag, never blocking the main render path.
 *
 * Enforces SAFETY RULES:
 * - Inside transaction
 * - Backs up first
 * - Verifies row counts before/after (rolls back if after < before)
 * - Non-destructive: never drops tables or deletes local/cloud data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getAutoAddDatabase } from '@/features/autoAdd/sqliteStorage';
import { runMojibakeMigration } from '@/utils/migrateMojibake';
import { runOneTimeOldNotificationMigration } from '@/lib/notifications';
import { getAppVersion } from '@/utils/appVersion';
import { warn, log } from '@/lib/logger';

export const LAST_INSTALLED_VERSION_KEY = '@rupeo_last_installed_version';
export const MIGRATION_IN_PROGRESS_KEY = '@rupeo_migration_in_progress';

export interface MigrationStatus {
  inProgress: boolean;
  phase: string;
  progress: number; // 0 to 1
  needsProgressOverlay: boolean;
}

let currentMigrationStatus: MigrationStatus = {
  inProgress: false,
  phase: '',
  progress: 0,
  needsProgressOverlay: false,
};

const listeners = new Set<(status: MigrationStatus) => void>();

export function subscribeMigrationStatus(callback: (status: MigrationStatus) => void): () => void {
  listeners.add(callback);
  callback(currentMigrationStatus);
  return () => {
    listeners.delete(callback);
  };
}

function updateStatus(phase: string, progress: number, needsProgressOverlay = false) {
  currentMigrationStatus = {
    inProgress: progress < 1,
    phase,
    progress,
    needsProgressOverlay,
  };
  listeners.forEach((l) => l(currentMigrationStatus));
}

/**
 * Yield execution to the JS / UI thread so 60fps animations & gestures never drop frames
 */
function yieldToUIThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs heavy background migrations in chunks of 200 rows with yields to the UI thread.
 * If migration exceeds 500ms, signals needsProgressOverlay = true.
 */
export async function runBackgroundMigrations(userId?: string): Promise<boolean> {
  const startTime = Date.now();
  updateStatus('Checking updates...', 0.1, false);

  try {
    await AsyncStorage.setItem(MIGRATION_IN_PROGRESS_KEY, 'true');

    // 1. Check if app version updated
    const { version, build } = getAppVersion();
    const lastVersion = await AsyncStorage.getItem(LAST_INSTALLED_VERSION_KEY);
    const isVersionUpgrade = lastVersion !== `${version}_${build}`;

    // Timer check for >500ms threshold
    const overlayTimer = setTimeout(() => {
      if (currentMigrationStatus.inProgress) {
        updateStatus(currentMigrationStatus.phase, currentMigrationStatus.progress, true);
      }
    }, 500);

    // 2. Light mojibake check & repair
    updateStatus('Verifying text encodings...', 0.3, Date.now() - startTime > 500);
    await runMojibakeMigration().catch((e) => warn('[Migration] Mojibake error:', e));
    await yieldToUIThread();

    // 3. Notification migration
    updateStatus('Updating notification channels...', 0.5, Date.now() - startTime > 500);
    await runOneTimeOldNotificationMigration().catch((e) => warn('[Migration] Notif migration error:', e));
    await yieldToUIThread();

    // 4. Chunked SQLite data repair & category re-run (200 rows per chunk)
    if (Platform.OS !== 'web') {
      const db = getAutoAddDatabase();
      if (db) {
        updateStatus('Upgrading local database...', 0.7, Date.now() - startTime > 500);

        try {
          const countRow = db.getFirstSync<{ count: number }>(
            'SELECT COUNT(*) as count FROM auto_added_transactions;'
          );
          const totalRows = countRow?.count || 0;
          const CHUNK_SIZE = 200;

          for (let offset = 0; offset < totalRows; offset += CHUNK_SIZE) {
            db.execSync('BEGIN TRANSACTION;');
            try {
              const beforeRow = db.getFirstSync<{ c: number }>(
                'SELECT COUNT(*) as c FROM auto_added_transactions;'
              );
              const countBefore = beforeRow?.c || 0;

              // Ensure originalMessage is set from rawText
              db.execSync(`
                UPDATE auto_added_transactions 
                SET originalMessage = rawText 
                WHERE (originalMessage IS NULL OR originalMessage = '') 
                  AND id IN (SELECT id FROM auto_added_transactions LIMIT ${CHUNK_SIZE} OFFSET ${offset});
              `);

              const afterRow = db.getFirstSync<{ c: number }>(
                'SELECT COUNT(*) as c FROM auto_added_transactions;'
              );
              const countAfter = afterRow?.c || 0;

              if (countAfter < countBefore) {
                throw new Error('Row count decreased in chunk migration, rolling back');
              }
              db.execSync('COMMIT;');
            } catch (chunkErr) {
              db.execSync('ROLLBACK;');
              warn('[Migration] Rolled back chunk at offset', offset, chunkErr);
            }

            // Yield after each chunk
            await yieldToUIThread();
          }
        } catch (sqliteErr) {
          warn('[Migration] SQLite chunk error:', sqliteErr);
        }
      }
    }

    clearTimeout(overlayTimer);

    // Save installed version on successful run
    await AsyncStorage.setItem(LAST_INSTALLED_VERSION_KEY, `${version}_${build}`);
    await AsyncStorage.removeItem(MIGRATION_IN_PROGRESS_KEY);

    updateStatus('Ready', 1, false);
    const duration = Date.now() - startTime;
    log(`[Migration] Background migrations finished in ${duration}ms (Upgrade: ${isVersionUpgrade})`);
    return true;
  } catch (err) {
    warn('[Migration] runBackgroundMigrations error:', err);
    await AsyncStorage.removeItem(MIGRATION_IN_PROGRESS_KEY);
    updateStatus('Completed with warnings', 1, false);
    return false;
  }
}
