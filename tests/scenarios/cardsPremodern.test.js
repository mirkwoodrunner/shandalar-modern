// tests/scenarios/cardsPremodern.test.js
// Structural integrity tests for the Premodern card pool data file.
// These tests validate the data file itself, not any runtime game logic.

import { describe, it, expect } from 'vitest';
import { CARD_DB_PREMODERN } from '../../src/data/cardsPremodern.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The full ban list from the Premodern format specification
const PREMODERN_BAN_LIST = [
  'Amulet of Quoz', 'Balance', 'Brainstorm', 'Bronze Tablet', 'Channel',
  'Demonic Consultation', 'Earthcraft', 'Entomb', 'Flash', 'Force of Will',
  'Goblin Recruiter', 'Grim Monolith', 'Jeweled Bird', 'Land Tax', 'Mana Vault',
  'Memory Jar', 'Mind Twist', "Mind's Desire", 'Mystical Tutor', 'Necropotence',
  'Parallax Tide', 'Rebirth', 'Strip Mine', 'Tempest Efreet', 'Tendrils of Agony',
  'Time Spiral', 'Timmerian Fiends', 'Tolarian Academy', 'Vampiric Tutor',
  'Windfall', 'Worldgorger Dragon', "Yawgmoth's Bargain", "Yawgmoth's Will",
];

// Spot-check: well-known Premodern-legal cards
const SPOT_CHECK_LEGAL = [
  'Lightning Bolt',
  'Swords to Plowshares',
  'Birds of Paradise',
  'Counterspell',
  'Llanowar Elves',
];

describe('CARD_DB_PREMODERN structural integrity', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(CARD_DB_PREMODERN)).toBe(true);
    expect(CARD_DB_PREMODERN.length).toBeGreaterThan(0);
  });

  it('contains a reasonable number of cards (>= 3000 for a 29-set format)', () => {
    expect(CARD_DB_PREMODERN.length).toBeGreaterThanOrEqual(3000);
  });

  it('has no duplicate ids (slugs)', () => {
    const ids = CARD_DB_PREMODERN.map(c => c.id);
    const unique = new Set(ids);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dups).toEqual([]);
    expect(unique.size).toBe(CARD_DB_PREMODERN.length);
  });

  it('has no duplicate card names', () => {
    const names = CARD_DB_PREMODERN.map(c => c.name);
    const unique = new Set(names);
    const dups = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dups).toEqual([]);
    expect(unique.size).toBe(CARD_DB_PREMODERN.length);
  });

  it('every card has a non-empty id, name, and type', () => {
    const missing = CARD_DB_PREMODERN.filter(
      c => !c.id || !c.name || !c.type
    );
    expect(missing).toEqual([]);
  });

  it('every card has an oracleText / text field (may be empty string for vanilla cards)', () => {
    const missing = CARD_DB_PREMODERN.filter(c => c.text === undefined || c.text === null);
    expect(missing).toEqual([]);
  });

  it('every card has a boolean legal field', () => {
    const invalid = CARD_DB_PREMODERN.filter(c => typeof c.legal !== 'boolean');
    expect(invalid).toEqual([]);
  });

  it('every card has implemented:false', () => {
    const notFalse = CARD_DB_PREMODERN.filter(c => c.implemented !== false);
    expect(notFalse).toEqual([]);
  });

  it('every card has a cmc field that is a non-negative number', () => {
    const invalid = CARD_DB_PREMODERN.filter(
      c => typeof c.cmc !== 'number' || c.cmc < 0
    );
    expect(invalid).toEqual([]);
  });

  it('every card with a non-empty id matches slug conventions (lowercase alphanumeric + underscores)', () => {
    const invalid = CARD_DB_PREMODERN.filter(c => c.id && !/^[a-z0-9_]+$/.test(c.id));
    expect(invalid).toEqual([]);
  });

  it('all 33 banned cards are present with legal:false', () => {
    const byName = Object.fromEntries(CARD_DB_PREMODERN.map(c => [c.name, c]));
    const notFound = [];
    const wrongFlag = [];

    for (const bannedName of PREMODERN_BAN_LIST) {
      if (!(bannedName in byName)) {
        notFound.push(bannedName);
      } else if (byName[bannedName].legal !== false) {
        wrongFlag.push(bannedName);
      }
    }

    expect(notFound).toEqual(
      [],
      `These banned cards are missing from CARD_DB_PREMODERN: ${notFound.join(', ')}`
    );
    expect(wrongFlag).toEqual(
      [],
      `These banned cards have legal:true instead of legal:false: ${wrongFlag.join(', ')}`
    );
  });

  it('spot-check: 5 well-known legal cards are present with legal:true and non-empty oracleText', () => {
    const byName = Object.fromEntries(CARD_DB_PREMODERN.map(c => [c.name, c]));

    for (const cardName of SPOT_CHECK_LEGAL) {
      const card = byName[cardName];
      expect(card, `${cardName} not found in CARD_DB_PREMODERN`).toBeDefined();
      expect(card.legal, `${cardName} should be legal:true`).toBe(true);
      expect(card.text, `${cardName} should have non-empty text`).toBeTruthy();
    }
  });

  it('no entry has a missing or undefined slug (id)', () => {
    const bad = CARD_DB_PREMODERN.filter(c => !c.id);
    expect(bad).toEqual([]);
  });

  it('no entry has a missing or undefined name', () => {
    const bad = CARD_DB_PREMODERN.filter(c => !c.name);
    expect(bad).toEqual([]);
  });

  it('no entry has an undefined oracleText (text may be empty string for vanilla)', () => {
    const bad = CARD_DB_PREMODERN.filter(c => c.text === undefined || c.text === null);
    expect(bad).toEqual([]);
  });

  it('file does not import anything from cards.js or reference CARD_DB directly', () => {
    const filePath = path.join(__dirname, '../../src/data/cardsPremodern.js');
    const src = readFileSync(filePath, 'utf8');
    // No import statements referencing cards.js
    expect(src).not.toMatch(/^import\s.*['"].*cards\.js['"]/m);
    // No import/require of the CARD_DB export (the export of the premodern file
    // itself is named CARD_DB_PREMODERN and is fine)
    expect(src).not.toMatch(/^import\s.*CARD_DB[^_]/m);
    expect(src).not.toMatch(/require\s*\(\s*['"].*cards\.js['"]\s*\)/);
  });
});
