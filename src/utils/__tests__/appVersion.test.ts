import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getAppVersion, APP_VERSION, APP_VERSION_CODE, APP_VERSION_DISPLAY } from '../appVersion.ts';

test('App Version & Hardcoded String Verification (Change 8)', async (t) => {
  await t.test('1. getAppVersion returns canonical version, build, and label', () => {
    const info = getAppVersion();
    assert.strictEqual(typeof info.version, 'string');
    assert.strictEqual(typeof info.build, 'string');
    assert.strictEqual(typeof info.label, 'string');
    assert.strictEqual(info.version, '2.2.2');
    assert.strictEqual(info.build, '40');
    assert.strictEqual(info.label, 'v2.2.2 (40)');
    assert.strictEqual(APP_VERSION, '2.2.2');
    assert.strictEqual(APP_VERSION_CODE, 40);
    assert.strictEqual(APP_VERSION_DISPLAY, 'v2.2.2 (40)');
  });

  await t.test('2. Label strictly adheres to "v{version} ({build})" format', () => {
    const info = getAppVersion();
    const regex = /^v\d+\.\d+\.\d+ \(\d+\)$/;
    assert.ok(regex.test(info.label), `Label "${info.label}" must match vX.Y.Z (build) format`);
  });

  await t.test('3. Grep check: No old hardcoded version strings appear in src/', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const oldVersionStrings = ['1.0.7', '2.1.10', '2.1.11', 'v1.0.7'];

    function scanDir(dir: string): { file: string; match: string }[] {
      const violations: { file: string; match: string }[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // skip node_modules, build artifacts, tests
          if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
            violations.push(...scanDir(fullPath));
          }
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.json'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const oldVer of oldVersionStrings) {
            if (content.includes(`"${oldVer}"`) || content.includes(`'${oldVer}'`)) {
              violations.push({ file: fullPath, match: oldVer });
            }
          }
        }
      }
      return violations;
    }

    const violations = scanDir(srcDir);
    assert.deepStrictEqual(
      violations,
      [],
      `Found forbidden old version strings in src/: ${JSON.stringify(violations)}`
    );
  });
});
