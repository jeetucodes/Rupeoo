/**
 * Utility script to verify package names against the Google Play Store
 * Usage: node scripts/verify-finance-packages.mjs
 */

import https from 'node:https';
import { DEFAULT_FINANCE_APPS } from '../src/lib/financeApps.ts';

function checkPlayStore(packageName) {
  return new Promise((resolve) => {
    const url = `https://play.google.com/store/apps/details?id=${packageName}&hl=en&gl=IN`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Android; Mobile)' } }, (res) => {
      resolve({
        packageName,
        statusCode: res.statusCode,
        isLive: res.statusCode === 200,
      });
    }).on('error', (err) => {
      resolve({
        packageName,
        statusCode: 0,
        isLive: false,
        error: err.message,
      });
    });
  });
}

async function verifyAll() {
  console.log('='.repeat(70));
  console.log('   RUPEO FINANCE APP PACKAGE VERIFIER');
  console.log('='.repeat(70));

  let verifiedCount = 0;
  let unverifiedCount = 0;

  for (const app of DEFAULT_FINANCE_APPS) {
    process.stdout.write(`Checking ${app.appName} (${app.packageName})... `);
    const result = await checkPlayStore(app.packageName);
    if (result.isLive) {
      console.log('✅ LIVE (HTTP 200)');
      verifiedCount++;
    } else {
      console.log(`❌ NOT FOUND (HTTP ${result.statusCode})`);
      unverifiedCount++;
    }
  }

  console.log('='.repeat(70));
  console.log(`Summary: ${verifiedCount} Live, ${unverifiedCount} Unverified`);
}

verifyAll();
