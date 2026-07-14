// tests/scenarios/ante-toggle-exclusion.test.js
// Regression coverage for Part 4: generateStartingDeck must never include
// anteOnly cards when ante is disabled, and may include them when ante is on.

import { describe, it, expect } from 'vitest';
import { generateStartingDeck } from '../../src/data/difficulties.js';
import { CARD_DB } from '../../src/data/cards.js';

const ANTE_ONLY_IDS = new Set(
  CARD_DB.filter(c => c.anteOnly).map(c => c.id)
);

describe('@engine-banding-ante-1 Scenario: ante-only card exclusion from generated starting decks', () => {

  it('flags exactly the seven known ante cards as anteOnly', () => {
    expect(ANTE_ONLY_IDS).toEqual(new Set([
      'contract_from_below', 'darkpact', 'demonic_attorney',
      'jeweled_bird', 'rebirth', 'bronze_tablet', 'tempest_efreet',
    ]));
  });

  it('never includes an anteOnly card when ante is disabled, across many seeds/colors', () => {
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      for (let seed = 0; seed < 25; seed++) {
        const deck = generateStartingDeck(color, 'WIZARD', seed, false);
        for (const id of deck) {
          expect(ANTE_ONLY_IDS.has(id)).toBe(false);
        }
      }
    }
  });

  it('defaults to excluding anteOnly cards when the anteEnabled parameter is omitted', () => {
    for (let seed = 0; seed < 10; seed++) {
      const deck = generateStartingDeck('B', 'WIZARD', seed);
      for (const id of deck) {
        expect(ANTE_ONLY_IDS.has(id)).toBe(false);
      }
    }
  });

  it('can include anteOnly cards when ante is enabled (at least once across many seeds)', () => {
    let sawAnteCard = false;
    for (let seed = 0; seed < 200 && !sawAnteCard; seed++) {
      const deck = generateStartingDeck('B', 'WIZARD', seed, true);
      if (deck.some(id => ANTE_ONLY_IDS.has(id))) sawAnteCard = true;
    }
    expect(sawAnteCard).toBe(true);
  });

});
