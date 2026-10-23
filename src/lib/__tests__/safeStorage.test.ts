import test from 'node:test';
import assert from 'node:assert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  safeJsonParse,
  safeAsyncStorageGet,
  safeAsyncStorageSet,
  withTimeout,
  backupCorruptValue,
  repairCorruptedStorageKeys,
} from '../safeStorage.ts';

// In-memory mock backing for AsyncStorage under Node.js test environment
const memoryStore = new Map<string, string>();
AsyncStorage.getItem = async (key: string) => memoryStore.get(key) ?? null;
AsyncStorage.setItem = async (key: string, value: string) => {
  memoryStore.set(key, String(value));
};
AsyncStorage.removeItem = async (key: string) => {
  memoryStore.delete(key);
};
AsyncStorage.getAllKeys = async () => Array.from(memoryStore.keys());
AsyncStorage.clear = async () => {
  memoryStore.clear();
};

test('SafeStorage Suite - Startup Resilience & Non-destructive Recovery', async (t) => {
  await t.beforeEach(async () => {
    await AsyncStorage.clear();
  });

  await t.test('1. safeJsonParse parses valid JSON correctly', () => {
    const json = JSON.stringify({ theme: 'light', count: 42 });
    const result = safeJsonParse(json, { theme: 'dark', count: 0 });
    assert.deepStrictEqual(result, { theme: 'light', count: 42 });
  });

  await t.test('2. safeJsonParse returns fallback on syntax error and triggers backup', async () => {
    const corruptJson = '{"broken": json...';
    const fallback = { fallback: true };
    let backedUpKey = '';

    const result = safeJsonParse(corruptJson, fallback, {
      keyForBackup: '@rupeo_test_key',
      onCorrupt: (key) => {
        backedUpKey = key;
      },
    });

    assert.deepStrictEqual(result, fallback);
    assert.strictEqual(backedUpKey, '@rupeo_test_key');
  });

  await t.test('3. safeJsonParse respects custom schema validator and rejects invalid shapes', () => {
    const invalidShape = JSON.stringify({ unexpected: 'shape' });
    const fallback = { allowed: true };

    const result = safeJsonParse(invalidShape, fallback, {
      validator: (val) => Boolean(val?.allowed),
      keyForBackup: '@rupeo_settings',
    });

    assert.deepStrictEqual(result, fallback);
  });

  await t.test('4. safeJsonParse gracefully handles null, undefined, and empty string', () => {
    assert.strictEqual(safeJsonParse(null, 'default'), 'default');
    assert.strictEqual(safeJsonParse(undefined, 'default'), 'default');
    assert.strictEqual(safeJsonParse('', 'default'), 'default');
  });

  await t.test('5. safeAsyncStorageGet retrieves stored value', async () => {
    const key = '@rupeo_valid_key';
    await AsyncStorage.setItem(key, JSON.stringify([1, 2, 3]));

    const res = await safeAsyncStorageGet(key, []);
    assert.deepStrictEqual(res, [1, 2, 3]);
  });

  await t.test('6. safeAsyncStorageGet detects corrupt storage, backs up to <key>.corrupt, and resets key', async () => {
    const key = '@rupeo_corrupt_config';
    const corruptData = '{ "invalid_raw_bytes": \x00\x01\x02 ';
    await AsyncStorage.setItem(key, corruptData);

    const fallback = { default: true };
    const res = await safeAsyncStorageGet(key, fallback);

    assert.deepStrictEqual(res, fallback);

    // Verify backup key was created
    const backup = await AsyncStorage.getItem(`${key}.corrupt`);
    assert.strictEqual(backup, corruptData);

    // Verify original corrupted key was cleared so future reads cleanly use fallback
    const original = await AsyncStorage.getItem(key);
    assert.strictEqual(original, null);
  });

  await t.test('7. withTimeout returns fallback when promise hangs', async () => {
    const hangingPromise = new Promise<string>(() => {});
    const res = await withTimeout(hangingPromise, 50, 'timed_out_fallback');
    assert.strictEqual(res, 'timed_out_fallback');
  });

  await t.test('8. repairCorruptedStorageKeys non-destructively repairs corrupted keys while preserving valid ones', async () => {
    const validKey = '@rupeo_offline_txs_user123';
    const validTxs = [{ id: 'tx_1', amount: 250 }];
    await AsyncStorage.setItem(validKey, JSON.stringify(validTxs));

    const corruptKey = '@rupeo_sms_settings_user123';
    await AsyncStorage.setItem(corruptKey, 'MALFORMED_JSON_CONTENT_#$@');

    const authKey = '@rupeo_active_user_id';
    await AsyncStorage.setItem(authKey, 'user123'); // scalar, not json

    const repairRes = await repairCorruptedStorageKeys();

    assert.ok(repairRes.corruptedKeys.includes(corruptKey));
    assert.ok(repairRes.backedUpKeys.includes(`${corruptKey}.corrupt`));

    // Confirm corrupt key was backed up
    const corruptBackup = await AsyncStorage.getItem(`${corruptKey}.corrupt`);
    assert.strictEqual(corruptBackup, 'MALFORMED_JSON_CONTENT_#$@');

    // Confirm valid transaction data was NOT touched
    const txsRaw = await AsyncStorage.getItem(validKey);
    assert.deepStrictEqual(JSON.parse(txsRaw!), validTxs);

    // Confirm scalar auth key was preserved
    const authVal = await AsyncStorage.getItem(authKey);
    assert.strictEqual(authVal, 'user123');
  });
});
