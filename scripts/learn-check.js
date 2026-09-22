#!/usr/bin/env node
// scripts/learn-check.js
// Authoring report for Learn Mode exercises: npm run learn:check
// Prints one line per exercise plus every finding. Exits 1 on any error
// finding, 0 when only warnings remain. The same checks run in Vitest
// (src/learn/__tests__/puzzleChecker.test.ts); this script is the readable
// version for content authoring.

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import {
  PINNED_BULK_FILE,
  cleanText,
  loadScryfallOracle,
  indexRealCards,
} from '../tools/generate-learn-pool.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { UNITS } = await server.ssrLoadModule('/src/learn/data/units.ts');
const { checkExercise, enumerateLines } = await server.ssrLoadModule('/src/learn/engine/puzzleChecker.ts');
const { CARD_DB_LEARN, LEARN_POOL_META } = await server.ssrLoadModule('/src/data/cardsLearn.js');

let errors = 0;
let warnings = 0;

// --- Oracle drift gate (L4a) ------------------------------------------------
// A frozen pool still drifts: Wizards issues errata and templating updates, so a
// stored `text` can silently stop matching the card it claims to be. This compares
// every CARD_DB_LEARN entry against the LOCALLY PINNED Scryfall bulk data. It never
// makes a network call -- refreshing the pin is a deliberate, separate act, and this
// check is what makes it visible when someone does it without regenerating the pool.
// Same mechanism as scryfall/sync-oracle-text.js: normalize, then compare strings.
async function checkOracleDrift() {
  const meta = LEARN_POOL_META ?? {};
  console.log(`Learn pool oracle drift check -- ${CARD_DB_LEARN.length} cards vs ${meta.scryfallBulkDataFile ?? '(no stamp)'}`);

  // Version stamp. If the pin on disk is not the one the pool was generated from,
  // every text comparison below is against a different data set than the pool
  // claims, so say that plainly instead of reporting N spurious drifts.
  if (meta.scryfallBulkDataFile !== PINNED_BULK_FILE) {
    console.log(`  error: version-stamp -- pool was generated from "${meta.scryfallBulkDataFile}", but the pinned file is "${PINNED_BULK_FILE}". Regenerate: node tools/generate-learn-pool.mjs`);
    return 1;
  }
  const zipPath = path.join(REPO_ROOT, 'scryfall', PINNED_BULK_FILE);
  if (!existsSync(zipPath)) {
    console.log(`  error: version-stamp -- pinned bulk data missing: scryfall/${PINNED_BULK_FILE}`);
    return 1;
  }

  const byName = indexRealCards(await loadScryfallOracle(zipPath));
  let drift = 0;
  for (const card of CARD_DB_LEARN) {
    const oracle = byName.get(card.name);
    if (!oracle) {
      console.log(`  error: oracle-drift -- ${card.id}: "${card.name}" not found in the pinned bulk data`);
      drift++;
      continue;
    }
    const expected = cleanText(oracle.oracle_text);
    if (card.text !== expected) {
      console.log(`  error: oracle-drift -- ${card.id}`);
      console.log(`           stored:   ${JSON.stringify(card.text)}`);
      console.log(`           scryfall: ${JSON.stringify(expected)}`);
      drift++;
    }
  }
  console.log(drift ? `  ${drift} card(s) drifted. Regenerate: node tools/generate-learn-pool.mjs` : `  ok -- no drift.`);
  return drift;
}

errors += await checkOracleDrift();

for (const unit of UNITS) {
  console.log(`\n${unit.id}  ${unit.title}`);
  for (const ex of unit.exercises) {
    let shape = 'multiSelect';
    if (ex.kind === 'engine') {
      const lines = enumerateLines(ex);
      const win = lines.filter(l => l.wins).length;
      shape = `${win}/${lines.length} lines win`;
    }
    const findings = checkExercise(ex);
    const errs = findings.filter(f => f.severity === 'error');
    const warns = findings.filter(f => f.severity === 'warn');
    errors += errs.length;
    warnings += warns.length;
    const mark = errs.length ? 'FAIL' : warns.length ? 'warn' : ' ok ';
    console.log(`  [${mark}] ${ex.id.padEnd(8)} ${ex.skill.padEnd(20)} ${shape}`);
    for (const f of findings) console.log(`         ${f.severity}: ${f.check} -- ${f.detail}`);
  }
}

await server.close();
console.log(`\n${errors} error(s), ${warnings} warning(s).`);
process.exit(errors ? 1 : 0);
