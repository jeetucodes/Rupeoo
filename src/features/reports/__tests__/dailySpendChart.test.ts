import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatCompactNumberIndian,
  calculateYAxisTicks,
  calculateDailySpendingSummary,
  formatBarAccessibilityLabel,
  formatBarTooltipText,
  generateRollingDateSlots,
} from '../dailySpendCore.ts';
import type { DailySpendBarPoint } from '../dailySpendCore.ts';

describe('Daily Spend & Average Chart - Pure Core & Calculations', () => {
  // 1. Average calculation for 7 / 14 / 30
  describe('Average calculation for 7 / 14 / 30 days', () => {
    it('calculates average correctly for 7-day range (total / 7)', () => {
      const mockPoints: DailySpendBarPoint[] = generateRollingDateSlots(7, new Date('2026-10-24T12:00:00Z'));
      // Assign known spends: Total = 4,200
      mockPoints[0].amount = 1000;
      mockPoints[1].amount = 500;
      mockPoints[2].amount = 700;
      mockPoints[3].amount = 0;
      mockPoints[4].amount = 2000;
      mockPoints[5].amount = 0;
      mockPoints[6].amount = 0;

      const summary = calculateDailySpendingSummary(mockPoints, 7);
      assert.strictEqual(summary.totalSpend, 4200);
      // 4200 / 7 = 600
      assert.strictEqual(summary.avgDailySpend, 600);
      assert.strictEqual(summary.rangeDays, 7);
    });

    it('calculates average correctly for 14-day range (total / 14)', () => {
      const mockPoints: DailySpendBarPoint[] = generateRollingDateSlots(14, new Date('2026-10-24T12:00:00Z'));
      // Total = 7,000
      mockPoints[0].amount = 3500;
      mockPoints[5].amount = 3500;

      const summary = calculateDailySpendingSummary(mockPoints, 14);
      assert.strictEqual(summary.totalSpend, 7000);
      // 7000 / 14 = 500
      assert.strictEqual(summary.avgDailySpend, 500);
      assert.strictEqual(summary.rangeDays, 14);
    });

    it('calculates average correctly for 30-day range (total / 30)', () => {
      const mockPoints: DailySpendBarPoint[] = generateRollingDateSlots(30, new Date('2026-10-24T12:00:00Z'));
      // Total = 15,000
      mockPoints[10].amount = 9000;
      mockPoints[20].amount = 6000;

      const summary = calculateDailySpendingSummary(mockPoints, 30);
      assert.strictEqual(summary.totalSpend, 15000);
      // 15000 / 30 = 500
      assert.strictEqual(summary.avgDailySpend, 500);
      assert.strictEqual(summary.rangeDays, 30);
    });

    it('handles rounding when average has fractional rupees', () => {
      const mockPoints: DailySpendBarPoint[] = generateRollingDateSlots(7, new Date('2026-10-24T12:00:00Z'));
      // Total = 1000 -> 1000 / 7 = 142.857... -> Math.round = 143
      mockPoints[0].amount = 1000;

      const summary = calculateDailySpendingSummary(mockPoints, 7);
      assert.strictEqual(summary.totalSpend, 1000);
      assert.strictEqual(summary.avgDailySpend, 143);
    });

    it('handles all-zero spending period gracefully', () => {
      const mockPoints: DailySpendBarPoint[] = generateRollingDateSlots(7, new Date('2026-10-24T12:00:00Z'));
      const summary = calculateDailySpendingSummary(mockPoints, 7);
      assert.strictEqual(summary.totalSpend, 0);
      assert.strictEqual(summary.avgDailySpend, 0);
      assert.strictEqual(summary.peakSpend, 0);
    });
  });

  // 2. Peak Detection
  describe('Peak detection', () => {
    it('detects peak spend, peak day name, and date correctly', () => {
      const mockPoints: DailySpendBarPoint[] = generateRollingDateSlots(7, new Date('2026-10-24T12:00:00Z'));
      mockPoints[2].amount = 3390;
      mockPoints[2].dayName = 'Thu';
      mockPoints[2].dayNum = 22;
      mockPoints[2].label = '22 Oct';

      mockPoints[4].amount = 1500;

      const summary = calculateDailySpendingSummary(mockPoints, 7);
      assert.strictEqual(summary.peakSpend, 3390);
      assert.strictEqual(summary.peakDayName, 'Thu');
      assert.strictEqual(summary.peakDayLabel, '22 Oct');
    });

    it('detects the first peak when multiple days share the same peak amount', () => {
      const mockPoints: DailySpendBarPoint[] = generateRollingDateSlots(7, new Date('2026-10-24T12:00:00Z'));
      mockPoints[1].amount = 2500;
      mockPoints[1].dayName = 'Mon';
      mockPoints[1].label = '19 Oct';

      mockPoints[3].amount = 2500;
      mockPoints[3].dayName = 'Wed';
      mockPoints[3].label = '21 Oct';

      const summary = calculateDailySpendingSummary(mockPoints, 7);
      assert.strictEqual(summary.peakSpend, 2500);
      assert.strictEqual(summary.peakDayName, 'Mon');
      assert.strictEqual(summary.peakDayLabel, '19 Oct');
    });
  });

  // 3. Y-axis ticks for max 3390 and max 0
  describe('Y axis ticks calculation', () => {
    it('calculates ticks starting at 0 for max 3390', () => {
      const { maxTick, ticks } = calculateYAxisTicks(3390);
      assert.strictEqual(ticks[0], 0, 'Y-axis must always start at 0');
      assert.ok(maxTick >= 3390, 'maxTick must be greater than or equal to 3390');
      assert.ok(ticks.length >= 3 && ticks.length <= 5, 'Should have 3-4 evenly spaced nice ticks');
      // Step size should be uniform
      const step = ticks[1] - ticks[0];
      for (let i = 1; i < ticks.length; i++) {
        assert.strictEqual(ticks[i] - ticks[i - 1], step, 'Ticks must be evenly spaced');
      }
    });

    it('calculates ticks for max 0 (empty week or no data)', () => {
      const { maxTick, ticks } = calculateYAxisTicks(0);
      assert.strictEqual(ticks[0], 0, 'Y-axis must start at 0');
      assert.ok(maxTick > 0, 'maxTick should have a sensible fallback > 0');
      assert.ok(ticks.length >= 3, 'Should have at least 3 ticks for baseline rendering');
      assert.deepStrictEqual(ticks, [0, 500, 1000]);
    });

    it('calculates ticks for negative or NaN values safely', () => {
      const { ticks } = calculateYAxisTicks(-50);
      assert.strictEqual(ticks[0], 0);
      assert.deepStrictEqual(ticks, [0, 500, 1000]);
    });
  });

  // 4. Label Formatter (999, 1000, 125000)
  describe('Indian compact number label formatter', () => {
    it('formats 0 as "0"', () => {
      assert.strictEqual(formatCompactNumberIndian(0), '0');
    });

    it('formats 999 as "999"', () => {
      assert.strictEqual(formatCompactNumberIndian(999), '999');
    });

    it('formats 1000 as "1k"', () => {
      assert.strictEqual(formatCompactNumberIndian(1000), '1k');
    });

    it('formats 2500 as "2.5k"', () => {
      assert.strictEqual(formatCompactNumberIndian(2500), '2.5k');
    });

    it('formats 125000 as "1.25L"', () => {
      assert.strictEqual(formatCompactNumberIndian(125000), '1.25L');
    });

    it('formats 120000 as "1.2L"', () => {
      assert.strictEqual(formatCompactNumberIndian(120000), '1.2L');
    });

    it('formats 200000 as "2L"', () => {
      assert.strictEqual(formatCompactNumberIndian(200000), '2L');
    });

    it('formats 10000000 as "1Cr"', () => {
      assert.strictEqual(formatCompactNumberIndian(10000000), '1Cr');
    });
  });

  // 5. Tooltip & Accessibility Text Formatting
  describe('Tooltip and accessibility formatting', () => {
    const samplePoint: DailySpendBarPoint = {
      dateStr: '2026-10-22',
      dayNum: 22,
      dayName: 'Thu',
      fullDayName: 'Thursday',
      monthShort: 'Oct',
      fullMonthName: 'October',
      label: '22 Oct',
      fullDateLabel: 'Thu, 22 Oct',
      amount: 3390,
      isToday: false,
      isFuture: false,
    };

    it('formats peak tooltip correctly: "Peak ₹3,390, Thu 22"', () => {
      const peakText = formatBarTooltipText(samplePoint, '₹3,390', true);
      assert.strictEqual(peakText, 'Peak ₹3,390, Thu 22');
    });

    it('formats regular tapped bar tooltip correctly', () => {
      const regularText = formatBarTooltipText(samplePoint, '₹3,390', false);
      assert.strictEqual(regularText, 'Thu, 22 Oct • ₹3,390');
    });

    it('formats accessibilityLabel correctly: "Thursday 22 October, 3,390 rupees"', () => {
      const accessLabel = formatBarAccessibilityLabel(samplePoint, 'rupees');
      assert.strictEqual(accessLabel, 'Thursday 22 October, 3,390 rupees');
    });
  });
});
