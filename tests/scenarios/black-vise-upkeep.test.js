// tests/scenarios/black-vise-upkeep.test.js
// Black Vise: "As this artifact enters, choose an opponent. At the beginning
// of the chosen player's upkeep, this artifact deals X damage to that
// player, where X is the number of cards in their hand minus 4." This
// engine's 2-player duel hardcodes "chosen player" as "opponent of
// controller" (upkeep:"blackVise" case in DuelCore.js).
//
// Regression: the blackVise case was missing the active-player guard that
// rackUpkeep already had, so it fired on every upkeep instead of only the
// chosen player's. This file guards against that bug returning.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeVise(iid, overrides = {}) {
  return {
    iid,
    id: 'black_vise',
    name: 'Black Vise',
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
    upkeep: 'blackVise',
    controller: 'p',
    ...overrides,
  };
}

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

function withLib(state, who, count) {
  return { ...state, [who]: { ...state[who], lib: makeHand(count) } };
}

function advanceUntil(state, predicate, maxSteps = 20) {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    if (predicate(s)) return s;
  }
  throw new Error('advanceUntil: predicate never satisfied within maxSteps');
}

describe('@engine-card-scenarios-3 Scenario: black-vise-upkeep -- fires only on the chosen (opponent-of-controller) upkeep', () => {
  it("BV-01: chosen player's (opponent's) upkeep with 7 cards in hand takes 3 damage", () => {
    const vise = makeVise('vise-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [vise], oHand: makeHand(7) });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)

    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.o.life).toBe(17);
  });

  it("BV-02: controller's own upkeep in the same turn cycle -- no damage, does not fire at all (regression guard)", () => {
    const vise = makeVise('vise-1', { controller: 'p' });
    let state = makeState({
      phase: PHASE.UNTAP,
      active: 'o',
      pBf: [vise],
      oHand: makeHand(7),
      pHand: makeHand(7),
    });
    state = withLib(state, 'p', 10);
    state = withLib(state, 'o', 10);

    const afterOUpkeep = duelReducer(state, { type: 'ADVANCE_PHASE' }); // o's upkeep -- fires
    expect(afterOUpkeep.o.life).toBe(17);

    const afterPUpkeep = advanceUntil(afterOUpkeep, s => s.phase === PHASE.UPKEEP && s.active === 'p');
    // Regression check: without the active-player guard, blackVise re-fires on every
    // UPKEEP phase transition (not just the chosen player's), so o would take a second
    // hit here even though it is p's upkeep. o's life must stay at 17.
    expect(afterPUpkeep.o.life).toBe(17);
    expect(afterPUpkeep.p.life).toBe(20);
  });

  it('BV-03: chosen player holding 4 or fewer cards takes no damage', () => {
    const vise = makeVise('vise-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [vise], oHand: makeHand(4) });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(s1.o.life).toBe(20);
  });

  it("BV-04: rackUpkeep regression -- still fires only on its chosen opponent's upkeep, never the controller's", () => {
    const rack = makeRack('rack-1', { controller: 'p' });

    const oUpkeepState = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [rack], oHand: makeHand(1) });
    const oUpkeep = duelReducer(oUpkeepState, { type: 'ADVANCE_PHASE' });
    expect(oUpkeep.o.life).toBe(18); // fires: 3 - 1 = 2 damage

    const pUpkeepState = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [rack], pHand: makeHand(1) });
    const pUpkeep = duelReducer(pUpkeepState, { type: 'ADVANCE_PHASE' });
    expect(pUpkeep.p.life).toBe(20); // never fires on controller's own upkeep
  });
});
