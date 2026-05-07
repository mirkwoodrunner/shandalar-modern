// scryfall/sync-oracle-text.js
// Step 1 of 2: Generate fuzzy-match review file for oracle text sync.
// Run: node scryfall/sync-oracle-text.js

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- Fail-fast checks -------------------------------------------------------

const poolPath = join(__dirname, 'shandalar-card-pool.json');
if (!existsSync(poolPath)) {
  throw new Error('shandalar-card-pool.json not found. Run process-card-pool.js first.');
}

const cardsPath = join(ROOT, 'src', 'data', 'cards.js');
if (!existsSync(cardsPath)) {
  throw new Error(`src/data/cards.js not found at ${cardsPath}`);
}

// --- Step 1: Load pool ------------------------------------------------------

const poolRaw = JSON.parse(readFileSync(poolPath, 'utf8'));
if (!Array.isArray(poolRaw)) {
  throw new Error('shandalar-card-pool.json root must be an array.');
}

const poolMap = new Map();
for (const entry of poolRaw) {
  if (!entry.id || entry.oracleText === undefined) {
    console.warn(`Warning: pool entry missing id or oracleText — skipping: ${JSON.stringify(entry).slice(0, 80)}`);
    continue;
  }
  poolMap.set(entry.id, entry);
}

// --- Step 2: Extract CARD_DB ids and texts from cards.js --------------------

const cardsSource = readFileSync(cardsPath, 'utf8');

// Match id and text fields from each object entry.
// Strategy: find all id:"..." occurrences, then for each, look for nearby text:"..."
const idMatches = [...cardsSource.matchAll(/\bid:\s*["']([^"']+)["']/g)];

const cardEntries = [];
for (const m of idMatches) {
  const id = m[1];
  const idIndex = m.index;
  // Look for text: within 2000 chars after the id
  const window = cardsSource.slice(idIndex, idIndex + 2000);
  const textMatch = window.match(/\btext:\s*"((?:[^"\\]|\\.)*)"/);
  const currentText = textMatch ? textMatch[1] : null;
  cardEntries.push({ id, currentText });
}

// --- SKIP list (basic lands) ------------------------------------------------

const SKIP_IDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest']);

// --- Step 3: Direct matches -------------------------------------------------

const directMatches = [];
const unresolved = [];

for (const entry of cardEntries) {
  if (SKIP_IDS.has(entry.id)) continue;
  if (poolMap.has(entry.id)) {
    const poolEntry = poolMap.get(entry.id);
    directMatches.push({
      cardDbId: entry.id,
      proposedPoolId: entry.id,
      proposedName: poolEntry.name,
      currentText: entry.currentText ?? '',
      proposedOracleText: poolEntry.oracleText,
      approved: true,
    });
  } else {
    unresolved.push(entry);
  }
}

// --- Step 4: Fuzzy matching -------------------------------------------------

function normalize(slug) {
  return slug
    .replace(/_s_/g, 's_')
    .replace(/_s$/g, 's')
    .replace(/s_/g, 's')
    .replace(/_/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// Build normalized pool index once
const poolNormIndex = [];
for (const [slug, poolEntry] of poolMap) {
  poolNormIndex.push({ slug, norm: normalize(slug), poolEntry });
}

const fuzzyMatches = [];
const noMatch = [];

for (const entry of unresolved) {
  const normId = normalize(entry.id);
  let bestCandidate = null;

  // Priority 1: exact normalized match
  for (const { slug, norm, poolEntry } of poolNormIndex) {
    if (norm === normId) {
      bestCandidate = { slug, poolEntry, reason: 'exact-norm' };
      break;
    }
  }

  // Priority 2: substring match
  if (!bestCandidate) {
    for (const { slug, norm, poolEntry } of poolNormIndex) {
      if (norm.includes(normId) || normId.includes(norm)) {
        bestCandidate = { slug, poolEntry, reason: 'substring' };
        break;
      }
    }
  }

  // Priority 3: Levenshtein distance ≤ 3
  if (!bestCandidate) {
    let bestDist = 4;
    for (const { slug, norm, poolEntry } of poolNormIndex) {
      const dist = levenshtein(normId, norm);
      if (dist < bestDist) {
        bestDist = dist;
        bestCandidate = { slug, poolEntry, reason: `lev-${dist}` };
      }
    }
    if (bestCandidate && levenshtein(normId, normalize(bestCandidate.slug)) > 3) {
      bestCandidate = null;
    }
  }

  if (bestCandidate) {
    fuzzyMatches.push({
      cardDbId: entry.id,
      proposedPoolId: bestCandidate.slug,
      proposedName: bestCandidate.poolEntry.name,
      currentText: entry.currentText ?? '',
      proposedOracleText: bestCandidate.poolEntry.oracleText,
      approved: false,
    });
  } else {
    noMatch.push(entry.id);
  }
}

// --- Step 5: Write output files ---------------------------------------------

const autoPatchPath = join(__dirname, 'auto-patch-candidates.json');
const fuzzyReviewPath = join(__dirname, 'fuzzy-match-review.json');

writeFileSync(autoPatchPath, JSON.stringify(directMatches, null, 2));
writeFileSync(fuzzyReviewPath, JSON.stringify(fuzzyMatches, null, 2));

// --- Step 6: Summary --------------------------------------------------------

console.log(`
Oracle Text Sync — Review Required
=====================================
Direct matches (will auto-patch): ${directMatches.length}
Fuzzy candidates (need review):   ${fuzzyMatches.length}
No match found:                    ${noMatch.length}
Review file written to: scryfall/fuzzy-match-review.json
`.trim());

if (noMatch.length > 0) {
  console.log(`\nNo-match IDs: ${noMatch.join(', ')}`);
}

console.log(`
Edit "approved": true for each entry you want to apply, then run:
  node scryfall/apply-oracle-patch.js
`);
