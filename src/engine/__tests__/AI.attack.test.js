// src/engine/__tests__/AI.attack.test.js
// Regression tests for GDD §Bug B4 / Phase 4 P6:
// "AI always attacks with all eligible creatures."
//
// These tests fail without the DECLARE_ATTACKER fix in DuelCore.js
// (where s.active !== "p" blocked AI attacks) and pass after it.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { aiDecide } from '../AI.js';
import { PHASE } from '../phases.js';

// --- Test fixtures -----------------------------------------------------------

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

function makeState({ oBf = [], pBf = [] } = {}) {
  return {
    phase: PHASE.COMBAT_ATTACKERS,
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
    },
    // KARAG: aggression 1.0 — always attacks with everything, deterministic.
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
    p: makePlayerState(pBf),
    o: makePlayerState(oBf),
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

// Helper: run aiDecide then apply all returned actions via the reducer.
function runAI(state) {
  const acts = aiDecide(state);
  return duelReducer(state, { type: 'AI_ACTS', acts });
}

// --- Tests -------------------------------------------------------------------

describe('AI attack declaration', () => {
  it('declares attack with a single eligible creature', () => {
    const creature = makeCreature('c1');
    const state = makeState({ oBf: [creature] });

    const result = runAI(state);

    expect(result.attackers).toHaveLength(1);
    expect(result.attackers[0]).toBe('c1');

    const c = result.o.bf.find(x => x.iid === 'c1');
    expect(c.attacking).toBe(true);
    expect(c.tapped).toBe(true);
  });

  it('does NOT declare attack with a summoning-sick creature', () => {
    const creature = makeCreature('c1', { summoningSick: true });
    const state = makeState({ oBf: [creature] });

    const result = runAI(state);

    expect(result.attackers).toHaveLength(0);
  });

  it('does NOT declare attack with a tapped creature', () => {
    const creature = makeCreature('c1', { tapped: true });
    const state = makeState({ oBf: [creature] });

    const result = runAI(state);

    expect(result.attackers).toHaveLength(0);
  });

  it('attacks with all multiple eligible creatures', () => {
    const creatures = [
      makeCreature('c1'),
      makeCreature('c2'),
      makeCreature('c3'),
    ];
    const state = makeState({ oBf: creatures });

    const result = runAI(state);

    expect(result.attackers).toHaveLength(3);
    expect(result.attackers).toContain('c1');
    expect(result.attackers).toContain('c2');
    expect(result.attackers).toContain('c3');

    for (const c of result.o.bf) {
      expect(c.attacking).toBe(true);
      expect(c.tapped).toBe(true);
    }
  });
});
