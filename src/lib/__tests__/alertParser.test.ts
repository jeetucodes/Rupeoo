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

  await t.test('8b. Strict Negative Filter: AutoPay cancel or add notifications are rejected', () => {
    // Autopay cancelled
    const cancel1 = parseAlert('UPI AutoPay of Rs. 499.00 has been cancelled successfully on your A/C XX1234.', { sender: 'AD-HDFCBK' });
    assert.strictEqual(cancel1.isOtpOrPromo, true);
    assert.strictEqual(cancel1.amount, null);
    assert.strictEqual(cancel1.confidence, 0);

    const cancel2 = parseAlert('AutoPay cancelled: Mandate for Rs. 199.00 on account XX5678 has been cancelled.', { sender: 'VM-ICICIB' });
    assert.strictEqual(cancel2.isOtpOrPromo, true);
    assert.strictEqual(cancel2.amount, null);

    const cancel3 = parseAlert('Auto pay cancel: Mandate for Rs. 500 on account ending 1234 has been cancelled.', { sender: 'AD-SBIINB' });
    assert.strictEqual(cancel3.isOtpOrPromo, true);
    assert.strictEqual(cancel3.amount, null);

    // Autopay added / setup
    const add1 = parseAlert('UPI AutoPay for Rs. 499.00 has been set up successfully on your A/C XX1234.', { sender: 'AD-HDFCBK' });
    assert.strictEqual(add1.isOtpOrPromo, true);
    assert.strictEqual(add1.amount, null);
    assert.strictEqual(add1.confidence, 0);

    const add2 = parseAlert('AutoPay added successfully for Rs. 199.00 towards NETFLIX.', { sender: 'AD-HDFCBK' });
    assert.strictEqual(add2.isOtpOrPromo, true);
    assert.strictEqual(add2.amount, null);

    const add3 = parseAlert('Auto pay added for A/c 1234 Rs 500', { sender: 'AD-SBIINB' });
    assert.strictEqual(add3.isOtpOrPromo, true);
    assert.strictEqual(add3.amount, null);

    // Mandate cancelled
    const mandateCancel = parseAlert('Mandate for Rs. 1,000.00 has been cancelled successfully.', { sender: 'JD-AXISBK' });
    assert.strictEqual(mandateCancel.isOtpOrPromo, true);
    assert.strictEqual(mandateCancel.amount, null);
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

  await t.test('15. Received money from Kotak SMS and UPI apps is strictly classified as Income (credit)', () => {
    // Exact user Kotak Bank SMS
    const kotakSms = 'Received Rs.3000.00 in your Kotak Bank AC 0741 from AKASH on 26-10-26.UPI Ref:********3882';
    const parsedKotak = parseAlert(kotakSms, { sender: 'BP-KOTAKB' });
    assert.strictEqual(parsedKotak.amount, 3000);
    assert.strictEqual(parsedKotak.type, 'income');
    assert.strictEqual(parsedKotak.merchantNormalized, 'Akash');
    assert.strictEqual(parsedKotak.category, 'Income');
    assert.strictEqual(parsedKotak.accountLast4, '0741');
    assert.strictEqual(parsedKotak.isOtpOrPromo, false);

    // Notification title + body combined (e.g. "Akash paid you ₹3,000" + Kotak SMS body)
    const combinedGpay = 'Akash paid you ₹3,000 Received Rs.3000.00 in your Kotak Bank AC 0741 from AKASH on 26-10-26.UPI Ref:********3882';
    const parsedCombined = parseAlert(combinedGpay);
    assert.strictEqual(parsedCombined.amount, 3000);
    assert.strictEqual(parsedCombined.type, 'income');
    assert.strictEqual(parsedCombined.category, 'Income');
    assert.strictEqual(parsedCombined.merchantNormalized, 'Akash');

    // Standalone UPI app notification: "AKASH paid you ₹3,000"
    const paidYou = parseAlert('AKASH paid you ₹3,000');
    assert.strictEqual(paidYou.amount, 3000);
    assert.strictEqual(paidYou.type, 'income');
    assert.strictEqual(paidYou.category, 'Income');
    assert.strictEqual(paidYou.merchantNormalized, 'Akash');

    // "Money sent to you by AKASH Rs 3000"
    const sentToYou = parseAlert('Money sent to you by AKASH Rs 3000');
    assert.strictEqual(sentToYou.amount, 3000);
    assert.strictEqual(sentToYou.type, 'income');
    assert.strictEqual(sentToYou.category, 'Income');
    assert.strictEqual(sentToYou.merchantNormalized, 'Akash');

    // Contrast with genuine outgoing expense: "Paid Rs 3000 to AKASH"
    const paidToAkash = parseAlert('Paid Rs 3000 to AKASH from A/C 0741');
    assert.strictEqual(paidToAkash.amount, 3000);
    assert.strictEqual(paidToAkash.type, 'expense');
    assert.strictEqual(paidToAkash.merchantNormalized, 'Akash');
  });

  await t.test('16. AutoPay setup, addition, cancellation, and deletion notifications are completely rejected', () => {
    const testCases = [
      'UPI AutoPay of Rs. 3000.00 has been set up successfully on your A/C XX0741',
      'AutoPay set up for Rs. 499 towards NETFLIX',
      'Mandate created for Rs. 5000 on account ending 0741',
      'AutoPay deleted: Mandate for Rs. 199.00 has been deleted',
      'Mandate for Rs. 1,000.00 has been cancelled successfully',
      'Auto pay cancel: Mandate for Rs. 500 on account ending 1234 has been cancelled',
      'Auto pay lgya Rs 500',
      'Auto pay lagaya Rs 299 for Hotstar',
      'Auto pay delete kiya Rs 199 mandate',
      'eNACH mandate registered for Rs. 1500',
      'SI set up successfully on your credit card for Rs. 1000',
      'AutoPay mandate revoked for Rs. 1500.00',
    ];

    for (const text of testCases) {
      const parsed = parseAlert(text);
      assert.strictEqual(parsed.isOtpOrPromo, true, `Expected isOtpOrPromo=true for: "${text}"`);
      assert.strictEqual(parsed.amount, null, `Expected amount=null for: "${text}"`);
      assert.strictEqual(parsed.confidence, 0, `Expected confidence=0 for: "${text}"`);
    }
  });
});

