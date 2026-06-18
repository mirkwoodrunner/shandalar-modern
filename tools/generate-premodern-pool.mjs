#!/usr/bin/env node
// tools/generate-premodern-pool.mjs
// Generates src/data/cardsPremodern.js from local Scryfall oracle bulk data.
// Uses legalities.premodern to identify Premodern-legal cards -- this is authoritative.
// Run: node tools/generate-premodern-pool.mjs

import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

// Expected ban list from the prompt spec (for cross-reference verification only)
// The legal flag itself comes from Scryfall legalities.premodern
const EXPECTED_BAN_LIST = new Set([
  'Amulet of Quoz', 'Balance', 'Brainstorm', 'Bronze Tablet', 'Channel',
  'Demonic Consultation', 'Earthcraft', 'Entomb', 'Flash', 'Force of Will',
  'Goblin Recruiter', 'Grim Monolith', 'Jeweled Bird', 'Land Tax', 'Mana Vault',
  'Memory Jar', 'Mind Twist', "Mind's Desire", 'Mystical Tutor', 'Necropotence',
  'Parallax Tide', 'Rebirth', 'Strip Mine', 'Tempest Efreet', 'Tendrils of Agony',
  'Time Spiral', 'Timmerian Fiends', 'Tolarian Academy', 'Vampiric Tutor',
  'Windfall', 'Worldgorger Dragon', "Yawgmoth's Bargain", "Yawgmoth's Will",
]);

// Layouts and set types to exclude (tokens, art cards, memorabilia, etc.)
const EXCLUDED_LAYOUTS = new Set([
  'token', 'art_series', 'emblem', 'double_faced_token', 'reversible_card'
]);
const EXCLUDED_SET_TYPES = new Set(['token', 'memorabilia', 'funny']);

// Supertypes: stripped when building the `type` field
const SUPERTYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Elite']);

// --- Slug generation ---
// Convention from src/data/cards.js: lowercase, diacritics stripped, apostrophes stripped,
// non-alphanumeric -> underscore, collapsed and trimmed.
function makeSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritical marks
    .replace(/['''`]/g, '') // strip apostrophes (straight and curly)
    .replace(/ \/\/ /g, '_')             // split-card " // " -> underscore
    .replace(/[^a-z0-9]+/g, '_')        // non-alphanumeric -> underscore
    .replace(/^_+|_+$/g, '')           // trim edges
    .replace(/_+/g, '_');              // collapse runs
}

// Convert Scryfall mana cost {W}{1}{G/U} -> W1G/U
function makeCost(manaCost) {
  if (!manaCost) return '';
  return manaCost.replace(/\{([^}]+)\}/g, (_, m) => m);
}

// Sanitize oracle text: ensure ASCII-only output per project encoding hygiene
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/—/g, '--')       // em-dash -> --
    .replace(/–/g, '-')        // en-dash -> -
    .replace(/[‘’]/g, "'") // curly apostrophes -> straight
    .replace(/[“”]/g, '"') // curly quotes -> straight
    .replace(/\n/g, '\\n');          // newline -> \n escape in JS string
}

// Extract card type string, stripping supertypes, taking first face for split cards
function extractType(typeLine) {
  if (!typeLine) return 'Unknown';
  const firstFace = typeLine.split(' // ')[0];
  const beforeDash = firstFace.split('—')[0].split('--')[0].trim();
  const words = beforeDash.split(/\s+/).filter(w => w && !SUPERTYPES.has(w));
  return words.join(' ') || 'Unknown';
}

// Extract subtype (after em-dash), first face only
function extractSubtype(typeLine) {
  if (!typeLine) return null;
  const firstFace = typeLine.split(' // ')[0];
  const dashIdx = firstFace.indexOf('—');
  if (dashIdx === -1) return null;
  const sub = firstFace.slice(dashIdx + 1).trim();
  return sub || null;
}

function makeRarity(rarity) {
  const map = { common: 'C', uncommon: 'U', rare: 'R', mythic: 'M', special: 'S', bonus: 'S' };
  return map[rarity] || 'C';
}

function makeColors(colors) {
  return Array.isArray(colors) ? colors.join('') : '';
}

// Parse power/toughness: number if numeric, string if variable ("*", "1+*", etc.)
function parsePT(val) {
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return isNaN(n) ? val : n;
}

// Get oracle text; handles split/transform cards whose text is in card_faces
function getOracleText(card) {
  if (typeof card.oracle_text === 'string') return card.oracle_text;
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    return card.card_faces.map(f => f.oracle_text || '').join('\n//\n');
  }
  return '';
}

// Get mana cost; handles split cards (each face has its own cost)
function getManaCost(card) {
  if (card.mana_cost != null) return card.mana_cost;
  if (Array.isArray(card.card_faces)) {
    const costs = card.card_faces.map(f => f.mana_cost || '').filter(Boolean);
    return costs.join(' // ');
  }
  return '';
}

// Get type line; use first face for multi-face cards
function getTypeLine(card) {
  if (card.type_line) return card.type_line;
  if (Array.isArray(card.card_faces) && card.card_faces[0]) {
    return card.card_faces[0].type_line || '';
  }
  return '';
}

async function loadScryfallData() {
  const zipPath = path.join(REPO_ROOT, 'scryfall', 'oracle-cards-20260419090229.zip');
  if (!existsSync(zipPath)) throw new Error(`Scryfall zip not found: ${zipPath}`);
  console.log(`Reading ${zipPath}...`);
  const dir = await unzipper.Open.file(zipPath);
  const jsonEntry = dir.files.find(f => f.path.endsWith('.json'));
  if (!jsonEntry) throw new Error('No .json file found inside the zip');
  const data = JSON.parse((await jsonEntry.buffer()).toString('utf8'));
  if (!Array.isArray(data)) throw new Error('Scryfall JSON is not an array');
  console.log(`Loaded ${data.length.toLocaleString()} oracle cards.\n`);
  return data;
}

function loadExistingIds() {
  const src = readFileSync(path.join(REPO_ROOT, 'src', 'data', 'cards.js'), 'utf8');
  const ids = new Set();
  const re = /\bid:"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) ids.add(m[1]);
  return ids;
}

async function main() {
  const scryfallData = await loadScryfallData();
  const existingIds = loadExistingIds();
  console.log(`Existing CARD_DB ids for collision check: ${existingIds.size}\n`);

  // Filter to Premodern-legal cards using Scryfall's legalities.premodern
  // Values: "legal" (playable), "banned" (in pool but banned), "not_legal" (outside pool)
  const pmCards = scryfallData.filter(c => {
    if (EXCLUDED_LAYOUTS.has(c.layout)) return false;
    if (EXCLUDED_SET_TYPES.has(c.set_type)) return false;
    const pm = c.legalities?.premodern;
    return pm === 'legal' || pm === 'banned';
  });

  console.log(`Premodern-eligible cards from oracle data: ${pmCards.length}`);

  // Cross-reference: verify our expected ban list matches Scryfall's banned set
  const scryfallBanned = new Set(
    pmCards.filter(c => c.legalities.premodern === 'banned').map(c => c.name)
  );
  const missingFromScryfall = [];
  for (const name of EXPECTED_BAN_LIST) {
    if (!scryfallBanned.has(name)) missingFromScryfall.push(name);
  }
  const extraInScryfall = [...scryfallBanned].filter(n => !EXPECTED_BAN_LIST.has(n));

  // Build entries
  const entries = [];
  const slugCollisions = [];
  const internalSlugs = new Map(); // slug -> name (for internal collision detection)

  for (const card of pmCards) {
    const name = card.name;
    const slug = makeSlug(name);
    const isBanned = card.legalities.premodern === 'banned';

    if (existingIds.has(slug)) {
      slugCollisions.push({ name, slug, set: card.set });
    }
    if (internalSlugs.has(slug)) {
      console.warn(`  INTERNAL SLUG COLLISION: "${slug}" for "${name}" conflicts with "${internalSlugs.get(slug)}"`);
    } else {
      internalSlugs.set(slug, name);
    }

    const typeLine = getTypeLine(card);
    const mainType = extractType(typeLine);
    const subtype = extractSubtype(typeLine);
    const oracleText = cleanText(getOracleText(card));
    const cost = makeCost(getManaCost(card));
    const powerVal = parsePT(card.power);
    const toughnessVal = parsePT(card.toughness);

    // set: oracle canonical printing set code.
    // Note: for many reprinted cards, this may be a post-Premodern set (e.g. dmr, vma, ema).
    // The set field here is informational; it records which Scryfall oracle printing was
    // used as the source. The earliest Premodern printing requires per-printing data
    // not available in the oracle bulk file.
    const entry = {
      id: slug,
      name,
      type: mainType,
      subtype: subtype || undefined,
      color: makeColors(card.colors),
      cmc: typeof card.cmc === 'number' ? card.cmc : 0,
      cost,
      text: oracleText,
      rarity: makeRarity(card.rarity),
      power: powerVal,
      toughness: toughnessVal,
      set: card.set,          // oracle canonical printing (see note above)
      legal: !isBanned,
      implemented: false,
    };

    entries.push(entry);
  }

  // Sort alphabetically by card name
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const legalCount = entries.filter(e => e.legal).length;
  const bannedCount = entries.filter(e => !e.legal).length;

  // === Generate JS output ===
  let out = '';
  out += `// src/data/cardsPremodern.js\n`;
  out += `// Premodern card pool (Fourth Edition through Scourge, 29 sets).\n`;
  out += `// Source: Scryfall oracle bulk data filtered by legalities.premodern.\n`;
  out += `// Do not edit by hand -- regenerate via: node tools/generate-premodern-pool.mjs\n`;
  out += `// Fully standalone: no imports from or references to cards.js or CARD_DB.\n`;
  out += `//\n`;
  out += `// NOTE: The 'set' field records the Scryfall oracle canonical printing,\n`;
  out += `// which may be a post-Premodern reprint (e.g. 'dmr', 'vma', 'ema').\n`;
  out += `// It does NOT always reflect the earliest Premodern appearance.\n`;
  out += `//\n`;
  out += `// Total unique cards: ${entries.length}\n`;
  out += `// Legal: ${legalCount} | Banned (legal:false): ${bannedCount}\n`;
  out += `\nexport const CARD_DB_PREMODERN = [\n`;

  for (const e of entries) {
    const parts = [];
    parts.push(`id:${JSON.stringify(e.id)}`);
    parts.push(`name:${JSON.stringify(e.name)}`);
    parts.push(`type:${JSON.stringify(e.type)}`);
    if (e.subtype) parts.push(`subtype:${JSON.stringify(e.subtype)}`);
    parts.push(`color:${JSON.stringify(e.color)}`);
    parts.push(`cmc:${e.cmc}`);
    parts.push(`cost:${JSON.stringify(e.cost)}`);
    parts.push(`text:${JSON.stringify(e.text)}`);
    parts.push(`rarity:${JSON.stringify(e.rarity)}`);
    if (e.power !== undefined) {
      parts.push(`power:${typeof e.power === 'string' ? JSON.stringify(e.power) : e.power}`);
    }
    if (e.toughness !== undefined) {
      parts.push(`toughness:${typeof e.toughness === 'string' ? JSON.stringify(e.toughness) : e.toughness}`);
    }
    parts.push(`set:${JSON.stringify(e.set)}`);
    parts.push(`legal:${e.legal}`);
    parts.push(`implemented:false`);
    out += `  {${parts.join(',')}},\n`;
  }

  out += `];\n\nexport default CARD_DB_PREMODERN;\n`;

  const outPath = path.join(REPO_ROOT, 'src', 'data', 'cardsPremodern.js');
  writeFileSync(outPath, out, 'utf8');
  const sizeKB = Math.round(out.length / 1024);
  console.log(`File written: src/data/cardsPremodern.js (${sizeKB}KB, ${entries.length} entries)\n`);

  // === FINAL REPORT ===
  console.log(`=== FINAL REPORT ===`);
  console.log(`Total unique cards:      ${entries.length}`);
  console.log(`Legal (legal:true):      ${legalCount}`);
  console.log(`Banned (legal:false):    ${bannedCount}`);

  console.log(`\nBan list cross-reference (prompt spec vs. Scryfall data):`);
  if (missingFromScryfall.length === 0 && extraInScryfall.length === 0) {
    console.log(`  All ${EXPECTED_BAN_LIST.size} banned cards match exactly -- no discrepancies.`);
  } else {
    if (missingFromScryfall.length > 0) {
      console.log(`  In prompt ban list but NOT in Scryfall banned (${missingFromScryfall.length}):`);
      missingFromScryfall.forEach(n => console.log(`    MISSING: "${n}"`));
    }
    if (extraInScryfall.length > 0) {
      console.log(`  Banned by Scryfall but NOT in prompt ban list (${extraInScryfall.length}):`);
      extraInScryfall.forEach(n => console.log(`    EXTRA: "${n}"`));
    }
  }

  console.log(`\nSlug collisions with existing CARD_DB: ${slugCollisions.length}`);
  if (slugCollisions.length > 0) {
    console.log(`  (first 20 shown)`);
    slugCollisions.slice(0, 20).forEach(c =>
      console.log(`  id:"${c.slug}"  name:"${c.name}"  oracle-set:${c.set}`)
    );
    if (slugCollisions.length > 20) {
      console.log(`  ... and ${slugCollisions.length - 20} more`);
    }
  }

  console.log(`\nNOTE: 'set' field uses Scryfall oracle canonical printing.`);
  console.log(`For ${slugCollisions.length} cards, set codes like 'dmr','vma','ema' may appear`);
  console.log(`instead of the earliest Premodern-era set. No runtime effect (all implemented:false).`);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
