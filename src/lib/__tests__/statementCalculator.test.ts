import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateStatementDetails,
  buildUpiPayUri,
  formatIndianCurrency,
  formatStatementDate,
} from '../statementCalculator.ts';
import type { UdharEntry, FriendContact } from '../udharStorage';

describe('Udhar Statement Calculator Unit Tests', () => {
  const dummyFriend: FriendContact = {
    id: 'friend_1',
    name: 'Jatin Dongre',
    phone: '98933 2113',
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  };

  const dummyUser = {
    name: 'Jitendra Yadav',
    phone: '7061461954',
    upiId: '7061461954@ptaxis',
  };

  it('1. Basic statement without interest (Principal only)', () => {
    const entry: UdharEntry = {
      id: 'entry_a11tl',
      friendId: 'friend_1',
      amount: 250,
      type: 'gave',
      date: '2026-09-22',
      createdAt: '2026-09-22T10:00:00Z',
    };

    const res = calculateStatementDetails({
      entry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserPhone: dummyUser.phone,
      currentUserUpiId: dummyUser.upiId,
      asOfDate: new Date('2026-10-08T12:00:00Z'),
      hideMyPhone: false,
    });

    assert.strictEqual(res.statementId, '#A11TL');
    assert.strictEqual(res.isUserLender, true);
    assert.strictEqual(res.lender.name, 'Jitendra Yadav');
    assert.strictEqual(res.borrower.name, 'Jatin Dongre');
    assert.strictEqual(res.directionTitle, 'Money Lent');
    assert.strictEqual(res.principalAmount, 250);
    assert.strictEqual(res.hasInterest, false);
    assert.strictEqual(res.accruedInterest, 0);
    assert.strictEqual(res.hasPayments, false);
    assert.strictEqual(res.netDue, 250);
    assert.strictEqual(res.remainingDue, 250);
    assert.strictEqual(res.isSettled, false);
    assert.strictEqual(res.shouldShowPaymentSection, true);
    assert.strictEqual(res.upiId, '7061461954@ptaxis');
  });

  it('2. Statement with monthly interest calculation', () => {
    const entry: UdharEntry = {
      id: 'entry_a11tl',
      friendId: 'friend_1',
      amount: 250,
      type: 'gave',
      date: '2026-09-22',
      isInterest: true,
      interestPercent: 2, // 2% per month
      interestPeriod: 'monthly',
      interestStartDate: '2026-09-23',
      createdAt: '2026-09-22T10:00:00Z',
    };

    // From 2026-09-23 to 2026-10-08 is ~15 days elapsed.
    // Interest = 250 * 0.02 * (15 / 30) = 5 * 0.5 = 2.5 rounded ~ 3
    const res = calculateStatementDetails({
      entry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserPhone: dummyUser.phone,
      currentUserUpiId: dummyUser.upiId,
      asOfDate: new Date('2026-10-08T12:00:00Z'),
    });

    assert.strictEqual(res.hasInterest, true);
    assert.strictEqual(res.interestPercent, 2);
    assert.ok(res.accruedInterest > 0, 'Accrued interest should be greater than 0');
    assert.strictEqual(res.netDue, res.principalAmount + res.accruedInterest);
  });

  it('3. Statement with partial payments', () => {
    const entry: UdharEntry = {
      id: 'entry_part1',
      friendId: 'friend_1',
      amount: 500,
      type: 'gave',
      date: '2026-09-01',
      createdAt: '2026-09-01T10:00:00Z',
    };

    const partialSettlements: UdharEntry[] = [
      {
        id: 'child_1',
        friendId: 'friend_1',
        amount: 200,
        type: 'got',
        date: '2026-09-15',
        parentEntryId: 'entry_part1',
        settlementType: 'partial',
        paymentMode: 'UPI',
        createdAt: '2026-09-15T12:00:00Z',
      },
    ];

    const res = calculateStatementDetails({
      entry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserUpiId: dummyUser.upiId,
      childSettlements: partialSettlements,
      asOfDate: new Date('2026-10-08T12:00:00Z'),
    });

    assert.strictEqual(res.hasPayments, true);
    assert.strictEqual(res.totalPaymentsReceived, 200);
    assert.strictEqual(res.netDue, 300);
    assert.strictEqual(res.remainingDue, 300);
    assert.strictEqual(res.isSettled, false);
    assert.strictEqual(res.statusText, 'Partially Settled');
  });

  it('4. Fully settled entry (net due == 0)', () => {
    const entry: UdharEntry = {
      id: 'entry_settled',
      friendId: 'friend_1',
      amount: 400,
      type: 'gave',
      date: '2026-08-01',
      createdAt: '2026-08-01T10:00:00Z',
    };

    const fullSettlements: UdharEntry[] = [
      {
        id: 'child_settle',
        friendId: 'friend_1',
        amount: 400,
        type: 'got',
        date: '2026-08-10',
        parentEntryId: 'entry_settled',
        settlementType: 'full',
        paymentMode: 'Cash',
        createdAt: '2026-08-10T12:00:00Z',
      },
    ];

    const res = calculateStatementDetails({
      entry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserUpiId: dummyUser.upiId,
      childSettlements: fullSettlements,
      asOfDate: new Date('2026-10-08T12:00:00Z'),
    });

    assert.strictEqual(res.netDue, 0);
    assert.strictEqual(res.remainingDue, 0);
    assert.strictEqual(res.isSettled, true);
    assert.strictEqual(res.statusText, 'Settled in Full');
    // For settled entry, payment section / QR must NOT be shown!
    assert.strictEqual(res.shouldShowPaymentSection, false);
  });

  it('5. Overpaid entry (payments > principal)', () => {
    const entry: UdharEntry = {
      id: 'entry_over',
      friendId: 'friend_1',
      amount: 100,
      type: 'gave',
      date: '2026-09-01',
      createdAt: '2026-09-01T10:00:00Z',
    };

    const settlements: UdharEntry[] = [
      {
        id: 'child_over',
        friendId: 'friend_1',
        amount: 120,
        type: 'got',
        date: '2026-09-10',
        parentEntryId: 'entry_over',
        settlementType: 'partial',
        paymentMode: 'UPI',
        createdAt: '2026-09-10T12:00:00Z',
      },
    ];

    const res = calculateStatementDetails({
      entry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      childSettlements: settlements,
    });

    assert.strictEqual(res.netDue, -20);
    assert.strictEqual(res.remainingDue, 0);
    assert.strictEqual(res.overpaidAmount, 20);
    assert.strictEqual(res.isSettled, true);
    assert.strictEqual(res.shouldShowPaymentSection, false);
  });

  it('6. Udhar taken (User is borrower, friend is lender)', () => {
    const entry: UdharEntry = {
      id: 'entry_borrowed',
      friendId: 'friend_1',
      amount: 1000,
      type: 'got', // User borrowed
      date: '2026-09-10',
      createdAt: '2026-09-10T10:00:00Z',
    };

    const res = calculateStatementDetails({
      entry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserUpiId: dummyUser.upiId,
    });

    assert.strictEqual(res.isUserLender, false);
    // Lender should be Friend, Borrower should be User
    assert.strictEqual(res.lender.name, 'Jatin Dongre');
    assert.strictEqual(res.borrower.name, 'Jitendra Yadav');
    assert.strictEqual(res.directionTitle, 'Money Borrowed');
    // If user is borrower, no QR section shown!
    assert.strictEqual(res.shouldShowPaymentSection, false);
  });

  it('7. UPI Deep Link Builder (encoding & 2 decimals)', () => {
    const uri = buildUpiPayUri({
      upiId: '7061461954@ptaxis',
      payeeName: 'Jitendra Yadav',
      amount: 253,
      statementId: '#A11TL',
    });

    assert.ok(uri.startsWith('upi://pay?'), 'URI must start with upi://pay?');
    assert.ok(uri.includes('pa=7061461954%40ptaxis') || uri.includes('pa=7061461954@ptaxis'));
    assert.ok(uri.includes('pn=Jitendra%20Yadav'));
    assert.ok(uri.includes('am=253.00'), 'Amount must have exactly 2 decimal places');
    assert.ok(uri.includes('cu=INR'));
    assert.ok(uri.includes('tn=Rupeo%20Khata%20%23A11TL'));
  });

  it('8. Indian Currency Formatting', () => {
    assert.strictEqual(formatIndianCurrency(250), '₹250');
    assert.strictEqual(formatIndianCurrency(125000), '₹1,25,000');
    assert.strictEqual(formatIndianCurrency(253.5), '₹253.50');
    assert.strictEqual(formatIndianCurrency(0), '₹0');
  });

  it('9. Statement with interest applied to payment as child settlement entry', () => {
    // Parent loan entry (e.g. lent 1000)
    const parentEntry: UdharEntry = {
      id: 'loan_parent_123',
      friendId: 'friend_1',
      amount: 1000,
      type: 'gave',
      date: '2026-09-08',
      createdAt: '2026-09-08T10:00:00Z',
    };

    // Child interest entry added via '% Interest' button
    const interestChild: UdharEntry = {
      id: 'interest_child_456',
      friendId: 'friend_1',
      amount: 20,
      type: 'gave',
      date: '2026-09-08',
      parentEntryId: 'loan_parent_123',
      settlementType: 'interest',
      isInterest: true,
      interestPercent: 2, // 2% per month
      interestPeriod: 'monthly',
      interestStartDate: '2026-09-08',
      interestCalcType: 'pro_rata',
      baseAmount: 1000,
      createdAt: '2026-09-08T10:05:00Z',
    };

    const res = calculateStatementDetails({
      entry: parentEntry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserUpiId: dummyUser.upiId,
      childSettlements: [interestChild],
      asOfDate: new Date('2026-10-08T12:00:00Z'), // 30 days elapsed
    });

    assert.strictEqual(res.hasInterest, true, 'hasInterest should be true for child interest');
    assert.strictEqual(res.interestPercent, 2);
    assert.strictEqual(res.principalAmount, 1000);
    assert.strictEqual(res.accruedInterest, 20); // 1000 * 0.02 * (30/30) = 20
    assert.strictEqual(res.totalWithInterest, 1020, 'totalWithInterest should be principal + interest');
    assert.strictEqual(res.remainingDue, 1020, 'remainingDue should be total with interest');
    assert.strictEqual(res.shouldShowPaymentSection, true);
    assert.ok(res.upiUri?.includes('am=1020.00'), 'UPI URI must encode total amount including interest (1020.00)');
  });

  it('10. Statement with child interest and repayments', () => {
    const parentEntry: UdharEntry = {
      id: 'loan_parent_999',
      friendId: 'friend_1',
      amount: 5000,
      type: 'gave',
      date: '2026-09-08',
      createdAt: '2026-09-08T10:00:00Z',
    };

    const interestChild: UdharEntry = {
      id: 'interest_child_999',
      friendId: 'friend_1',
      amount: 250,
      type: 'gave',
      date: '2026-09-08',
      parentEntryId: 'loan_parent_999',
      settlementType: 'interest',
      isInterest: true,
      interestPercent: 5,
      interestPeriod: 'monthly',
      interestStartDate: '2026-09-08',
      baseAmount: 5000,
      createdAt: '2026-09-08T10:05:00Z',
    };

    const partialPayment: UdharEntry = {
      id: 'repay_1',
      friendId: 'friend_1',
      amount: 1500,
      type: 'got',
      date: '2026-09-20',
      parentEntryId: 'loan_parent_999',
      settlementType: 'partial',
      createdAt: '2026-09-20T10:00:00Z',
    };

    const res = calculateStatementDetails({
      entry: parentEntry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserUpiId: dummyUser.upiId,
      childSettlements: [interestChild, partialPayment],
      asOfDate: new Date('2026-10-08T12:00:00Z'), // 30 days -> 250 interest
    });

    assert.strictEqual(res.hasInterest, true);
    assert.strictEqual(res.principalAmount, 5000);
    assert.strictEqual(res.accruedInterest, 250);
    assert.strictEqual(res.totalWithInterest, 5250);
    assert.strictEqual(res.totalPaymentsReceived, 1500);
    assert.strictEqual(res.netDue, 3750); // 5250 - 1500 = 3750
    assert.strictEqual(res.remainingDue, 3750);
    assert.ok(res.upiUri?.includes('am=3750.00'), 'UPI URI should encode net remaining total with interest (3750.00)');
  });

  it('11. Complete interest breakdown details (formula, base principal, days, records)', () => {
    const parentEntry: UdharEntry = {
      id: 'loan_parent_full',
      friendId: 'friend_1',
      amount: 2000,
      type: 'gave',
      date: '2026-09-18',
      createdAt: '2026-09-18T10:00:00Z',
    };

    const interestChild: UdharEntry = {
      id: 'interest_child_full',
      friendId: 'friend_1',
      amount: 40,
      type: 'gave',
      date: '2026-09-18',
      parentEntryId: 'loan_parent_full',
      settlementType: 'interest',
      isInterest: true,
      interestPercent: 3,
      interestPeriod: 'monthly',
      interestStartDate: '2026-09-18',
      baseAmount: 2000,
      createdAt: '2026-09-18T10:05:00Z',
    };

    const res = calculateStatementDetails({
      entry: parentEntry,
      friend: dummyFriend,
      currentUserName: dummyUser.name,
      currentUserUpiId: dummyUser.upiId,
      childSettlements: [interestChild],
      asOfDate: new Date('2026-10-08T12:00:00Z'), // 20 days -> 2000 * 0.03 * 20/30 = 40
    });

    assert.strictEqual(res.hasInterest, true);
    assert.strictEqual(res.interestBaseAmount, 2000);
    assert.strictEqual(res.daysElapsed, 20);
    assert.strictEqual(res.accruedInterest, 40);
    assert.strictEqual(res.interestRecords.length, 1);
    assert.strictEqual(res.interestRecords[0].ratePercent, 3);
    assert.strictEqual(res.interestRecords[0].baseAmount, 2000);
    assert.ok(res.interestFormulaStr?.includes('₹2,000') || res.interestFormulaStr?.includes('3%/mo'), 'Formula must show base and rate');
    assert.ok(res.interestFormulaStr?.includes('₹40'), 'Formula must show final accrued interest');
  });
});
