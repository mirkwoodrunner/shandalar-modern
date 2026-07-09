// tests/scenarios/ai-fatal-error-handling.test.js
// Fail-fast hardening for the two aiDecide() call sites in
// useDuelController.ts ("AI priority window effect" and "AI main loop"
// heuristic path). Neither had a try/catch before this change, and there is
// no ErrorBoundary anywhere in the app, so an uncaught throw there died
// silently -- this is the confirmed mechanism behind a reported bug where
// "End Turn" left the button stuck on "Ending Turn..." forever with no
// visible error.
//
// Follows the hook-level testing pattern established in
// tests/scenarios/ai-priority-passthrough.test.js: this project's vitest
// setup runs in a `node` environment with no React rendering harness, so the
// two branches are mirrored verbatim here and asserted against directly
// rather than rendered.

import { describe, it, expect } from 'vitest';

// Mirrors useDuelController.ts's "AI priority window effect" post-fix,
// including the new try/catch and fault-injection check.
function decideAiPriorityDispatchWithErrorHandling(acts, shouldThrow) {
  try {
    if (shouldThrow) {
      throw new Error('[sandbox] forced AI error for testing');
    }
    const illegal = acts?.some((a) => a.type === 'MULLIGAN' || a.type === 'MULLIGAN_KEEP');
    if (illegal) {
      return { type: 'PASS_PRIORITY', who: 'o' };
    } else if (acts && acts.length) {
      return { type: 'APPLY_AI_ACTIONS', acts };
    } else {
      return { type: 'PASS_PRIORITY', who: 'o' };
    }
  } catch (err) {
    return { type: 'FATAL_ERROR', where: 'AI priority window effect', message: err.message };
  }
}

// Mirrors useDuelController.ts's AI main-loop "heuristic path" post-fix.
function decideAiMainLoopWithErrorHandling(acts, shouldThrow) {
  try {
    if (shouldThrow) {
      throw new Error('[sandbox] forced AI error for testing');
    }
    const hasCast = acts.some((a) => a.type === 'CAST_SPELL');
    return { type: 'APPLY_AI_ACTIONS', acts, thenAdvance: !hasCast };
  } catch (err) {
    return { type: 'FATAL_ERROR', where: 'AI main loop (heuristic path)', message: err.message };
  }
}

describe('@engine AI priority window effect -- fatal error handling (mirrors useDuelController.ts)', () => {
  it('FATAL-AI-01: aiDecide() throwing produces a FATAL_ERROR result, not a priority dispatch', () => {
    const result = decideAiPriorityDispatchWithErrorHandling([], true);
    expect(result).toEqual({
      type: 'FATAL_ERROR',
      where: 'AI priority window effect',
      message: '[sandbox] forced AI error for testing',
    });
  });

  it('FATAL-AI-02: no throw, empty acts -- still dispatches PASS_PRIORITY for "o" (regression, matches AI-PRIORITY-01)', () => {
    expect(decideAiPriorityDispatchWithErrorHandling([], false)).toEqual({ type: 'PASS_PRIORITY', who: 'o' });
  });

  it('FATAL-AI-03: no throw, real acts -- still applies them (regression, matches AI-PRIORITY-03)', () => {
    const acts = [{ type: 'ACTIVATE_ABILITY', who: 'o', iid: 'pest-1' }];
    expect(decideAiPriorityDispatchWithErrorHandling(acts, false)).toEqual({ type: 'APPLY_AI_ACTIONS', acts });
  });
});

describe('@engine AI main loop heuristic path -- fatal error handling (mirrors useDuelController.ts)', () => {
  it('FATAL-AI-04: aiDecide() throwing produces a FATAL_ERROR result, not APPLY_AI_ACTIONS', () => {
    const result = decideAiMainLoopWithErrorHandling([], true);
    expect(result).toEqual({
      type: 'FATAL_ERROR',
      where: 'AI main loop (heuristic path)',
      message: '[sandbox] forced AI error for testing',
    });
  });

  it('FATAL-AI-05: no throw, hasCast true -- does not schedule a phase advance (regression)', () => {
    const acts = [{ type: 'CAST_SPELL', who: 'o' }];
    expect(decideAiMainLoopWithErrorHandling(acts, false)).toEqual({ type: 'APPLY_AI_ACTIONS', acts, thenAdvance: false });
  });

  it('FATAL-AI-06: no throw, hasCast false -- schedules a phase advance (regression)', () => {
    const acts = [{ type: 'PLAY_LAND', who: 'o' }];
    expect(decideAiMainLoopWithErrorHandling(acts, false)).toEqual({ type: 'APPLY_AI_ACTIONS', acts, thenAdvance: true });
  });
});
