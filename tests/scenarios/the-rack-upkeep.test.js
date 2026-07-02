// tests/scenarios/the-rack-upkeep.test.js
// The Rack: "At the beginning of the chosen player's upkeep, this artifact
// deals X damage to that player, where X is 3 minus the number of cards in
// their hand." This engine's 2-player duel hardcodes "chosen player" as
// "opponent of controller" (upkeep:"rackUpkeep" case in DuelCore.js).
//
// Regression: the trigger previously did not exist (cards.js effect:"STUB"),
// so there was no fire-on-the-wrong-upkeep bug possible until this
// implementation landed. RACK-02 guards against that exact regression going
// forward -- the Rack must never damage its own controller.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeRack(iid, overrides = {}) {
  return {
    iid,
    id: 'the_rack',
    name: 'The Rack',
    type: 'Artifact',
    color: '',
    cmc: 1,
    cost: '1',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    upkeep: 'rackUpkeep',
    controller: 'p',
    ...overrides,
  };
}

function makeHand(count) {
  return Array.from({ length: count }, (_, i) => makeLand(`hand-${i}`));
}

describe('@engine Scenario: the-rack-upkeep -- fires only on the opponent-of-controller upkeep', () => {
  it("RACK-01: opponent's upkeep with 1 card in hand takes 2 damage", () => {
    const rack = makeRack('rack-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [rack], oHand: makeHand(1) });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)

    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.o.life).toBe(18);
  });

  it("RACK-02: controller's own upkeep -- no damage (regression guard)", () => {
    const rack = makeRack('rack-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [rack], pHand: makeHand(1) });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (p's own upkeep)

    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.p.life).toBe(20);
  });

  it('RACK-03: opponent holding 3+ cards takes no damage', () => {
    const rack = makeRack('rack-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [rack], oHand: makeHand(3) });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(s1.o.life).toBe(20);
  });

  it('RACK-04: two Racks each trigger independently -- opponent with empty hand takes 6 total', () => {
    const rack1 = makeRack('rack-1', { controller: 'p' });
    const rack2 = makeRack('rack-2', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [rack1, rack2], oHand: [] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(s1.o.life).toBe(14);
  });
});
