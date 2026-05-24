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
import { makePlayerState, makeState, makeCreature, makeLand } from './_factory.js';

// Helper: run aiDecide then apply all returned actions via the reducer.
function runAI(state) {
  const acts = aiDecide(state);
  return duelReducer(state, { type: 'AI_ACTS', acts });
}

// --- Tests -------------------------------------------------------------------

describe('AI attack declaration', () => {
  it('declares attack with a single eligible creature', () => {
    const creature = makeCreature('c1');
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [creature] });

    const result = runAI(state);

    expect(result.attackers).toHaveLength(1);
    expect(result.attackers[0]).toBe('c1');

    const c = result.o.bf.find(x => x.iid === 'c1');
    expect(c.attacking).toBe(true);
    expect(c.tapped).toBe(true);
  });

  it('does NOT declare attack with a summoning-sick creature', () => {
    const creature = makeCreature('c1', { summoningSick: true });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [creature] });

    const result = runAI(state);

    expect(result.attackers).toHaveLength(0);
  });

  it('does NOT declare attack with a tapped creature', () => {
    const creature = makeCreature('c1', { tapped: true });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [creature] });

    const result = runAI(state);

    expect(result.attackers).toHaveLength(0);
  });

  it('attacks with all multiple eligible creatures', () => {
    const creatures = [
      makeCreature('c1'),
      makeCreature('c2'),
      makeCreature('c3'),
    ];
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: creatures });

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
