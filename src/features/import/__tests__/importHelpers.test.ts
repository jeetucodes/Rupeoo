import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateSummaryTotals,
  groupDrafts,
  getSelectAllState,
  shouldShowDiscardDialog,
  buildCardSubtitle,
  getMaskedAccount,
  getCleanBankName,
} from '../utils/importHelpers.ts';

describe('Import Helpers & Redesign Logic Tests', () => {
  it('1. Summary totals with 0 selected never shows ₹0 when items exist', () => {
    const drafts = [
      { id: '1', amount: 15, type: 'expense', isAlreadyAdded: false, selected: false, category: 'Others' },
      { id: '2', amount: 500, type: 'income', isAlreadyAdded: false, selected: false, category: 'Salary' },
      { id: '3', amount: 99, type: 'expense', isAlreadyAdded: true, selected: false, category: 'Food' },
    ];

    const result = calculateSummaryTotals(drafts as any);
    assert.strictEqual(result.foundCount, 3);
    assert.strictEqual(result.foundText, 'Found 3 transactions');
    assert.strictEqual(result.totalSpent, 15);
    assert.strictEqual(result.totalReceived, 500);
    // Totals include all non-duplicates even when 0 are selected
    assert.strictEqual(result.totalsSubtitle, 'Spent ₹15.00 · Received ₹500.00');
    // Selected subtitle is null when 0 items are selected
    assert.strictEqual(result.selectedSubtitle, null);
    assert.strictEqual(result.selectedCount, 0);
  });

  it('2. Singular and plural text formatting', () => {
    const single = [{ id: '1', amount: 15, type: 'expense', isAlreadyAdded: false, selected: true, date: 1 }];
    const resSingle = calculateSummaryTotals(single as any);
    assert.strictEqual(resSingle.foundText, 'Found 1 transaction');
    assert.strictEqual(resSingle.selectedSubtitle, 'Selected: 1 · ₹15.00');

    const multi = [
      { id: '1', amount: 15, type: 'expense', isAlreadyAdded: false, selected: true, date: 1 },
      { id: '2', amount: 25, type: 'expense', isAlreadyAdded: false, selected: true, date: 2 },
    ];
    const resMulti = calculateSummaryTotals(multi as any);
    assert.strictEqual(resMulti.foundText, 'Found 2 transactions');
    assert.strictEqual(resMulti.selectedSubtitle, 'Selected: 2 · ₹40.00');
  });

  it('3. Dedupe grouping: Ready to add, Needs review, Already added', () => {
    const drafts = [
      // 1: High confidence + good category -> Ready to add
      { id: '1', amount: 120, type: 'expense', category: 'Food', confidence: 0.95, isAlreadyAdded: false, date: 1 },
      // 2: Confidence 0.8 + Others category -> Needs review
      { id: '2', amount: 15, type: 'expense', category: 'Others', confidence: 0.8, isAlreadyAdded: false, date: 2 },
      // 3: Low confidence -> Needs review
      { id: '3', amount: 200, type: 'expense', category: 'Travel', confidence: 0.65, isAlreadyAdded: false, date: 3 },
      // 4: Duplicate -> Already added
      { id: '4', amount: 50, type: 'expense', category: 'Food', confidence: 0.9, isAlreadyAdded: true, date: 4 },
    ];

    const { readyToAdd, needsReview, alreadyAdded } = groupDrafts(drafts as any);
    assert.strictEqual(readyToAdd.length, 1);
    assert.strictEqual(readyToAdd[0].id, '1');

    assert.strictEqual(needsReview.length, 2);
    assert.strictEqual(needsReview[0].id, '2');
    assert.strictEqual(needsReview[1].id, '3');

    assert.strictEqual(alreadyAdded.length, 1);
    assert.strictEqual(alreadyAdded[0].id, '4');
  });

  it('4. Select All state calculation', () => {
    const list = [
      { id: '1', selected: false },
      { id: '2', selected: false },
    ];
    assert.strictEqual(getSelectAllState(list as any), 'none');

    list[0].selected = true;
    assert.strictEqual(getSelectAllState(list as any), 'some');

    list[1].selected = true;
    assert.strictEqual(getSelectAllState(list as any), 'all');
  });

  it('5. Discard dialog logic: no dialog when nothing selected or edited', () => {
    const draftsUnselected = [
      { id: '1', isAlreadyAdded: false, selected: false },
      { id: '2', isAlreadyAdded: false, selected: false },
    ];
    // No edits and 0 selected -> DO NOT show dialog
    assert.strictEqual(shouldShowDiscardDialog(draftsUnselected as any, false), false);

    // Has edits -> show dialog
    assert.strictEqual(shouldShowDiscardDialog(draftsUnselected as any, true), true);

    // Has 1 selected -> show dialog
    draftsUnselected[0].selected = true;
    assert.strictEqual(shouldShowDiscardDialog(draftsUnselected as any, false), true);
  });

  it('6. Subtitle builder produces "Kotak ••0741 · UPI" from Kotak message', () => {
    const rawKotak = 'Sent Rs.15.00 from Kotak Bank A/c X0741 to SHUBHAM RAI on 22-10-26. UPI Ref 666123542887.';
    const subtitle = buildCardSubtitle('Pasted Alert', '0741', 'UPI', rawKotak);
    assert.strictEqual(subtitle, 'Kotak ••0741 · UPI');

    // Test with DLT code
    const subtitleDlt = buildCardSubtitle('AD-KOTAKB', 'X0741', 'UPI', rawKotak);
    assert.strictEqual(subtitleDlt, 'Kotak ••0741 · UPI');

    // Never output raw **0741 or Pasted Alert
    assert.strictEqual(getMaskedAccount('**0741'), '••0741');
    assert.strictEqual(getMaskedAccount('X0741'), '••0741');
    assert.strictEqual(getCleanBankName('Pasted Alert', rawKotak), 'Kotak');
  });
});
