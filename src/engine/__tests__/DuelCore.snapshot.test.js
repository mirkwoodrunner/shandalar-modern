// src/engine/__tests__/DuelCore.snapshot.test.js
// Snapshot regression tests for duelReducer.
// Run once to create snapshots; subsequent runs catch unintended engine changes.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { PHASE } from '../phases.js';

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

// --- Snapshot tests ----------------------------------------------------------

describe('DuelCore snapshot — fixed action sequence', () => {
  it('fixed tap + play land sequence matches snapshot', () => {
    // land-tap: already on battlefield, will be tapped for mana
    // land-play: in hand, will be played onto the battlefield
    const landTap  = makeLand('land-tap',  { controller: 'p' });
    const landPlay = makeLand('land-play', { controller: 'p' });

    let state = makeState({
      pBf:   [landTap],
      pHand: [landPlay],
      phase: PHASE.MAIN_1,
      active: 'p',
    });

    state = duelReducer(state, { type: 'TAP_LAND',  who: 'p', iid: 'land-tap',  mana: 'G' });
    state = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-play' });

    const slice = {
      phase:       state.phase,
      landsPlayed: state.landsPlayed,
      pMana:       state.p.mana,
      pBfCount:    state.p.bf.length,
      pHandCount:  state.p.hand.length,
      over:        state.over,
    };

    expect(slice).toMatchSnapshot();
  });

  it('fresh state structure matches snapshot', () => {
    const s = makeState();

    expect({
      phase:  s.phase,
      active: s.active,
      turn:   s.turn,
      over:   s.over,
      pLife:  s.p.life,
      oLife:  s.o.life,
    }).toMatchSnapshot();
  });
});
