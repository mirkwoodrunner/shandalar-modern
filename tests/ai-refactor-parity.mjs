// tests/ai-refactor-parity.mjs
// Behavioral parity snapshot for Tier 4 refactor.
//
// Verifies that aiDecide produces consistent, deterministic output for a fixed
// game state. Any divergence from the established baseline is a refactor bug.

import { describe, it, expect } from 'vitest';
import { aiDecide, getAIPlan } from '../src/engine/AI.js';
import { PHASE } from '../src/engine/phases.js';

function makeCard(overrides) {
  return {
    iid: 'card-default',
    id: 'forest',
    name: 'Forest',
    type: 'Land',
    subtype: 'Forest',
    color: 'G',
    cmc: 0,
    cost: '',
    effect: null,
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'o',
    produces: ['G'],
    ...overrides,
  };
}

function makePlayerState(hand = [], bf = []) {
  return {
    life: 20,
    lib: [],
    hand,
    bf,
    gy: [],
    exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0,
    mulls: 0,
    lifeAnim: null,
    poisonCounters: 0,
    channelActive: false,
  };
}

function makeBaseState(overrides = {}) {
  return {
    phase: PHASE.MAIN_1,
    active: 'o',
    turn: 2,
    landsPlayed: 0,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack: [],
    over: null,
    selCard: null,
    selTgt: null,
    xVal: 1,
    log: [],
    ruleset: {
      startingLife: 20,
      startingHandSize: 7,
      drawOnFirstTurn: false,
      londonMulligan: false,
      deathtouch: true,
      stackType: 'full',
    },
    oppArch: { id: 'KARAG', profileId: 'KARAG' },
    castleMod: null,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    turnState: { damageLog: [] },
    triggerQueue: [],
    pendingChoice: null,
    fogActive: false,
    anteEnabled: false,
    anteP: null,
    anteO: null,
    priorityWindow: false,
    priorityPasser: null,
    ...overrides,
  };
}

// Fixed deterministic game state used for all parity checks.
function makeFixedState() {
  const forest1 = makeCard({ iid: 'land-g1', id: 'forest', name: 'Forest', type: 'Land', cmc: 0, cost: '', produces: ['G'] });
  const forest2 = makeCard({ iid: 'land-g2', id: 'forest', name: 'Forest', type: 'Land', cmc: 0, cost: '', produces: ['G'] });
  const mountain = makeCard({ iid: 'land-r1', id: 'mountain', name: 'Mountain', type: 'Land', cmc: 0, cost: '', produces: ['R'] });

  const grizzlyBears = makeCard({
    iid: 'cre-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
    subtype: 'Bear', color: 'G', cmc: 2, cost: '1G', effect: null, produces: null,
    pow: 2, tou: 2,
  });

  const lightningBolt = makeCard({
    iid: 'inst-1', id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant',
    color: 'R', cmc: 1, cost: 'R', effect: 'damage3', produces: null,
  });

  const pBear = makeCard({
    iid: 'p-cre-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
    subtype: 'Bear', color: 'G', cmc: 2, cost: '1G', effect: null,
    pow: 2, tou: 2, controller: 'p', produces: null,
  });

  const p = { ...makePlayerState([], [pBear]), life: 12 };
  const o = makePlayerState([grizzlyBears, lightningBolt], [forest1, forest2, mountain]);

  return makeBaseState({ p, o });
}

describe('Tier 4 parity: aiDecide determinism', () => {
  // Each aiDecide call may run MCTS for up to 600 ms; 10 calls can take ~6 s.
  it('produces identical output across 10 calls with the same fixed state', () => {
    const state = makeFixedState();
    const results = Array.from({ length: 10 }, () => aiDecide(state));

    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  }, 15000);

  it('output is an array', () => {
    const state = makeFixedState();
    expect(Array.isArray(aiDecide(state))).toBe(true);
  });

  it('KARAG profile casts Grizzly Bears with 3 lands available', () => {
    const state = makeFixedState();
    const result = aiDecide(state);
    const types = result.map(a => a.type);
    // KARAG is fully aggro — greedySpells 1.0, so bear scores well and should be cast.
    expect(types).toContain('CAST_SPELL');
    const cast = result.find(a => a.type === 'CAST_SPELL');
    expect(cast.iid).toBe('cre-1');
  });

  it('selectPlayableCards excludes counter-spells when stack is empty', () => {
    const blueLand1 = makeCard({ iid: 'land-u1', id: 'island', name: 'Island', type: 'Land', cmc: 0, cost: '', produces: ['U'] });
    const blueLand2 = makeCard({ iid: 'land-u2', id: 'island', name: 'Island', type: 'Land', cmc: 0, cost: '', produces: ['U'] });
    const counterspell = makeCard({
      iid: 'cnt-1', id: 'counterspell', name: 'Counterspell', type: 'Instant',
      color: 'U', cmc: 2, cost: 'UU', effect: 'counter', produces: null,
    });

    const o = makePlayerState([counterspell], [blueLand1, blueLand2]);
    const p = makePlayerState([], []);
    const state = makeBaseState({ p, o, stack: [] });

    const result = aiDecide(state);
    const types = result.map(a => a.type);
    expect(types).not.toContain('CAST_SPELL');
  });

  it('removal targets highest-threat creature', () => {
    const greenLand1 = makeCard({ iid: 'land-g1', id: 'forest', name: 'Forest', type: 'Land', cmc: 0, cost: '', produces: ['G'] });
    const greenLand2 = makeCard({ iid: 'land-g2', id: 'forest', name: 'Forest', type: 'Land', cmc: 0, cost: '', produces: ['G'] });
    const blackLand = makeCard({ iid: 'land-b1', id: 'swamp', name: 'Swamp', type: 'Land', cmc: 0, cost: '', produces: ['B'] });

    const terror = makeCard({
      iid: 'rem-1', id: 'terror', name: 'Terror', type: 'Instant',
      color: 'B', cmc: 2, cost: 'BB', effect: 'destroy', produces: null,
    });
    const smallBear = makeCard({
      iid: 'p-cre-small', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
      color: 'G', cmc: 2, pow: 2, tou: 2, cost: '1G', effect: null,
      controller: 'p', produces: null,
    });
    const bigTrample = makeCard({
      iid: 'p-cre-big', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature',
      color: 'G', cmc: 6, pow: 6, tou: 4, cost: '4GG', effect: null,
      keywords: ['TRAMPLE'], controller: 'p', produces: null,
    });

    const o = makePlayerState([terror], [greenLand1, greenLand2, blackLand, { ...blackLand, iid: 'land-b2' }]);
    const p = makePlayerState([], [smallBear, bigTrample]);
    const state = makeBaseState({ p, o });

    const result = aiDecide(state);
    const cast = result.find(a => a.type === 'CAST_SPELL');
    // Terror must target the Craw Wurm (higher scoreThreat due to trample bonus).
    expect(cast).toBeTruthy();
    expect(cast.tgt).toBe('p-cre-big');
  });

  it('getAIPlan returns well-formed plan', () => {
    const state = makeFixedState();
    const plan = getAIPlan(state, PHASE.MAIN_1);
    expect(plan).toBeTruthy();
    expect(Array.isArray(plan.actions)).toBe(true);
    expect(plan.phase).toBe(PHASE.MAIN_1);
    const last = plan.actions[plan.actions.length - 1];
    expect(last.type).toBe('PASS_PRIORITY');
  });
});
