/**
 * scripts/grandfather-existing-users.js
 *
 * Scans all existing Firebase Auth users and assigns the custom claim:
 *   { grandfathered: true }
 * Merges with existing custom claims (never overwrites).
 *
 * Skips:
 *   - Users whose email is already verified (emailVerified === true)
 *   - Users signed in via Google-only or non-password providers
 *   - Users who already have grandfathered: true
 *
 * Usage:
 *   # 1. Dry run (counts and previews only, no writes):
 *   FIREBASE_SERVICE_ACCOUNT_PATH="./service-account.json" node scripts/grandfather-existing-users.js --dry-run
 *
 *   # 2. Real run:
 *   FIREBASE_SERVICE_ACCOUNT_PATH="./service-account.json" node scripts/grandfather-existing-users.js
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const isDryRun = process.argv.includes('--dry-run');

// Read service account path from environment variable
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  console.error('\n[ERROR] Service account path not provided.');
  console.error('Please set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS.');
  console.error('Example:');
  console.error('  export FIREBASE_SERVICE_ACCOUNT_PATH="/path/to/service-account.json"');
  console.error('  node scripts/grandfather-existing-users.js --dry-run\n');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`\n[ERROR] File does not exist at: ${resolvedPath}\n`);
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
} catch (err) {
  console.error(`\n[ERROR] Failed to parse JSON from ${resolvedPath}:`, err.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();

async function runGrandfatherMigration() {
  console.log('\n======================================================');
  console.log(` Starting Grandfather Migration ${isDryRun ? '(DRY RUN - NO WRITES)' : '(LIVE WRITES)'}`);
  console.log('======================================================\n');

  let totalScanned = 0;
  let skippedAlreadyVerified = 0;
  let skippedNonPassword = 0;
  let skippedAlreadyGrandfathered = 0;
  let grandfatheredCount = 0;

  let nextPageToken = undefined;

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    const users = listResult.users;
    nextPageToken = listResult.pageToken;

    for (const user of users) {
      totalScanned++;

      // Skip users already email-verified
      if (user.emailVerified) {
        skippedAlreadyVerified++;
        continue;
      }

      // Check if user has password provider
      const hasPasswordProvider = (user.providerData || []).some(
        (p) => p.providerId === 'password'
      );

      // Skip Google-only or non-password users
      if (!hasPasswordProvider) {
        skippedNonPassword++;
        continue;
      }

      // Skip users who already have grandfathered: true
      const existingClaims = user.customClaims || {};
      if (existingClaims.grandfathered === true) {
        skippedAlreadyGrandfathered++;
        continue;
      }

      // Candidate for grandfathering
      if (isDryRun) {
        grandfatheredCount++;
        if (grandfatheredCount <= 20) {
          console.log(`[DRY RUN Candidate] UID: ${user.uid} | Email: ${user.email || 'N/A'}`);
        } else if (grandfatheredCount === 21) {
          console.log('... additional candidates will be summarized below ...');
        }
      } else {
        try {
          const mergedClaims = {
            ...existingClaims,
            grandfathered: true,
          };
          await auth.setCustomUserClaims(user.uid, mergedClaims);
          grandfatheredCount++;
          if (grandfatheredCount % 50 === 0) {
            console.log(`[PROGRESS] Grandfathered ${grandfatheredCount} users so far...`);
          }
        } catch (setClaimErr) {
          console.error(`[ERROR] Failed to set claim for UID ${user.uid}:`, setClaimErr.message);
        }
      }
    }

    console.log(`Processed batch of ${users.length} users (Total scanned: ${totalScanned})...`);
  } while (nextPageToken);

  console.log('\n======================================================');
  console.log(' Migration Summary:');
  console.log(` - Total users scanned:             ${totalScanned}`);
  console.log(` - Skipped (already emailVerified): ${skippedAlreadyVerified}`);
  console.log(` - Skipped (Google-only/no password): ${skippedNonPassword}`);
  console.log(` - Skipped (already grandfathered):  ${skippedAlreadyGrandfathered}`);
  console.log(` - ${isDryRun ? 'Candidates for grandfathering' : 'Users successfully grandfathered'}: ${grandfatheredCount}`);
  console.log('======================================================\n');

  if (isDryRun) {
    console.log('Dry run complete. No modifications were made.');
    console.log('Run without --dry-run to apply the custom claims.\n');
  } else {
    console.log('Migration complete!');
    console.log('IMPORTANT: Wait at least 1 hour for client tokens to refresh naturally,');
    console.log('or until active users have relogged before deploying Firestore rules.\n');
  }

  process.exit(0);
}

runGrandfatherMigration().catch((err) => {
  console.error('\n[FATAL ERROR] Migration failed:', err);
  process.exit(1);
});
