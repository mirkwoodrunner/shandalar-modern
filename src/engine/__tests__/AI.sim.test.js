// src/engine/__tests__/AI.sim.test.js
// Headless AI-vs-AI simulation tests.
// Detects infinite loops, illegal terminal states, and non-determinism.

import { describe, it, expect } from 'vitest';
import { duelReducer, buildDuelState } from '../DuelCore.js';
import { aiDecide } from '../AI.js';
// NOTE: getAIPlan (re-exported for reference) returns high-level AITurnPlan actions
// (PLAY_CARD, ATTACK, BLOCK) that duelReducer does not handle natively. aiDecide()
// wraps getAIPlan() and translates its output to DuelCore-native actions
// (PLAY_LAND, CAST_SPELL, DECLARE_ATTACKER, etc.). The sim uses aiDecide directly.
import { getAIPlan } from '../AI.js'; // eslint-disable-line no-unused-vars
import { RULESETS } from '../../data/rulesets.js';
import { ARCHETYPES } from '../../data/cards.js';

// --- Sim helper --------------------------------------------------------------

/**
 * Runs a full AI-vs-AI game to completion (state.over !== null).
 * The AI plan (via aiDecide) drives both turns; on each step the current
 * phase's actions are applied then the phase is advanced exactly once.
 *
 * Only 'o' has an AI profile; 'p' passes every turn by doing nothing.
 * This is sufficient for termination because 'o' attacks 'p' to 0 life.
 *
 * @param {object} initialState - from buildDuelState or a hand-crafted state
 * @param {number} maxSteps     - safety cap (default 2000)
 * @returns {{ finalState, steps, terminated }}
 */
function runSimGame(initialState, maxSteps = 2000) {
  let state = initialState;
  let steps = 0;

  while (!state.over && steps < maxSteps) {
    const acts = aiDecide(state);
    if (acts.length > 0) {
      state = duelReducer(state, { type: 'AI_ACTS', acts });
    }
    if (!state.over) {
      state = duelReducer(state, { type: 'ADVANCE_PHASE' });
    }
    steps++;
  }

  return { finalState: state, steps, terminated: !!state.over };
}

// --- Tests -------------------------------------------------------------------

describe('AI simulation — game termination', () => {
  // Build a single canonical state once. BOSS_RED uses the KARAG AI profile
  // (aggression 1.0, greedySpells 1.0) which makes every decision deterministic:
  // it always attacks with all eligible creatures and always casts affordable spells.
  const initialState = buildDuelState(
    ARCHETYPES.BOSS_RED.deck,
    'BOSS_RED',
    RULESETS.CLASSIC,
  );

  it('terminates within the step cap', () => {
    const clone = JSON.parse(JSON.stringify(initialState));
    const { terminated, steps } = runSimGame(clone);

    expect(terminated).toBe(true);
    expect(steps).toBeLessThan(2000);
  });

  it('produces a valid winner', () => {
    const clone = JSON.parse(JSON.stringify(initialState));
    const { finalState } = runSimGame(clone);

    expect(['p', 'o']).toContain(finalState.over.winner);
  });

  it('has a defined phase string at end of game', () => {
    const clone = JSON.parse(JSON.stringify(initialState));
    const { finalState } = runSimGame(clone);

    expect(typeof finalState.phase).toBe('string');
    expect(finalState.phase.length).toBeGreaterThan(0);
  });

  it('preserves finite life totals', () => {
    const clone = JSON.parse(JSON.stringify(initialState));
    const { finalState } = runSimGame(clone);

    expect(Number.isFinite(finalState.p.life)).toBe(true);
    expect(Number.isFinite(finalState.o.life)).toBe(true);
  });

  it('is deterministic given the same initial state', () => {
    // Both clones start from the identical shuffled state so the KARAG
    // profile's fully-deterministic decisions must produce identical outcomes.
    const clone1 = JSON.parse(JSON.stringify(initialState));
    const clone2 = JSON.parse(JSON.stringify(initialState));

    const run1 = runSimGame(clone1);
    const run2 = runSimGame(clone2);

    expect(run1.finalState.over.winner).toBe(run2.finalState.over.winner);
    expect(run1.steps).toBe(run2.steps);
  });
});
