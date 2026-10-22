import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchBill,
  calculateAdvancedDueDate,
  checkMerchantKeywordMatch,
} from '../matchBill.ts';

test('Bill Matcher - Comprehensive Unit Tests', async (t) => {
  // Base reference date: 2026-10-22
  const now = '2026-10-22';

  await t.test('1. Exact match + keyword (auto)', () => {
    const transaction = {
      amount: 349,
      type: 'debit',
      merchant: 'Reliance Jio Infocomm',
      rawText: 'Paid Rs 349.00 to Jio on 22-Oct via UPI',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_jio_349',
        title: 'Jio Mobile Recharge',
        amount: 349,
        category: 'Subscriptions',
        type: 'cycle_days',
        cycleDays: 28,
        provider: 'jio',
        nextDueDate: '2026-10-24', // 2 days away (within [-5, +5] window)
        status: 'pending',
        autoConfirm: true,
      },
    ];

    const result = matchBill(transaction, bills, now);

    assert.equal(result.matchType, 'auto');
    assert.equal(result.reason, 'auto_match');
    assert.equal(result.candidates.length, 1);
    assert.ok(result.suggestedBill);
    assert.equal(result.suggestedBill?.id, 'bill_jio_349');
    assert.equal(result.suggestedBill?.hasKeywordMatch, true);
    assert.ok(result.confidence >= 90); // 50 (amount) + 16 (date) + 30 (keyword)
  });

  await t.test('2. Amount-only (inbox) - merchant mismatch', () => {
    const transaction = {
      amount: 349,
      type: 'debit',
      merchant: 'Swiggy Food Delivery',
      rawText: 'Paid Rs 349.00 to Swiggy on 22-Oct',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_jio_349',
        title: 'Jio Mobile Recharge',
        amount: 349,
        category: 'Subscriptions',
        type: 'cycle_days',
        cycleDays: 28,
        provider: 'jio',
        nextDueDate: '2026-10-24',
        status: 'pending',
        autoConfirm: true,
      },
    ];

    const result = matchBill(transaction, bills, now);

    assert.equal(result.matchType, 'inbox');
    assert.equal(result.reason, 'merchant_mismatch');
    assert.equal(result.candidates.length, 1);
    assert.equal(result.suggestedBill?.id, 'bill_jio_349');
    assert.equal(result.suggestedBill?.hasKeywordMatch, false);
    assert.ok(result.confidence < 80); // No keyword bonus
  });

  await t.test('3. Two bills with same amount (inbox) - multiple candidates', () => {
    const transaction = {
      amount: 349,
      type: 'debit',
      merchant: 'UPI Payment',
      rawText: 'Paid Rs 349.00 via UPI',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_jio_349',
        title: 'Jio Prepaid',
        amount: 349,
        category: 'Subscriptions',
        nextDueDate: '2026-10-24',
        status: 'pending',
      },
      {
        id: 'bill_airtel_349',
        title: 'Airtel Prepaid',
        amount: 349,
        category: 'Subscriptions',
        nextDueDate: '2026-10-23',
        status: 'pending',
      },
    ];

    const result = matchBill(transaction, bills, now);

    assert.equal(result.matchType, 'inbox');
    assert.equal(result.reason, 'multiple_candidates');
    assert.equal(result.candidates.length, 2);
    assert.ok(result.suggestedBill);
  });

  await t.test('4. Outside date window (no match)', () => {
    const transaction = {
      amount: 349,
      type: 'debit',
      merchant: 'Jio Infocomm',
      rawText: 'Paid Rs 349 to Jio',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_jio_future',
        title: 'Jio Mobile Recharge',
        amount: 349,
        provider: 'jio',
        nextDueDate: '2026-11-15', // 24 days away (exceeds 5-day window)
        status: 'pending',
      },
    ];

    const result = matchBill(transaction, bills, now);

    assert.equal(result.matchType, 'none');
    assert.equal(result.reason, 'no_candidates');
    assert.equal(result.candidates.length, 0);
    assert.equal(result.suggestedBill, null);
  });

  await t.test('5. Credit transactions never match (no match)', () => {
    const transaction = {
      amount: 349,
      type: 'credit', // Credit / Income
      merchant: 'Jio Cashback',
      rawText: 'Received Rs 349.00 refund from Jio',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_jio_349',
        title: 'Jio Mobile Recharge',
        amount: 349,
        provider: 'jio',
        nextDueDate: '2026-10-24',
        status: 'pending',
      },
    ];

    const result = matchBill(transaction, bills, now);

    assert.equal(result.matchType, 'none');
    assert.equal(result.reason, 'credit_transactions_never_match');
    assert.equal(result.candidates.length, 0);
  });

  await t.test('6. Already paid bills never match (no match)', () => {
    const transaction = {
      amount: 349,
      type: 'debit',
      merchant: 'Jio Infocomm',
      rawText: 'Paid Rs 349 to Jio',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_jio_paid',
        title: 'Jio Mobile Recharge',
        amount: 349,
        provider: 'jio',
        nextDueDate: '2026-10-24',
        status: 'paid', // Already paid
      },
    ];

    const result = matchBill(transaction, bills, now);

    assert.equal(result.matchType, 'none');
    assert.equal(result.candidates.length, 0);
  });

  await t.test('7. Auto-confirm disabled on bill goes to inbox with suggested bill', () => {
    const transaction = {
      amount: 349,
      type: 'debit',
      merchant: 'Jio Infocomm',
      rawText: 'Paid Rs 349 to Jio',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_jio_no_auto',
        title: 'Jio Mobile Recharge',
        amount: 349,
        provider: 'jio',
        nextDueDate: '2026-10-24',
        status: 'pending',
        autoConfirm: false, // Per-bill toggle turned OFF
      },
    ];

    const result = matchBill(transaction, bills, now);

    assert.equal(result.matchType, 'inbox');
    assert.equal(result.reason, 'auto_confirm_disabled');
    assert.equal(result.suggestedBill?.id, 'bill_jio_no_auto');
  });

  await t.test('8. Amount tolerance allows small difference', () => {
    const transaction = {
      amount: 350,
      type: 'debit',
      merchant: 'Jio Infocomm',
      date: '2026-10-22',
    };

    const bills = [
      {
        id: 'bill_with_tolerance',
        title: 'Jio Mobile',
        amount: 349,
        amountTolerance: 2, // Allows ±2 difference
        nextDueDate: '2026-10-22',
        provider: 'jio',
      },
    ];

    const result = matchBill(transaction, bills, now);
    assert.equal(result.matchType, 'auto');
  });

  await t.test('9. Due date advancement calculations', () => {
    // 28-day cycle recharge
    const cycleBill = {
      type: 'cycle_days',
      cycleDays: 28,
      nextDueDate: '2026-10-24',
    };
    const nextCycle = calculateAdvancedDueDate(cycleBill, '2026-10-24');
    assert.equal(nextCycle, '2026-11-21'); // 24 Oct + 28 days = 21 Nov

    // Monthly recurring bill (day 30)
    const monthlyBill = {
      type: 'monthly_date',
      dueDay: 30,
      nextDueDate: '2026-10-30',
    };
    const nextMonthly = calculateAdvancedDueDate(monthlyBill, '2026-10-30');
    assert.equal(nextMonthly, '2026-11-30');

    // Quarterly bill
    const quarterlyBill = {
      frequency: 'quarterly',
      nextDueDate: '2026-10-15',
    };
    const nextQuarter = calculateAdvancedDueDate(quarterlyBill, '2026-10-15');
    assert.equal(nextQuarter, '2027-01-15');

    // Yearly bill
    const yearlyBill = {
      frequency: 'yearly',
      nextDueDate: '2026-10-22',
    };
    const nextYear = calculateAdvancedDueDate(yearlyBill, '2026-10-22');
    assert.equal(nextYear, '2027-10-22');
  });

  await t.test('10. Keyword alias map matches electricity, telecom, and custom keywords', () => {
    // BSES Electricity alias
    const bsesMatch = checkMerchantKeywordMatch(
      { title: 'Electricity Bill', provider: 'electricity' },
      { amount: 1200, merchant: 'BSES Rajdhani Power Ltd' }
    );
    assert.equal(bsesMatch, true);

    // Tata Power alias
    const tataPowerMatch = checkMerchantKeywordMatch(
      { title: 'Power Bill', provider: 'electricity' },
      { amount: 1500, rawText: 'Paid to Tata Power DDL' }
    );
    assert.equal(tataPowerMatch, true);

    // Custom keywords field
    const customMatch = checkMerchantKeywordMatch(
      { title: 'Home Helper', keywords: 'sunita, kamwali, maid' },
      { amount: 4000, merchant: 'Sunita Devi' }
    );
    assert.equal(customMatch, true);
  });
});
