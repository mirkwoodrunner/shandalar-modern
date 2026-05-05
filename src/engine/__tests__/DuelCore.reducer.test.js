// src/engine/__tests__/DuelCore.reducer.test.js
// Isolated unit tests for duelReducer action handlers.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { PHASE, PHASE_SEQUENCE } from '../phases.js';

// --- Fixtures ----------------------------------------------------------------

function makePlayerState(bf = []) {
  return {
    life: 20,
    lib: [],
    hand: [],
    bf,
    gy: [],
    exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0,
    mulls: 0,
    lifeAnim: null,
    poisonCounters: 0,
  };
}

function makeState({
  oBf = [],
  pBf = [],
  pHand = [],
  phase = PHASE.MAIN_1,
  active = 'p',
  landsPlayed = 0,
  over = null,
} = {}) {
  const p = makePlayerState(pBf);
  const o = makePlayerState(oBf);
  return {
    phase,
    active,
    turn: 1,
    landsPlayed,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack: [],
    over,
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
    p: { ...p, hand: pHand },
    o,
  };
}

function makeCreature(iid, overrides = {}) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
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
    ...overrides,
  };
}

function makeLand(iid, overrides = {}) {
  return {
    iid,
    id: 'forest',
    name: 'Forest',
    type: 'Land',
    subtype: 'Forest',
    color: 'G',
    cmc: 0,
    cost: '',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    produces: ['G'],
    controller: 'p',
    ...overrides,
  };
}

// --- TAP_LAND ----------------------------------------------------------------

describe('TAP_LAND', () => {
  it('taps an untapped land in bf and adds mana', () => {
    const land = makeLand('land-1');
    const state = makeState({ pBf: [land] });

    const result = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-1', mana: 'G' });

    const tappedLand = result.p.bf.find(c => c.iid === 'land-1');
    expect(tappedLand.tapped).toBe(true);
    expect(result.p.mana.G).toBe(1);
  });

  it('returns state unchanged when land is already tapped', () => {
    const land = makeLand('land-1', { tapped: true });
    const state = makeState({ pBf: [land] });

    const result = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-1', mana: 'G' });

    expect(result).toBe(state);
    expect(result.p.mana.G).toBe(0);
  });

  it('returns state unchanged when iid is not in bf', () => {
    const state = makeState();

    const result = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-missing', mana: 'G' });

    expect(result).toBe(state);
  });
});

// --- PLAY_LAND ---------------------------------------------------------------

describe('PLAY_LAND', () => {
  it('moves land from hand to bf and increments landsPlayed', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.MAIN_1, active: 'p' });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result.p.bf.some(c => c.iid === 'land-h1')).toBe(true);
    expect(result.p.hand.some(c => c.iid === 'land-h1')).toBe(false);
    expect(result.landsPlayed).toBe(1);
  });

  it('returns state unchanged when landsPlayed >= 1', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.MAIN_1, active: 'p', landsPlayed: 1 });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result).toBe(state);
  });

  it('returns state unchanged during a non-main phase', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.COMBAT_ATTACKERS, active: 'p' });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result).toBe(state);
  });

  it('returns state unchanged when it is not the active player\'s turn', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.MAIN_1, active: 'o' });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result).toBe(state);
  });
});

// --- ADVANCE_PHASE -----------------------------------------------------------

describe('ADVANCE_PHASE', () => {
  it('advances from MAIN_1 to the next phase in sequence', () => {
    const state = makeState({ phase: PHASE.MAIN_1 });
    const expectedNext = PHASE_SEQUENCE[PHASE_SEQUENCE.indexOf(PHASE.MAIN_1) + 1];

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(expectedNext);
  });

  it('leaves state.over as null after advancing from a fresh state', () => {
    const state = makeState({ phase: PHASE.MAIN_1 });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.over).toBeNull();
  });
});

// --- state.over guard --------------------------------------------------------

describe('state.over guard', () => {
  it('returns state unchanged for any action when over is already set', () => {
    const overState = makeState({ over: { winner: 'p', reason: 'test' } });

    const actions = [
      { type: 'TAP_LAND', who: 'p', iid: 'any', mana: 'G' },
      { type: 'PLAY_LAND', who: 'p', iid: 'any' },
      { type: 'ADVANCE_PHASE' },
      { type: 'DECLARE_ATTACKER', iid: 'any' },
    ];

    for (const action of actions) {
      const result = duelReducer(overState, action);
      expect(result).toBe(overState);
    }
  });
});
