#!/usr/bin/env node
// tools/generate-learn-pool.mjs
// Generates src/data/cardsLearn.js from local Scryfall oracle bulk data.
//
// Unlike tools/generate-premodern-pool.mjs, selection here is CURATED, not a bulk
// legality filter. The list below is derived from docs/LEARN_CURRICULUM.md's Tier 1-3
// skill tags, bounded by docs/LEARN_MODE_ROADMAP.md's L4a constraints: current Oracle
// templating, evergreen keywords only, one clean example per concept, frequently
// reprinted, no planeswalkers, nothing DuelCore can't execute.
//
// Run: node tools/generate-learn-pool.mjs

import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import unzipper from 'unzipper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

// The pinned Scryfall bulk-data file. Refreshing this pin is a separate decision
// (see docs/LEARN_MODE.md -- Learn card pool); this script never fetches.
export const PINNED_BULK_FILE = 'oracle-cards-20260419090229.zip';

// --- Curated selection ------------------------------------------------------
//
// `skills` are literal skill tags from docs/LEARN_CURRICULUM.md. `mech` carries the
// fields beyond the shared card shape that make the card executable by DuelCore --
// these cannot be derived from Scryfall and are curated against effect keys DuelCore
// already implements. Every effect key below is verified against DuelCore.js at
// generation time; an unknown key fails the run.
//
// Not a bulk import: 27 cards. Tier 1 needs no Learn pool at all (the Shandalar pool
// covers it -- LEARN_CURRICULUM.md section 3). This list serves Tier 2 and Tier 3.

const CURATED = [
  // --- Lands -------------------------------------------------------------------
  // A pool is self-contained: an exercise setting pool:'learn' resolves EVERY id
  // against it, lands included. Without basics the pool cannot host any exercise.
  { name: 'Plains',   skills: ['tap-for-mana', 'colored-vs-generic', 'land-per-turn'], mech: { produces: 'auto' } },
  { name: 'Island',   skills: ['tap-for-mana', 'colored-vs-generic', 'land-per-turn'], mech: { produces: 'auto' } },
  { name: 'Swamp',    skills: ['tap-for-mana', 'colored-vs-generic', 'land-per-turn'], mech: { produces: 'auto' } },
  { name: 'Mountain', skills: ['tap-for-mana', 'colored-vs-generic', 'land-per-turn'], mech: { produces: 'auto' } },
  { name: 'Forest',   skills: ['tap-for-mana', 'colored-vs-generic', 'land-per-turn'], mech: { produces: 'auto' } },

  // --- Creatures: vanilla bodies for blocking maths (2.1) and combat tricks (3.3) --
  { name: 'Grizzly Bears', skills: ['choose-a-blocker', 'trade-or-take', 'pump-after-blocks'], mech: {} },
  { name: 'Hill Giant',    skills: ['chump-block', 'double-block', 'trade-or-take'],           mech: {} },
  { name: 'Goblin Piker',  skills: ['double-block', 'trade-or-take', 'bait-a-block'],          mech: {} },
  { name: 'Raging Goblin', skills: ['hold-back-a-blocker', 'untap-and-upkeep', 'chump-block'], mech: {} },

  // --- Creatures: evasion and the answers to it (2.1, 2.7) ----------------------
  { name: 'Storm Crow',    skills: ['chump-block', 'choose-a-blocker'],                        mech: {} },
  { name: 'Wind Drake',    skills: ['choose-a-blocker', 'race-or-block'],                      mech: {} },
  { name: 'Air Elemental', skills: ['race-or-block', 'chump-block'],                           mech: {} },
  { name: 'Serra Angel',   skills: ['hold-back-a-blocker', 'race-or-block'],                   mech: {} },
  { name: 'Giant Spider',  skills: ['choose-a-blocker', 'trade-or-take'],                      mech: {} },
  { name: 'Steel Wall',    skills: ['choose-a-blocker', 'identify-card-type'],                 mech: {} },
  { name: 'Child of Night', skills: ['race-or-block', 'plan-two-turns'],                       mech: {} },

  // --- Noncreature permanents: card types (2.3) ---------------------------------
  { name: 'Manalith',       skills: ['identify-card-type', 'permanent-vs-spell', 'main-phase-timing'],
    mech: { activated: { cost: 'T', effect: 'addManaAny' } } },
  { name: 'Unholy Strength', skills: ['identify-card-type', 'permanent-vs-spell', 'target-your-own'],
    mech: { effect: 'enchantCreature', mod: { power: 2, toughness: 1 } } },

  // --- Instants: targeting (2.4), the stack (2.5), tricks (3.3) -----------------
  { name: 'Lightning Bolt',  skills: ['burn-for-lethal', 'legal-target', 'lethal-damage'],       mech: { effect: 'damage3' } },
  { name: 'Shock',           skills: ['burn-for-lethal', 'zero-toughness', 'lethal-damage'],     mech: { effect: 'damage2' } },
  { name: 'Giant Growth',    skills: ['pump-after-blocks', 'target-your-own', 'bait-a-block'],
    mech: { effect: 'pumpCreature', mod: { power: 3, toughness: 3 } } },
  { name: 'Murder',          skills: ['removal-after-blocks', 'legal-target'],                   mech: { effect: 'destroy' } },
  { name: 'Counterspell',    skills: ['stack-order', 'respond-to-a-spell', 'holding-priority'],  mech: { effect: 'counter' } },
  { name: 'Essence Scatter', skills: ['legal-target', 'stack-order'],                            mech: { effect: 'counterCreature' } },
  { name: 'Naturalize',      skills: ['legal-target', 'identify-card-type'],                     mech: { effect: 'destroyArtOrEnch' } },
  { name: 'Unsummon',        skills: ['respond-to-a-spell', 'when-can-i-cast-this'],             mech: { effect: 'bounce' } },

  // --- Sorcery: the instant/sorcery contrast (2.5) and board wipes (3.2) --------
  { name: 'Day of Judgment', skills: ['instant-vs-sorcery-timing', 'when-can-i-cast-this', 'zero-toughness'],
    mech: { effect: 'wrathAll' } },
];

// --- Keyword policy ---------------------------------------------------------
// Scryfall keyword name -> project KEYWORDS id (src/data/keywords.js).
// Only evergreen keywords DuelCore honours, minus the ones project policy bans
// (src/learn/__tests__/units.test.ts BLOCKED_KEYWORDS: TRAMPLE, BANDING,
// FIRST_STRIKE, DOUBLE_STRIKE, DEATHTOUCH). A card carrying anything outside
// ALLOWED_KEYWORDS or IGNORED_KEYWORDS fails the run rather than being silently
// stripped -- a pool card whose printed abilities the engine drops is worse than
// no card at all.
const ALLOWED_KEYWORDS = {
  Flying: 'FLYING',
  Reach: 'REACH',
  Defender: 'DEFENDER',
  Vigilance: 'VIGILANCE',
  Haste: 'HASTE',
  Lifelink: 'LIFELINK',
};
// Scryfall lists these as "keywords" but they are templating markers, not abilities
// with a keyword id in this project's registry.
const IGNORED_KEYWORDS = new Set(['Enchant', 'Equip']);

const EXCLUDED_LAYOUTS = new Set(['token', 'art_series', 'emblem', 'double_faced_token', 'reversible_card']);
const EXCLUDED_SET_TYPES = new Set(['token', 'memorabilia', 'funny']);
const SUPERTYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Elite']);

// --- Field mapping (same conventions as generate-premodern-pool.mjs) --------

function makeSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/ \/\/ /g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function makeCost(manaCost) {
  if (!manaCost) return '';
  return manaCost.replace(/\{([^}]+)\}/g, (_, m) => m);
}

// ASCII-sanitize per the project's encoding-hygiene rule. Newlines are left as
// real newlines: the emitted literal is JSON.stringify'd, so a newline becomes a
// \n escape in the source and a real newline at runtime -- which is what CARD_DB
// entries carry, and what makes the learn:check drift comparison a like-for-like
// string compare against cleanText(oracle_text).
export function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function extractType(typeLine) {
  const firstFace = (typeLine || '').split(' // ')[0];
  const beforeDash = firstFace.split('\u2014')[0].split('--')[0].trim();
  const words = beforeDash.split(/\s+/).filter(w => w && !SUPERTYPES.has(w));
  return words.join(' ') || 'Unknown';
}

function extractSubtype(typeLine) {
  const firstFace = (typeLine || '').split(' // ')[0];
  const i = firstFace.indexOf('\u2014');
  if (i === -1) return null;
  return firstFace.slice(i + 1).trim() || null;
}

function makeRarity(rarity) {
  return { common: 'C', uncommon: 'U', rare: 'R', mythic: 'M', special: 'S', bonus: 'S' }[rarity] || 'C';
}

function parsePT(val) {
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return isNaN(n) ? val : n;
}

// --- Loading ----------------------------------------------------------------

function resolveBulkPath() {
  const dir = path.join(REPO_ROOT, 'scryfall');
  const pinned = path.join(dir, PINNED_BULK_FILE);
  if (existsSync(pinned)) return pinned;

  const present = readdirSync(dir).filter(f => /^oracle-cards-\d+\.zip$/.test(f));
  console.error(`\nFATAL: pinned Scryfall bulk data not found: scryfall/${PINNED_BULK_FILE}`);
  console.error(present.length
    ? `  Present instead: ${present.join(', ')}\n  The pin has moved. Refreshing it is a separate decision -- see\n  docs/LEARN_MODE.md -- Learn card pool. This script never fetches bulk data.`
    : `  No oracle-cards-*.zip is present in scryfall/ at all.`);
  process.exit(1);
}

export async function loadScryfallOracle(zipPath) {
  const dir = await unzipper.Open.file(zipPath);
  const jsonEntry = dir.files.find(f => f.path.endsWith('.json'));
  if (!jsonEntry) throw new Error(`No .json entry inside ${zipPath}`);
  const data = JSON.parse((await jsonEntry.buffer()).toString('utf8'));
  if (!Array.isArray(data)) throw new Error('Scryfall JSON root is not an array');
  return data;
}

// Real printings only, keyed by name. Token entries shadow real cards by name
// (Storm Crow has both), so the exclusions below are load-bearing, not cosmetic.
export function indexRealCards(data) {
  const byName = new Map();
  for (const c of data) {
    if (EXCLUDED_LAYOUTS.has(c.layout)) continue;
    if (EXCLUDED_SET_TYPES.has(c.set_type)) continue;
    if (!byName.has(c.name)) byName.set(c.name, c);
  }
  return byName;
}

// The date stamp carried in the bulk filename: oracle-cards-YYYYMMDDHHMMSS.zip
export function bulkDataDate(fileName) {
  const m = /^oracle-cards-(\d{4})(\d{2})(\d{2})/.exec(fileName);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : 'unknown';
}

// --- Validation gates -------------------------------------------------------

// Textual presence check against DuelCore's resolveEff switch. It catches the real
// failure mode -- a curated effect key that no case matches, which resolves to a
// silent no-op. It does NOT verify the effect's semantics; that is the authoring
// prompt's job when an exercise uses the card.
function loadDuelCoreEffectKeys() {
  const src = readFileSync(path.join(REPO_ROOT, 'src', 'engine', 'DuelCore.js'), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/case\s+"([A-Za-z][A-Za-z0-9_]*)"\s*:/g)) keys.add(m[1]);
  return keys;
}

function loadKeywordIds() {
  const src = readFileSync(path.join(REPO_ROOT, 'src', 'data', 'keywords.js'), 'utf8');
  const ids = new Set();
  for (const m of src.matchAll(/\bid:\s*"([A-Z_]+)"/g)) ids.add(m[1]);
  return ids;
}

function nonAscii(s) {
  const bad = [...String(s)].filter(ch => ch.charCodeAt(0) > 126);
  return bad.length ? bad.join('') : null;
}

// --- Emission ---------------------------------------------------------------

function emitMod(mod) {
  const parts = Object.entries(mod).map(([k, v]) => `${k}:${JSON.stringify(v)}`);
  return `{${parts.join(',')}}`;
}

function emitEntry(e) {
  const parts = [];
  parts.push(`id:${JSON.stringify(e.id)}`);
  parts.push(`name:${JSON.stringify(e.name)}`);
  parts.push(`type:${JSON.stringify(e.type)}`);
  if (e.subtype) parts.push(`subtype:${JSON.stringify(e.subtype)}`);
  parts.push(`color:${JSON.stringify(e.color)}`);
  parts.push(`cmc:${e.cmc}`);
  parts.push(`cost:${JSON.stringify(e.cost)}`);
  if (e.power !== undefined) parts.push(`power:${typeof e.power === 'string' ? JSON.stringify(e.power) : e.power}`);
  if (e.toughness !== undefined) parts.push(`toughness:${typeof e.toughness === 'string' ? JSON.stringify(e.toughness) : e.toughness}`);
  if (e.produces) parts.push(`produces:${JSON.stringify(e.produces)}`);
  if (e.keywords) parts.push(`keywords:[${e.keywords.map(k => `KEYWORDS.${k}.id`).join(',')}]`);
  parts.push(`text:${JSON.stringify(e.text)}`);
  parts.push(`rarity:${JSON.stringify(e.rarity)}`);
  if (e.effect) parts.push(`effect:${JSON.stringify(e.effect)}`);
  if (e.mod) parts.push(`mod:${emitMod(e.mod)}`);
  if (e.activated) parts.push(`activated:{cost:${JSON.stringify(e.activated.cost)},effect:${JSON.stringify(e.activated.effect)}}`);
  parts.push(`skills:${JSON.stringify(e.skills)}`);
  return `  {${parts.join(',')}},`;
}

// --- Main -------------------------------------------------------------------

async function main() {
  const zipPath = resolveBulkPath();
  const bulkFile = path.basename(zipPath);
  console.log(`Reading scryfall/${bulkFile} ...`);
  const data = await loadScryfallOracle(zipPath);
  console.log(`Loaded ${data.length.toLocaleString()} oracle cards.`);

  const byName = indexRealCards(data);
  const effectKeys = loadDuelCoreEffectKeys();
  const keywordIds = loadKeywordIds();

  const errors = [];
  const entries = [];
  const slugs = new Set();

  for (const pick of CURATED) {
    const card = byName.get(pick.name);
    if (!card) { errors.push(`${pick.name}: not found in pinned Scryfall oracle data`); continue; }

    const id = makeSlug(card.name);
    if (slugs.has(id)) errors.push(`${pick.name}: duplicate slug "${id}"`);
    slugs.add(id);

    const typeLine = card.type_line || '';
    const entry = {
      id,
      name: card.name,
      type: extractType(typeLine),
      subtype: extractSubtype(typeLine) || undefined,
      color: Array.isArray(card.colors) ? card.colors.join('') : '',
      cmc: typeof card.cmc === 'number' ? card.cmc : 0,
      cost: makeCost(card.mana_cost),
      text: cleanText(card.oracle_text),
      rarity: makeRarity(card.rarity),
      power: parsePT(card.power),
      toughness: parsePT(card.toughness),
      skills: [...pick.skills].sort(),
    };

    // Keywords: mapped from Scryfall, gated by policy.
    const scryKeywords = Array.isArray(card.keywords) ? card.keywords : [];
    const mapped = [];
    for (const kw of scryKeywords) {
      if (IGNORED_KEYWORDS.has(kw)) continue;
      const projectId = ALLOWED_KEYWORDS[kw];
      if (!projectId) { errors.push(`${pick.name}: keyword "${kw}" is not permitted in the Learn pool`); continue; }
      if (!keywordIds.has(projectId)) { errors.push(`${pick.name}: KEYWORDS.${projectId} missing from src/data/keywords.js`); continue; }
      mapped.push(projectId);
    }
    if (/Creature/.test(entry.type)) entry.keywords = mapped;
    else if (mapped.length) errors.push(`${pick.name}: noncreature carrying keywords ${mapped.join(',')}`);

    // Mechanics: curated, verified against DuelCore.
    const mech = pick.mech || {};
    if (mech.produces === 'auto') {
      const produced = Array.isArray(card.produced_mana) ? card.produced_mana : [];
      if (!produced.length) errors.push(`${pick.name}: produces:'auto' but Scryfall lists no produced_mana`);
      entry.produces = produced;
    } else if (mech.produces) {
      entry.produces = mech.produces;
    }
    if (mech.effect) {
      if (!effectKeys.has(mech.effect)) errors.push(`${pick.name}: effect "${mech.effect}" has no case in DuelCore.js`);
      entry.effect = mech.effect;
    }
    if (mech.mod) entry.mod = mech.mod;
    if (mech.activated) {
      if (!effectKeys.has(mech.activated.effect)) {
        errors.push(`${pick.name}: activated effect "${mech.activated.effect}" has no case in DuelCore.js`);
      }
      entry.activated = mech.activated;
    }

    // Shape contract. Mirrors validateCardShape from src/data/cardShape.js; kept as
    // an inline list because this script is plain Node and cardShape.js is an ES
    // module under src/ -- the authoritative assertion is the Vitest contract test.
    for (const f of ['id', 'name', 'type', 'color', 'cmc', 'cost', 'text', 'rarity']) {
      if (entry[f] === undefined || entry[f] === null) errors.push(`${pick.name}: missing required shape field "${f}"`);
    }

    // Encoding hygiene: this file is .js and must be ASCII.
    for (const f of ['name', 'type', 'subtype', 'text', 'cost']) {
      const bad = entry[f] == null ? null : nonAscii(entry[f]);
      if (bad) errors.push(`${pick.name}: non-ASCII in ${f}: ${JSON.stringify(bad)}`);
    }

    entries.push(entry);
  }

  if (errors.length) {
    console.error(`\nFATAL: ${errors.length} problem(s) building the Learn pool:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const meta = {
    generatedAt: new Date().toISOString(),
    scryfallBulkDataFile: bulkFile,
    scryfallBulkDataDate: bulkDataDate(bulkFile),
  };

  let out = '';
  out += `// src/data/cardsLearn.js\n`;
  out += `// Learn Mode card pool. ${entries.length} cards, curated from docs/LEARN_CURRICULUM.md's\n`;
  out += `// Tier 1-3 skill tags and bounded by docs/LEARN_MODE_ROADMAP.md L4a.\n`;
  out += `//\n`;
  out += `// Do not edit by hand -- regenerate via: node tools/generate-learn-pool.mjs\n`;
  out += `//\n`;
  out += `// Oracle text here is CURRENT Scryfall templating, deliberately unlike CARD_DB's\n`;
  out += `// classic-flavored wording. That is the point of the pool, not drift to reconcile.\n`;
  out += `// scripts/learn-check.js gates on a mismatch against the pinned bulk data.\n`;
  out += `//\n`;
  out += `// Each entry carries a 'skills' array: the docs/LEARN_CURRICULUM.md skill tags the\n`;
  out += `// card was selected for. It is selection provenance, not engine data -- DuelCore\n`;
  out += `// never reads it.\n`;
  out += `\nimport KEYWORDS from './keywords.js';\n`;
  out += `\nexport const LEARN_POOL_META = ${JSON.stringify(meta, null, 2)};\n`;
  out += `\nexport const CARD_DB_LEARN = [\n`;
  for (const e of entries) out += `${emitEntry(e)}\n`;
  out += `];\n\nexport default CARD_DB_LEARN;\n`;

  const outPath = path.join(REPO_ROOT, 'src', 'data', 'cardsLearn.js');
  writeFileSync(outPath, out, 'utf8');
  console.log(`\nFile written: src/data/cardsLearn.js (${entries.length} entries, ${Math.round(out.length / 1024)}KB)`);

  // --- Report ---------------------------------------------------------------
  console.log(`\n=== LEARN POOL REPORT ===`);
  console.log(`Bulk data:  ${meta.scryfallBulkDataFile} (${meta.scryfallBulkDataDate})`);
  console.log(`Cards:      ${entries.length}`);
  const byType = new Map();
  for (const e of entries) byType.set(e.type, (byType.get(e.type) || 0) + 1);
  console.log(`By type:    ${[...byType].map(([t, n]) => `${t} ${n}`).join(', ')}`);

  console.log(`\nCard -> curriculum skills:`);
  for (const e of entries) console.log(`  ${e.name.padEnd(17)} ${e.skills.join(', ')}`);

  const skillMap = new Map();
  for (const e of entries) for (const s of e.skills) skillMap.set(s, (skillMap.get(s) || 0) + 1);
  console.log(`\nSkills covered: ${skillMap.size}`);
  for (const [s, n] of [...skillMap].sort()) console.log(`  ${s.padEnd(26)} ${n} card(s)`);
}

// Only run when invoked directly; scripts/learn-check.js imports the helpers above.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => { console.error('\nFatal error:', err); process.exit(1); });
}
