// tests/duel-regression.mjs
// Regression test harness for DuelCore.js.
// Run with: node tests/duel-regression.mjs
// Exits 0 if all scenarios pass, 1 if any fail.

// ─── 1. IMPORTS ───────────────────────────────────────────────────────────────

import { duelReducer } from '../src/engine/DuelCore.js';
import { PHASE } from '../src/engine/phases.js';

if (typeof duelReducer !== 'function') {
  console.error('ERROR: duelReducer is not a function. Check the named export from src/engine/DuelCore.js.');
  process.exit(1);
}

if (typeof PHASE !== 'object' || !PHASE.MAIN_1) {
  console.error('ERROR: PHASE is not exported correctly from src/engine/phases.js.');
  process.exit(1);
}

// ─── 2. STATE FACTORY ─────────────────────────────────────────────────────────

function defaultPlayer() {
  return {
    life: 20,
    hand: [],
    lib: [],
    bf: [],
    gy: [],
    exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0,
    mulls: 0,
    lifeAnim: null,
    poisonCounters: 0,
  };
}

function makeState(overrides = {}) {
  const base = {
    ruleset: { manaBurn: true, stackType: 'batch' },
    phase: PHASE.MAIN_1,
    active: 'o',
    turn: 1,
    landsPlayed: 0,
    spellsThisTurn: 0,
    p: defaultPlayer(),
    o: defaultPlayer(),
    stack: [],
    attackers: [],
    blockers: {},
    selCard: null,
    selTgt: null,
    xVal: 0,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    log: [],
    over: null,
    castleMod: null,
    fogActive: false,
    turnState: { damageLog: [] },
    triggerQueue: [],
    pendingChoice: null,
  };
  return { ...base, ...overrides };
}

// ─── 3. SCENARIO RUNNER ───────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function runScenario(name, setupFn, assertFn) {
  let state;
  try {
    state = setupFn();
  } catch (err) {
    console.error(`❌ FAIL — ${name}: setup threw: ${err.message}`);
    failCount++;
    return;
  }

  let result;
  try {
    result = assertFn(state);
  } catch (err) {
    console.error(`❌ FAIL — ${name}: assert threw: ${err.message}`);
    failCount++;
    return;
  }

  if (result.pass) {
    console.log(`✅ PASS — ${name}`);
    passCount++;
  } else {
    console.error(`❌ FAIL — ${name}: ${result.reason}`);
    failCount++;
  }
}

// ─── 4. SCENARIOS ─────────────────────────────────────────────────────────────

// ── Scenario A ────────────────────────────────────────────────────────────────
// Bug history: DECLARE_ATTACKER had guard `s.active !== "p"` which blocked the
// AI (active === "o") from ever attacking.
runScenario(
  'AI attacker guard: AI can declare attackers',
  () => makeState({
    active: 'o',
    phase: PHASE.COMBAT_ATTACKERS,
    o: {
      ...defaultPlayer(),
      bf: [{
        iid: 'c1',
        name: 'Grizzly Bears',
        power: 2,
        toughness: 2,
        type: 'Creature',
        tapped: false,
        summoningSick: false,
        attacking: false,
        blocking: null,
        damage: 0,
        keywords: [],
      }],
    },
  }),
  (state) => {
    const result = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'c1' });
    const pass = result.attackers.includes('c1');
    return {
      pass,
      reason: 'AI creature was not added to attackers — guard may still block AI from attacking',
    };
  }
);

// ── Scenario B ────────────────────────────────────────────────────────────────
// Bug history: Mirror of the attacker guard bug — blocker declaration may have
// had a similar symmetry issue.
runScenario(
  'AI blocker guard: AI can declare blockers',
  () => makeState({
    active: 'p',
    phase: PHASE.COMBAT_BLOCKERS,
    attackers: ['att1'],
    p: {
      ...defaultPlayer(),
      bf: [{
        iid: 'att1',
        name: 'Hill Giant',
        power: 3,
        toughness: 3,
        type: 'Creature',
        tapped: true,
        summoningSick: false,
        attacking: true,
        blocking: null,
        damage: 0,
        keywords: [],
      }],
    },
    o: {
      ...defaultPlayer(),
      bf: [{
        iid: 'bl1',
        name: 'Grizzly Bears',
        power: 2,
        toughness: 2,
        type: 'Creature',
        tapped: false,
        summoningSick: false,
        attacking: false,
        blocking: null,
        damage: 0,
        keywords: [],
      }],
    },
  }),
  (state) => {
    const result = duelReducer(state, { type: 'DECLARE_BLOCKER', blId: 'bl1', attId: 'att1' });
    const pass = result.blockers['bl1'] === 'att1';
    return {
      pass,
      reason: 'AI creature was not registered as blocker — guard may be blocking AI blocker declaration',
    };
  }
);

// ── Scenario C ────────────────────────────────────────────────────────────────
// Bug history: AI was tapping summoning-sick creatures as mana sources.
runScenario(
  'Summoning sick creatures cannot tap for mana',
  () => makeState({
    active: 'o',
    phase: PHASE.MAIN_1,
    o: {
      ...defaultPlayer(),
      bf: [{
        iid: 'm1',
        name: 'Llanowar Elves',
        power: 1,
        toughness: 1,
        type: 'Creature',
        tapped: false,
        summoningSick: true,
        attacking: false,
        blocking: null,
        damage: 0,
        keywords: [],
        producedMana: { G: 1 },
      }],
      mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    },
  }),
  (state) => {
    const result = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'm1' });
    const manaUnchanged = result.o.mana.G === 0;
    const creatureUntapped = result.o.bf.find(c => c.iid === 'm1').tapped === false;
    const pass = manaUnchanged && creatureUntapped;
    return {
      pass,
      reason: 'Summoning-sick creature was tapped for mana — summoningSick check missing in TAP_LAND handler',
    };
  }
);

// ── Scenario D ────────────────────────────────────────────────────────────────
// Bug history: AI speculative land tapping left mana in the pool; burn was not
// applied or was applied incorrectly.
runScenario(
  'Mana burn: leftover mana damages player at phase end',
  () => makeState({
    active: 'o',
    phase: PHASE.MAIN_1,
    o: {
      ...defaultPlayer(),
      life: 20,
      mana: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 },
    },
  }),
  (state) => {
    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const pass = result.o.life === 18;
    return {
      pass,
      reason: 'Mana burn not applied on phase advance — check burnMana call in advPhase',
    };
  }
);

// ─── HOW TO ADD NEW SCENARIOS ─────────────────────────────────────────────────
//
// When a new bug is reported, add a new runScenario block at the bottom of this
// file using this template:
//
// runScenario(
//   "[system] — [what should happen]",
//   () => {
//     // Build the minimal GameState that reproduces the bug.
//     // Use makeState({ ...overrides }) as the base.
//     return makeState({
//       active: "o",           // or "p"
//       phase: PHASE.MAIN_1,  // whichever phase the bug occurs in
//       o: {
//         ...defaultPlayer(),
//         bf: [
//           // Add creatures/permanents involved in the bug
//         ],
//         mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
//       },
//     });
//   },
//   (state) => {
//     // Dispatch the action(s) that trigger the bug
//     let result = duelReducer(state, { type: "ACTION_TYPE", /* params */ });
//     // Optionally chain more actions:
//     // result = duelReducer(result, { type: "ADVANCE_PHASE" });
//
//     // Check the expected outcome
//     const pass = /* boolean condition that should be true if bug is fixed */;
//     return {
//       pass,
//       reason: "Human-readable explanation of what went wrong if pass === false",
//     };
//   }
// );
//
// Rules for new scenarios:
//   - One scenario per bug — do not combine multiple bugs into one test
//   - The scenario must FAIL before the fix and PASS after
//   - Commit the failing scenario to GitHub before implementing the fix
//   - Name the scenario using the pattern: "[system] — [what should happen]"

// ─── EXIT ─────────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
process.exit(failCount > 0 ? 1 : 0);
