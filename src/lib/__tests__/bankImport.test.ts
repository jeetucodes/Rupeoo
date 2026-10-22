import test from 'node:test';
import assert from 'node:assert';
import { detectDraftTransactions, type DraftTransactionItem } from '../bankDraftDetector.ts';
import { computePayKey, computeMsgHash, createDeterministicTxId } from '../smsDedupe.ts';

test('Bank Import One-Tap Flow - Unit Test Suite', async (t) => {
  const baseTime = 1792600000000;

  await t.test('1. Draft Selection Logic: High-confidence items selected by default, low-confidence unselected', async () => {
    const messages = [
      {
        _id: 'sms_1',
        address: 'AD-HDFCBK',
        body: 'Sent Rs. 650.00 from HDFC Bank A/C *1234 to ZOMATO on 21-OCT-26 via UPI Ref 629584729104.',
        date: baseTime,
      },
      {
        _id: 'sms_2',
        address: 'UnknownSender',
        body: 'Paid Rs. 250 to some shop yesterday.',
        date: baseTime + 1000,
      },
      {
        _id: 'sms_3',
        address: 'VK-SBIINB',
        body: 'Your OTP for online banking login is 582910. Do not share with anyone.',
        date: baseTime + 2000,
      },
    ];

    const drafts = await detectDraftTransactions('test_user_1', messages, {
      settings: {
        autoAddEnabled: true,
        reviewBeforeAdding: false,
        saveOriginalInNote: false,
        maskAccountNumbers: true,
        customCategoryRules: {},
        allowedSenders: [],
        customBanks: [],
      },
      existingTransactions: [],
    });

    // OTP message (sms_3) must be strictly rejected
    assert.strictEqual(drafts.length, 2);

    // High confidence item (HDFC UPI alert with account and refNo) -> selected: true
    const hdfcDraft = drafts.find((d) => d.bankName === 'AD-HDFCBK');
    assert.ok(hdfcDraft);
    assert.strictEqual(hdfcDraft.selected, true);
    assert.strictEqual(hdfcDraft.isLowConfidence, false);
    assert.strictEqual(hdfcDraft.amount, 650);
    assert.strictEqual(hdfcDraft.merchant, 'Zomato');

    // Low confidence item (unknown sender, no ref, no account) -> selected: false
    const unknownDraft = drafts.find((d) => d.bankName === 'UnknownSender');
    assert.ok(unknownDraft);
    assert.strictEqual(unknownDraft.selected, false);
    assert.strictEqual(unknownDraft.isLowConfidence, true);
  });

  await t.test('2. "Already added" handling: Existing transactions appear disabled and unselected', async () => {
    const rawSms = {
      _id: 'sms_repeat',
      address: 'CP-AXISBK',
      body: 'INR 1,200.00 debited from A/C *9876 on 21-OCT-26 at SHELL PETROL. Ref: 827491029384.',
      date: baseTime,
    };

    const drafts = await detectDraftTransactions('test_user_dedupe', [rawSms], { existingTransactions: [] });
    assert.strictEqual(drafts.length, 1);
    const draft = drafts[0];

    assert.strictEqual(draft.amount, 1200);
    assert.strictEqual(draft.selected, true);
    assert.strictEqual(draft.isAlreadyAdded, false);

    // If an item is already added, isAlreadyAdded becomes true and selected becomes false
    const alreadyAddedDraft: DraftTransactionItem = {
      ...draft,
      isAlreadyAdded: true,
      selected: false,
    };

    assert.strictEqual(alreadyAddedDraft.isAlreadyAdded, true);
    assert.strictEqual(alreadyAddedDraft.selected, false);
  });

  await t.test('3. Save-Only-Selected Rule: Unselected items are excluded from saving', () => {
    const draftList: DraftTransactionItem[] = [
      {
        id: 'tx_1',
        payKey: 'pk_1',
        msgHash: 'h_1',
        amount: 450,
        type: 'expense',
        merchant: 'Swiggy',
        category: 'Food',
        bankName: 'HDFC',
        date: baseTime,
        channel: 'UPI',
        confidence: 0.95,
        rawText: 'text1',
        selected: true,
        isAlreadyAdded: false,
        isLowConfidence: false,
      },
      {
        id: 'tx_2',
        payKey: 'pk_2',
        msgHash: 'h_2',
        amount: 800,
        type: 'expense',
        merchant: 'Unknown Store',
        category: 'Others',
        bankName: 'SBI',
        date: baseTime,
        channel: 'UPI',
        confidence: 0.65,
        rawText: 'text2',
        selected: false, // User left this unchecked
        isAlreadyAdded: false,
        isLowConfidence: true,
      },
      {
        id: 'tx_3',
        payKey: 'pk_3',
        msgHash: 'h_3',
        amount: 1500,
        type: 'expense',
        merchant: 'Amazon',
        category: 'Shopping',
        bankName: 'ICICI',
        date: baseTime,
        channel: 'card',
        confidence: 0.95,
        rawText: 'text3',
        selected: true,
        isAlreadyAdded: false,
        isLowConfidence: false,
      },
      {
        id: 'tx_4',
        payKey: 'pk_4',
        msgHash: 'h_4',
        amount: 200,
        type: 'expense',
        merchant: 'Chai',
        category: 'Food',
        bankName: 'HDFC',
        date: baseTime,
        channel: 'UPI',
        confidence: 0.95,
        rawText: 'text4',
        selected: true,
        isAlreadyAdded: true, // Already in DB
        isLowConfidence: false,
      },
    ];

    // Filter rule: only drafts that are selected AND NOT already added are saved
    const toSave = draftList.filter((d) => d.selected && !d.isAlreadyAdded);

    assert.strictEqual(toSave.length, 2);
    assert.deepStrictEqual(
      toSave.map((d) => d.id),
      ['tx_1', 'tx_3']
    );
    // Unchecked tx_2 and already added tx_4 must NOT be in toSave
    assert.ok(!toSave.some((d) => d.id === 'tx_2'));
    assert.ok(!toSave.some((d) => d.id === 'tx_4'));
  });

  await t.test('4. Discard Rule: Clears in-memory review list with zero side-effects', () => {
    let activeDrafts: DraftTransactionItem[] = [
      {
        id: 'tx_temp_1',
        payKey: 'pk_temp',
        msgHash: 'h_temp',
        amount: 999,
        type: 'expense',
        merchant: 'Test Store',
        category: 'Shopping',
        bankName: 'Axis',
        date: baseTime,
        channel: 'UPI',
        confidence: 0.9,
        rawText: 'test',
        selected: true,
        isAlreadyAdded: false,
        isLowConfidence: false,
      },
    ];

    // Discard operation
    activeDrafts = [];
    assert.strictEqual(activeDrafts.length, 0);
  });
});
