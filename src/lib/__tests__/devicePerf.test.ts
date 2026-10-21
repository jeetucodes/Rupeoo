import test from 'node:test';
import assert from 'node:assert';
import { computeIsLowEndDevice } from '../devicePerfCore.ts';

test('Device Performance & Low-End Mode Unit Tests', async (t) => {
  await t.test('1. iOS device is never classified as low-end Android', () => {
    const result = computeIsLowEndDevice({
      platformOS: 'ios',
      totalMemory: 2 * 1024 * 1024 * 1024,
      platformVersion: 15,
    });
    assert.strictEqual(result, false);
  });

  await t.test('2. Android device with < 3GB RAM is classified as low-end', () => {
    const result = computeIsLowEndDevice({
      platformOS: 'android',
      totalMemory: 2 * 1024 * 1024 * 1024, // 2GB RAM
      platformVersion: 30,
      deviceYearClass: 2021,
    });
    assert.strictEqual(result, true);
  });

  await t.test('3. Android device with >= 3GB RAM and modern OS is NOT low-end', () => {
    const result = computeIsLowEndDevice({
      platformOS: 'android',
      totalMemory: 4 * 1024 * 1024 * 1024, // 4GB RAM
      platformVersion: 33, // Android 13
      deviceYearClass: 2022,
    });
    assert.strictEqual(result, false);
  });

  await t.test('4. Android device with older API level (<= 28 / Android 9) is low-end', () => {
    const result = computeIsLowEndDevice({
      platformOS: 'android',
      totalMemory: 4 * 1024 * 1024 * 1024,
      platformVersion: 28, // Android 9
    });
    assert.strictEqual(result, true);
  });

  await t.test('5. Android device with year class <= 2018 is low-end', () => {
    const result = computeIsLowEndDevice({
      platformOS: 'android',
      totalMemory: 4 * 1024 * 1024 * 1024,
      platformVersion: 29,
      deviceYearClass: 2017,
    });
    assert.strictEqual(result, true);
  });
});
