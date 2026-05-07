// scryfall/apply-oracle-patch.js
// Step 2 of 2: Apply approved oracle text patches to src/data/cards.js.
// Run: node scryfall/apply-oracle-patch.js

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- Fail-fast checks -------------------------------------------------------

const autoPatchPath = join(__dirname, 'auto-patch-candidates.json');
const fuzzyReviewPath = join(__dirname, 'fuzzy-match-review.json');

if (!existsSync(autoPatchPath)) {
  throw new Error('auto-patch-candidates.json not found. Run sync-oracle-text.js first.');
}
if (!existsSync(fuzzyReviewPath)) {
  throw new Error('fuzzy-match-review.json not found. Run sync-oracle-text.js first.');
}

// --- Step 1: Load both JSON files -------------------------------------------

const autoPatch = JSON.parse(readFileSync(autoPatchPath, 'utf8'));
const fuzzyReview = JSON.parse(readFileSync(fuzzyReviewPath, 'utf8'));
const allEntries = [...autoPatch, ...fuzzyReview];

const toApply = allEntries.filter(e => e.approved === true);
const skippedFuzzy = fuzzyReview.filter(e => e.approved !== true).length;

// --- Step 2: Read src/data/cards.js as a string -----------------------------

const cardsPath = join(ROOT, 'src', 'data', 'cards.js');
let source = readFileSync(cardsPath, 'utf8');

// --- Step 3: Escape oracle text for JS double-quoted string -----------------

function escapeText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

// --- Step 4: Patch each approved entry --------------------------------------

let patchedDirect = 0;
let patchedFuzzy = 0;
const isDirectId = new Set(autoPatch.map(e => e.cardDbId));

for (const entry of toApply) {
  const { cardDbId, proposedOracleText } = entry;

  // Find the id in source (double or single quote variants)
  const idPatternDQ = `id:"${cardDbId}"`;
  const idPatternSQ = `id:'${cardDbId}'`;

  let idIndex = source.indexOf(idPatternDQ);
  if (idIndex === -1) idIndex = source.indexOf(idPatternSQ);

  if (idIndex === -1) {
    console.warn(`Warning: id not found in cards.js — skipping: ${cardDbId}`);
    continue;
  }

  // Find next text: within 2000 chars of the id position.
  // Use (?:[^"\\]|\\.)* to correctly handle escaped quotes inside the value.
  const window = source.slice(idIndex, idIndex + 2000);
  const textMatch = window.match(/\btext:"((?:[^"\\]|\\.)*)"/);

  if (!textMatch) {
    console.warn(`Warning: text: field not found within 2000 chars of id "${cardDbId}" — skipping`);
    continue;
  }

  const oldTextLiteral = `text:"${textMatch[1]}"`;
  const newTextLiteral = `text:"${escapeText(proposedOracleText)}"`;

  // No-op: current text already matches proposed oracle text
  if (oldTextLiteral === newTextLiteral) continue;

  // Replace only the first occurrence after idIndex to avoid clobbering unrelated entries
  const before = source.slice(0, idIndex);
  const after = source.slice(idIndex);
  const patchedAfter = after.replace(oldTextLiteral, newTextLiteral);

  if (patchedAfter === after) {
    console.warn(`Warning: text replacement had no effect for "${cardDbId}" (pattern not matched)`);
    continue;
  }

  source = before + patchedAfter;

  if (isDirectId.has(cardDbId)) {
    patchedDirect++;
  } else {
    patchedFuzzy++;
  }
}

// --- Step 5: Write patched file ---------------------------------------------

writeFileSync(cardsPath, source, 'utf8');

// --- Report -----------------------------------------------------------------

const noMatchEntries = 0; // no-match entries are never in toApply

console.log(`
Oracle Text Patch Applied
=========================
Patched: ${patchedDirect} direct matches
Patched: ${patchedFuzzy} approved fuzzy matches
Skipped: ${skippedFuzzy} fuzzy entries (not approved)
Skipped: ${noMatchEntries} no-match entries
src/data/cards.js updated.
`.trim());
