#!/usr/bin/env node
// scripts/run-targeted.js
// Run tests for specific tags via: npm run test:targeted -- @engine @persistence
// Tags are passed as CLI args. Both Vitest and Playwright are run for each set.
// Multiple tags are OR-combined so any test matching any tag is included.

import { spawnSync } from 'child_process';

const VALID_TAGS = ['@engine', '@overworld', '@mobile', '@persistence', '@premodern'];

const tags = process.argv.slice(2).filter(a => a.startsWith('@'));

if (tags.length === 0) {
  console.error('[targeted] Error: no tags provided. Usage: npm run test:targeted -- @engine @persistence');
  process.exit(1);
}

const unknown = tags.filter(t => !VALID_TAGS.includes(t));
if (unknown.length > 0) {
  console.error(`[targeted] Unknown tag(s): ${unknown.join(', ')}. Valid tags: ${VALID_TAGS.join(', ')}`);
  process.exit(1);
}

const pattern = tags.join('|');
console.log(`[targeted] Running tags: ${tags.join(', ')}`);
console.log(`[targeted] Pattern: ${pattern}`);

// --- Vitest ------------------------------------------------------------------
console.log('\n[targeted] Running Vitest...');
const vitestResult = spawnSync(
  'npm',
  ['test', '--', '--testNamePattern', pattern],
  { stdio: 'inherit', shell: true, cwd: process.cwd() }
);

const vitestFailed = vitestResult.status !== 0;

// --- Playwright --------------------------------------------------------------
console.log('\n[targeted] Running Playwright...');
const pwResult = spawnSync(
  'npm',
  ['run', 'test:e2e', '--', '--grep', pattern],
  { stdio: 'inherit', shell: true, cwd: process.cwd() }
);

const pwFailed = pwResult.status !== 0;

if (vitestFailed || pwFailed) {
  console.error('\n[targeted] One or more targeted test suites failed.');
  process.exit(1);
}

console.log('\n[targeted] All targeted tests passed.');
