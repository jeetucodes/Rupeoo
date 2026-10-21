import test from 'node:test';
import assert from 'node:assert';
import { determineUpdateMode } from '../appUpdateCore.ts';

test('App Update Logic Unit Tests', async (t) => {
  const baseTime = 1700000000000; // Fixed timestamp for deterministic testing
  const oneHourMs = 60 * 60 * 1000;

  await t.test('1. Installed version equal to latest and min -> returns NONE', () => {
    const res = determineUpdateMode({
      installedVersionCode: 35,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      now: baseTime,
    });
    assert.strictEqual(res, 'NONE');
  });

  await t.test('2. Installed version greater than latest -> returns NONE', () => {
    const res = determineUpdateMode({
      installedVersionCode: 36,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      now: baseTime,
    });
    assert.strictEqual(res, 'NONE');
  });

  await t.test('3. Installed version less than minSupportedVersionCode -> returns FORCE', () => {
    const res = determineUpdateMode({
      installedVersionCode: 29,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      now: baseTime,
    });
    assert.strictEqual(res, 'FORCE');
  });

  await t.test('4. FORCE mode ignores cooldown and always prompts', () => {
    const res = determineUpdateMode({
      installedVersionCode: 25,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      lastPromptedAt: baseTime - 1000, // Prompted 1 second ago
      cooldownHours: 24,
      now: baseTime,
    });
    assert.strictEqual(res, 'FORCE');
  });

  await t.test('5. Installed version less than latestVersionCode without previous prompt -> returns SOFT', () => {
    const res = determineUpdateMode({
      installedVersionCode: 34,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      lastPromptedAt: null,
      cooldownHours: 24,
      now: baseTime,
    });
    assert.strictEqual(res, 'SOFT');
  });

  await t.test('6. SOFT update within 24h cooldown -> returns NONE', () => {
    const res = determineUpdateMode({
      installedVersionCode: 34,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      lastPromptedAt: baseTime - (12 * oneHourMs), // Prompted 12 hours ago
      cooldownHours: 24,
      now: baseTime,
    });
    assert.strictEqual(res, 'NONE');
  });

  await t.test('7. SOFT update after 24h cooldown expired -> returns SOFT', () => {
    const res = determineUpdateMode({
      installedVersionCode: 34,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      lastPromptedAt: baseTime - (25 * oneHourMs), // Prompted 25 hours ago
      cooldownHours: 24,
      now: baseTime,
    });
    assert.strictEqual(res, 'SOFT');
  });

  await t.test('8. Custom cooldownHours (e.g. 6 hours)', () => {
    // 4 hours ago -> still in cooldown
    const res1 = determineUpdateMode({
      installedVersionCode: 34,
      latestVersionCode: 35,
      lastPromptedAt: baseTime - (4 * oneHourMs),
      cooldownHours: 6,
      now: baseTime,
    });
    assert.strictEqual(res1, 'NONE');

    // 7 hours ago -> cooldown passed
    const res2 = determineUpdateMode({
      installedVersionCode: 34,
      latestVersionCode: 35,
      lastPromptedAt: baseTime - (7 * oneHourMs),
      cooldownHours: 6,
      now: baseTime,
    });
    assert.strictEqual(res2, 'SOFT');
  });

  await t.test('9. Missing remote version fields -> returns NONE', () => {
    const res1 = determineUpdateMode({
      installedVersionCode: 35,
      latestVersionCode: undefined,
      minSupportedVersionCode: undefined,
      now: baseTime,
    });
    assert.strictEqual(res1, 'NONE');

    const res2 = determineUpdateMode({
      installedVersionCode: 0,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      now: baseTime,
    });
    assert.strictEqual(res2, 'NONE');
  });

  await t.test('10. Precedence: when installed < min AND installed < latest -> FORCE wins', () => {
    const res = determineUpdateMode({
      installedVersionCode: 20,
      latestVersionCode: 40,
      minSupportedVersionCode: 30,
      now: baseTime,
    });
    assert.strictEqual(res, 'FORCE');
  });

  await t.test('11. Exact boundary: installed == minSupportedVersionCode and installed < latest -> SOFT', () => {
    const res = determineUpdateMode({
      installedVersionCode: 30,
      latestVersionCode: 35,
      minSupportedVersionCode: 30,
      lastPromptedAt: null,
      now: baseTime,
    });
    assert.strictEqual(res, 'SOFT');
  });
});
