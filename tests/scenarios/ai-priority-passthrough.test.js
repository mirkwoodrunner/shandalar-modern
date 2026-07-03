// tests/scenarios/ai-priority-passthrough.test.js
// AI priority pass-through stall fix (useDuelController.ts "AI priority window
// effect"). Follows the hook-level testing pattern established in
// src/hooks/__tests__/useDuelController.castFlow.test.ts: this project's vitest
// setup runs in a `node` environment with no React rendering harness
// (@testing-library/react / jsdom are not installed), so the hook's internal
// decision logic is tested the same way CAST-FLOW-07 tests cancel-flow undo
// logic -- by mirroring the exact branch from the source verbatim and
// asserting against it, matching src/hooks/__tests__/usePersistence.test.ts's
// "pure logic, no hook rendering required" approach for this hook family.
//
// Repro (matches the real bug): player's Main 1, Pestilence (non-mana
// activated-ability permanent, cost:"B", effect:"pestilence") on the
// battlefield. usePhaseAdvance opens a priority window (priorityWindow:true,
// priorityPasser:null). End Turn's skip-loop passes for 'p' first
// (useDuelController.ts:367 -- `if (s.priorityPasser !== 'p') passPriority('p')`),
// leaving priorityPasser:'p' and active:'p'. The AI priority window effect then
// must decide what 'o' does. Before the fix, when aiDecide(s) returned null or
// [] (normal -- AI has nothing worth doing), nothing was dispatched: 'o' never
// explicitly passed, so PASS_PRIORITY could never see priorityPasser !== null
// a second time, and the window -- and the whole end-turn skip-loop -- hung
// forever. The fix adds an else branch that dispatches PASS_PRIORITY for 'o'
// in that case.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState } from '../../src/engine/__tests__/_factory.js';

function makePestilence(iid, overrides = {}) {
  return {
    iid,
    id: 'pestilence',
    name: 'Pestilence',
    type: 'Enchantment',
    color: 'B',
    cmc: 4,
    cost: '2BB',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    activated: { cost: 'B', effect: 'pestilence' },
    controller: 'p',
    ...overrides,
  };
}

// Mirrors the exact decision branch from the "AI priority window effect" in
// src/hooks/useDuelController.ts (post-fix). Kept verbatim so a future edit to
// that branch that isn't reflected here will make this comment (and this
// test's purpose) visibly stale rather than silently drifting.
function decideAiPriorityDispatch(acts) {
  const illegal = acts?.some((a) => a.type === 'MULLIGAN' || a.type === 'MULLIGAN_KEEP');
  if (illegal) {
    return { type: 'PASS_PRIORITY', who: 'o' };
  } else if (acts && acts.length) {
    return { type: 'APPLY_AI_ACTIONS', acts };
  } else {
    return { type: 'PASS_PRIORITY', who: 'o' };
  }
}

describe('@engine AI priority window effect -- decision logic (mirrors useDuelController.ts)', () => {
  it('AI-PRIORITY-01: aiDecide() returning [] dispatches PASS_PRIORITY for "o"', () => {
    expect(decideAiPriorityDispatch([])).toEqual({ type: 'PASS_PRIORITY', who: 'o' });
  });

  it('AI-PRIORITY-02: aiDecide() returning null dispatches PASS_PRIORITY for "o"', () => {
    expect(decideAiPriorityDispatch(null)).toEqual({ type: 'PASS_PRIORITY', who: 'o' });
  });

  it('AI-PRIORITY-03: aiDecide() returning real actions applies them, does not pass', () => {
    const acts = [{ type: 'ACTIVATE_ABILITY', who: 'o', iid: 'pest-1' }];
    expect(decideAiPriorityDispatch(acts)).toEqual({ type: 'APPLY_AI_ACTIONS', acts });
  });

  it('AI-PRIORITY-04: aiDecide() returning an illegal mulligan action still passes priority', () => {
    const acts = [{ type: 'MULLIGAN', who: 'o' }];
    expect(decideAiPriorityDispatch(acts)).toEqual({ type: 'PASS_PRIORITY', who: 'o' });
  });
});

describe('@engine AI priority window effect -- window actually closes on PASS_PRIORITY (DuelCore.js, real production code)', () => {
  it('AI-PRIORITY-05: with Pestilence on the battlefield and "p" already passed, dispatching PASS_PRIORITY for "o" closes the window', () => {
    const pestilence = makePestilence('pest-1', { controller: 'p' });
    const state = {
      ...makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pestilence] }),
      priorityWindow: true,
      priorityPasser: 'p', // End Turn skip-loop already passed for 'p'
    };

    const s1 = duelReducer(state, { type: 'PASS_PRIORITY', who: 'o' });

    expect(s1.priorityWindow).toBe(false);
    expect(s1.priorityPasser).toBeNull();
  });

  it('AI-PRIORITY-06: before "p" has passed, "o" passing alone leaves the window open (only records the pass)', () => {
    const pestilence = makePestilence('pest-1', { controller: 'p' });
    const state = {
      ...makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pestilence] }),
      priorityWindow: true,
      priorityPasser: null,
    };

    const s1 = duelReducer(state, { type: 'PASS_PRIORITY', who: 'o' });

    expect(s1.priorityWindow).toBe(true);
    expect(s1.priorityPasser).toBe('o');
  });
});
