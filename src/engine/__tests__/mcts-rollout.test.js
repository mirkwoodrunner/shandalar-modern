// src/engine/__tests__/mcts-rollout.test.js
// Characterization baseline for MCTS rollout pass-fest bug (TD-003) and KARAG gate guard.
// BASELINE: pins the documented MCTS rollout pass-fest bug (TD-003). Prompt 2 flips these assertions.

import { describe, it, expect } from 'vitest';
import { rollout, stepOnce, policyMainAction } from '../MCTS.js';
import { makeState, makeCreature, makeLand } from './_factory.js';
import { PHASE } from '../phases.js';
import AI from '../AI.js';

// ---------------------------------------------------------------------------
// Group A: rollout pass-fest baseline (characterization, currently GREEN / bug)
// ---------------------------------------------------------------------------
describe('Group A: rollout pass-fest baseline', () => {
  const state = makeState({
    active: 'o',
    phase: PHASE.MAIN_1,
    landsPlayed: 1,
    oBf: [
      makeLand('L1', { controller: 'o' }),
      makeLand('L2', { controller: 'o' }),
    ],
    oHand: [
      makeCreature('C1', { controller: 'o' }),
    ],
  });

  it('policyMainAction returns null when pool is empty and land-play is exhausted', () => {
    // Mana pool is { W:0,U:0,B:0,R:0,G:0,C:0 }; canPay('1G') is false.
    // landsPlayed:1 means no land-play branch fires. Returns null.
    expect(policyMainAction(state)).toBeNull();
  });

  it('stepOnce does not cast the creature (empty pool blocks canPay)', () => {
    const next = stepOnce(JSON.parse(JSON.stringify(state)));
    expect(next.o.hand.some(c => c.iid === 'C1')).toBe(true);
    expect(next.stack).toHaveLength(0);
    expect(next.phase).not.toBe(PHASE.MAIN_1);
  });

  it('stepOnce does not tap either forest (no TAP_LAND dispatched by rollout)', () => {
    const next = stepOnce(JSON.parse(JSON.stringify(state)));
    expect(next.o.bf.find(c => c.iid === 'L1').tapped).toBe(false);
    expect(next.o.bf.find(c => c.iid === 'L2').tapped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group B: rollout determinism
// ---------------------------------------------------------------------------
describe('Group B: rollout determinism', () => {
  it('produces the same winner when called twice from identical state', () => {
    const state = makeState({
      active: 'o',
      phase: PHASE.MAIN_1,
      landsPlayed: 1,
      oBf: [
        makeLand('DL1', { controller: 'o' }),
        makeCreature('DC1', { controller: 'o', summoningSick: false }),
      ],
    });
    // rollout deep-clones internally; pass same ref to both calls is safe.
    const result1 = rollout(state);
    const result2 = rollout(state);
    expect(result1).toBe(result2);
  });
});

// ---------------------------------------------------------------------------
// Group C: MCTS gate is KARAG-only (guard)
// ---------------------------------------------------------------------------
describe('Group C: MCTS gate is KARAG-only', () => {
  // GUARD: MCTS path is gated at aggression >= 0.9. Keep this KARAG-only so the
  // Prompt 2 rollout change cannot silently alter ARZAKON/MORTIS.

  it('KARAG aggression is >= 0.9 (MCTS eligible)', () => {
    expect(AI.AI_PROFILES.KARAG.aggression).toBeGreaterThanOrEqual(0.9);
  });

  it('ARZAKON aggression is < 0.9 (MCTS ineligible)', () => {
    expect(AI.AI_PROFILES.ARZAKON.aggression).toBeLessThan(0.9);
  });

  it('MORTIS aggression is < 0.9 (MCTS ineligible)', () => {
    expect(AI.AI_PROFILES.MORTIS.aggression).toBeLessThan(0.9);
  });
});
