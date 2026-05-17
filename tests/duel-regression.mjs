// tests/duel-regression.mjs
// Regression tests for casting rules and stack enforcement.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../src/engine/DuelCore.js';
import { PHASE } from '../src/engine/phases.js';

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

function makeState({ pHand = [], pBf = [], oBf = [], phase = PHASE.MAIN_1, active = 'p' } = {}) {
  const p = { ...makePlayerState(pBf), hand: pHand };
  const o = makePlayerState(oBf);
  return {
    phase,
    active,
    turn: 1,
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
    p,
    o,
  };
}

describe('Regression: stack casting rules', () => {
  // SQ-01: Sorcery blocked when stack is non-empty
  it('SQ-01: sorcery cannot be cast with a spell on the stack', () => {
    const sorcCard = {
      iid: 'sor-1', id: 'terror', name: 'Terror', type: 'Sorcery',
      color: 'B', cmc: 2, cost: 'BB', effect: 'destroy', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const instCard = {
      iid: 'ins-1', id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage3', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const base = makeState({ pHand: [sorcCard], phase: 'MAIN_1', active: 'p' });
    const withStack = { ...base, stack: [{ id: 'x1', card: instCard, caster: 'p', targets: [], xValue: 0 }] };
    const result = duelReducer(withStack, { type: 'CAST_SPELL', who: 'p', iid: 'sor-1' });
    expect(result.p.hand.some(c => c.iid === 'sor-1')).toBe(true);
    expect(result.stack.length).toBe(1);
  });

  // SQ-02: ADVANCE_PHASE blocked when stack is non-empty
  it('SQ-02: ADVANCE_PHASE no-ops when stack is non-empty', () => {
    const instCard = {
      iid: 'ins-2', id: 'shock', name: 'Shock', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage2', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const base = makeState({ phase: 'MAIN_1', active: 'p' });
    const withStack = { ...base, stack: [{ id: 'x2', card: instCard, caster: 'p', targets: [], xValue: 0 }] };
    const result = duelReducer(withStack, { type: 'ADVANCE_PHASE' });
    expect(result.phase).toBe('MAIN_1');
  });

  // SQ-03: Instant CAN be cast while stack is non-empty (priority response)
  it('SQ-03: instant can be cast while another spell is on the stack', () => {
    const instA = {
      iid: 'ins-3a', id: 'shock', name: 'Shock', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage2', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const instB = {
      iid: 'ins-3b', id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage3', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const base = makeState({ pHand: [instB], phase: 'MAIN_1', active: 'p' });
    const withMana = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 1 } } };
    const withStack = { ...withMana, stack: [{ id: 'x3', card: instA, caster: 'p', targets: [], xValue: 0 }] };
    const result = duelReducer(withStack, { type: 'CAST_SPELL', who: 'p', iid: 'ins-3b' });
    expect(result.stack.length).toBe(2);
  });
});
