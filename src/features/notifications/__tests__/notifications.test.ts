import test from 'node:test';
import assert from 'node:assert';

import {
  formatStringWithPlaceholders,
  pickVariantIndex,
  resolveNotificationMessage,
  getMessageDictionary,
} from '../messages/index.ts';
import { enMessages } from '../messages/en.ts';
import { hiMessages } from '../messages/hi.ts';
import { hinglishMessages } from '../messages/hinglish.ts';
import {
  isQuietWindow,
  parseTimeString,
  getMorningTemplateKey,
  getLunchTemplateKey,
  getDailyReportTemplateKey,
  shouldTriggerBudget80,
  shouldTriggerBudgetOver,
  shouldSkipNudge,
  enforceDailyCap,
  MAX_DAILY_SCHEDULED,
} from '../rules.ts';
import type { NotificationPlaceholders } from '../types.ts';

test('Notification System Unit Tests', async (t) => {
  const samplePlaceholders: NotificationPlaceholders = {
    name: 'Jeetu',
    spent: '₹450.00',
    budget: '₹1,000.00',
    left: '₹550.00',
    over: '₹100.00',
    top_category: 'Food',
    top_amount: '₹250.00',
    count: 4,
    biggest: '₹250.00',
    amount: '₹120.00',
    merchant: 'Starbucks',
  };

  // 1. Template Rendering in EN with all placeholders
  await t.test('1. Template rendering in English replaces all placeholders correctly', () => {
    const raw = 'Hey {name}, you spent {spent} of {budget}. {left} left. Top: {top_category} ({top_amount}) across {count} items. Biggest: {biggest}. Debited {amount} at {merchant}.';
    const rendered = formatStringWithPlaceholders(raw, samplePlaceholders);

    assert.ok(rendered.includes('Jeetu'), 'Must include name');
    assert.ok(rendered.includes('₹450.00'), 'Must include spent');
    assert.ok(rendered.includes('₹1,000.00'), 'Must include budget');
    assert.ok(rendered.includes('₹550.00'), 'Must include left');
    assert.ok(rendered.includes('Food'), 'Must include top_category');
    assert.ok(rendered.includes('₹250.00'), 'Must include top_amount');
    assert.ok(rendered.includes('4 items'), 'Must include count');
    assert.ok(rendered.includes('Starbucks'), 'Must include merchant');
    assert.ok(!rendered.includes('{'), 'No unreplaced { brackets remain');
  });

  // 2. Template Rendering in Hindi with real Devanagari characters (UTF-8, no mojibake)
  await t.test('2. Template rendering in Hindi contains real Devanagari characters and replaces placeholders', () => {
    const raw = 'सुप्रभात {name}! आज का बजट {budget} है।';
    const rendered = formatStringWithPlaceholders(raw, samplePlaceholders);

    assert.ok(rendered.includes('सुप्रभात Jeetu!'), 'Must contain authentic Hindi text');
    assert.ok(rendered.includes('आज का बजट ₹1,000.00 है।'), 'Must replace budget placeholder');
    // Ensure no mojibake
    assert.ok(!rendered.includes('â'), 'No Windows-1252 mojibake');
    assert.ok(!rendered.includes('Ã'), 'No UTF-8 misdecoding mojibake');
  });

  // 3. Template Rendering in Hinglish
  await t.test('3. Template rendering in Hinglish is warm and friendly', () => {
    const raw = 'Good morning {name}! Aaj ka budget {budget} hai. Chalo smart kharcha karte hain ☀️';
    const rendered = formatStringWithPlaceholders(raw, samplePlaceholders);

    assert.ok(rendered.includes('Good morning Jeetu!'), 'Must include friendly greeting');
    assert.ok(rendered.includes('₹1,000.00'), 'Must include formatted budget');
  });

  // 4. All message types exist across all 3 languages (en, hi, hinglish)
  await t.test('4. All message types exist across English, Hindi, and Hinglish', () => {
    const requiredKeys = [
      'morning',
      'morning_with_budget',
      'lunch',
      'lunch_spent',
      'teatime',
      'evening',
      'report_under',
      'report_over',
      'report_zero',
      'budget_80',
      'budget_over',
      'weekly_report',
      'transaction_added',
    ];

    for (const key of requiredKeys) {
      assert.ok(enMessages[key] && enMessages[key].length >= 3, `enMessages must have >= 3 variants for ${key}`);
      assert.ok(hiMessages[key] && hiMessages[key].length >= 3, `hiMessages must have >= 3 variants for ${key}`);
      assert.ok(hinglishMessages[key] && hinglishMessages[key].length >= 3, `hinglishMessages must have >= 3 variants for ${key}`);

      // Verify each variant has non-empty title and body
      for (const variant of enMessages[key]) {
        assert.ok(variant.title.length > 0, `en ${key} title not empty`);
        assert.ok(variant.body.length > 0, `en ${key} body not empty`);
      }
      for (const variant of hiMessages[key]) {
        assert.ok(variant.title.length > 0, `hi ${key} title not empty`);
        assert.ok(variant.body.length > 0, `hi ${key} body not empty`);
      }
      for (const variant of hinglishMessages[key]) {
        assert.ok(variant.title.length > 0, `hinglish ${key} title not empty`);
        assert.ok(variant.body.length > 0, `hinglish ${key} body not empty`);
      }
    }
  });

  // 5. No variant repeat two days in a row
  await t.test('5. pickVariantIndex avoids repeating yesterday variant index', () => {
    const variantCount = 4;
    for (let prev = 0; prev < variantCount; prev++) {
      for (let iteration = 0; iteration < 20; iteration++) {
        const next = pickVariantIndex(variantCount, prev);
        assert.notStrictEqual(next, prev, `Variant index ${next} must not equal yesterday's index ${prev}`);
        assert.ok(next >= 0 && next < variantCount, `Variant index must be within range [0, ${variantCount - 1}]`);
      }
    }
  });

  // 6. resolveNotificationMessage rotates variants and renders string
  await t.test('6. resolveNotificationMessage resolves title and body with rotation', () => {
    const yesterdayIndex = 0;
    const resolved = resolveNotificationMessage('morning_with_budget', 'en', samplePlaceholders, yesterdayIndex);

    assert.ok(resolved.title.length > 0);
    assert.ok(resolved.body.includes('Jeetu'));
    assert.notStrictEqual(resolved.variantIndex, yesterdayIndex, 'Resolved variant must not repeat yesterday index');
  });

  // 7. Budget 80% threshold calculation
  await t.test('7. shouldTriggerBudget80 fires only at 80%-100% and deduplicates', () => {
    const budget = 100;

    // Below 80%: no alert
    assert.strictEqual(shouldTriggerBudget80(75, budget, false), false);

    // Exactly 80%: alert fires
    assert.strictEqual(shouldTriggerBudget80(80, budget, false), true);

    // 85%: alert fires
    assert.strictEqual(shouldTriggerBudget80(85, budget, false), true);

    // Already fired today: do not re-fire
    assert.strictEqual(shouldTriggerBudget80(85, budget, true), false);

    // Over budget (> 100): budget_80 should not fire (budget_over handles that)
    assert.strictEqual(shouldTriggerBudget80(105, budget, false), false);

    // Budget = 0: no budget alerts
    assert.strictEqual(shouldTriggerBudget80(85, 0, false), false);
  });

  // 8. Budget Over threshold calculation (fires once per day only)
  await t.test('8. shouldTriggerBudgetOver fires once per day when budget is exceeded', () => {
    const budget = 100;

    // At budget: not over
    assert.strictEqual(shouldTriggerBudgetOver(100, budget, false), false);

    // Crosses budget: fires
    assert.strictEqual(shouldTriggerBudgetOver(105, budget, false), true);

    // Already fired today: does NOT fire again
    assert.strictEqual(shouldTriggerBudgetOver(110, budget, true), false);

    // Budget = 0: disabled
    assert.strictEqual(shouldTriggerBudgetOver(500, 0, false), false);
  });

  // 9. dailyBudget = 0 handling
  await t.test('9. dailyBudget = 0 uses standard greeting without budget text', () => {
    assert.strictEqual(getMorningTemplateKey(0), 'morning');
    assert.strictEqual(getMorningTemplateKey(500), 'morning_with_budget');

    // Rendering 'morning' does not mention budget placeholder
    const msg = resolveNotificationMessage('morning', 'en', { name: 'Jeetu' });
    assert.ok(msg.body.includes('Jeetu'));
    assert.ok(!msg.body.includes('{budget}'));
  });

  // 10. Quiet Window (11:00 PM to 8:00 AM)
  await t.test('10. isQuietWindow identifies 11 PM to 8 AM correctly', () => {
    const testDate = (hour: number, minute: number = 0) => {
      const d = new Date();
      d.setHours(hour, minute, 0, 0);
      return d;
    };

    // Daytime: Active (not quiet)
    assert.strictEqual(isQuietWindow(testDate(9, 0)), false, '9:00 AM must be active');
    assert.strictEqual(isQuietWindow(testDate(13, 0)), false, '1:00 PM must be active');
    assert.strictEqual(isQuietWindow(testDate(16, 30)), false, '4:30 PM must be active');
    assert.strictEqual(isQuietWindow(testDate(20, 0)), false, '8:00 PM must be active');
    assert.strictEqual(isQuietWindow(testDate(22, 0)), false, '10:00 PM must be active');
    assert.strictEqual(isQuietWindow(testDate(22, 59)), false, '10:59 PM must be active');

    // Quiet window: 11 PM to 7:59 AM
    assert.strictEqual(isQuietWindow(testDate(23, 0)), true, '11:00 PM must be quiet');
    assert.strictEqual(isQuietWindow(testDate(23, 30)), true, '11:30 PM must be quiet');
    assert.strictEqual(isQuietWindow(testDate(0, 0)), true, '12:00 AM must be quiet');
    assert.strictEqual(isQuietWindow(testDate(3, 15)), true, '3:15 AM must be quiet');
    assert.strictEqual(isQuietWindow(testDate(7, 59)), true, '7:59 AM must be quiet');
  });

  // 11. Time string parsing
  await t.test('11. parseTimeString parses "HH:mm" strings accurately', () => {
    assert.deepStrictEqual(parseTimeString('22:00'), { hour: 22, minute: 0 });
    assert.deepStrictEqual(parseTimeString('09:30'), { hour: 9, minute: 30 });
    assert.deepStrictEqual(parseTimeString('13:45'), { hour: 13, minute: 45 });
    assert.deepStrictEqual(parseTimeString(''), { hour: 22, minute: 0 });
    assert.deepStrictEqual(parseTimeString('invalid'), { hour: 22, minute: 0 });
  });

  // 12. Smart skipping logic
  await t.test('12. shouldSkipNudge skips when recent transaction was logged < 2h ago or count >= 3 for evening', () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;

    // Logged 1 hour ago -> Skip lunch nudge
    assert.strictEqual(
      shouldSkipNudge({
        slotType: 'lunch',
        nowMs: now,
        lastTransactionTime: oneHourAgo,
        todayCount: 1,
      }),
      true
    );

    // Logged 3 hours ago -> Do NOT skip lunch nudge
    assert.strictEqual(
      shouldSkipNudge({
        slotType: 'lunch',
        nowMs: now,
        lastTransactionTime: threeHoursAgo,
        todayCount: 1,
      }),
      false
    );

    // Evening: user has already logged 3+ payments -> Skip evening nudge
    assert.strictEqual(
      shouldSkipNudge({
        slotType: 'evening',
        nowMs: now,
        lastTransactionTime: threeHoursAgo,
        todayCount: 3,
      }),
      true
    );

    // Evening: user has only logged 1 payment -> Do NOT skip evening nudge
    assert.strictEqual(
      shouldSkipNudge({
        slotType: 'evening',
        nowMs: now,
        lastTransactionTime: threeHoursAgo,
        todayCount: 1,
      }),
      false
    );
  });

  // 13. Daily Cap enforcement
  await t.test('13. enforceDailyCap respects max 6 scheduled slots per day', () => {
    assert.strictEqual(enforceDailyCap(5), true);
    assert.strictEqual(enforceDailyCap(6), true);
    assert.strictEqual(enforceDailyCap(7), false);
    assert.strictEqual(MAX_DAILY_SCHEDULED, 6);
  });

  // 14. Daily report template selection
  await t.test('14. getDailyReportTemplateKey chooses correct variant for zero spend, under, or over', () => {
    assert.strictEqual(getDailyReportTemplateKey(0, 500), 'report_zero');
    assert.strictEqual(getDailyReportTemplateKey(300, 500), 'report_under');
    assert.strictEqual(getDailyReportTemplateKey(600, 500), 'report_over');
    // When no budget set (budget = 0), non-zero spend falls back to report_under summary
    assert.strictEqual(getDailyReportTemplateKey(400, 0), 'report_under');
  });

  // 15. Transaction added notification format
  await t.test('15. transaction_added notification template formats amount and merchant properly', () => {
    const txEn = resolveNotificationMessage('transaction_added', 'en', {
      amount: '₹349.00',
      merchant: 'Swiggy',
    });
    assert.ok(txEn.body.includes('₹349.00'));
    assert.ok(txEn.body.includes('Swiggy'));

    const txHinglish = resolveNotificationMessage('transaction_added', 'hinglish', {
      amount: '₹349.00',
      merchant: 'Swiggy',
    });
    assert.ok(txHinglish.body.includes('₹349.00'));
    assert.ok(txHinglish.body.includes('Swiggy'));

    const txHi = resolveNotificationMessage('transaction_added', 'hi', {
      amount: '₹349.00',
      merchant: 'Swiggy',
    });
    assert.ok(txHi.body.includes('₹349.00'));
    assert.ok(txHi.body.includes('Swiggy'));
  });

  // 16. In-App Notification 10-item cap & pruning simulation
  await t.test('16. Notification inbox caps at 10 items and auto-prunes older alerts', () => {
    const MAX_ITEMS = 10;
    // Generate 18 simulated notifications over a chronological sequence
    const generated = Array.from({ length: 18 }, (_, i) => ({
      id: `notif_${i + 1}`,
      title: `Alert ${i + 1}`,
      message: `Message body for notification ${i + 1}`,
      type: (i % 2 === 0 ? 'reminder' : 'system') as 'reminder' | 'system',
      createdAt: new Date(Date.now() - (18 - i) * 60000).toISOString(),
      isRead: false,
    }));

    // Sort descending (latest first)
    const sorted = [...generated].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Keep top 10
    const kept = sorted.slice(0, MAX_ITEMS);
    // Excess to prune
    const excess = sorted.slice(MAX_ITEMS);

    assert.strictEqual(kept.length, 10, 'Must strictly keep 10 notifications');
    assert.strictEqual(excess.length, 8, '8 older notifications must be identified for pruning');
    assert.strictEqual(kept[0].id, 'notif_18', 'Latest notification is notif_18');
    assert.strictEqual(kept[9].id, 'notif_9', '10th notification is notif_9');
    assert.ok(!kept.some(n => n.id === 'notif_1'), 'Oldest notification notif_1 must NOT be in kept list');
  });

  // 17. Every notification type (subh-saam, auto-add, budget) resolves properly for in-app inbox
  await t.test('17. Subh-saam routines, auto-add, bills, and budget notifications produce valid inbox entries', () => {
    const types: Array<{ key: any; placeholders: NotificationPlaceholders }> = [
      { key: 'morning', placeholders: { name: 'Jeetu', budget: '₹1,500' } },
      { key: 'lunch', placeholders: { name: 'Jeetu', spent: '₹200' } },
      { key: 'teatime', placeholders: { name: 'Jeetu', spent: '₹350' } },
      { key: 'evening', placeholders: { name: 'Jeetu' } },
      { key: 'report_under', placeholders: { spent: '₹600', left: '₹900' } },
      { key: 'report_over', placeholders: { spent: '₹1,800', over: '₹300' } },
      { key: 'budget_80', placeholders: { category: 'Food', percent: '80%' } },
      { key: 'budget_over', placeholders: { category: 'Shopping', percent: '100%' } },
      { key: 'transaction_added', placeholders: { amount: '₹150.00', merchant: 'Chai Point' } },
    ];

    for (const item of types) {
      const msg = resolveNotificationMessage(item.key, 'hinglish', item.placeholders);
      assert.ok(msg.title && msg.title.trim().length > 0, `${item.key} must have non-empty title`);
      assert.ok(msg.body && msg.body.trim().length > 0, `${item.key} must have non-empty body`);
      assert.ok(!msg.body.includes('{') && !msg.body.includes('}'), `${item.key} placeholders must be replaced`);
    }
  });
});
