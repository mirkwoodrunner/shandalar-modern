// tests/scenarios/enemy-deck-audit-stub-batch.test.js
// Structural integrity tests for the follow-up enemy-deck-audit batch that
// closes out the gaps deliberately deferred by the prior
// "Enemy Deck Audit -- Missing Cards" batch (docs/MECHANICS_INDEX.md,
// 2026-07-20): Ragman, Zephyr Falcons, Whimsy, the 4 non-white Mana
// Batteries, V. Enchantress, Deep Water, Abu Jafar.
//
// Of those 8 deck-file names, 4 (Ragman, Zephyr Falcons, V. Enchantress,
// Abu Jafar) turned out to already have matching CARD_DB entries under
// their real Scryfall names (Rag Man, Zephyr Falcon, Verduran Enchantress,
// Abu Ja'far) -- the gap was analyze.mjs's ALIASES table missing the
// deck-file spelling, not a missing card. Only 6 new CARD_DB entries were
// genuinely required: black_mana_battery, blue_mana_battery,
// green_mana_battery, red_mana_battery, whimsy, deep_water.

import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CARD_DB, validateCardIds } from '../../src/data/cards.js';
import { makeCardInstance } from '../../src/engine/DuelCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const NEW_IDS = [
  'black_mana_battery', 'blue_mana_battery', 'green_mana_battery',
  'red_mana_battery', 'whimsy', 'deep_water',
];

// Legacy ids that predate the double-s possessive convention (e.g.
// Aladdin's Lamp -> aladdinss_lamp) and would need an id rename -- touching
// every reference to them -- to fully resolve. validateCardIds() now strips
// diacritics before comparing, so the accented names that used to appear
// here (Dandan, Juzam Djinn, El-Hajjaj, Ghazban Ogre, Khabal Ghoul, Junun
// Efreet, Ifh-Biff Efreet) are gone from this set. See
// tools/enemy-deck-audit/analyze.mjs and
// tests/scenarios/enemy-deck-audit-missing-cards.test.js. None of this
// batch's 6 new ids have accents or apostrophes, so none belong here --
// this list exists only so the test can assert "no *new* warnings".
const KNOWN_PRE_EXISTING_WARNING_IDS = new Set([
  'monss_goblin_raiders', 'gaea_liege', 'hurkyls_recall', 'nevinyrral_disk',
  'ashnods_altar', 'tawnos_coffin', 'davenant_archer', 'ring_of_maruf',
  'will_o_the_wisp', 'hells_caretaker',
]);

describe('@engine @premodern Scenario: enemy-deck-audit stub batch (mana batteries, Whimsy, Deep Water)', () => {
  it('all 6 new ids exist in CARD_DB with effect === "STUB"', () => {
    for (const id of NEW_IDS) {
      const card = CARD_DB.find(c => c.id === id);
      expect(card, `expected CARD_DB entry for id "${id}"`).toBeTruthy();
      expect(card.effect).toBe('STUB');
    }
  });

  it('has no duplicate id values anywhere in CARD_DB', () => {
    const ids = CARD_DB.map(c => c.id);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dups).toEqual([]);
  });

  it('makeCardInstance() constructs each of the 6 new cards without throwing', () => {
    for (const id of NEW_IDS) {
      let instance;
      expect(() => { instance = makeCardInstance(id, 'player'); }).not.toThrow();
      expect(instance, `expected instance for id "${id}"`).toBeTruthy();
      expect(instance.id).toBe(id);
      expect(instance.controller).toBe('player');
    }
  });

  it('validateCardIds(CARD_DB) raises no new warnings for the 6 new ids', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateCardIds(CARD_DB);
    const newIdWarnings = warnSpy.mock.calls
      .map(args => args.join(' '))
      .filter(msg => NEW_IDS.some(id => msg.includes(`"${id}"`)));
    warnSpy.mockRestore();
    expect(newIdWarnings).toEqual([]);
  });

  it('running the audit tool reports 100% coverage on both enemy deck packs', () => {
    execFileSync(process.execPath, [join(ROOT, 'tools', 'enemy-deck-audit', 'analyze.mjs')], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const report = JSON.parse(
      readFileSync(join(ROOT, 'tools', 'enemy-deck-audit', 'report.json'), 'utf8')
    );
    expect(report.rollups.original.coveragePct).toBe(100);
    expect(report.rollups['spells-of-the-ancients'].coveragePct).toBe(100);
    expect(report.rollups.original.missingCardFrequency).toEqual([]);
    expect(report.rollups['spells-of-the-ancients'].missingCardFrequency).toEqual([]);
  });
});
