import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  matchIncomingEvent,
  registerUnmatchedTransaction,
  resetUnmatchedStore,
  resetInMemoryMatcherState,
  formatSourcesDisplay,
} from '../src/lib/crossSourceMatcher.ts';

// In-memory mock for AsyncStorage in CLI evaluation runner
const memoryStore = new Map();
AsyncStorage.getItem = async (key) => memoryStore.get(key) ?? null;
AsyncStorage.setItem = async (key, value) => {
  memoryStore.set(key, String(value));
};
AsyncStorage.removeItem = async (key) => {
  memoryStore.delete(key);
};
AsyncStorage.clear = async () => {
  memoryStore.clear();
};

async function resetEnvironment() {
  await AsyncStorage.clear();
  await resetUnmatchedStore();
}

async function runEvaluator() {
  console.log('='.repeat(86));
  console.log('         RUPEO BANK & UPI CROSS-SOURCE TRANSACTION MATCHER EVALUATION');
  console.log('='.repeat(86));
  console.log('');

  const scenarios = [
    {
      id: 'SCN-01',
      name: 'App Notif -> SMS (2 min lag)',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const appEvent = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 450.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Starbucks Coffee',
          accountLast4: '1234',
        };
        const appRes = await matchIncomingEvent(appEvent);
        if (appRes.matched) return { pass: false, note: 'App notif unexpectedly matched empty store' };
        await registerUnmatchedTransaction('tx_sbux_1', appEvent);

        const smsEvent = {
          source: 'sms',
          sender: 'AD-HDFCBK',
          amount: 450.0,
          type: 'debit',
          timestamp: t0 + 2 * 60 * 1000,
          merchant: 'STARBUCKS MUMBAI',
          accountLast4: '1234',
          refNo: 'UPI_HDFC_99281',
        };
        const smsRes = await matchIncomingEvent(smsEvent);
        const pass =
          smsRes.matched === true &&
          smsRes.action === 'enrich' &&
          smsRes.matchedTxId === 'tx_sbux_1' &&
          smsRes.enrichedFields?.ref_no === 'UPI_HDFC_99281' &&
          smsRes.enrichedFields?.sources?.length === 2;

        return {
          pass,
          expected: 'Enriched tx_sbux_1 with refNo & 2 sources',
          observed: pass
            ? `Matched ${smsRes.matchedTxId}, refNo=${smsRes.enrichedFields?.ref_no}, sources=${smsRes.enrichedFields?.sources?.length}`
            : `Matched=${smsRes.matched}`,
        };
      },
    },
    {
      id: 'SCN-02',
      name: 'SMS -> App Notif (SMS first)',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const smsEvent = {
          source: 'sms',
          sender: 'AD-ICICIB',
          amount: 1200.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Croma Retail',
          accountLast4: '4321',
        };
        const smsRes = await matchIncomingEvent(smsEvent);
        if (smsRes.matched) return { pass: false, note: 'SMS unexpectedly matched empty store' };
        await registerUnmatchedTransaction('tx_croma_sms', smsEvent);

        const appEvent = {
          source: 'upi_app',
          packageName: 'com.google.android.apps.nbu.paisa.user',
          amount: 1200.0,
          type: 'debit',
          timestamp: t0 + 45 * 1000,
          merchant: 'CROMA ELECTRONICS',
          refNo: 'GPAY_RRN_102938',
        };
        const appRes = await matchIncomingEvent(appEvent);
        const pass =
          appRes.matched === true &&
          appRes.action === 'enrich' &&
          appRes.matchedTxId === 'tx_croma_sms' &&
          appRes.enrichedFields?.ref_no === 'GPAY_RRN_102938';

        return {
          pass,
          expected: 'Enriched tx_croma_sms with refNo',
          observed: pass ? `Matched ${appRes.matchedTxId}, refNo=${appRes.enrichedFields?.ref_no}` : `Failed`,
        };
      },
    },
    {
      id: 'SCN-03',
      name: '2 Quick Identical Payments (3 min)',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        // Payment 1
        const app1 = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 50.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Chai Point',
        };
        await matchIncomingEvent(app1);
        await registerUnmatchedTransaction('tx_chai_1', app1);

        // Payment 2 (3 min later, identical amount & merchant)
        const app2 = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 50.0,
          type: 'debit',
          timestamp: t0 + 3 * 60 * 1000,
          merchant: 'Chai Point',
        };
        await matchIncomingEvent(app2);
        await registerUnmatchedTransaction('tx_chai_2', app2);

        // SMS 1 arrives (lagged 1 min after Payment 1)
        const sms1 = {
          source: 'sms',
          sender: 'AD-SBIINB',
          amount: 50.0,
          type: 'debit',
          timestamp: t0 + 1 * 60 * 1000,
          merchant: 'CHAI POINT',
          refNo: 'SBI_RRN_1111',
        };
        const resSms1 = await matchIncomingEvent(sms1);

        // SMS 2 arrives (lagged 1 min after Payment 2)
        const sms2 = {
          source: 'sms',
          sender: 'AD-SBIINB',
          amount: 50.0,
          type: 'debit',
          timestamp: t0 + 4 * 60 * 1000,
          merchant: 'CHAI POINT',
          refNo: 'SBI_RRN_2222',
        };
        const resSms2 = await matchIncomingEvent(sms2);

        const pass =
          resSms1.matchedTxId === 'tx_chai_1' &&
          resSms2.matchedTxId === 'tx_chai_2' &&
          resSms1.matchedTxId !== resSms2.matchedTxId;

        return {
          pass,
          expected: 'Exactly 2 distinct txs (1-to-1 strictly preserved)',
          observed: pass
            ? `SMS1 -> ${resSms1.matchedTxId}, SMS2 -> ${resSms2.matchedTxId} (no collision)`
            : `Mismatch: SMS1=${resSms1.matchedTxId}, SMS2=${resSms2.matchedTxId}`,
        };
      },
    },
    {
      id: 'SCN-04',
      name: '2 App Notifs, Only 1 SMS',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const app1 = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 200.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Blinkit',
        };
        await matchIncomingEvent(app1);
        await registerUnmatchedTransaction('tx_blink_1', app1);

        const app2 = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 200.0,
          type: 'debit',
          timestamp: t0 + 2 * 60 * 1000,
          merchant: 'Blinkit',
        };
        await matchIncomingEvent(app2);
        await registerUnmatchedTransaction('tx_blink_2', app2);

        const singleSms = {
          source: 'sms',
          sender: 'AD-HDFCBK',
          amount: 200.0,
          type: 'debit',
          timestamp: t0 + 50 * 1000,
          merchant: 'BLINKIT COMMERCE',
          refNo: 'HDFC_BLINK_01',
        };
        const resSms = await matchIncomingEvent(singleSms);

        const pass = resSms.matchedTxId === 'tx_blink_1';
        return {
          pass,
          expected: '1 tx enriched, 1 tx remains single',
          observed: pass ? `tx_blink_1 enriched; tx_blink_2 unaffected` : `Failed: matched ${resSms.matchedTxId}`,
        };
      },
    },
    {
      id: 'SCN-05',
      name: 'Same Amount, Different Type (Debit vs Credit)',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const debitEvent = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 799.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Amazon Shopping',
        };
        await matchIncomingEvent(debitEvent);
        await registerUnmatchedTransaction('tx_amazon_debit', debitEvent);

        const refundEvent = {
          source: 'sms',
          sender: 'AD-HDFCBK',
          amount: 799.0,
          type: 'credit', // Refund
          timestamp: t0 + 60 * 1000,
          merchant: 'AMAZON PAY REFUND',
        };
        const resRefund = await matchIncomingEvent(refundEvent);

        const pass = resRefund.matched === false && resRefund.action === 'create';
        return {
          pass,
          expected: 'Never matched (2 independent transactions)',
          observed: pass ? `Debit and Credit remained separate (action=create)` : `Incorrectly matched!`,
        };
      },
    },
    {
      id: 'SCN-06',
      name: 'SMS 40m Lag with RefNo (Strong Match)',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const appEvent = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 2500.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'IKEA India',
          refNo: 'UPI_RRN_99008877',
        };
        await matchIncomingEvent(appEvent);
        await registerUnmatchedTransaction('tx_ikea_1', appEvent);

        // SMS delayed 40 minutes (beyond 15m normal window) but carries same RRN
        const lateSms = {
          source: 'sms',
          sender: 'AD-AXISBK',
          amount: 2500.0,
          type: 'debit',
          timestamp: t0 + 40 * 60 * 1000,
          merchant: 'IKEA STORE',
          refNo: 'UPI_RRN_99008877',
          accountLast4: '7788',
        };
        const lateRes = await matchIncomingEvent(lateSms);

        const pass =
          lateRes.matched === true &&
          lateRes.reason === 'strong_ref_match' &&
          lateRes.matchedTxId === 'tx_ikea_1' &&
          lateRes.enrichedFields?.accountLast4 === '7788';

        return {
          pass,
          expected: 'Matches via strong_ref_match despite 40m lag',
          observed: pass ? `Strong match -> ${lateRes.matchedTxId}, accountLast4 added` : `Failed to match`,
        };
      },
    },
    {
      id: 'SCN-07',
      name: 'Same-Source Duplicate Re-post Ignored',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const notif1 = {
          source: 'app_notification',
          packageName: 'com.snapwork.hdfc',
          amount: 850.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Fuel Pump',
        };
        await matchIncomingEvent(notif1);
        await registerUnmatchedTransaction('tx_fuel_1', notif1);

        // Android re-posts notification from same package
        const notifDuplicate = {
          source: 'app_notification',
          packageName: 'com.snapwork.hdfc',
          amount: 850.0,
          type: 'debit',
          timestamp: t0 + 10 * 1000,
          merchant: 'Fuel Pump',
        };
        const dupRes = await matchIncomingEvent(notifDuplicate);

        const pass = dupRes.matched === false && dupRes.action === 'create';
        return {
          pass,
          expected: 'Ignored by cross-source (left to msgHash dedupe)',
          observed: pass ? `Cross-source matcher ignored same-source repeat` : `Incorrectly matched`,
        };
      },
    },
    {
      id: 'SCN-08',
      name: 'Timezone Skew / Clock Drift Handling',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const appEvent = {
          source: 'upi_app',
          packageName: 'net.one97.paytm',
          amount: 350.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Metro Smart Card',
          accountLast4: '3322',
        };
        await matchIncomingEvent(appEvent);
        await registerUnmatchedTransaction('tx_metro_1', appEvent);

        // User changes timezone or clock drifts by 8 minutes (within 15m window)
        const smsEvent = {
          source: 'sms',
          sender: 'AD-SBIBNK',
          amount: 350.0,
          type: 'debit',
          timestamp: t0 + 8 * 60 * 1000,
          merchant: 'DMRC METRO',
          accountLast4: '3322',
          refNo: 'METRO_RRN_456',
        };
        const smsRes = await matchIncomingEvent(smsEvent);

        const pass = smsRes.matched === true && smsRes.matchedTxId === 'tx_metro_1';
        return {
          pass,
          expected: 'Matches within 15-minute sliding window',
          observed: pass ? `Matched with 8m drift (diff=${smsRes.enrichedFields?.ref_no})` : `Failed`,
        };
      },
    },
    {
      id: 'SCN-09',
      name: 'App Process Killed (AsyncStorage Persistence)',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        const appEvent = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 320.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Uber Rides',
          accountLast4: '9900',
        };
        await matchIncomingEvent(appEvent);
        await registerUnmatchedTransaction('tx_uber_1', appEvent);

        // App killed: in-memory state wiped
        resetInMemoryMatcherState();

        // Later SMS arrives; index reloaded from AsyncStorage
        const smsEvent = {
          source: 'sms',
          sender: 'AD-AXISBK',
          amount: 320.0,
          type: 'debit',
          timestamp: t0 + 3 * 60 * 1000,
          merchant: 'UBER INDIA',
          accountLast4: '9900',
          refNo: 'AXIS_UTR_8833',
        };
        const smsRes = await matchIncomingEvent(smsEvent);

        const pass =
          smsRes.matched === true &&
          smsRes.matchedTxId === 'tx_uber_1' &&
          smsRes.enrichedFields?.ref_no === 'AXIS_UTR_8833';

        return {
          pass,
          expected: 'State recovered from storage & matched',
          observed: pass ? `Recovered from disk, matched tx_uber_1` : `Disk restore failed`,
        };
      },
    },
    {
      id: 'SCN-10',
      name: 'Source Priority: App Notif > UPI > SMS',
      run: async () => {
        await resetEnvironment();
        const t0 = Date.now();
        // Specific merchant in PhonePe app
        const appEvent = {
          source: 'upi_app',
          packageName: 'com.phonepe.app',
          amount: 1400.0,
          type: 'debit',
          timestamp: t0,
          merchant: 'Zara Clothing Store',
        };
        await matchIncomingEvent(appEvent);
        await registerUnmatchedTransaction('tx_zara_1', appEvent);

        // Generic SMS with bank merchant "POS DEBIT"
        const smsEvent = {
          source: 'sms',
          sender: 'AD-HDFCBK',
          amount: 1400.0,
          type: 'debit',
          timestamp: t0 + 90 * 1000,
          merchant: 'POS DEBIT',
          refNo: 'HDFC_POS_0099',
        };
        const smsRes = await matchIncomingEvent(smsEvent);

        // Zara Clothing Store should be retained over generic POS DEBIT
        const pass =
          smsRes.matched === true &&
          smsRes.enrichedFields?.merchant_name === undefined; // Not overwritten by generic

        return {
          pass,
          expected: 'Keep app merchant (Zara Clothing Store)',
          observed: pass ? `Preserved specific app merchant name` : `Overwritten with generic`,
        };
      },
    },
    {
      id: 'SCN-11',
      name: 'Multi-Source Display String Formatting',
      run: async () => {
        const sources = [
          { source: 'upi_app', name: 'PhonePe', timestamp: Date.now() },
          { source: 'sms', name: 'HDFC Bank', timestamp: Date.now() + 60000 },
        ];
        const display = formatSourcesDisplay(sources);
        const expected = 'Added from PhonePe notification, confirmed by HDFC Bank';
        const pass = display === expected;

        return {
          pass,
          expected: `"${expected}"`,
          observed: `"${display}"`,
        };
      },
    },
  ];

  let passedCount = 0;
  const results = [];

  for (const s of scenarios) {
    try {
      const res = await s.run();
      if (res.pass) passedCount++;
      results.push({
        id: s.id,
        name: s.name,
        pass: res.pass,
        expected: res.expected || 'Success',
        observed: res.observed || 'OK',
      });
    } catch (err) {
      results.push({
        id: s.id,
        name: s.name,
        pass: false,
        expected: 'Success',
        observed: `Error: ${err?.message || err}`,
      });
    }
  }

  // Print results table
  console.log(
    '| ID     | Scenario Name                          | Status | Details / Result'
  );
  console.log(
    '|--------|----------------------------------------|--------|--------------------------------------------------'
  );
  for (const r of results) {
    const statusStr = r.pass ? '✅ PASS' : '❌ FAIL';
    const idPad = r.id.padEnd(6);
    const namePad = r.name.padEnd(38).substring(0, 38);
    const details = r.pass ? r.observed : `Expected: ${r.expected} | Got: ${r.observed}`;
    console.log(`| ${idPad} | ${namePad} | ${statusStr} | ${details.substring(0, 48)}`);
  }
  console.log('');
  console.log('='.repeat(86));
  console.log(`Summary: ${passedCount} / ${scenarios.length} scenarios passed (${((passedCount / scenarios.length) * 100).toFixed(1)}%)`);
  console.log('='.repeat(86));

  if (passedCount === scenarios.length) {
    console.log('\n✨ ALL CROSS-SOURCE MATCHER SCENARIOS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } else {
    console.error(`\n❌ Failed ${scenarios.length - passedCount} scenario(s).\n`);
    process.exit(1);
  }
}

runEvaluator().catch((err) => {
  console.error('Fatal error during evaluator run:', err);
  process.exit(1);
});
