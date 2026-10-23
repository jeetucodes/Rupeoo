import test from 'node:test';
import assert from 'node:assert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  matchIncomingEvent,
  registerUnmatchedTransaction,
  resetUnmatchedStore,
  resetInMemoryMatcherState,
  formatSourcesDisplay,
  areRefNosMatching,
  areMerchantsFuzzyEqual,
  type MatcherEvent,
} from '../crossSourceMatcher.ts';

// In-memory backing for AsyncStorage under Node.js test environment
const memoryStore = new Map<string, string>();
AsyncStorage.getItem = async (key: string) => memoryStore.get(key) ?? null;
AsyncStorage.setItem = async (key: string, value: string) => {
  memoryStore.set(key, String(value));
};
AsyncStorage.removeItem = async (key: string) => {
  memoryStore.delete(key);
};
AsyncStorage.clear = async () => {
  memoryStore.clear();
};

test('Cross-Source Transaction Matcher Suite', async (t) => {
  await t.beforeEach(async () => {
    await AsyncStorage.clear();
    await resetUnmatchedStore();
  });

  await t.test('1. App notification arrives first, then SMS 2 min later -> Merges & Enriches with refNo', async () => {
    const baseTime = Date.now();

    // Event 1: App notification from PhonePe
    const appEvent: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 150.0,
      type: 'debit',
      timestamp: baseTime,
      merchant: 'Chai Point',
      accountLast4: '1234',
      refNo: null, // Bank hasn't provided UTR in initial quick alert
    };

    const firstMatch = await matchIncomingEvent(appEvent);
    assert.strictEqual(firstMatch.matched, false);
    assert.strictEqual(firstMatch.action, 'create');

    // Register Tx1
    const txId = 'tx_auto_001';
    await registerUnmatchedTransaction(txId, appEvent);

    // Event 2: SMS arrives 2 minutes later with Bank UTR/Ref
    const smsEvent: MatcherEvent = {
      source: 'sms',
      sender: 'AD-HDFCBK',
      amount: 150.0,
      type: 'debit',
      timestamp: baseTime + 2 * 60 * 1000,
      merchant: 'CHAI POINT INDIRANAGAR',
      accountLast4: '1234',
      refNo: 'UPI123456789012',
    };

    const secondMatch = await matchIncomingEvent(smsEvent);
    assert.strictEqual(secondMatch.matched, true);
    assert.strictEqual(secondMatch.action, 'enrich');
    assert.strictEqual(secondMatch.matchedTxId, txId);
    assert.strictEqual(secondMatch.enrichedFields?.ref_no, 'UPI123456789012');
    assert.strictEqual(secondMatch.enrichedFields?.sources.length, 2);

    const sourcesText = formatSourcesDisplay(secondMatch.enrichedFields!.sources);
    assert.ok(sourcesText.includes('PhonePe'));
    assert.ok(sourcesText.includes('SMS'));
  });

  await t.test('2. SMS arrives first, then App notification arrives later -> Merges & Enriches', async () => {
    const baseTime = Date.now();

    // Event 1: SMS arrives first
    const smsEvent: MatcherEvent = {
      source: 'sms',
      sender: 'VM-ICICIB',
      amount: 450.0,
      type: 'debit',
      timestamp: baseTime,
      merchant: 'Swiggy',
      accountLast4: '5678',
      refNo: 'REF987654321',
    };

    const firstMatch = await matchIncomingEvent(smsEvent);
    assert.strictEqual(firstMatch.matched, false);

    const txId = 'tx_sms_002';
    await registerUnmatchedTransaction(txId, smsEvent);

    // Event 2: Google Pay notification arrives 1 minute later
    const gpayEvent: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      amount: 450.0,
      type: 'debit',
      timestamp: baseTime + 60 * 1000,
      merchant: 'SWIGGY BANGALORE',
      accountLast4: '5678',
      refNo: 'REF987654321',
    };

    const secondMatch = await matchIncomingEvent(gpayEvent);
    assert.strictEqual(secondMatch.matched, true);
    assert.strictEqual(secondMatch.matchedTxId, txId);
    assert.strictEqual(secondMatch.enrichedFields?.sources.length, 2);

    const sourcesText = formatSourcesDisplay(secondMatch.enrichedFields!.sources);
    assert.ok(sourcesText.includes('SMS'));
    assert.ok(sourcesText.includes('Google Pay'));
  });

  await t.test('3. Two identical payments 3 minutes apart with 2 App notifications and 2 SMS -> Exactly 2 transactions (strictly 1-to-1)', async () => {
    const t0 = Date.now();
    const t1 = t0;
    const t2 = t0 + 2 * 60 * 1000;
    const t3 = t0 + 3 * 60 * 1000;
    const t4 = t0 + 5 * 60 * 1000;

    // Payment 1 App notification (at t1)
    const app1: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 50.0,
      type: 'debit',
      timestamp: t1,
      merchant: 'Tea Stall',
      refNo: 'UTR_PAYMENT_1',
    };
    const matchApp1 = await matchIncomingEvent(app1);
    assert.strictEqual(matchApp1.matched, false);
    const tx1Id = 'tx_pay_1';
    await registerUnmatchedTransaction(tx1Id, app1);

    // Payment 1 SMS (at t2)
    const sms1: MatcherEvent = {
      source: 'sms',
      sender: 'AD-SBIINB',
      amount: 50.0,
      type: 'debit',
      timestamp: t2,
      merchant: 'Tea Stall',
      refNo: 'UTR_PAYMENT_1',
    };
    const matchSms1 = await matchIncomingEvent(sms1);
    assert.strictEqual(matchSms1.matched, true);
    assert.strictEqual(matchSms1.matchedTxId, tx1Id);

    // Payment 2 App notification (at t3, 3 mins later for same amount & shop)
    const app2: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 50.0,
      type: 'debit',
      timestamp: t3,
      merchant: 'Tea Stall',
      refNo: 'UTR_PAYMENT_2',
    };
    const matchApp2 = await matchIncomingEvent(app2);
    // Crucial: Tx1 is already matched, so App2 CANNOT match Tx1!
    assert.strictEqual(matchApp2.matched, false);
    const tx2Id = 'tx_pay_2';
    await registerUnmatchedTransaction(tx2Id, app2);

    // Payment 2 SMS (at t4)
    const sms2: MatcherEvent = {
      source: 'sms',
      sender: 'AD-SBIINB',
      amount: 50.0,
      type: 'debit',
      timestamp: t4,
      merchant: 'Tea Stall',
      refNo: 'UTR_PAYMENT_2',
    };
    const matchSms2 = await matchIncomingEvent(sms2);
    assert.strictEqual(matchSms2.matched, true);
    assert.strictEqual(matchSms2.matchedTxId, tx2Id);

    // Exactly 2 transactions created, each enriched 1-to-1!
  });

  await t.test('4. Two app notifications and only one SMS -> 2 transactions, one enriched, one single', async () => {
    const t0 = Date.now();

    // App notification 1
    const app1: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 100.0,
      type: 'debit',
      timestamp: t0,
      merchant: 'Metro Recharge',
    };
    await matchIncomingEvent(app1);
    await registerUnmatchedTransaction('tx_metro_1', app1);

    // App notification 2 (5 mins later)
    const app2: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 100.0,
      type: 'debit',
      timestamp: t0 + 5 * 60 * 1000,
      merchant: 'Metro Recharge',
    };
    await matchIncomingEvent(app2);
    await registerUnmatchedTransaction('tx_metro_2', app2);

    // Only 1 SMS arrives (at t0 + 1 min, closer to app1)
    const sms1: MatcherEvent = {
      source: 'sms',
      sender: 'AD-HDFCBK',
      amount: 100.0,
      type: 'debit',
      timestamp: t0 + 1 * 60 * 1000,
      merchant: 'METRO',
    };
    const matchSms = await matchIncomingEvent(sms1);
    assert.strictEqual(matchSms.matched, true);
    assert.strictEqual(matchSms.matchedTxId, 'tx_metro_1'); // Matched closest in time

    // Next SMS does not arrive. Result: exactly 2 transactions (tx_metro_1 enriched, tx_metro_2 single).
  });

  await t.test('5. Same amount but different type (debit vs credit refund) -> Never matched (2 transactions)', async () => {
    const t0 = Date.now();

    // Debit payment of 899
    const debitEvent: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 899.0,
      type: 'debit',
      timestamp: t0,
      merchant: 'Amazon',
    };
    await registerUnmatchedTransaction('tx_debit_amazon', debitEvent);

    // Credit refund of 899
    const creditSms: MatcherEvent = {
      source: 'sms',
      sender: 'AD-HDFCBK',
      amount: 899.0,
      type: 'credit', // Refund!
      timestamp: t0 + 3 * 60 * 1000,
      merchant: 'Amazon Refund',
    };

    const matchRes = await matchIncomingEvent(creditSms);
    assert.strictEqual(matchRes.matched, false);
    assert.strictEqual(matchRes.action, 'create');
  });

  await t.test('6. SMS arriving 40 minutes later -> Merges if refNo matches via Strong Match', async () => {
    const t0 = Date.now();
    const existingTx = {
      id: 'tx_old_app_001',
      source: 'app_notification',
      amount: 1200.0,
      type: 'debit',
      created_at: t0,
      ref_no: 'UTR998877665544',
      merchant_name: 'Flipkart',
    };

    // SMS arrives 40 minutes later
    const lateSms: MatcherEvent = {
      source: 'sms',
      sender: 'AD-KOTAKB',
      amount: 1200.0,
      type: 'debit',
      timestamp: t0 + 40 * 60 * 1000,
      refNo: 'UTR998877665544',
      accountLast4: '3456',
    };

    const matchRes = await matchIncomingEvent(lateSms, [existingTx]);
    assert.strictEqual(matchRes.matched, true);
    assert.strictEqual(matchRes.reason, 'strong_ref_match');
    assert.strictEqual(matchRes.matchedTxId, 'tx_old_app_001');
    assert.strictEqual(matchRes.enrichedFields?.accountLast4, '3456');
  });

  await t.test('7. Same-source repeats are NOT paired by cross-source matcher', async () => {
    const t0 = Date.now();

    // App notification from PhonePe
    const app1: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 250.0,
      type: 'debit',
      timestamp: t0,
      merchant: 'Zomato',
    };
    await registerUnmatchedTransaction('tx_zomato_1', app1);

    // Repeated App notification from same app (e.g. Android reposting notification)
    const app2Repeat: MatcherEvent = {
      source: 'upi_app', // Same source!
      packageName: 'com.phonepe.app',
      amount: 250.0,
      type: 'debit',
      timestamp: t0 + 500,
      merchant: 'Zomato',
    };

    const matchRes = await matchIncomingEvent(app2Repeat);
    assert.strictEqual(matchRes.matched, false); // Cross-matcher refuses same-source pairing
  });

  await t.test('8. App killed between the two events -> Restores unmatched index from AsyncStorage', async () => {
    const t0 = Date.now();

    const appEvent: MatcherEvent = {
      source: 'upi_app',
      packageName: 'com.phonepe.app',
      amount: 320.0,
      type: 'debit',
      timestamp: t0,
      merchant: 'Uber Rides',
      accountLast4: '9900',
    };

    // App registers unmatched transaction and simulates app process termination
    await registerUnmatchedTransaction('tx_uber_1', appEvent);

    // Verify persisted in AsyncStorage
    const storedRaw = await AsyncStorage.getItem('@rupeo_cross_source_unmatched_v1');
    assert.ok(storedRaw !== null);

    // Reset in-memory cache to simulate cold app restart (keeping storage intact)
    resetInMemoryMatcherState();

    // SMS arrives after app restart
    const smsEvent: MatcherEvent = {
      source: 'sms',
      sender: 'AD-AXISBK',
      amount: 320.0,
      type: 'debit',
      timestamp: t0 + 3 * 60 * 1000,
      merchant: 'UBER INDIA',
      accountLast4: '9900',
      refNo: 'AXIS_UTR_8833',
    };

    const matchRes = await matchIncomingEvent(smsEvent);
    assert.strictEqual(matchRes.matched, true);
    assert.strictEqual(matchRes.matchedTxId, 'tx_uber_1');
    assert.strictEqual(matchRes.enrichedFields?.ref_no, 'AXIS_UTR_8833');
  });

  await t.test('9. RefNo partial matching (last 6 characters)', () => {
    assert.strictEqual(areRefNosMatching('123456789012', '56789012'), true);
    assert.strictEqual(areRefNosMatching('UPI/123456789012', '123456789012'), true);
    assert.strictEqual(areRefNosMatching('123456789012', '999999999999'), false);
    assert.strictEqual(areRefNosMatching(null, '123456'), false);
  });

  await t.test('10. Fuzzy merchant matching handles brand substrings and generic fallback', () => {
    assert.strictEqual(areMerchantsFuzzyEqual('Swiggy', 'Swiggy Bangalore Pvt Ltd'), true);
    assert.strictEqual(areMerchantsFuzzyEqual('Chai Point', 'Chai Point Indiranagar'), true);
    assert.strictEqual(areMerchantsFuzzyEqual('Expense', 'Starbucks'), true); // Generic fallback
    assert.strictEqual(areMerchantsFuzzyEqual('Zomato', 'McDonalds'), false);
  });
});
