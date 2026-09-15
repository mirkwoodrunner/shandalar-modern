#!/usr/bin/env node
// scripts/learn-check.js
// Authoring report for Learn Mode exercises: npm run learn:check
// Prints one line per exercise plus every finding. Exits 1 on any error
// finding, 0 when only warnings remain. The same checks run in Vitest
// (src/learn/__tests__/puzzleChecker.test.ts); this script is the readable
// version for content authoring.

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { UNITS } = await server.ssrLoadModule('/src/learn/data/units.ts');
const { checkExercise, enumerateLines } = await server.ssrLoadModule('/src/learn/engine/puzzleChecker.ts');

let errors = 0;
let warnings = 0;

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
