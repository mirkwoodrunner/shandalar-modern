#!/usr/bin/env node
// scripts/build-test-tags.js
// Authoring/maintenance tool: scans all Vitest + Playwright test files, classifies
// each into a subject-matter family by filename, then greedily packs each family's
// files into numbered leaf tags so no leaf tag exceeds TEST_CAP live test cases.
// Writes scripts/test-tags.json. Re-run this whenever new test files are added and
// scripts/validate-test-tags.js starts reporting orphaned files or an over-cap tag.
//
// This does not hand-place individual files -- classification is rule-based on
// filename, and packing is mechanical (sorted by path, greedy bin-fill). Review
// the diff after running; adjust the FAMILY_RULES below and re-run if a file lands
// somewhere semantically wrong.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const TEST_CAP = 50;

const VITEST_DIRS = ['tests/scenarios', 'src/engine/__tests__', 'src/hooks/__tests__'];
const PW_DIRS = ['tests/e2e'];

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

// Rules are checked in order; first match wins. `family` groups files that stay
// topically together; large families get split into -1, -2, ... leaf tags.
const FAMILY_RULES = [
  { family: 'premodern', test: f => /cardsPremodern/.test(f) },

  { family: 'overworld-generation', test: f => /(map-terrain-clustering|monster-variety|terrain-decoration-bounds|castle-boss-routing|difficulty\.spec|\bmap\.spec|overworld-desktop)/.test(f) },
  { family: 'overworld-visual', test: f => /overworld|dungeon-tileset|structure-icons|plaque-visibility|hooded-figure-sprites|preduel-sandbox|ruins\.spec/.test(f) },

  { family: 'engine-ai', test: f => /(^|\/)AI\.|(^|\/)ai-|mcts-rollout/.test(f) },
  { family: 'engine-core-mechanics', test: f => /DuelCore\.(reducer|snapshot)|tap-centralization|cleanup-discard|undo-tap-activate|no-tap-activation-auras|tap-triggered-auras/.test(f) },
  { family: 'engine-phases-priority', test: f => /phase6\.test|instant-cast-priority-window|end-turn-skip-ahead|end-turn-stack-priority-deadlock|end-turn-with-activated-permanent|combat-blockers-priority/.test(f) },
  { family: 'engine-combat', test: f => /creature-damage-centralization|combat-damage|blocking\.test|counter-targeting|lava-axe|psionic-blast|damage-shields|damage-source-meta|hurt-meta-retrofit|protection-artifact-ward|circle-of-protection|first-strike-combat/.test(f) },
  { family: 'engine-tier-complex', test: f => /complex-c\d|batch-complex-tier/.test(f) },
  { family: 'engine-tier-moderate', test: f => /moderate-m\d|batch-moderate-tier/.test(f) },
  { family: 'engine-tier-simple', test: f => /simple-tier-forge|batch1a-desert-landwalk|batch1b-wall-destruction/.test(f) },
  { family: 'engine-banding-ante', test: f => /banding-|ante-|ante_system|ante-system-complete/.test(f) },
  { family: 'engine-layers-copy', test: f => /layer1-copy-artifact|layer2-control-change|layer3-text-substitution|copy-mechanism-generalized|copy-and-modal-choice|layer-engine\.spec|type-change-cards|type-eff-baking|vesuvan-doppelganger|tetravus|enchanted-slot/.test(f) },
  { family: 'engine-batch-stubs', test: f => /batch-14-quick-win-stubs|stub-batch-rd-conv-stasis|deferral-sweep|additional-cost-sacrifice|discard-centralization|gemini-removal-smoke/.test(f) },
  { family: 'engine-cast-flow-ui', test: f => /sandbox-|duel-controller|ability-stack-bugs|engine-fatal-error-overlay|generalized-choice-mechanisms|mobile-targeting|tutor-modal|lotus-cancel-undo|power-sink-x-select|undo-mana-taps-all-phases|card-type-line|exile-zone|ancestral-recall-targeting/.test(f) },

  // catch-all for standalone single-card scenario files with no other natural home
  { family: 'engine-card-scenarios', test: () => true },
];

function classify(file) {
  for (const rule of FAMILY_RULES) {
    if (rule.test(file)) return rule.family;
  }
  return 'engine-card-scenarios';
}

const vitestFiles = VITEST_DIRS.flatMap(d => findFiles(d, ['.test.js'])).filter(f => !f.endsWith('_template.test.js'));
const pwFiles = PW_DIRS.flatMap(d => findFiles(d, ['.spec.ts', '.spec.js']));

const families = new Map(); // family -> { vitest: [{file,count}], pw: [{file,count}] }

for (const f of vitestFiles) {
  const fam = classify(f);
  if (!families.has(fam)) families.set(fam, { vitest: [], pw: [] });
  families.get(fam).vitest.push({ file: f, count: countCases(f) });
}
for (const f of pwFiles) {
  const fam = classify(f);
  if (!families.has(fam)) families.set(fam, { vitest: [], pw: [] });
  families.get(fam).pw.push({ file: f, count: countCases(f) });
}

// Pack a family's files (vitest + pw combined, sorted by path) into numbered leaf
// tags of at most TEST_CAP live test cases each.
function packFamily(familyName, entries) {
  const sorted = [...entries].sort((a, b) => a.file.localeCompare(b.file));
  const leaves = [];
  let current = { vitestFiles: [], pwFiles: [], count: 0 };

  for (const e of sorted) {
    if (current.count > 0 && current.count + e.count > TEST_CAP) {
      leaves.push(current);
      current = { vitestFiles: [], pwFiles: [], count: 0 };
    }
    if (e.file.endsWith('.test.js')) current.vitestFiles.push(e.file);
    else current.pwFiles.push(e.file);
    current.count += e.count;
  }
  if (current.count > 0) leaves.push(current);

  if (leaves.length === 1) return { [familyName]: leaves[0] };
  const out = {};
  leaves.forEach((leaf, i) => { out[`${familyName}-${i + 1}`] = leaf; });
  return out;
}

const tags = {};
for (const [familyName, { vitest, pw }] of families) {
  const combined = [...vitest.map(e => ({ file: e.file, count: e.count })), ...pw.map(e => ({ file: e.file, count: e.count }))];
  const packed = packFamily(familyName, combined);
  Object.assign(tags, packed);
}

// Default `related`: every other leaf tag sharing the same family prefix
// (strip trailing "-<n>" if present).
function baseFamily(tagName) {
  const meta = tagName.match(/^(.*?)(-\d+)?$/);
  return meta[1];
}
for (const tagName of Object.keys(tags)) {
  const base = baseFamily(tagName);
  const related = Object.keys(tags).filter(t => t !== tagName && baseFamily(t) === base);
  tags[tagName].related = related;
  tags[tagName].family = base;
}

// stable key order
const ordered = {};
for (const k of Object.keys(tags).sort()) {
  ordered[k] = {
    family: tags[k].family,
    vitestFiles: tags[k].vitestFiles,
    pwFiles: tags[k].pwFiles,
    related: tags[k].related,
  };
}

fs.writeFileSync('scripts/test-tags.json', JSON.stringify({ tags: ordered }, null, 2) + '\n');

// report
let grandTotal = 0;
console.log('tag\tcount\tvitest\tpw');
for (const [name, t] of Object.entries(ordered)) {
  const count = [...t.vitestFiles, ...t.pwFiles].reduce((s, f) => s + countCases(f), 0);
  grandTotal += count;
  const flag = count > TEST_CAP ? '  <-- OVER CAP' : '';
  console.log(`${name}\t${count}\t${t.vitestFiles.length}\t${t.pwFiles.length}${flag}`);
}
console.log(`\n${Object.keys(ordered).length} tags, ${grandTotal} total test cases, ${vitestFiles.length} vitest files, ${pwFiles.length} pw files`);
