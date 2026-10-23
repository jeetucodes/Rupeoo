import AsyncStorage from '@react-native-async-storage/async-storage';
import { warn, log } from './logger.ts';

export interface SafeJsonParseOptions<T> {
  validator?: (val: any) => boolean;
  keyForBackup?: string;
  onCorrupt?: (key: string, raw: string, reason: string) => void;
}

/**
 * Safely backs up a corrupt raw storage value under "<key>.corrupt"
 * without deleting or wiping other user data.
 */
export async function backupCorruptValue(key: string, rawValue: string): Promise<void> {
  if (!key || typeof rawValue !== 'string') return;
  const backupKey = `${key}.corrupt`;
  try {
    await AsyncStorage.setItem(backupKey, rawValue);
    log(`[SafeStorage] Successfully backed up corrupt value for '${key}' to '${backupKey}'`);
  } catch (err) {
    warn(`[SafeStorage] Failed to backup corrupt value for '${key}':`, err);
  }
}

/**
 * Parses a JSON string safely.
 * If JSON.parse throws or the validator returns false, it:
 * 1. Backs up the raw string to "<key>.corrupt" (if keyForBackup provided).
 * 2. Emits a warning log.
 * 3. Returns the provided fallback value.
 */
export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  optionsOrKey?: SafeJsonParseOptions<T> | string,
  validator?: (val: any) => boolean
): T {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }

  const options: SafeJsonParseOptions<T> =
    typeof optionsOrKey === 'string'
      ? { keyForBackup: optionsOrKey, validator }
      : (optionsOrKey || {});

  try {
    const parsed = JSON.parse(raw);

    if (options.validator) {
      const isValid = options.validator(parsed);
      if (!isValid) {
        warn(`[SafeStorage] Schema validation failed for raw value of key '${options.keyForBackup || 'unknown'}'`);
        if (options.keyForBackup) {
          backupCorruptValue(options.keyForBackup, raw).catch(() => {});
          options.onCorrupt?.(options.keyForBackup, raw, 'schema_validation_failed');
        }
        return fallback;
      }
    }

    return parsed as T;
  } catch (parseError: any) {
    warn(`[SafeStorage] JSON parse syntax error for key '${options?.keyForBackup || 'unknown'}':`, parseError?.message);
    if (options.keyForBackup) {
      backupCorruptValue(options.keyForBackup, raw).catch(() => {});
      options.onCorrupt?.(options.keyForBackup, raw, `syntax_error: ${parseError?.message}`);
    }
    return fallback;
  }
}

/**
 * Races a promise against a timeout to prevent AsyncStorage hangs
 * on eMMC storage deadlocks during cold startup.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3000, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        warn(`[SafeStorage] AsyncStorage operation timed out after ${timeoutMs}ms; using fallback`);
        resolve(fallback);
      }
    }, timeoutMs);

    promise
      .then((val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          warn('[SafeStorage] AsyncStorage operation rejected:', err);
          resolve(fallback);
        }
      });
  });
}

/**
 * Safely reads and parses a JSON key from AsyncStorage with:
 * 1. Timeout protection (default 3000ms).
 * 2. Error handling (catches unhandled storage rejections).
 * 3. Syntax error & schema validation recovery (backs up to <key>.corrupt and falls back).
 */
export async function safeAsyncStorageGet<T>(
  key: string,
  fallback: T,
  validator?: (val: any) => boolean,
  timeoutMs: number = 3000
): Promise<T> {
  if (!key) return fallback;

  try {
    const rawPromise = AsyncStorage.getItem(key);
    const raw = await withTimeout(rawPromise, timeoutMs, null);

    if (raw === null || raw === undefined) {
      return fallback;
    }

    let isCorrupted = false;
    const parsed = safeJsonParse(raw, fallback, {
      validator,
      keyForBackup: key,
      onCorrupt: () => {
        isCorrupted = true;
      },
    });

    if (isCorrupted) {
      // Non-destructive recovery: reset the single corrupted key to cleanly use defaults next time
      try {
        await AsyncStorage.removeItem(key);
        log(`[SafeStorage] Cleared corrupted key '${key}' after backing it up to '${key}.corrupt'`);
      } catch (removeErr) {
        warn(`[SafeStorage] Failed to remove corrupted key '${key}':`, removeErr);
      }
    }

    return parsed;
  } catch (err) {
    warn(`[SafeStorage] Unexpected error reading '${key}':`, err);
    return fallback;
  }
}

/**
 * Safely writes a value to AsyncStorage with serialization and timeout protection.
 */
export async function safeAsyncStorageSet(
  key: string,
  value: any,
  timeoutMs: number = 3000
): Promise<boolean> {
  if (!key) return false;

  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const setPromise = AsyncStorage.setItem(key, serialized);
    await withTimeout(setPromise, timeoutMs, undefined);
    return true;
  } catch (err) {
    warn(`[SafeStorage] Failed to set '${key}':`, err);
    return false;
  }
}

const KNOWN_JSON_KEY_PATTERNS = [
  '@rupeo_offline_txs_',
  '@rupeo_offline_categories_',
  '@rupeo_sync_queue_',
  '@rupeo_offline_bills_',
  '@rupeo_recurring_bills_',
  '@rupeo_user_categories_',
  '@rupeo_app_config',
  '@rupeo_friends_',
  '@rupeo_udhar_entries_',
  '@rupeo_sms_settings_',
  '@rupeo_sms_hashes_',
  '@rupeo_sms_batches_',
  '@rupeo_pending_alerts_',
  '@rupeo_widget_snapshot_',
  '@rupeo_notification_settings_',
  '@rupeo_custom_templates_',
  '@rupeo_user_category_rules_v1',
  '@rupeo_ai_cat_cache_v1',
  '@rupeo_last_crash_v1',
  '@rupeo_saved_qr_cards_',
  '@rupeo_grandfathered_accounts_v1',
  '@rupeo_cached_login_hints',
];

const KNOWN_SCALAR_KEYS = [
  '@rupeo_active_user_id',
  '@rupeo_pending_redirect',
  '@rupeo_auto_add_paused_until',
  '@rupeo_cancelled_legacy_scheduled_notifs_v1',
  '@rupeo_ai_categorizer_enabled_v1',
];

export function isKeyExpectedJson(key: string, raw: string): boolean {
  if (KNOWN_SCALAR_KEYS.includes(key)) return false;
  if (key.startsWith('@rupeo_welcome_') || key.startsWith('@rupeo_last_sync_')) return false;

  const isKnownJson = KNOWN_JSON_KEY_PATTERNS.some((pat) => key.startsWith(pat));
  if (isKnownJson) return true;

  const trimmed = raw.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * Non-destructive storage repair:
 * Iterates through all AsyncStorage keys, tests JSON parsability on JSON-stored keys,
 * and if any corrupted key is found:
 * 1. Backs it up to "<key>.corrupt"
 * 2. Removes the corrupted key so defaults apply cleanly.
 *
 * NEVER touches user transaction history (@rupeo_offline_txs_*) unless backed up,
 * and NEVER deletes auth session keys.
 */
export async function repairCorruptedStorageKeys(): Promise<{
  scannedCount: number;
  corruptedKeys: string[];
  backedUpKeys: string[];
}> {
  const result = {
    scannedCount: 0,
    corruptedKeys: [] as string[],
    backedUpKeys: [] as string[],
  };

  try {
    const allKeys = await withTimeout(AsyncStorage.getAllKeys(), 4000, []);
    result.scannedCount = allKeys.length;

    for (const key of allKeys) {
      // Don't test keys that are already backups
      if (key.endsWith('.corrupt')) continue;

      // Only inspect keys prefixed with @rupeo
      if (!key.startsWith('@rupeo')) continue;

      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;

        if (!isKeyExpectedJson(key, raw)) {
          continue;
        }

        // Try parsing expected JSON
        try {
          JSON.parse(raw);
        } catch {
          result.corruptedKeys.push(key);
          const backupKey = `${key}.corrupt`;
          await AsyncStorage.setItem(backupKey, raw);
          await AsyncStorage.removeItem(key);
          result.backedUpKeys.push(backupKey);
          log(`[SafeStorage Repair] Repaired corrupted key '${key}': backed up to '${backupKey}'`);
        }
      } catch (readErr) {
        warn(`[SafeStorage Repair] Error checking key '${key}':`, readErr);
      }
    }
  } catch (scanErr) {
    warn('[SafeStorage Repair] Error scanning keys:', scanErr);
  }

  return result;
}
