#!/usr/bin/env node
// scripts/run-targeted.js
// Run tests for specific tags via: npm run test:targeted -- @engine @overworld
// Tags are passed as CLI args. Both Vitest and Playwright are run for each set.
// Multiple tags are OR-combined so any test matching any tag is included.
//
// Alternative --files mode: npm run test:targeted -- --files <vitest files...> --pw-files <pw files...> --declared-vitest <N> --declared-pw-files <M>
// Runs Vitest directly against specific files (bypassing --testNamePattern, which
// does not reliably scope Vitest in this repo) and Playwright against specific spec files.

import { spawnSync } from 'child_process';

const VALID_TAGS = ['@engine', '@overworld', '@mobile', '@premodern'];

const VITEST_CASE_CEILING = 75;
const PW_FILE_CEILING = 20;

const argv = process.argv.slice(2);

if (argv.includes('--files')) {
  runFilesMode(argv);
} else {
  runTagMode(argv);
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

  const vitestFiles = takeFilesUntilFlag(argv, filesIdx + 1);
  const pwFiles = pwFilesIdx !== -1 ? takeFilesUntilFlag(argv, pwFilesIdx + 1) : [];

  if (vitestFiles.length === 0 && pwFiles.length === 0) {
    console.error('[targeted] Error: --files mode requires at least one Vitest file or one Playwright file (after --pw-files).');
    process.exit(1);
  }

  const declaredVitestIdx = argv.indexOf('--declared-vitest');
  const declaredPwFilesIdx = argv.indexOf('--declared-pw-files');

  if (declaredVitestIdx === -1 || declaredPwFilesIdx === -1) {
    console.error('[targeted] Error: --files mode requires both --declared-vitest <N> and --declared-pw-files <M>.');
    process.exit(1);
  }

  const declaredVitest = Number(argv[declaredVitestIdx + 1]);
  const declaredPwFiles = Number(argv[declaredPwFilesIdx + 1]);

  if (!Number.isFinite(declaredVitest) || !Number.isFinite(declaredPwFiles)) {
    console.error('[targeted] Error: --declared-vitest and --declared-pw-files must be numbers.');
    process.exit(1);
  }

  // --- Count-check gate (before spawning any test process) -------------------
  const actualVitestCount = countVitestCases(vitestFiles);
  const actualPwFileCount = pwFiles.length;

  let mismatched = false;
  if (actualVitestCount !== declaredVitest) {
    console.error(`[targeted] Vitest count mismatch: actual=${actualVitestCount} declared=${declaredVitest}`);
    mismatched = true;
  }
  if (actualPwFileCount !== declaredPwFiles) {
    console.error(`[targeted] Playwright file count mismatch: actual=${actualPwFileCount} declared=${declaredPwFiles}`);
    mismatched = true;
  }
  if (mismatched) {
    console.error('[targeted] Count-check gate failed. Not running anything.');
    process.exit(1);
  }

  if (actualVitestCount > VITEST_CASE_CEILING) {
    console.error(`[targeted] Backstop ceiling exceeded: Vitest test-case count ${actualVitestCount} > ${VITEST_CASE_CEILING} (over by ${actualVitestCount - VITEST_CASE_CEILING}).`);
    process.exit(1);
  }
  if (actualPwFileCount > PW_FILE_CEILING) {
    console.error(`[targeted] Backstop ceiling exceeded: Playwright file count ${actualPwFileCount} > ${PW_FILE_CEILING} (over by ${actualPwFileCount - PW_FILE_CEILING}).`);
    process.exit(1);
  }

  console.log(`[targeted] --files mode. Vitest files: ${vitestFiles.length}, Playwright files: ${pwFiles.length}`);

  // --- Vitest ------------------------------------------------------------------
  let vitestFailed = false;
  if (vitestFiles.length > 0) {
    console.log('\n[targeted] Running Vitest...');
    const vitestResult = spawnSync(
      'npx',
      ['vitest', 'run', ...vitestFiles],
      { stdio: 'inherit', shell: true, cwd: process.cwd() }
    );
    vitestFailed = vitestResult.status !== 0;
  } else {
    console.log('\n[targeted] No Vitest files given, skipping Vitest.');
  }

  // --- Playwright --------------------------------------------------------------
  let pwFailed = false;
  if (pwFiles.length > 0) {
    console.log('\n[targeted] Running Playwright...');
    const pwResult = spawnSync(
      'npx',
      ['playwright', 'test', ...pwFiles],
      { stdio: 'inherit', shell: true, cwd: process.cwd(), env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers' } }
    );
    pwFailed = pwResult.status !== 0;
  } else {
    console.log('\n[targeted] No Playwright files given, skipping Playwright.');
  }

  if (vitestFailed || pwFailed) {
    console.error('\n[targeted] One or more targeted test suites failed.');
    process.exit(1);
  }

  console.log('\n[targeted] All targeted tests passed.');
}

function countVitestCases(files) {
  if (files.length === 0) return 0;
  const result = spawnSync('grep', ['-ohP', '^\\s*(it|test)\\(', ...files], { encoding: 'utf8' });
  const out = result.stdout || '';
  return out.split('\n').filter(l => l.trim().length > 0).length;
}

function runTagMode(argv) {
  const tags = argv.filter(a => a.startsWith('@'));

  if (tags.length === 0) {
    console.error('[targeted] Error: no tags provided. Usage: npm run test:targeted -- @engine @overworld');
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
}
