// tests/scenarios/dual-land-mountainwalk.test.js
// Regression coverage for two bugs found via a live-game screenshot report:
// (1) 9 of the 10 original dual lands had no `subtype` field, so mountainwalk
//     (and every other landwalk type) silently never triggered against them.
// (2) Goblin King's lord-granted mountainwalk specifically, since that's the
//     exact scenario reported (Goblin King + Goblin Hero attacking into a
//     Badlands-only defense).

import { describe, it, expect } from 'vitest';
import { canBlockDuel } from '../../src/engine/DuelCore.js';
import { getCardById } from '../../src/data/cards.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: dual land subtypes and mountainwalk', () => {

  it('all 10 original dual lands have the correct two-type subtype', () => {
    const expected = {
      tundra: 'Plains Island',
      underground_sea: 'Island Swamp',
      badlands: 'Swamp Mountain',
      taiga: 'Mountain Forest',
      savannah: 'Forest Plains',
      scrubland: 'Plains Swamp',
      volcanic_island: 'Island Mountain',
      bayou: 'Swamp Forest',
      plateau: 'Mountain Plains',
      tropical_island: 'Forest Island',
    };
    for (const [id, subtype] of Object.entries(expected)) {
      const card = getCardById(id);
      expect(card, `${id} should exist in CARD_DB`).toBeTruthy();
      expect(card.subtype, `${id} subtype`).toBe(subtype);
    }
  });

  it('Goblin King mountainwalk: Goblin Hero cannot be blocked when defender controls Badlands', () => {
    const goblinKing = makeCreature('gk-1', {
      id: 'goblin_king', name: 'Goblin King', subtype: 'Goblin Legend',
      color: 'R', power: 2, toughness: 2, controller: 'o',
      effect: 'lordEffect', targets: 'goblin', mod: { power: 1, toughness: 1 }, lordKeywords: ['MOUNTAINWALK'],
    });
    const goblinHero = makeCreature('gh-1', {
      id: 'goblin_hero', name: 'Goblin Hero', subtype: 'Goblin Warrior',
      color: 'R', power: 2, toughness: 1, controller: 'o',
    });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const badlands = makeLand('bd-1', { id: 'badlands', name: 'Badlands', subtype: 'Swamp Mountain', produces: ['B', 'R'], color: '' });

    const state = makeState({ oBf: [goblinKing, goblinHero], pBf: [blocker, badlands] });

    expect(canBlockDuel(blocker, goblinHero, state.p.bf, state)).toBe(false);
  });

  it('positive control: same Goblin Hero is blockable when defender controls no Mountain-type land', () => {
    const goblinKing = makeCreature('gk-1', {
      id: 'goblin_king', name: 'Goblin King', subtype: 'Goblin Legend',
      color: 'R', power: 2, toughness: 2, controller: 'o',
      effect: 'lordEffect', targets: 'goblin', mod: { power: 1, toughness: 1 }, lordKeywords: ['MOUNTAINWALK'],
    });
    const goblinHero = makeCreature('gh-1', {
      id: 'goblin_hero', name: 'Goblin Hero', subtype: 'Goblin Warrior',
      color: 'R', power: 2, toughness: 1, controller: 'o',
    });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const swamp = makeLand('sw-1', { id: 'swamp', name: 'Swamp', subtype: 'Basic Swamp', produces: ['B'], color: '' });

    const state = makeState({ oBf: [goblinKing, goblinHero], pBf: [blocker, swamp] });

    expect(canBlockDuel(blocker, goblinHero, state.p.bf, state)).toBe(true);
  });

});
