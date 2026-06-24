#!/usr/bin/env node
// scripts/run-audit.js
// Run a random audit of an untouched tag area after targeted work.
// Usage: npm run test:audit -- @engine @persistence
//
// The script:
//   1. Accepts the TARGETED tags as CLI args (same ones just tested)
//   2. Picks one tag at random from the REMAINING tags (excluding targeted ones)
//   3. Runs that tag's full suite via Vitest + Playwright
//   4. Exits non-zero with a STOP message if audit fails

import { spawnSync } from 'child_process';

const ALL_TAGS = ['@engine', '@overworld', '@mobile', '@gemini', '@persistence', '@premodern'];

const targeted = process.argv.slice(2).filter(a => a.startsWith('@'));

if (targeted.length === 0) {
  console.error('[audit] Error: no targeted tags provided. Usage: npm run test:audit -- @engine @persistence');
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
console.log('\n[audit] Running Vitest...');
const vitestResult = spawnSync(
  'npm',
  ['test', '--', '--testNamePattern', auditTag],
  { stdio: 'inherit', shell: true, cwd: process.cwd() }
);

const vitestFailed = vitestResult.status !== 0;

// --- Playwright --------------------------------------------------------------
console.log('\n[audit] Running Playwright...');
const pwResult = spawnSync(
  'npm',
  ['run', 'test:e2e', '--', '--grep', auditTag],
  { stdio: 'inherit', shell: true, cwd: process.cwd() }
);

const pwFailed = pwResult.status !== 0;

if (vitestFailed || pwFailed) {
  console.error(`\n[audit] FAILURE in untouched area "${auditTag}". This change has a side effect outside its declared scope.`);
  console.error('[audit] STOP. Do not proceed with the current task.');
  console.error('[audit] Required next steps:');
  console.error('[audit]   1. Run full suite: npm test && npm run test:e2e');
  console.error('[audit]   2. Diagnose and fix the regression');
  console.error('[audit]   3. Only then resume the original task');
  process.exit(1);
}

console.log(`\n[audit] Audit passed for tag: ${auditTag}`);
