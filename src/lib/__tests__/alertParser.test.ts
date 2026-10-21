import test from 'node:test';
import assert from 'node:assert';
import {
  parseAlert,
  parseDltSender,
  normalizeMerchant,
  categorizeTransaction,
  parseIndianNumber,
} from '../alertParser.ts';

test('Alert Parser - Comprehensive Suite', async (t) => {
  await t.test('1. Standard HDFC UPI Debit message with Indian number grouping', () => {
    const text = 'Sent Rs. 1,23,456.78 from HDFC Bank A/C *1234 to SWIGGY on 21-OCT-26 via UPI/P2M/629584729104. Bal: Rs. 14,350.20.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK-S' });

    assert.strictEqual(parsed.amount, 123456.78);
    assert.strictEqual(parsed.type, 'expense');
    assert.strictEqual(parsed.merchantNormalized, 'Swiggy');
    assert.strictEqual(parsed.accountLast4, '1234');
    assert.strictEqual(parsed.refNo, '629584729104');
    assert.strictEqual(parsed.channel, 'UPI');
    assert.strictEqual(parsed.balance, 14350.2);
    assert.strictEqual(parsed.isOtpOrPromo, false);
    assert.ok(parsed.confidence >= 0.9);
  });

  await t.test('2. Strict isolation: Balance is NEVER returned as the transaction amount', () => {
    const text = 'Debited Rs. 500.00 from A/c 5678 to Zomato. Avail Bal Rs. 85,250.00.';
    const parsed = parseAlert(text, { sender: 'VM-ICICIB' });

    assert.strictEqual(parsed.amount, 500);
    assert.notStrictEqual(parsed.amount, 85250);
    assert.strictEqual(parsed.balance, 85250);
  });

  await t.test('3. Reversals and refunds are marked as income', () => {
    const text = 'Refund of Rs. 750.00 credited to your A/C 9988 from SWIGGY on 22-OCT-26.';
    const parsed = parseAlert(text, { sender: 'BP-KOTAKB' });

    assert.strictEqual(parsed.amount, 750);
    assert.strictEqual(parsed.type, 'income');
    assert.strictEqual(parsed.isReversal, true);
    assert.strictEqual(parsed.merchantNormalized, 'Swiggy');
  });

  await t.test('4. Own account transfer is classified as transfer, not expense', () => {
    const text = 'Transferred INR 5,000.00 from A/c *1234 to your own A/c *5678 on 05-OCT-26.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK' });

    assert.strictEqual(parsed.amount, 5000);
    assert.strictEqual(parsed.type, 'transfer');
    assert.strictEqual(parsed.isTransfer, true);
  });

  await t.test('5. ATM cash withdrawal sets channel ATM and category Cash', () => {
    const text = 'Withdrawn Rs 4,000.00 at SBI ATM from A/C *4321 on 10-OCT-26. Clear Bal: Rs 21,900.00.';
    const parsed = parseAlert(text, { sender: 'AD-SBIINB' });

    assert.strictEqual(parsed.amount, 4000);
    assert.strictEqual(parsed.type, 'expense');
    assert.strictEqual(parsed.channel, 'ATM');
    assert.strictEqual(parsed.category, 'Cash');
    assert.strictEqual(parsed.isAtm, true);
  });

  await t.test('6. Strict Negative Filter: OTP is rejected with confidence 0 and isOtpOrPromo=true', () => {
    const text = '482910 is your OTP for HDFC Bank NetBanking login. Valid for 10 minutes. Do not share with anyone.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK' });

    assert.strictEqual(parsed.isOtpOrPromo, true);
    assert.strictEqual(parsed.amount, null);
    assert.strictEqual(parsed.confidence, 0);
  });

  await t.test('7. Strict Negative Filter: Loan promo is rejected', () => {
    const text = 'Congratulations! You are pre-approved for an Instant Personal Loan of Rs. 5,00,000 at special interest rates. Apply now.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK' });

    assert.strictEqual(parsed.isOtpOrPromo, true);
    assert.strictEqual(parsed.amount, null);
    assert.strictEqual(parsed.confidence, 0);
  });

  await t.test('8. Strict Negative Filter: Future mandate/scheduled debit is rejected', () => {
    const text = 'Reminder: Rs. 1,500.00 will be debited from your HDFC Bank A/c *1234 towards SIP on 25-OCT-26.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK' });

    assert.strictEqual(parsed.isOtpOrPromo, true);
    assert.strictEqual(parsed.amount, null);
    assert.strictEqual(parsed.confidence, 0);
  });

  await t.test('9. Strict Negative Filter: Balance inquiry only is rejected', () => {
    const text = 'Dear Customer, available balance in your HDFC Bank A/C *1234 is Rs. 14,350.20 as on 22-OCT-26.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK' });

    assert.strictEqual(parsed.isOtpOrPromo, true);
    assert.strictEqual(parsed.amount, null);
  });

  await t.test('10. Strict Negative Filter: Failed/declined transaction is rejected', () => {
    const text = 'Your transaction of Rs. 1,500.00 at SWIGGY was declined due to insufficient funds in A/c 1234.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK' });

    assert.strictEqual(parsed.isOtpOrPromo, true);
    assert.strictEqual(parsed.confidence, 0);
  });

  await t.test('11. Strict Negative Filter: Credit card bill due notice is rejected', () => {
    const text = 'Statement for your HDFC Bank Credit Card ending 9012 is generated. Total amount due is Rs. 14,850.00. Due date is 05-NOV-26.';
    const parsed = parseAlert(text, { sender: 'AD-HDFCBK' });

    assert.strictEqual(parsed.isOtpOrPromo, true);
    assert.strictEqual(parsed.confidence, 0);
  });

  await t.test('12. DLT Sender Header Parser identifies operator, bank code, and authenticity', () => {
    const dlt1 = parseDltSender('AD-HDFCBK-S');
    assert.strictEqual(dlt1.isDlt, true);
    assert.strictEqual(dlt1.operatorPrefix, 'AD');
    assert.strictEqual(dlt1.bankCode, 'HDFCBK');
    assert.strictEqual(dlt1.isKnownBank, true);

    const dlt2 = parseDltSender('VM-ICICIB');
    assert.strictEqual(dlt2.isDlt, true);
    assert.strictEqual(dlt2.bankCode, 'ICICIB');
    assert.strictEqual(dlt2.isKnownBank, true);

    const unknown = parseDltSender('XY-UNKNOWN');
    assert.strictEqual(unknown.isKnownBank, false);
  });

  await t.test('13. Merchant Normalization strips handles and legal suffixes', () => {
    assert.strictEqual(normalizeMerchant('swiggy@hdfcbank'), 'Swiggy');
    assert.strictEqual(normalizeMerchant('ZOMATO PVT LTD'), 'Zomato');
    assert.strictEqual(normalizeMerchant('UPI/BLINKIT LIMITED'), 'Blinkit');
    assert.strictEqual(normalizeMerchant('AMAZON INDIA SERVICES'), 'Amazon');
  });

  await t.test('14. Custom user category overrides are applied', () => {
    const customRules = { myntra: 'Gifts', zepto: 'Snacks' };
    const cat = categorizeTransaction('Myntra', 'card', 'expense', false, customRules);
    assert.strictEqual(cat, 'Gifts');
  });
});
