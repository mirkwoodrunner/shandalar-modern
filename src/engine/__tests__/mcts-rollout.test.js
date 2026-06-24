// src/engine/__tests__/mcts-rollout.test.js
// POST-FIX: rollout taps exact cost, casts one spell per main phase, resolves it. Life assertion guards against mana-burn regression.
// Group A was flipped by Prompt 2 after TD-003 was resolved. Groups B and C unchanged.

import { describe, it, expect } from 'vitest';
import { rollout, stepOnce, policyMainAction } from '../MCTS.js';
import { makeState, makeCreature, makeLand } from './_factory.js';
import { PHASE } from '../phases.js';
import AI from '../AI.js';

// ---------------------------------------------------------------------------
// Group A: post-fix rollout behavior (TD-003 resolved)
// ---------------------------------------------------------------------------
describe('@engine Group A: rollout casts one spell per main phase (post-fix)', () => {
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

  it('policyMainAction returns CAST_SPELL for the Grizzly Bears (available mana from forests covers 1G)', () => {
    const action = policyMainAction(state);
    expect(action).not.toBeNull();
    expect(action.type).toBe('CAST_SPELL');
    expect(action.iid).toBe('C1');
  });

  it('stepOnce removes the creature from hand after casting', () => {
    const next = stepOnce(JSON.parse(JSON.stringify(state)));
    expect(next.o.hand.some(c => c.iid === 'C1')).toBe(false);
  });

  it('stepOnce resolves the creature onto the battlefield', () => {
    const next = stepOnce(JSON.parse(JSON.stringify(state)));
    expect(next.o.bf.some(c => c.iid === 'C1')).toBe(true);
  });

  it('both forests are tapped after exact-cost payment', () => {
    const next = stepOnce(JSON.parse(JSON.stringify(state)));
    expect(next.o.bf.find(c => c.iid === 'L1').tapped).toBe(true);
    expect(next.o.bf.find(c => c.iid === 'L2').tapped).toBe(true);
  });

  it('life is 20 (exact-cost tapping left no floating mana — mana-burn regression guard)', () => {
    const next = stepOnce(JSON.parse(JSON.stringify(state)));
    expect(next.o.life).toBe(20);
  });

  it('stack is empty and phase has advanced past MAIN_1', () => {
    const next = stepOnce(JSON.parse(JSON.stringify(state)));
    expect(next.stack).toHaveLength(0);
    expect(next.phase).not.toBe(PHASE.MAIN_1);
  });
});

// ---------------------------------------------------------------------------
// Group B: rollout determinism
// ---------------------------------------------------------------------------
describe('@engine Group B: rollout determinism', () => {
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
describe('@engine Group C: MCTS gate is KARAG-only', () => {
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
