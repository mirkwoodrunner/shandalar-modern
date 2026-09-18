#!/usr/bin/env node
// scripts/run-audit.js
// Run a random audit of an untouched tag area (or untouched file) after targeted work.
// Usage: npm run test:audit -- @engine @overworld
//    or: npm run test:audit -- --files <targeted vitest files...> --pw-files <targeted pw files...>
//
// Tag mode:
//   1. Accepts the TARGETED tags as CLI args (same ones just tested)
//   2. Picks one tag at random from the REMAINING tags (excluding targeted ones)
//   3. Runs that tag's full suite via Vitest + Playwright
//   4. Exits non-zero with a STOP message if audit fails
//
// Each half reports one of THREE outcomes, never two: PASSED, FAILED, or
// NO TESTS MATCHED. The third means the tag has no tests of that kind, so
// nothing was verified by that half -- it is not a pass and not a failure, and
// it does not affect the exit code. See docs/TEST_AUDIT_LOG.md, 2026-09-18,
// Findings 5 and 6.
//
// --files mode:
//   1. Accepts the TARGETED files as CLI args (same ones just tested via test:targeted --files)
//   2. Auto-discovers the full candidate pool of Vitest/Playwright files, excludes the targeted ones
//   3. Picks one file at random from each remaining pool (independently)
//   4. Runs each picked file via Vitest/Playwright
//   5. Exits non-zero with a STOP message if audit fails

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  countVitestFilesForTags,
  countPlaywrightTestsForGrep,
  reportNoTestsMatched,
} from './lib/test-scope.js';

const ALL_TAGS = ['@engine', '@overworld', '@mobile', '@premodern', '@learn'];

const VITEST_DIRS = ['tests/scenarios', 'src/engine/__tests__'];
const PW_DIRS = ['tests/e2e'];

const argv = process.argv.slice(2);

if (argv.includes('--files')) {
  runFilesMode(argv);
} else {
  runTagMode(argv);
}

function findFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function takeFilesUntilFlag(argv, start) {
  const files = [];
  for (let i = start; i < argv.length; i++) {
    if (argv[i].startsWith('--')) break;
    files.push(argv[i]);
  }
  return files;
}

function runFilesMode(argv) {
  const filesIdx = argv.indexOf('--files');
  const pwFilesIdx = argv.indexOf('--pw-files');

  const targetedVitestFiles = takeFilesUntilFlag(argv, filesIdx + 1);
  const targetedPwFiles = pwFilesIdx !== -1 ? takeFilesUntilFlag(argv, pwFilesIdx + 1) : [];

  const vitestPool = VITEST_DIRS
    .flatMap(dir => findFiles(dir, ['.test.js']))
    .filter(f => !targetedVitestFiles.includes(f));

  const pwPool = PW_DIRS
    .flatMap(dir => findFiles(dir, ['.spec.ts', '.spec.js']))
    .filter(f => !targetedPwFiles.includes(f));

  console.log(`[audit] Vitest candidate pool (excluding targeted): ${vitestPool.length}`);
  console.log(`[audit] Playwright candidate pool (excluding targeted): ${pwPool.length}`);

  if (vitestPool.length === 0 && pwPool.length === 0) {
    console.log('[audit] No remaining untouched files to audit. Skipping audit.');
    process.exit(0);
  }

  let vitestFailed = false;
  let pwFailed = false;

  if (vitestPool.length > 0) {
    const pick = vitestPool[Math.floor(Math.random() * vitestPool.length)];
    console.log(`[audit] Selected Vitest file: ${pick}`);
    const result = spawnSync('npx', ['vitest', 'run', pick], { stdio: 'inherit', shell: true, cwd: process.cwd() });
    vitestFailed = result.status !== 0;
  } else {
    console.log('[audit] No untouched Vitest files remain, skipping Vitest audit.');
  }

  if (pwPool.length > 0) {
    const pick = pwPool[Math.floor(Math.random() * pwPool.length)];
    console.log(`[audit] Selected Playwright file: ${pick}`);
    const result = spawnSync('npx', ['playwright', 'test', pick], { stdio: 'inherit', shell: true, cwd: process.cwd(), env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers' } });
    pwFailed = result.status !== 0;
  } else {
    console.log('[audit] No untouched Playwright files remain, skipping Playwright audit.');
  }

  if (vitestFailed || pwFailed) {
    console.error('\n[audit] FAILURE in untouched file. This change has a side effect outside its declared scope.');
    console.error('[audit] STOP. Do not proceed with the current task.');
    console.error('[audit] Required next steps:');
    console.error('[audit]   1. Run full suite: npm test && npm run test:e2e');
    console.error('[audit]   2. Diagnose and fix the regression');
    console.error('[audit]   3. Only then resume the original task');
    process.exit(1);
  }

  console.log('\n[audit] Audit passed.');
}

function runTagMode(argv) {
  const targeted = argv.filter(a => a.startsWith('@'));

  if (targeted.length === 0) {
    console.error('[audit] Error: no targeted tags provided. Usage: npm run test:audit -- @engine @overworld');
    process.exit(1);
  }

  const remaining = ALL_TAGS.filter(t => !targeted.includes(t));

  if (remaining.length === 0) {
    console.log('[audit] All tags were targeted — no remaining tags to audit. Skipping audit.');
    process.exit(0);
  }

  // Pick one at random
  const auditTag = remaining[Math.floor(Math.random() * remaining.length)];

  console.log(`[audit] Selected tag: ${auditTag} (excluded: ${targeted.join(', ')})`);
  console.log(`[audit] Running audit for tag: ${auditTag}`);

  // --- Vitest ------------------------------------------------------------------
  let vitestFailed = false;
  let vitestNoTests = false;

  const vitestFileCount = countVitestFilesForTags([auditTag.slice(1)]);
  if (vitestFileCount === 0) {
    vitestNoTests = true;
    console.log('');
    reportNoTestsMatched('[audit]', 'Vitest', auditTag);
  } else {
    console.log('\n[audit] Running Vitest...');
    const vitestResult = spawnSync(
      'npx',
      ['vitest', 'run', '--tags-filter', auditTag.slice(1)],
      { stdio: 'inherit', shell: true, cwd: process.cwd() }
    );
    vitestFailed = vitestResult.status !== 0;
    console.log(`[audit] ${auditTag} Vitest: ${vitestFailed ? 'FAILED' : 'PASSED'}`);
  }

  // --- Playwright --------------------------------------------------------------
  let pwFailed = false;
  let pwNoTests = false;

  const pwTestCount = countPlaywrightTestsForGrep(auditTag);
  if (pwTestCount === 0) {
    pwNoTests = true;
    console.log('');
    reportNoTestsMatched('[audit]', 'Playwright', auditTag);
  } else {
    console.log('\n[audit] Running Playwright...');
    const pwResult = spawnSync(
      'npm',
      ['run', 'test:e2e', '--', '--grep', auditTag],
      { stdio: 'inherit', shell: true, cwd: process.cwd() }
    );
    pwFailed = pwResult.status !== 0;
    console.log(`[audit] ${auditTag} Playwright: ${pwFailed ? 'FAILED' : 'PASSED'}`);
  }

  if (vitestFailed || pwFailed) {
    console.error(`\n[audit] FAILURE in untouched area "${auditTag}". This change has a side effect outside its declared scope.`);
    console.error('[audit] STOP. Do not proceed with the current task.');
    console.error('[audit] Required next steps:');
    console.error('[audit]   1. Run full suite: npm test && npm run test:e2e');
    console.error('[audit]   2. Diagnose and fix the regression');
    console.error('[audit]   3. Only then resume the original task');
    process.exit(1);
  }

  if (vitestNoTests && pwNoTests) {
    console.log(`\n[audit] NOTHING AUDITED for tag: ${auditTag}. Neither half had any tests to run.`);
    console.log('[audit] This is not a pass. The tag verified nothing about the current change.');
    process.exit(0);
  }

  if (vitestNoTests || pwNoTests) {
    const ran = vitestNoTests ? 'Playwright' : 'Vitest';
    const missing = vitestNoTests ? 'Vitest' : 'Playwright';
    console.log(`\n[audit] PARTIAL audit for tag: ${auditTag}. ${ran} passed; ${missing} had no tests to run.`);
    console.log(`[audit] ${missing} coverage for ${auditTag} was not verified.`);
    process.exit(0);
  }

  console.log(`\n[audit] Audit passed for tag: ${auditTag}`);
}
