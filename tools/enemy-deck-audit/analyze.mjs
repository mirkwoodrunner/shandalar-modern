#!/usr/bin/env node
// tools/enemy-deck-audit/analyze.mjs
// Coverage/conversion audit for the original-Shandalar enemy deck packs under
// public/enemy-decks/. Parses both packs, matches card names against this repo's
// CARD_DB, and reports per-deck / per-pack / global coverage so a later prompt can
// decide how (or whether) to build these into the game. Read-only against src/ and
// public/ -- writes only report.json and report.md into this directory.
//
// Run: node tools/enemy-deck-audit/analyze.mjs

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CARD_DB } from '../../src/data/cards.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const PACKS = [
  { key: 'original', dir: join(ROOT, 'public', 'enemy-decks', 'original'), ext: '.DCK', hasSideboards: true },
  { key: 'spells-of-the-ancients', dir: join(ROOT, 'public', 'enemy-decks', 'spells-of-the-ancients'), ext: '.dck', hasSideboards: false },
];

// --- Name normalization -----------------------------------------------------
// Mirrors the slug convention enforced by validateCardIds() in src/data/cards.js.
function slugify(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/['’]/g, 's')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function looseKey(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Known naming quirks in the deck packs that don't survive plain slugify()
// matching against this repo's oracle-name-derived ids. Keyed by looseKey(raw name).
const ALIASES = {
  'yotian soldiers': 'Yotian Soldier',
  't.island': 'Tropical Island',
  'v.island': 'Volcanic Island',
  'cop: red': 'Circle of Protection: Red',
  'cop:red': 'Circle of Protection: Red',
  'cop: white': 'Circle of Protection: White',
  'cop:white': 'Circle of Protection: White',
  'cop: blue': 'Circle of Protection: Blue',
  'cop:blue': 'Circle of Protection: Blue',
  'cop: black': 'Circle of Protection: Black',
  'cop:black': 'Circle of Protection: Black',
  'cop: green': 'Circle of Protection: Green',
  'cop:green': 'Circle of Protection: Green',
  'will-o-the-wisp': "Will-o'-the-Wisp",
  "will-o'-the-wisp": "Will-o'-the-Wisp",
  'will-o-wisp': "Will-o'-the-Wisp",
  "will-o'-wisp": "Will-o'-the-Wisp",
  'birds of paridise': 'Birds of Paradise',        // typo in spells-of-the-ancients pack
  'stripmine': 'Strip Mine',                        // spacing, original pack
  'vesuvan doppleganger': 'Vesuvan Doppelganger',   // letter transposition, spells pack
  'manaflare': 'Mana Flare',                        // spacing, both packs
  "naf's asp": 'Nafs Asp',                          // stored card name lacks apostrophe -- see note below
  'bloodlust': 'Blood Lust',                        // spacing, spells pack
  "tawnos' weaponry": "Tawnos's Weaponry",          // old possessive form, original pack
  "tawnos' wand": "Tawnos's Wand",                  // old possessive form, original pack
  'circle of protection from artifacts': 'Circle of Protection: Artifacts', // old naming, original pack
  'golbin polka band': 'Goblin Polka Band',         // typo, spells pack
  // Necropolis of Azar / Rainbow Knights: real Scryfall names (spells pack
  // uses them verbatim). Original pack uses non-canonical Shandalar-manual
  // spellings ("Azaar", "Knights of the Rainbow Vale") for the same cards --
  // see completion summary / MECHANICS_INDEX.md for the corrected-name note.
  'necropolis of azaar': 'Necropolis of Azar',      // original pack manual spelling
  'knights of the rainbow vale': 'Rainbow Knights', // original pack manual spelling
  'mons goblin raiders': "Mons's Goblin Raiders",   // deck files drop the apostrophe-s, both packs
  'ragman': 'Rag Man',                              // spacing, deck packs
  'zephyr falcons': 'Zephyr Falcon',                // plural in deck packs, card is singular
  'abu jafar': "Abu Ja'far",                        // deck files drop the apostrophe; CARD_DB id is abu_jasfar
  'v. enchantress': 'Verduran Enchantress',          // abbreviation, deck packs
};

const slugMap = new Map();
for (const card of CARD_DB) {
  const slug = slugify(card.name);
  if (!slugMap.has(slug)) slugMap.set(slug, card);
}

function matchCard(rawName) {
  const direct = slugMap.get(slugify(rawName));
  if (direct) return direct;
  const alias = ALIASES[looseKey(rawName)];
  if (alias) {
    const aliased = slugMap.get(slugify(alias));
    if (aliased) return aliased;
  }
  return null;
}

// --- .DCK / .dck parser ------------------------------------------------------
// Format:
//   <title line>
//   <blank line>
//   .<internalId>\t<qty>\t<name>       (maindeck, repeated)
//   <blank line>                        (only when a sideboard follows)
//   .v<Color>                           (sideboard section marker, repeatable)
//   .<internalId>\t<qty>\t<name>       (sideboard entries for that marker)
function parseDeckFile(text, filename) {
  const lines = text.split(/\r\n|\n/);
  const title = (lines[0] || '').trim();
  const cardLineRe = /^\.(\d+)\t(\d+)\t(.+)$/;
  const sideboardMarkerRe = /^\.v(\w+)$/i;

  const maindeck = []; // { internalId, qty, name }
  const sideboard = {}; // color -> [{ internalId, qty, name }]
  let inSideboard = false;
  let currentColor = null;
  const internalIdNames = new Map(); // internalId -> Set(names seen) -- anomaly detection

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const marker = line.match(sideboardMarkerRe);
    if (marker) {
      inSideboard = true;
      currentColor = marker[1];
      if (!sideboard[currentColor]) sideboard[currentColor] = [];
      continue;
    }
    const m = line.match(cardLineRe);
    if (!m) {
      console.warn(`[${filename}] Unrecognized line, skipping: "${line}"`);
      continue;
    }
    const [, internalId, qtyStr, name] = m;
    const qty = parseInt(qtyStr, 10);
    const entry = { internalId, qty, name };
    if (inSideboard) {
      sideboard[currentColor].push(entry);
    } else {
      maindeck.push(entry);
    }
    if (!internalIdNames.has(internalId)) internalIdNames.set(internalId, new Set());
    internalIdNames.get(internalId).add(name);
  }

  const idCollisions = [...internalIdNames.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([internalId, names]) => ({ internalId, names: [...names] }));

  return { title, maindeck, sideboard, idCollisions };
}

// --- Load and match all decks -------------------------------------------------
const deckResults = {}; // packKey -> fileId -> result

for (const pack of PACKS) {
  deckResults[pack.key] = {};
  const files = readdirSync(pack.dir).filter(f => f.toLowerCase().endsWith(pack.ext.toLowerCase()));
  for (const file of files) {
    const fileId = file.slice(0, file.length - pack.ext.length);
    const text = readFileSync(join(pack.dir, file), 'utf8');
    const parsed = parseDeckFile(text, `${pack.key}/${file}`);

    let totalCards = 0, matchedCards = 0;
    const unmatched = new Map(); // name -> qty
    const matchedIds = [];
    for (const { qty, name } of parsed.maindeck) {
      totalCards += qty;
      const card = matchCard(name);
      if (card) {
        matchedCards += qty;
        matchedIds.push(card.id);
      } else {
        unmatched.set(name, (unmatched.get(name) || 0) + qty);
      }
    }

    deckResults[pack.key][fileId] = {
      file,
      title: parsed.title,
      totalCards,
      matchedCards,
      unmatchedCards: totalCards - matchedCards,
      coveragePct: totalCards > 0 ? +(100 * matchedCards / totalCards).toFixed(1) : 0,
      unmatchedNames: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).map(([name, qty]) => ({ name, qty })),
      matchedCardIds: matchedIds,
      sideboardColors: Object.keys(parsed.sideboard),
      idCollisions: parsed.idCollisions,
    };
  }
}

// --- Cross-pack comparison ----------------------------------------------------
const allFileIds = new Set([
  ...Object.keys(deckResults[PACKS[0].key]),
  ...Object.keys(deckResults[PACKS[1].key]),
]);

const crossPack = [];
for (const fileId of [...allFileIds].sort()) {
  const a = deckResults[PACKS[0].key][fileId];
  const b = deckResults[PACKS[1].key][fileId];
  if (!a || !b) {
    crossPack.push({ fileId, note: 'present in only one pack', original: a ? a.title : null, spellsOfTheAncients: b ? b.title : null });
    continue;
  }
  const setA = new Set(a.matchedCardIds);
  const setB = new Set(b.matchedCardIds);
  const intersection = [...setA].filter(id => setB.has(id)).length;
  const union = new Set([...setA, ...setB]).size;
  const overlapPct = union > 0 ? +(100 * intersection / union).toFixed(1) : 0;
  crossPack.push({
    fileId,
    titleOriginal: a.title,
    titleSpells: b.title,
    titleMismatch: a.title.replace(/\s*\(.*\)$/, '').trim().toLowerCase() !== b.title.replace(/\s*\(.*\)$/, '').trim().toLowerCase(),
    coverageOriginal: a.coveragePct,
    coverageSpells: b.coveragePct,
    betterSource: a.coveragePct === b.coveragePct ? 'tie' : (a.coveragePct > b.coveragePct ? 'original' : 'spells-of-the-ancients'),
    contentOverlapPct: overlapPct,
    contentMismatchFlag: overlapPct < 30,
  });
}

// --- Global rollups ------------------------------------------------------------
function packRollup(packKey) {
  const decks = Object.values(deckResults[packKey]);
  const totalCards = decks.reduce((s, d) => s + d.totalCards, 0);
  const matchedCards = decks.reduce((s, d) => s + d.matchedCards, 0);
  const missing = new Map();
  for (const d of decks) {
    for (const { name, qty } of d.unmatchedNames) {
      missing.set(name, (missing.get(name) || 0) + qty);
    }
  }
  return {
    deckCount: decks.length,
    totalCards,
    matchedCards,
    coveragePct: totalCards > 0 ? +(100 * matchedCards / totalCards).toFixed(1) : 0,
    fullyCoveredDecks: decks.filter(d => d.unmatchedCards === 0).length,
    missingCardFrequency: [...missing.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, deckCopies: count })),
    filesWithIdCollisions: decks.filter(d => d.idCollisions.length > 0).map(d => ({ file: d.file, idCollisions: d.idCollisions })),
  };
}

const rollups = { original: packRollup('original'), 'spells-of-the-ancients': packRollup('spells-of-the-ancients') };

const contentMismatches = crossPack.filter(c => c.contentMismatchFlag || c.titleMismatch);

// --- Write JSON report -----------------------------------------------------
const report = {
  generatedAt: new Date().toISOString(),
  cardDbSize: CARD_DB.length,
  rollups,
  crossPack,
  contentMismatches,
  deckResults,
};
writeFileSync(join(__dirname, 'report.json'), JSON.stringify(report, null, 2));

// --- Write Markdown summary --------------------------------------------------
function fmtRollup(key, r) {
  const lines = [];
  lines.push(`### ${key}`);
  lines.push('');
  lines.push(`- Decks: ${r.deckCount}`);
  lines.push(`- Overall coverage: ${r.matchedCards}/${r.totalCards} cards matched (${r.coveragePct}%)`);
  lines.push(`- Fully-covered decks (100%): ${r.fullyCoveredDecks} / ${r.deckCount}`);
  if (r.filesWithIdCollisions.length) {
    lines.push(`- Files with internal-ID collisions (same numeric id used for different card names within one file): ${r.filesWithIdCollisions.length}`);
  }
  lines.push('');
  lines.push('Top missing cards (by total copies across all decks in this pack):');
  lines.push('');
  lines.push('| Card name | Copies missing |');
  lines.push('|---|---|');
  for (const { name, deckCopies } of r.missingCardFrequency.slice(0, 25)) {
    lines.push(`| ${name} | ${deckCopies} |`);
  }
  lines.push('');
  return lines.join('\n');
}

const md = [];
md.push('# Enemy Deck Audit Report');
md.push('');
md.push(`Generated: ${report.generatedAt}`);
md.push(`CARD_DB size: ${report.cardDbSize}`);
md.push('');
md.push('## Pack rollups');
md.push('');
md.push(fmtRollup('original', rollups.original));
md.push(fmtRollup('spells-of-the-ancients', rollups['spells-of-the-ancients']));

md.push('## Cross-pack comparison (per deck ID)');
md.push('');
md.push('`betterSource` picks whichever pack has higher coverage for that deck ID.');
md.push('`contentMismatchFlag` is set when matched-card overlap between the two packs is below 30% -- treat these as different decks, not variants of the same list.');
md.push('');
md.push('| ID | Title (original) | Title (spells) | Coverage orig | Coverage spells | Better source | Overlap % | Mismatch? |');
md.push('|---|---|---|---|---|---|---|---|');
for (const c of crossPack) {
  if (c.note) {
    md.push(`| ${c.fileId} | ${c.original || '-'} | ${c.spellsOfTheAncients || '-'} | - | - | - | - | ${c.note} |`);
    continue;
  }
  md.push(`| ${c.fileId} | ${c.titleOriginal} | ${c.titleSpells} | ${c.coverageOriginal}% | ${c.coverageSpells}% | ${c.betterSource} | ${c.contentOverlapPct}% | ${c.contentMismatchFlag || c.titleMismatch ? 'YES' : ''} |`);
}
md.push('');

md.push('## Flagged content mismatches');
md.push('');
if (contentMismatches.length === 0) {
  md.push('None.');
} else {
  for (const c of contentMismatches) {
    md.push(`- **${c.fileId}**: "${c.titleOriginal}" (original) vs "${c.titleSpells}" (spells-of-the-ancients) -- content overlap ${c.contentOverlapPct}%`);
  }
}
md.push('');

md.push('## Per-deck detail');
md.push('');
for (const pack of PACKS) {
  md.push(`### ${pack.key}`);
  md.push('');
  md.push('| ID | Title | Total | Matched | Coverage | Unmatched (top 3) |');
  md.push('|---|---|---|---|---|---|');
  for (const fileId of Object.keys(deckResults[pack.key]).sort()) {
    const d = deckResults[pack.key][fileId];
    const top3 = d.unmatchedNames.slice(0, 3).map(u => `${u.name} x${u.qty}`).join(', ');
    md.push(`| ${fileId} | ${d.title} | ${d.totalCards} | ${d.matchedCards} | ${d.coveragePct}% | ${top3} |`);
  }
  md.push('');
}

writeFileSync(join(__dirname, 'report.md'), md.join('\n'));

console.log(`Analyzed ${allFileIds.size} deck IDs across ${PACKS.length} packs.`);
console.log(`original: ${rollups.original.coveragePct}% coverage (${rollups.original.matchedCards}/${rollups.original.totalCards})`);
console.log(`spells-of-the-ancients: ${rollups['spells-of-the-ancients'].coveragePct}% coverage (${rollups['spells-of-the-ancients'].matchedCards}/${rollups['spells-of-the-ancients'].totalCards})`);
console.log(`Flagged content mismatches: ${contentMismatches.length}`);
console.log('Wrote tools/enemy-deck-audit/report.json and report.md');
