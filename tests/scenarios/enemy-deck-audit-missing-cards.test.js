// tests/scenarios/enemy-deck-audit-missing-cards.test.js
// Structural integrity tests for the enemy-deck-audit missing-cards batch
// (tools/enemy-deck-audit/analyze.mjs bugfixes + 23 new CARD_DB entries).
// These tests validate the data file itself, not any runtime game logic.
//
// Note on counts: the task that produced this batch named 5 "not in the local
// pool" cards to live-fetch from Scryfall. During implementation, "Mons
// Goblin Raiders" turned out to already exist in CARD_DB as "Mons's Goblin
// Raiders" (id monss_goblin_raiders) -- the deck files just drop the
// apostrophe-s, the same false-positive pattern Part 1 of this task fixed.
// That one was resolved with an analyze.mjs alias only, not a new CARD_DB
// entry, so the real total is 23 new cards (19 pool-sourced + 4 live-fetched),
// not 24. See docs/CURRENT_SPRINT.md and the completion summary for detail.

import { describe, it, expect, vi } from 'vitest';
import { CARD_DB, validateCardIds } from '../../src/data/cards.js';

const POOL_SOURCED_IDS = [
  'gem_bazaar', 'apprentice_wizard', 'white_mana_battery', 'dwarven_warriors',
  'goblin_polka_band', 'celestial_prism', 'armageddon_clock', 'bottle_of_suleiman',
  'faerie_dragon', 'prismatic_dragon', 'power_struggle', 'call_from_the_grave',
  'clockwork_avian', 'argothian_pixies', 'elephant_graveyard', 'mijae_djinn',
  'king_suleiman', 'cyclone', 'dwarven_demolition_team',
];

const POOL_SOURCED_NAMES = {
  gem_bazaar: 'Gem Bazaar',
  apprentice_wizard: 'Apprentice Wizard',
  white_mana_battery: 'White Mana Battery',
  dwarven_warriors: 'Dwarven Warriors',
  goblin_polka_band: 'Goblin Polka Band',
  celestial_prism: 'Celestial Prism',
  armageddon_clock: 'Armageddon Clock',
  bottle_of_suleiman: 'Bottle of Suleiman',
  faerie_dragon: 'Faerie Dragon',
  prismatic_dragon: 'Prismatic Dragon',
  power_struggle: 'Power Struggle',
  call_from_the_grave: 'Call from the Grave',
  clockwork_avian: 'Clockwork Avian',
  argothian_pixies: 'Argothian Pixies',
  elephant_graveyard: 'Elephant Graveyard',
  mijae_djinn: 'Mijae Djinn',
  king_suleiman: 'King Suleiman',
  cyclone: 'Cyclone',
  dwarven_demolition_team: 'Dwarven Demolition Team',
};

// Live-fetched from Scryfall (not in scryfall/shandalar-card-pool.json under
// the task's exact given name). "Ifh-Biff Efreet" and "Necropolis of Azaar"
// / "Knights of the Rainbow Vale" were corrected to their real Scryfall names
// (Ifh-Bíff Efreet, Necropolis of Azar, Rainbow Knights) -- see completion
// summary for the pre-flight-STOP naming discrepancies found during research.
const LIVE_FETCHED_IDS = ['rainbow_knights', 'necropolis_of_azar', 'aswan_jaguar', 'ifh_biff_efreet'];

const ALL_NEW_IDS = [...POOL_SOURCED_IDS, ...LIVE_FETCHED_IDS];

// Legacy ids that predate the double-s possessive convention (e.g.
// Aladdin's Lamp -> aladdinss_lamp) and would need an id rename -- touching
// every reference to them -- to fully resolve. validateCardIds() now strips
// diacritics before comparing, so the accented names that used to appear
// here (Dandan, Juzam Djinn, El-Hajjaj, Ghazban Ogre, Khabal Ghoul, Junun
// Efreet, Ifh-Biff Efreet) are gone from this set. See the ALIASES
// diacritics-fix comment in tools/enemy-deck-audit/analyze.mjs.
const KNOWN_DIACRITIC_OR_APOSTROPHE_WARNING_IDS = new Set([
  'monss_goblin_raiders', 'gaea_liege', 'hurkyls_recall', 'nevinyrral_disk',
  'ashnods_altar', 'tawnos_coffin', 'davenant_archer', 'ring_of_maruf',
  'will_o_the_wisp', 'hells_caretaker',
]);

describe('@engine @premodern Scenario: enemy-deck-audit missing-cards batch', () => {
  it('validateCardIds(CARD_DB) raises no new warnings beyond the known pre-existing diacritic/apostrophe set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateCardIds(CARD_DB);
    const unexpected = warnSpy.mock.calls
      .map(args => args.join(' '))
      .filter(msg => {
        const isKnown = [...KNOWN_DIACRITIC_OR_APOSTROPHE_WARNING_IDS].some(id => msg.includes(`"${id}"`));
        return !isKnown;
      });
    warnSpy.mockRestore();
    expect(unexpected).toEqual([]);
  });

  it('has no duplicate id values anywhere in CARD_DB', () => {
    const ids = CARD_DB.map(c => c.id);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dups).toEqual([]);
  });

  it('all 19 pool-sourced ids are present in CARD_DB with name matching the pool entry exactly', () => {
    for (const id of POOL_SOURCED_IDS) {
      const card = CARD_DB.find(c => c.id === id);
      expect(card, `expected CARD_DB entry for id "${id}"`).toBeTruthy();
      expect(card.name).toBe(POOL_SOURCED_NAMES[id]);
    }
  });

  it('all 4 live-fetched ids are present in CARD_DB with id correctly derived from name', () => {
    const derive = (name) => name
      .toLowerCase()
      .replace(/[']/g, 's')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    for (const id of LIVE_FETCHED_IDS) {
      const card = CARD_DB.find(c => c.id === id);
      expect(card, `expected CARD_DB entry for id "${id}"`).toBeTruthy();
      // ifh_biff_efreet is the sole accented exception (real name is
      // "Ifh-Bíff Efreet"); its clean ascii id intentionally does not match
      // literal derivation, matching the pre-existing convention for the
      // other 6 accented cards already in CARD_DB.
      if (id !== 'ifh_biff_efreet') {
        expect(card.id).toBe(derive(card.name));
      }
    }
  });

  it('every new entry has required base fields defined and non-undefined', () => {
    for (const id of ALL_NEW_IDS) {
      const card = CARD_DB.find(c => c.id === id);
      expect(card, `expected CARD_DB entry for id "${id}"`).toBeTruthy();
      for (const field of ['type', 'color', 'cmc', 'cost', 'rarity']) {
        expect(card[field], `${id}.${field}`).not.toBeUndefined();
      }
    }
  });

  it('every new entry classified as a creature has numeric power and toughness', () => {
    for (const id of ALL_NEW_IDS) {
      const card = CARD_DB.find(c => c.id === id);
      if (card.type.includes('Creature')) {
        expect(typeof card.power, `${id}.power`).toBe('number');
        expect(typeof card.toughness, `${id}.toughness`).toBe('number');
      }
    }
  });

  it('every new entry classified as land/artifact/enchantment has no stray power/toughness fields', () => {
    for (const id of ALL_NEW_IDS) {
      const card = CARD_DB.find(c => c.id === id);
      if (!card.type.includes('Creature')) {
        const powerOk = card.power === undefined || card.power === null;
        const toughnessOk = card.toughness === undefined || card.toughness === null;
        expect(powerOk, `${id}.power should be absent or null`).toBe(true);
        expect(toughnessOk, `${id}.toughness should be absent or null`).toBe(true);
      }
    }
  });

  it('exactly 23 new ids are present as a set (catches silent skips or accidental duplicates)', () => {
    const found = ALL_NEW_IDS.filter(id => CARD_DB.some(c => c.id === id));
    expect(new Set(found).size).toBe(23);
    expect(found.length).toBe(23);
  });
});
