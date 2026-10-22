import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatAmountNumber, RUPEE_SYMBOL } from '../formatCurrency.ts';

test('Currency Formatter Tests', async (t) => {
  await t.test('1. Standard positive amount with Indian grouping', () => {
    assert.strictEqual(formatCurrency(13971.89), '₹13,971.89');
    assert.strictEqual(formatCurrency(13971.89), `${RUPEE_SYMBOL}13,971.89`);
  });

  await t.test('2. Negative amount formats with minus before currency symbol', () => {
    assert.strictEqual(formatCurrency(-349), '-₹349.00');
    assert.strictEqual(formatCurrency(-349), `-${RUPEE_SYMBOL}349.00`);
    assert.strictEqual(formatCurrency(-349.5), '-₹349.50');
  });

  await t.test('3. Positive amount with explicit plus sign', () => {
    assert.strictEqual(formatCurrency(1, { showPlus: true }), '+₹1.00');
    assert.strictEqual(formatCurrency(100.5, { showPlus: true }), '+₹100.50');
  });

  await t.test('4. Lakhs and Crores grouping (Indian number system)', () => {
    assert.strictEqual(formatCurrency(168939.47), '₹1,68,939.47');
    assert.strictEqual(formatCurrency(10000000), '₹1,00,00,000.00');
  });

  await t.test('5. Zero handling', () => {
    assert.strictEqual(formatCurrency(0), '₹0.00');
    assert.strictEqual(formatCurrency('0'), '₹0.00');
    assert.strictEqual(formatCurrency(0, { showPlus: true }), '₹0.00');
  });

  await t.test('6. Custom foreign currency options', () => {
    assert.strictEqual(formatCurrency(50.25, { currency: 'USD' }), '$50.25');
    assert.strictEqual(formatCurrency(-20, { currency: 'USD' }), '-$20.00');
  });

  await t.test('7. formatAmountNumber formats pure number with en-IN commas', () => {
    assert.strictEqual(formatAmountNumber(168939.47), '1,68,939.47');
    assert.strictEqual(formatAmountNumber(-349), '-349.00');
  });
});
