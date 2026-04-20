#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRYFALL_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, '..');

// --- Slug utility ---
function makeSlug(name) {
  return name
    .toLowerCase()
    .replace(/ \/\/ /g, '__')
    .replace(/'/g, '')
    .replace(/,/g, '')
    .replace(/\./g, '')
    .replace(/ /g, '_')
    .replace(/-/g, '_');
}

// --- Step 1: Unzip and parse JSON ---
async function loadScryfallData() {
  const zipPath = path.join(SCRYFALL_DIR, 'oracle-cards-20260419090229.zip');
  const directory = await unzipper.Open.file(zipPath);

  const jsonEntry = directory.files.find(f => f.path.endsWith('.json'));
  if (!jsonEntry) throw new Error('No JSON found in zip');

  const content = await jsonEntry.buffer();
  const data = JSON.parse(content.toString('utf8'));

  if (!Array.isArray(data)) throw new Error('Scryfall JSON root is not an array');
  if (data.length === 0) throw new Error('Scryfall JSON array is empty');

  console.log(`Loaded ${data.length} Scryfall oracle cards`);
  return data;
}

// --- Step 2: Parse card pool txt ---
function loadCardPool() {
  const txtPath = path.join(SCRYFALL_DIR, 'Shandalar Cardpool.txt');
  const raw = fs.readFileSync(txtPath, 'utf8');
  const originalLines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  if (originalLines.length === 0) throw new Error('Card pool txt is empty');

  const pool = new Map();
  for (const line of originalLines) {
    pool.set(line.toLowerCase(), line);
    if (line.includes(' // ')) {
      const parts = line.split(' // ');
      for (const part of parts) {
        pool.set(part.trim().toLowerCase(), part.trim());
      }
    }
  }

  console.log(`Loaded ${pool.size} card names from pool list`);
  return { pool, originalLines };
}

// --- Step 3: Filter Scryfall cards ---
const EXCLUDED_LAYOUTS = new Set(['token', 'art_series']);
const EXCLUDED_SET_TYPES = new Set(['token', 'memorabilia', 'funny']);
// 'past' is Scryfall's set code for the Shandalar astral cards — game-only cards
// that never existed in the real card game and must be excluded.
const EXCLUDED_SET_CODES = new Set(['past']);

function filterCards(scryfallData, pool, originalLines) {
  const matchedNames = new Set();
  const matched = [];

  for (const card of scryfallData) {
    if (EXCLUDED_LAYOUTS.has(card.layout)) continue;
    if (EXCLUDED_SET_TYPES.has(card.set_type)) continue;
    if (EXCLUDED_SET_CODES.has(card.set)) continue;

    let found = false;
    if (pool.has(card.name.toLowerCase())) {
      found = true;
    } else if (card.card_faces) {
      for (const face of card.card_faces) {
        if (pool.has(face.name.toLowerCase())) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      matched.push(card);
      matchedNames.add(card.name.toLowerCase());
      if (card.card_faces) {
        for (const face of card.card_faces) {
          matchedNames.add(face.name.toLowerCase());
        }
      }
    }
  }

  // Unmatched: original pool lines with no Scryfall match
  const unmatched = [];
  for (const line of originalLines) {
    const lineLower = line.toLowerCase();
    let isMatched = matchedNames.has(lineLower);
    if (!isMatched && line.includes(' // ')) {
      isMatched = line.split(' // ').some(p => matchedNames.has(p.trim().toLowerCase()));
    }
    if (!isMatched) unmatched.push(line);
  }

  return { matched, unmatched };
}

// --- Step 4: Map to game schema ---
function rarityCode(r) {
  if (r === 'common') return 'C';
  if (r === 'uncommon') return 'U';
  return 'R';
}

function mapCard(card) {
  const oracleText = card.oracle_text ??
    (card.card_faces ? card.card_faces.map(f => f.oracle_text ?? '').join(' // ') : '');

  return {
    id: makeSlug(card.name),
    scryfallId: card.id,
    name: card.name,
    manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? '',
    cmc: card.cmc,
    typeLine: card.type_line,
    oracleText,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    power: card.power ?? card.card_faces?.[0]?.power ?? null,
    toughness: card.toughness ?? card.card_faces?.[0]?.toughness ?? null,
    rarity: rarityCode(card.rarity),
    keywords: card.keywords ?? [],
    setCode: card.set,
    scryfallUri: card.scryfall_uri,
  };
}

// --- Step 6: Slug reconciliation ---
function reconcileSlugs(poolIds) {
  const poolIdSet = new Set(poolIds);
  const candidates = [
    path.join(REPO_ROOT, 'src', 'data', 'cards.js'),
    path.join(REPO_ROOT, 'ARCHIVE', 'shandalar-phase4.jsx'),
  ];

  const existingIds = new Set();
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const m of content.matchAll(/\bid:\s*["']([^"']+)["']/g)) {
      existingIds.add(m[1]);
    }
  }

  const mismatches = [];
  for (const existingId of existingIds) {
    if (poolIdSet.has(existingId)) continue;
    let closest = 'NO MATCH';
    for (const poolId of poolIds) {
      if (poolId.includes(existingId) || existingId.includes(poolId)) {
        closest = poolId;
        break;
      }
    }
    mismatches.push({ existingId, closest });
  }

  return mismatches;
}

// --- Main ---
async function main() {
  const scryfallData = await loadScryfallData();
  const { pool, originalLines } = loadCardPool();

  const { matched, unmatched } = filterCards(scryfallData, pool, originalLines);
  console.log(`Matched: ${matched.length} cards, Unmatched: ${unmatched.length}`);

  const cards = matched.map(mapCard);
  cards.sort((a, b) => a.name.localeCompare(b.name));

  // Step 5: Write JSON output
  const outputJsonPath = path.join(SCRYFALL_DIR, 'shandalar-card-pool.json');
  fs.writeFileSync(outputJsonPath, JSON.stringify(cards, null, 2), 'utf8');
  console.log(`Wrote ${cards.length} cards to ${outputJsonPath}`);

  // Step 6: Slug reconciliation
  const poolIds = cards.map(c => c.id);
  const mismatches = reconcileSlugs(poolIds);

  const unmatchedSection = unmatched.length > 0
    ? unmatched.map(n => `- ${n}`).join('\n')
    : '(none)';

  const mismatchSection = mismatches.length > 0
    ? mismatches.map(m => `- ${m.existingId}  →  closest match in pool: ${m.closest}`).join('\n')
    : '(none)';

  const report = `Shandalar Card Pool Processing Report
======================================
Run date: ${new Date().toISOString()}
Scryfall oracle cards loaded: ${scryfallData.length}
Pool list entries: ${originalLines.length}
Cards matched: ${cards.length}
Cards unmatched: ${unmatched.length}

UNMATCHED CARDS (not found in Scryfall oracle data):
${unmatchedSection}

SLUG RECONCILIATION (existing CARD_DB ids not found in generated pool):
${mismatchSection}

ACTION REQUIRED: Review mismatches above before engine integration.
If the pool id is correct, patch CARD_DB to use the new slug.
If the CARD_DB id is preferred, add a slug override map to this script.
`;

  const reportPath = path.join(SCRYFALL_DIR, 'processing-report.txt');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Wrote report to ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
