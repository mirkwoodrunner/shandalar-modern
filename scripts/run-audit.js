#!/usr/bin/env node
// scripts/run-audit.js
// Run a related-tag audit after targeted work, using scripts/test-tags.json
// (the tag manifest) to resolve tags to files and to find tags "related" to
// whatever was just targeted -- instead of picking a fully random tag from
// the whole suite, which could just as easily audit an unrelated area.
// Usage: npm run test:audit -- @engine-combat-1 @overworld-generation
//    or: npm run test:audit -- --files <targeted vitest files...> --pw-files <targeted pw files...>
//
// Tag mode:
//   1. Accepts the TARGETED tags as CLI args (same ones just tested)
//   2. Builds a candidate pool: every other tag sharing a family with a
//      targeted tag, plus each targeted tag's explicit `related` entries,
//      minus the targeted tags themselves
//   3. Picks one tag at random from that pool (falls back to a fully random
//      pick across all tags only if the pool is empty -- e.g. a targeted tag
//      is the only leaf in its family and declares no explicit relations)
//   4. Runs that tag's files via Vitest + Playwright
//   5. Exits non-zero with a STOP message if audit fails
//
// --files mode:
//   1. Accepts the TARGETED files as CLI args (same ones just tested via test:targeted --files)
//   2. Auto-discovers the full candidate pool of Vitest/Playwright files, excludes the targeted ones
//   3. Picks one file at random from each remaining pool (independently)
//   4. Runs each picked file via Vitest/Playwright
//   5. Exits non-zero with a STOP message if audit fails

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const MANIFEST_PATH = new URL('./test-tags.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const VITEST_DIRS = ['tests/scenarios', 'src/engine/__tests__', 'src/hooks/__tests__'];
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
    .flatMap(dir => findFiles(dir, ['.test.js', '.test.ts', '.test.tsx']))
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
    reportFailure(`untouched file`);
  }

  console.log('\n[audit] Audit passed.');
}

function runTagMode(argv) {
  const targeted = argv.filter(a => a.startsWith('@'));

  if (targeted.length === 0) {
    console.error('[audit] Error: no targeted tags provided. Usage: npm run test:audit -- @engine-combat-1 @overworld-generation');
    process.exit(1);
  }

  const unknown = targeted.filter(t => !manifest.tags[t]);
  if (unknown.length > 0) {
    console.error(`[audit] Unknown tag(s): ${unknown.join(', ')}.`);
    console.error('[audit] Run `node scripts/list-test-tags.js` to see all valid tags.');
    process.exit(1);
  }

  const allTags = Object.keys(manifest.tags);
  const targetedFamilies = new Set(targeted.map(t => manifest.tags[t].family));

  // Related pool: same family as any targeted tag, or explicitly declared
  // `related`, minus the targeted tags themselves.
  const relatedPool = new Set();
  for (const t of allTags) {
    if (targeted.includes(t)) continue;
    if (targetedFamilies.has(manifest.tags[t].family)) relatedPool.add(t);
  }
  for (const t of targeted) {
    for (const r of manifest.tags[t].related || []) {
      if (!targeted.includes(r)) relatedPool.add(r);
    }
  }

  let auditTag;
  let usedFallback = false;
  if (relatedPool.size > 0) {
    const pool = [...relatedPool];
    auditTag = pool[Math.floor(Math.random() * pool.length)];
  } else {
    // Fallback: targeted tag(s) have no family peers and no declared
    // relations -- pick fully at random from everything else, same as the
    // old behavior.
    const remaining = allTags.filter(t => !targeted.includes(t));
    if (remaining.length === 0) {
      console.log('[audit] All tags were targeted -- no remaining tags to audit. Skipping audit.');
      process.exit(0);
    }
    auditTag = remaining[Math.floor(Math.random() * remaining.length)];
    usedFallback = true;
  }

  console.log(`[audit] Selected tag: ${auditTag} (excluded: ${targeted.join(', ')})${usedFallback ? ' [fallback: no related tags declared]' : ' [related to targeted tag(s)]'}`);

  const entry = manifest.tags[auditTag];
  console.log(`[audit] Running audit for tag: ${auditTag} (${entry.vitestFiles.length} Vitest file(s), ${entry.pwFiles.length} Playwright file(s))`);

  // --- Vitest ------------------------------------------------------------------
  let vitestFailed = false;
  if (entry.vitestFiles.length > 0) {
    console.log('\n[audit] Running Vitest...');
    const vitestResult = spawnSync('npx', ['vitest', 'run', ...entry.vitestFiles], { stdio: 'inherit', shell: true, cwd: process.cwd() });
    vitestFailed = vitestResult.status !== 0;
  }

  // --- Playwright --------------------------------------------------------------
  let pwFailed = false;
  if (entry.pwFiles.length > 0) {
    console.log('\n[audit] Running Playwright...');
    const pwResult = spawnSync('npx', ['playwright', 'test', ...entry.pwFiles], { stdio: 'inherit', shell: true, cwd: process.cwd(), env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers' } });
    pwFailed = pwResult.status !== 0;
  }

  if (vitestFailed || pwFailed) {
    reportFailure(`untouched area "${auditTag}"`);
  }

  console.log(`\n[audit] Audit passed for tag: ${auditTag}`);
}

function reportFailure(where) {
  console.error(`\n[audit] FAILURE in ${where}. This change has a side effect outside its declared scope.`);
  console.error('[audit] STOP. Do not proceed with the current task.');
  console.error('[audit] Required next steps:');
  console.error('[audit]   1. Run full suite: npm test && npm run test:e2e');
  console.error('[audit]   2. Diagnose and fix the regression');
  console.error('[audit]   3. Only then resume the original task');
  process.exit(1);
}
