// scripts/lib/test-scope.js
// Shared "does this tag actually match anything?" probe for run-targeted.js and
// run-audit.js.
//
// Why this exists (docs/TEST_AUDIT_LOG.md, 2026-09-18, Findings 5 and 6):
// a tag that matches zero tests is neither a pass nor a failure, but both
// runners report it as one of the two, and they disagree about which:
//
//   - Playwright exits NON-ZERO with "Error: No tests found" on an empty
//     --grep, so @premodern (zero Playwright specs) could never pass an audit.
//   - Vitest exits ZERO after skipping every file, so @mobile (zero Vitest
//     files) was silently counted as a pass while verifying nothing.
//
// Both are wrong in the same way. These probes let the callers report "no tests
// matched" as an explicit third outcome instead.
//
// Every probe returns a number, or null meaning "could not determine". null is
// deliberately treated by callers as "just run it" -- a broken probe must never
// be able to silently skip a half that would otherwise have run.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Mirrors vite.config.js `test.include`.
const VITEST_SCAN_DIRS = ['src', 'tests'];
const VITEST_EXTS = [
  '.test.js', '.test.jsx', '.test.ts', '.test.tsx', '.test.mjs', '.test.cjs',
  '.spec.js', '.spec.jsx', '.spec.ts', '.spec.tsx', '.spec.mjs', '.spec.cjs',
];

const PW_LIST_TIMEOUT_MS = 120000;

function walk(dir, exts, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, exts, acc);
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Count Vitest files carrying any of the given `@module-tag` names.
 *
 * @param {string[]} tagNames bare tag names, no leading '@' (e.g. ['engine'])
 * @returns {number|null} matching file count, or null if the scan looked broken
 */
export function countVitestFilesForTags(tagNames) {
  const wanted = new Set(tagNames);
  const files = [];
  for (const dir of VITEST_SCAN_DIRS) walk(dir, VITEST_EXTS, files);

  // If nothing at all was discovered, this probe is broken (moved dirs, bad
  // cwd). Report "unknown" rather than claiming zero coverage.
  if (files.length === 0) return null;

  let taggedAnywhere = 0;
  let matching = 0;

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const tags = [...text.matchAll(/@module-tag\s+(\S+)/g)].map(m => m[1]);
    if (tags.length === 0) continue;
    taggedAnywhere += 1;
    if (tags.some(t => wanted.has(t))) matching += 1;
  }

  // Same guard: a repo where no file carries any tag means the header
  // convention changed, not that this tag has no coverage.
  if (taggedAnywhere === 0) return null;

  return matching;
}

/**
 * Count Playwright tests matching a --grep pattern, via Playwright's own
 * --list. Authoritative: it applies the real config, projects and title match.
 *
 * @param {string} grepPattern the pattern handed to --grep
 * @returns {number|null} matching test count, or null if the listing failed for
 *                        some reason other than an empty match
 */
export function countPlaywrightTestsForGrep(grepPattern) {
  const result = spawnSync(
    './node_modules/.bin/playwright',
    ['test', '--list', '--grep', grepPattern],
    {
      encoding: 'utf8',
      shell: true,
      cwd: process.cwd(),
      timeout: PW_LIST_TIMEOUT_MS,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers' },
    }
  );

  const output = `${result.stdout || ''}${result.stderr || ''}`;

  // Playwright's explicit empty-match signal.
  if (/No tests found/i.test(output)) return 0;

  const m = output.match(/Total:\s+(\d+)\s+test/i);
  if (m) return Number(m[1]);

  // Listing itself failed (config error, bad regex, timeout). Unknown.
  return null;
}

/**
 * Print one of the three outcomes for a half that was NOT run because nothing
 * matched. Kept here so both scripts word it identically.
 *
 * @param {string} prefix log prefix, e.g. '[audit]' or '[targeted]'
 * @param {string} label  which half, e.g. 'Vitest' or 'Playwright'
 * @param {string} tagLabel the tag(s) this concerns, for the message
 */
export function reportNoTestsMatched(prefix, label, tagLabel) {
  console.log(`${prefix} ${tagLabel} ${label}: NO TESTS MATCHED -- this tag has no ${label}`);
  console.log(`${prefix}         coverage. Not a failure, and not a pass. Nothing was verified here.`);
}
