/**
 * scripts/backfill-coupon-codeupper.js
 * 
 * One-off admin script to backfill `codeUpper` for all existing Firestore coupons.
 * This enables O(1) indexed lookups by uppercase coupon code, eliminating the need
 * for full collection scans across the public coupons collection.
 * 
 * Usage:
 *   node scripts/backfill-coupon-codeupper.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAy0P_i2ywT_jpF_leDU-oo3juR1Pu9VJE",
  authDomain: "paisewaise-e545e.firebaseapp.com",
  projectId: "paisewaise-e545e",
  storageBucket: "paisewaise-e545e.firebasestorage.app",
  messagingSenderId: "26927139619",
  appId: "1:26927139619:android:e0cace3a90101a2b02da96"
};

async function backfillCoupons() {
  console.log('--- Starting Coupon codeUpper Backfill ---');
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const couponsRef = collection(db, 'coupons');
  console.log('Fetching coupons from Firestore...');
  const snapshot = await getDocs(couponsRef);

  console.log(`Found ${snapshot.size} coupon documents.`);

  let updatedCount = 0;
  let alreadyValidCount = 0;
  let errorCount = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const rawCode = data.code || data.coupon_code || docSnap.id;
    const codeUpper = String(rawCode).trim().toUpperCase();

    if (!codeUpper) {
      console.warn(`[Skip] Document ${docSnap.id} has no discernable code.`);
      continue;
    }

    if (data.codeUpper === codeUpper) {
      alreadyValidCount++;
      continue;
    }

    try {
      console.log(`[Updating] Doc ID: ${docSnap.id} -> codeUpper: "${codeUpper}"`);
      await updateDoc(doc(db, 'coupons', docSnap.id), { codeUpper });
      updatedCount++;
    } catch (err) {
      console.error(`[Error] Failed to update doc ${docSnap.id}:`, err);
      errorCount++;
    }
  }

  console.log('\n--- Backfill Summary ---');
  console.log(`Total Scanned:  ${snapshot.size}`);
  console.log(`Updated:        ${updatedCount}`);
  console.log(`Already Valid:  ${alreadyValidCount}`);
  console.log(`Errors:         ${errorCount}`);
  console.log('--- Finished ---');
}

backfillCoupons().catch(err => {
  console.error('Fatal error running backfill:', err);
  process.exit(1);
});
