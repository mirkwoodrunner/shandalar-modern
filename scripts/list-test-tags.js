#!/usr/bin/env node
// scripts/list-test-tags.js
// Prints every tag with its family, live test count, file counts, and
// related tags -- the replacement for eyeballing a static markdown table.
// Use this to pick which tag(s) to target for a given source change, or to
// see the audit network for a tag.
//
// Usage:
//   node scripts/list-test-tags.js                # list everything
//   node scripts/list-test-tags.js --family engine-combat
//   node scripts/list-test-tags.js --file src/engine/DuelCore.js   # which tag(s) cover a given test file

import fs from 'fs';
import { spawnSync } from 'child_process';

const manifest = JSON.parse(fs.readFileSync(new URL('./test-tags.json', import.meta.url), 'utf8'));

function countCases(file) {
  const result = spawnSync('grep', ['-cP', '^\\s*(it|test)\\(', file], { encoding: 'utf8' });
  const n = parseInt((result.stdout || '0').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

const argv = process.argv.slice(2);
const familyIdx = argv.indexOf('--family');
const fileIdx = argv.indexOf('--file');

if (fileIdx !== -1) {
  const target = argv[fileIdx + 1];
  const matches = Object.entries(manifest.tags).filter(
    ([, e]) => e.vitestFiles.includes(target) || e.pwFiles.includes(target)
  );
  if (matches.length === 0) {
    console.log(`No tag covers ${target}. Either it's not a test file, or it's untagged (run scripts/validate-test-tags.js to check for orphans).`);
  } else {
    for (const [name] of matches) console.log(name);
  }
  process.exit(0);
}

const familyFilter = familyIdx !== -1 ? argv[familyIdx + 1] : null;

const rows = Object.entries(manifest.tags)
  .filter(([, e]) => !familyFilter || e.family === familyFilter)
  .map(([name, e]) => {
    const count = [...e.vitestFiles, ...e.pwFiles].reduce((s, f) => s + countCases(f), 0);
    return { name, family: e.family, count, vitest: e.vitestFiles.length, pw: e.pwFiles.length, related: e.related };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const nameWidth = Math.max(...rows.map(r => r.name.length), 4);
console.log(`${'tag'.padEnd(nameWidth)}  count  vitest  pw  family`);
for (const r of rows) {
  console.log(`${r.name.padEnd(nameWidth)}  ${String(r.count).padStart(5)}  ${String(r.vitest).padStart(6)}  ${String(r.pw).padStart(2)}  ${r.family}`);
}
console.log(`\n${rows.length} tag(s) shown. Pass --family <family> to filter, or --file <path> to find which tag covers a test file.`);
