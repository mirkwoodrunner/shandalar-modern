// tests/duel-regression.mjs
// Regression tests for casting rules and stack enforcement.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../src/engine/DuelCore.js';
import { getAIPlan } from '../src/engine/AI.js';
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

describe('Regression: AI block selection (Fix 1 — worthlessBlock)', () => {
  // AI-BLK-01: AI must block with its 3/3 when the player attacks with a lone 2/2.
  // Before Fix 1 the worthlessBlock guard incorrectly identified the 3/3 as "worthless"
  // (pow > attPow && tou > attPow is true for any dominating blocker) and suppressed
  // the block entirely.
  it('AI-BLK-01: AI blocks with 3/3 against attacking 2/2', () => {
    const attacker = {
      iid: 'att-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
      color: 'G', cmc: 2, cost: 'GG', effect: null, keywords: [],
      tapped: false, summoningSick: false, attacking: true, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
      power: 2, toughness: 2,
    };
    const blocker = {
      iid: 'blk-1', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature',
      color: 'G', cmc: 6, cost: 'GGGGGG', effect: null, keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      power: 3, toughness: 3,
    };
    const state = {
      ...makeState({ pBf: [attacker], oBf: [blocker], phase: PHASE.COMBAT_BLOCKERS, active: 'p' }),
      attackers: ['att-1'],
    };
    const plan = getAIPlan(state, PHASE.COMBAT_BLOCKERS);
    expect(plan.actions.some(a => a.type === 'BLOCK' && a.blockerId === 'blk-1')).toBe(true);
  });
});
