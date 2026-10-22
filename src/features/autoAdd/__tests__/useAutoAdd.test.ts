import test from 'node:test';
import assert from 'node:assert';
import {
  calculatePauseTimestamp,
  formatCountdownMinutes,
  formatResumeTime,
} from '../autoAddCore.ts';

test('useAutoAdd utility functions suite', async (t) => {
  await t.test('1. calculatePauseTimestamp calculates correct future times', () => {
    const fixedNow = 1700000000000;

    // 30m
    const pause30m = calculatePauseTimestamp('30m', fixedNow);
    assert.strictEqual(pause30m, fixedNow + 30 * 60 * 1000);

    // 1h
    const pause1h = calculatePauseTimestamp('1h', fixedNow);
    assert.strictEqual(pause1h, fixedNow + 60 * 60 * 1000);

    // custom minutes (e.g. 45m)
    const pause45m = calculatePauseTimestamp(45, fixedNow);
    assert.strictEqual(pause45m, fixedNow + 45 * 60 * 1000);

    // tomorrow at 8 AM
    const pauseTomorrow = calculatePauseTimestamp('tomorrow', fixedNow);
    const tomorrowDate = new Date(pauseTomorrow);
    assert.strictEqual(tomorrowDate.getHours(), 8);
    assert.strictEqual(tomorrowDate.getMinutes(), 0);
    assert.ok(pauseTomorrow > fixedNow);
  });

  await t.test('2. formatCountdownMinutes formats clean compact time labels', () => {
    const now = 1700000000000;

    // 42 minutes
    const ms42m = now + 42 * 60 * 1000;
    assert.strictEqual(formatCountdownMinutes(ms42m, now), '42m');

    // 1 minute
    const ms1m = now + 60 * 1000;
    assert.strictEqual(formatCountdownMinutes(ms1m, now), '1m');

    // 60 minutes = 1h
    const ms60m = now + 60 * 60 * 1000;
    assert.strictEqual(formatCountdownMinutes(ms60m, now), '1h');

    // 75 minutes = 1h 15m
    const ms75m = now + 75 * 60 * 1000;
    assert.strictEqual(formatCountdownMinutes(ms75m, now), '1h 15m');

    // 120 minutes = 2h
    const ms120m = now + 120 * 60 * 1000;
    assert.strictEqual(formatCountdownMinutes(ms120m, now), '2h');

    // Past or 0 -> empty string
    assert.strictEqual(formatCountdownMinutes(now - 1000, now), '');
    assert.strictEqual(formatCountdownMinutes(0, now), '');
  });

  await t.test('3. formatResumeTime returns formatted string for valid timestamps', () => {
    const future = Date.now() + 60 * 60 * 1000;
    const formatted = formatResumeTime(future);
    assert.ok(typeof formatted === 'string' && formatted.length > 0);

    // Returns empty string for past or 0
    assert.strictEqual(formatResumeTime(0), '');
    assert.strictEqual(formatResumeTime(Date.now() - 5000), '');
  });
});
