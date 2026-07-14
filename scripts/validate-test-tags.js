#!/usr/bin/env node
// scripts/validate-test-tags.js
// Enforces the test tag policy in CLAUDE.md: no tag may cover more than 50
// live test cases, every test file must be claimed by exactly one tag, and
// every @mobile-marked Playwright file must be registered in the
// `mobile-chrome` project's testMatch array (and vice versa).
//
// This is the ongoing trip-wire, not a one-time check: as the suite grows,
// re-run this (or let `npm run test:targeted`/`test:audit` run it for you)
// to catch a tag drifting past the cap or a new test file landing untagged.
// If a tag is reported over cap, split it: move some of its files into a new
// `@<family>-N` leaf tag in scripts/test-tags.json (scripts/build-test-tags.js
// can regenerate the whole manifest from scratch if classification has drifted
// significantly).

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const TEST_CAP = 50;
const VITEST_DIRS = ['tests/scenarios', 'src/engine/__tests__', 'src/hooks/__tests__'];
const PW_DIRS = ['tests/e2e'];

const manifest = JSON.parse(fs.readFileSync(new URL('./test-tags.json', import.meta.url), 'utf8'));

function findFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full, exts));
    else if (exts.some(ext => entry.name.endsWith(ext))) results.push(full);
  }
  return results;
}

function countCases(file) {
  const result = spawnSync('grep', ['-cP', '^\\s*(it|test)\\(', file], { encoding: 'utf8' });
  const n = parseInt((result.stdout || '0').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

let errors = [];

// --- 1. Per-tag cap check ----------------------------------------------------
for (const [tagName, entry] of Object.entries(manifest.tags)) {
  const files = [...entry.vitestFiles, ...entry.pwFiles];
  const count = files.reduce((s, f) => s + countCases(f), 0);
  if (count > TEST_CAP) {
    errors.push(`OVER CAP: ${tagName} has ${count} live test cases (max ${TEST_CAP}). Split it into a new leaf tag.`);
  }
}

// --- 2. Orphan / duplicate coverage check ------------------------------------
const actualVitest = VITEST_DIRS
  .flatMap(d => findFiles(d, ['.test.js', '.test.ts', '.test.tsx']))
  .filter(f => !f.endsWith('_template.test.js'));
const actualPw = PW_DIRS.flatMap(d => findFiles(d, ['.spec.ts', '.spec.js']));

const coverage = new Map(); // file -> [tagNames]
for (const [tagName, entry] of Object.entries(manifest.tags)) {
  for (const f of [...entry.vitestFiles, ...entry.pwFiles]) {
    if (!coverage.has(f)) coverage.set(f, []);
    coverage.get(f).push(tagName);
  }
}

for (const f of [...actualVitest, ...actualPw]) {
  const tags = coverage.get(f) || [];
  if (tags.length === 0) errors.push(`ORPHAN: ${f} is not covered by any tag in scripts/test-tags.json.`);
  else if (tags.length > 1) errors.push(`DUPLICATE: ${f} is covered by multiple tags: ${tags.join(', ')}.`);
}

const actualSet = new Set([...actualVitest, ...actualPw]);
for (const f of coverage.keys()) {
  if (!actualSet.has(f)) errors.push(`STALE: ${f} is listed in the manifest but no longer exists on disk.`);
}

// --- 3. @mobile <-> mobile-chrome testMatch consistency ----------------------
const pwConfig = fs.readFileSync('playwright.config.js', 'utf8');
const testMatchBlock = pwConfig.match(/name:\s*['"]mobile-chrome['"][\s\S]*?testMatch:\s*\[([\s\S]*?)\]/);
const registeredMobileFiles = new Set(
  testMatchBlock
    ? [...testMatchBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1])
    : []
);

const mobileTaggedFiles = new Set();
for (const f of actualPw) {
  const content = fs.readFileSync(f, 'utf8');
  if (/@mobile\b/.test(content)) mobileTaggedFiles.add(f);
}

for (const f of mobileTaggedFiles) {
  if (!registeredMobileFiles.has(f)) {
    errors.push(`MOBILE DRIFT: ${f} has a @mobile-tagged describe but is not in playwright.config.js's mobile-chrome testMatch array.`);
  }
}
for (const f of registeredMobileFiles) {
  if (!mobileTaggedFiles.has(f) && actualSet.has(f)) {
    errors.push(`MOBILE DRIFT: ${f} is in playwright.config.js's mobile-chrome testMatch array but has no @mobile-tagged describe.`);
  }
}

// --- Report -------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`[validate-test-tags] ${errors.length} problem(s) found:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`[validate-test-tags] OK: ${Object.keys(manifest.tags).length} tags, ${actualVitest.length} Vitest files, ${actualPw.length} Playwright files, all within the ${TEST_CAP}-test cap.`);
