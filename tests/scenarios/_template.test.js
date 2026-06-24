// tests/scenarios/_template.test.js
// Template for scenario-based duel tests.
//
// USAGE (for Claude Code):
// 1. Copy this file to tests/scenarios/<your-scenario-name>.test.js
// 2. Replace the describe/it blocks with your scenario.
// 3. Run: npm test -- tests/scenarios/<your-scenario-name>.test.js
// 4. Confirm it fails before applying your fix.
// 5. Apply the fix, re-run, confirm it passes.
// 6. Leave the file in place -- it becomes a permanent regression test.
//
// RULES:
// - Only dispatch actions through duelReducer. No direct state mutation after setup.
// - Build initial state with factories from _factory.js.
// - Each it() tests exactly one observable behavior.
// - Name the file after the bug/feature it validates (e.g., first-strike-damage.test.js).

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: <short description of what is being tested>', () => {

  it('<observable behavior that should be true after the action sequence>', () => {
    // 1. Build the starting state using factories.
    const state = makeState({
      phase: PHASE.MAIN_1,
      active: 'p',
      pBf: [],
      oBf: [],
      pHand: [],
    });

    // 2. Drive state forward with explicit action dispatches.
    // const s1 = duelReducer(state, { type: 'SOME_ACTION', ... });
    // const s2 = duelReducer(s1,    { type: 'ANOTHER_ACTION', ... });

    // 3. Assert the specific field that proves the behavior is correct.
    // expect(s2.someField).toBe(expectedValue);

    // Replace this placeholder with a real assertion.
    expect(true).toBe(true);
  });

});
