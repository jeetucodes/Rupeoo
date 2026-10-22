#!/usr/bin/env node

/**
 * CI/Lint script to detect broken UTF-8 encoding (mojibake) in the codebase.
 * Fails with non-zero exit code if sequences like "â‚¹", "â,¹", "â€", "Ã", "Â" are found.
 */

const fs = require('fs');
const path = require('path');

const MOJIBAKE_PATTERNS = [
  'â‚¹',
  'â,¹',
  'â€',
  'â€”',
  'â€¢',
  'âœ¦',
  'âœ…',
  'â—',
  'âž',
  'â–',
  'â€™',
  'â€˜',
  'â€œ',
  'â€\x9d',
  'Â',
];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'android',
  'ios',
  'dist',
  'build',
  '.gemini',
]);

const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.html',
  '.sql',
]);

const rootDir = path.resolve(__dirname, '..');
let errorCount = 0;
const matchedFiles = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        scanDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.has(ext)) {
        // Skip this script itself
        if (fullPath === __filename) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        const found = [];

        for (const pattern of MOJIBAKE_PATTERNS) {
          if (content.includes(pattern)) {
            found.push(pattern);
          }
        }

        if (found.length > 0) {
          const lines = content.split('\n');
          const details = [];

          lines.forEach((line, index) => {
            for (const pat of found) {
              if (line.includes(pat)) {
                details.push({
                  line: index + 1,
                  pattern: pat,
                  snippet: line.trim().slice(0, 80),
                });
                break;
              }
            }
          });

          matchedFiles.push({
            file: path.relative(rootDir, fullPath),
            details,
          });
          errorCount += details.length;
        }
      }
    }
  }
}

console.log('🔍 Scanning codebase for mojibake encoding corruption...');
scanDirectory(rootDir);

if (matchedFiles.length > 0) {
  console.error('\n❌ FAILED: Mojibake corruption found in the following files:');
  for (const item of matchedFiles) {
    console.error(`\n📄 ${item.file} (${item.details.length} occurrences):`);
    for (const d of item.details) {
      console.error(`   L${d.line} [${d.pattern}]: ${d.snippet}`);
    }
  }
  console.error(`\nTotal errors: ${errorCount}. Please fix encoding issues.\n`);
  process.exit(1);
} else {
  console.log('✅ PASS: No mojibake sequences found across the codebase.');
  process.exit(0);
}
