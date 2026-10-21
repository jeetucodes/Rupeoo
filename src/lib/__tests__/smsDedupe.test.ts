import test from 'node:test';
import assert from 'node:assert';
import {
  computeMsgHash,
  computePayKey,
  getCandidatePayKeys,
  createDeterministicTxId,
  normalizeForHash,
  collapseDuplicatePaymentAlerts,
  type EnrichedAlertItem,
} from '../smsDedupe.ts';
import { parseAlert } from '../alertParser.ts';

test('SMS 4-Layer Dedupe - Comprehensive Edge Cases', async (t) => {
  const baseTime = 1792600000000; // Fixed timestamp for reproducible testing

  await t.test('Edge Case 1: Same SMS imported 5 times -> identical msgHash and payKey', () => {
    const rawSms = {
      sender: 'AD-HDFCBK-S',
      body: 'Sent Rs. 450.00 from HDFC Bank A/C *1234 to SWIGGY on 21-OCT-26 via UPI/P2M/629584729104.',
      timestamp: baseTime,
    };

    const parsed = parseAlert(rawSms.body, { sender: rawSms.sender, timestamp: rawSms.timestamp });
    const hashes: string[] = [];
    const payKeys: string[] = [];

    for (let i = 0; i < 5; i++) {
      hashes.push(computeMsgHash(rawSms.sender, rawSms.body, rawSms.timestamp));
      payKeys.push(computePayKey(parsed.amount, parsed.type, parsed.refNo, parsed.accountLast4, rawSms.timestamp));
    }

    // All 5 msgHashes must be strictly identical
    const uniqueHashes = new Set(hashes);
    assert.strictEqual(uniqueHashes.size, 1);

    // All 5 payKeys must be strictly identical
    const uniquePayKeys = new Set(payKeys);
    assert.strictEqual(uniquePayKeys.size, 1);

    // The deterministic document ID must be identical across all 5 runs
    const docId1 = createDeterministicTxId(payKeys[0]);
    const docId5 = createDeterministicTxId(payKeys[4]);
    assert.strictEqual(docId1, docId5);
  });

  await t.test('Edge Case 2: Same payment via Bank SMS + GPay notification -> collapses into 1 with richest data', () => {
    // Alert A: Bank SMS (has account *1234, ref 629584729104, generic name)
    const smsA = {
      sender: 'AD-HDFCBK',
      body: 'Rs. 450.00 debited from A/C *1234 on 21-OCT-26 to SWIGGY. Ref: 629584729104.',
      timestamp: baseTime,
    };
    const parsedA = parseAlert(smsA.body, { sender: smsA.sender, timestamp: smsA.timestamp });
    const payKeyA = computePayKey(parsedA.amount, parsedA.type, parsedA.refNo, parsedA.accountLast4, smsA.timestamp);

    // Alert B: GPay notification 30 seconds later (has rich name Swiggy Bundl Technologies, same ref)
    const notifB = {
      sender: 'Google Pay',
      body: 'Paid Rs. 450.00 to SWIGGY BUNDL TECHNOLOGIES PVT LTD on 21-OCT-26. UPI Ref 629584729104.',
      timestamp: baseTime + 30000,
    };
    const parsedB = parseAlert(notifB.body, { sender: notifB.sender, timestamp: notifB.timestamp });
    const payKeyB = computePayKey(parsedB.amount, parsedB.type, parsedB.refNo, parsedB.accountLast4, notifB.timestamp);

    const items: EnrichedAlertItem[] = [
      { alert: parsedA, msgHash: 'hash_a', payKey: payKeyA },
      { alert: parsedB, msgHash: 'hash_b', payKey: payKeyB },
    ];

    const collapsed = collapseDuplicatePaymentAlerts(items);

    // Must collapse into exactly 1 record
    assert.strictEqual(collapsed.length, 1);

    // The merged record must retain the richest data
    const merged = collapsed[0].alert;
    assert.strictEqual(merged.amount, 450);
    assert.strictEqual(merged.refNo, '629584729104');
    assert.strictEqual(merged.accountLast4, '1234'); // Kept from Bank SMS
    assert.ok(merged.merchantNormalized?.includes('Swiggy Bundl')); // Kept richer name from GPay
  });

  await t.test('Edge Case 3: Two genuine identical payments within minutes with different refNos -> must stay 2', () => {
    const time1 = baseTime;
    const time2 = baseTime + 60000; // 1 minute later

    // Payment 1: Chai 20 Rs with UTR 629581920191
    const p1 = parseAlert('Sent Rs. 20.00 to CHAI POINT via UPI Ref 629581920191.', { timestamp: time1 });
    const key1 = computePayKey(p1.amount, p1.type, p1.refNo, p1.accountLast4, time1);

    // Payment 2: Second cup of Chai 20 Rs with different UTR 629581920192
    const p2 = parseAlert('Sent Rs. 20.00 to CHAI POINT via UPI Ref 629581920192.', { timestamp: time2 });
    const key2 = computePayKey(p2.amount, p2.type, p2.refNo, p2.accountLast4, time2);

    // Different UTRs produce different payKeys
    assert.notStrictEqual(key1, key2);

    const collapsed = collapseDuplicatePaymentAlerts([
      { alert: p1, msgHash: 'h1', payKey: key1 },
      { alert: p2, msgHash: 'h2', payKey: key2 },
    ]);

    // Must NOT collapse! Must stay 2 distinct transactions!
    assert.strictEqual(collapsed.length, 2);
  });

  await t.test('Edge Case 4: Same amount at the same merchant on different days -> must stay 2', () => {
    const day1 = baseTime;
    const day2 = baseTime + 24 * 60 * 60 * 1000; // 1 day later

    // Monday Lunch: Swiggy 350
    const lunchDay1 = parseAlert('Rs. 350.00 paid to SWIGGY on A/c *1234.', { timestamp: day1 });
    const keyDay1 = computePayKey(lunchDay1.amount, lunchDay1.type, lunchDay1.merchantNormalized, lunchDay1.accountLast4, day1);

    // Tuesday Lunch: Swiggy 350
    const lunchDay2 = parseAlert('Rs. 350.00 paid to SWIGGY on A/c *1234.', { timestamp: day2 });
    const keyDay2 = computePayKey(lunchDay2.amount, lunchDay2.type, lunchDay2.merchantNormalized, lunchDay2.accountLast4, day2);

    assert.notStrictEqual(keyDay1, keyDay2);

    const collapsed = collapseDuplicatePaymentAlerts([
      { alert: lunchDay1, msgHash: 'h_mon', payKey: keyDay1 },
      { alert: lunchDay2, msgHash: 'h_tue', payKey: keyDay2 },
    ]);

    // Must stay 2 distinct transactions!
    assert.strictEqual(collapsed.length, 2);
  });

  await t.test('Edge Case 5: Device clock/timezone change (boundary edges within ±2 min)', () => {
    // Boundary edge: Payment alert 1 at 10:01:59 and alert 2 at 10:02:01 (2 seconds apart across bucket boundary)
    const tBoundary1 = 120000 - 1000; // 119000ms
    const tBoundary2 = 120000 + 1000; // 121000ms

    const alert1 = parseAlert('Rs. 150.00 paid to UBER UPI Ref: 629581920194.', { timestamp: tBoundary1 });
    const alert2 = parseAlert('Rs. 150.00 paid to UBER INDIA UPI Ref: 629581920194.', { timestamp: tBoundary2 });

    const key1 = computePayKey(alert1.amount, alert1.type, alert1.refNo, alert1.accountLast4, tBoundary1);
    const key2 = computePayKey(alert2.amount, alert2.type, alert2.refNo, alert2.accountLast4, tBoundary2);

    // Candidate keys of alert2 include adjacent bucket offset -1 which matches key1
    const candidates2 = getCandidatePayKeys(alert2.amount, alert2.type, alert2.refNo, alert2.accountLast4, tBoundary2);
    assert.ok(candidates2.includes(key1));

    const collapsed = collapseDuplicatePaymentAlerts([
      { alert: alert1, msgHash: 'hb1', payKey: key1 },
      { alert: alert2, msgHash: 'hb2', payKey: key2 },
    ]);

    // Boundary edge collapses correctly
    assert.strictEqual(collapsed.length, 1);
  });

  await t.test('Edge Case 6: App killed mid-import and resumed -> incremental cursor & hashes skip already processed', () => {
    const rawList = [
      { sender: 'AD-HDFCBK', body: 'Rs. 100 paid to TEA.', date: baseTime + 1000 },
      { sender: 'AD-HDFCBK', body: 'Rs. 200 paid to COFFEE.', date: baseTime + 2000 },
      { sender: 'AD-HDFCBK', body: 'Rs. 300 paid to LUNCH.', date: baseTime + 3000 },
    ];

    // Simulate batch 1 processed first 2 messages before app was killed
    const processedHashes = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const h = computeMsgHash(rawList[i].sender, rawList[i].body, rawList[i].date);
      processedHashes.add(h);
    }

    // On resume: scanning all 3 messages
    let newlyAdded = 0;
    let skipped = 0;

    for (const msg of rawList) {
      const h = computeMsgHash(msg.sender, msg.body, msg.date);
      if (processedHashes.has(h)) {
        skipped++;
      } else {
        newlyAdded++;
        processedHashes.add(h);
      }
    }

    // Exactly 2 skipped, exactly 1 added!
    assert.strictEqual(skipped, 2);
    assert.strictEqual(newlyAdded, 1);
  });

  await t.test('Edge Case 7: Reinstall + re-import -> deterministic document ID avoids Firestore duplication', () => {
    // When the app is reinstalled, local AsyncStorage might be wiped, but the deterministic doc ID is derived from the payment key
    const payment = parseAlert('Sent Rs. 999.00 to MYNTRA via UPI/629581920194.', { timestamp: baseTime });
    const payKey = computePayKey(payment.amount, payment.type, payment.refNo, payment.accountLast4, baseTime);

    // Initial Install Write:
    const docIdInitial = createDeterministicTxId(payKey);

    // Reinstall + Re-import Write:
    const docIdReinstall = createDeterministicTxId(payKey);

    // Document ID matches exactly: 'sms_' + payKey
    assert.strictEqual(docIdInitial, docIdReinstall);
    assert.ok(docIdInitial.startsWith('sms_'));
  });
});
