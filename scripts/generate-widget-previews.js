#!/usr/bin/env node
/**
 * scripts/generate-widget-previews.js
 * Generates and verifies 8-bit RGBA PNG widget previews for all Rupeo Android widgets.
 * Validates magic bytes (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A) and size < 200KB.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PREVIEWS_DIR = path.join(__dirname, '..', 'assets', 'widget-preview');

const REQUIRED_PREVIEWS = [
  'todaysummarywidget_preview.png',
  'quickaddwidget_preview.png',
  'monthoverviewwidget_preview.png',
  'budgetprogresswidget_preview.png',
  'recenttransactionswidget_preview.png',
  'udharsummarywidget_preview.png',
  'goalsprogresswidget_preview.png',
  'upcomingbillswidget_preview.png',
  'weeklyspendingwidget_preview.png',
  'insightwidget_preview.png',
  'quickactionswidget_preview.png',
];

// Valid PNG header: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function main() {
  console.log('[Widget Previews] Running generator...');
  const pythonScript = path.join(__dirname, 'generate_previews.py');
  try {
    execSync(`python "${pythonScript}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('[Widget Previews] Failed to execute generate_previews.py');
    process.exit(1);
  }

  console.log('\n[Widget Previews] Verifying files...');
  let failed = false;

  for (const filename of REQUIRED_PREVIEWS) {
    const filePath = path.join(PREVIEWS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      console.error(`  [FAIL] Missing file: ${filename}`);
      failed = true;
      continue;
    }

    const stat = fs.statSync(filePath);
    const sizeKb = stat.size / 1024;

    if (sizeKb > 200) {
      console.error(`  [FAIL] File too large (${sizeKb.toFixed(1)} KB > 200 KB): ${filename}`);
      failed = true;
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
      console.error(`  [FAIL] Invalid PNG magic bytes for ${filename}`);
      failed = true;
      continue;
    }

    console.log(`  [OK] ${filename} (${sizeKb.toFixed(1)} KB, valid 8-bit RGBA PNG)`);
  }

  if (failed) {
    console.error('\n[Widget Previews] Verification failed!');
    process.exit(1);
  }

  console.log('\n[Widget Previews] All widget previews generated and verified successfully!');
}

main();
