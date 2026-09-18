/**
 * @module-tag learn
 */
// src/learn/__tests__/scenarioMachine.test.ts
// The lesson lifecycle machine (L3). The point of these tests is not that the
// happy path works -- it is that unnamed transitions do NOT, since an implicit
// edge between a failed attempt and a retry is exactly the ghost state this
// machine exists to prevent.

import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  canAct,
  canTransition,
  initialScenarioState,
  scenarioMountKey,
  scenarioReducer,
} from '../engine/scenarioMachine';
import type { ScenarioEvent, ScenarioState } from '../engine/scenarioMachine';

const SEED = { marker: 'seed' };

function run(start: ScenarioState, events: ScenarioEvent[]): ScenarioState {
  return events.reduce(scenarioReducer, start);
}

const load = () => initialScenarioState('1.1-01');
const acting = () => run(load(), [{ type: 'SCENARIO_READY', seed: SEED }]);
const evaluating = () => run(acting(), [{ type: 'CHECK_REQUESTED' }]);
const feedback = (outcome: 'success' | 'fail' = 'success') =>
  run(evaluating(), [{ type: 'EVALUATED', outcome, message: 'done' }]);

const ALL_EVENTS: ScenarioEvent[] = [
  { type: 'SCENARIO_READY', seed: SEED },
  { type: 'SCENARIO_LOAD_FAILED', message: 'boom' },
  { type: 'PLAYER_ACTED' },
  { type: 'PLAYER_ACTION_REJECTED', message: 'no' },
  { type: 'HINT_REVEALED' },
  { type: 'CHECK_REQUESTED' },
  { type: 'EVALUATED', outcome: 'success', message: 'ok' },
  { type: 'RETRY_REQUESTED' },
  { type: 'EXIT_REQUESTED' },
];

describe('@learn-scenario-machine-1 the named path', () => {
  it('starts in scenarioLoad with no seed and no hint', () => {
    const s = load();
    expect(s.phase).toBe('scenarioLoad');
    expect(s.attempt).toBe(1);
    expect(s.hintShown).toBe(false);
    expect('seed' in s).toBe(false);
  });

  it('scenarioLoad -> playerActing carries the seed', () => {
    const s = acting();
    expect(s.phase).toBe('playerActing');
    if (s.phase !== 'playerActing') throw new Error('unreachable');
    expect(s.seed).toBe(SEED);
    expect(s.rejection).toBeNull();
  });

  it('playerActing -> evaluating -> feedback grades the attempt', () => {
    const s = feedback('fail');
    expect(s.phase).toBe('feedback');
    if (s.phase !== 'feedback') throw new Error('unreachable');
    expect(s.outcome).toBe('fail');
    expect(s.message).toBe('done');
    expect(s.seed).toBe(SEED);
  });

  it('a load failure lands in feedback with outcome error and no seed', () => {
    const s = run(load(), [{ type: 'SCENARIO_LOAD_FAILED', message: 'boom' }]);
    expect(s.phase).toBe('feedback');
    if (s.phase !== 'feedback') throw new Error('unreachable');
    expect(s.outcome).toBe('error');
    expect(s.seed).toBeNull();
  });

  it('canAct is true only in playerActing', () => {
    expect(canAct(load())).toBe(false);
    expect(canAct(acting())).toBe(true);
    expect(canAct(evaluating())).toBe(false);
    expect(canAct(feedback())).toBe(false);
    expect(canAct(run(acting(), [{ type: 'EXIT_REQUESTED' }]))).toBe(false);
  });
});

describe('@learn-scenario-machine-2 rejection keeps the learner acting', () => {
  it('a refusal stays in playerActing and records the reason', () => {
    const s = run(acting(), [{ type: 'PLAYER_ACTION_REJECTED', message: "That isn't part of this lesson." }]);
    expect(s.phase).toBe('playerActing');
    if (s.phase !== 'playerActing') throw new Error('unreachable');
    expect(s.rejection).toBe("That isn't part of this lesson.");
    expect(canAct(s)).toBe(true);
  });

  it('the next accepted action clears the refusal', () => {
    const s = run(acting(), [
      { type: 'PLAYER_ACTION_REJECTED', message: 'no' },
      { type: 'PLAYER_ACTED' },
    ]);
    if (s.phase !== 'playerActing') throw new Error('unreachable');
    expect(s.rejection).toBeNull();
    expect(s.seed).toBe(SEED);
  });
});

describe('@learn-scenario-machine-3 reset and exit', () => {
  it('retry from feedback returns to scenarioLoad, attempt + 1, hint re-hidden', () => {
    const s = run(feedback(), [{ type: 'HINT_REVEALED' }, { type: 'RETRY_REQUESTED' }]);
    // HINT_REVEALED is not a named transition out of feedback, so it is a
    // no-op -- but the retry must clear the flag regardless.
    expect(s.phase).toBe('scenarioLoad');
    expect(s.attempt).toBe(2);
    expect(s.hintShown).toBe(false);
    expect('seed' in s).toBe(false);
  });

  it('retry is also reachable mid-attempt, from playerActing', () => {
    const s = run(acting(), [{ type: 'RETRY_REQUESTED' }]);
    expect(s.phase).toBe('scenarioLoad');
    expect(s.attempt).toBe(2);
  });

  it('the mount key changes on retry, which is what remounts the board', () => {
    const before = scenarioMountKey(acting());
    const after = scenarioMountKey(run(acting(), [{ type: 'RETRY_REQUESTED' }]));
    expect(before).toBe('1.1-01#1');
    expect(after).toBe('1.1-01#2');
    expect(after).not.toBe(before);
  });

  it('hintShown survives within an attempt but never across one', () => {
    const shown = run(acting(), [{ type: 'HINT_REVEALED' }]);
    expect(shown.hintShown).toBe(true);
    expect(run(shown, [{ type: 'CHECK_REQUESTED' }]).hintShown).toBe(true);
    expect(run(shown, [{ type: 'RETRY_REQUESTED' }]).hintShown).toBe(false);
  });

  it('exit is reachable from every live phase and is terminal', () => {
    for (const start of [load(), acting(), evaluating(), feedback()]) {
      const exited = run(start, [{ type: 'EXIT_REQUESTED' }]);
      expect(exited.phase).toBe('exited');
      for (const event of ALL_EVENTS) {
        expect(scenarioReducer(exited, event)).toBe(exited);
      }
    }
  });
});

describe('@learn-scenario-machine-4 unnamed transitions do not exist', () => {
  it('every (phase, event) pair outside TRANSITIONS is a no-op returning the same object', () => {
    const states: ScenarioState[] = [load(), acting(), evaluating(), feedback(), run(acting(), [{ type: 'EXIT_REQUESTED' }])];
    let refused = 0;
    for (const start of states) {
      for (const event of ALL_EVENTS) {
        const next = scenarioReducer(start, event);
        if (canTransition(start, event.type)) continue;
        refused += 1;
        expect(next).toBe(start); // identity, not just deep equality
      }
    }
    // Guards the test itself: if the table ever admitted everything, this
    // assertion would catch it rather than the suite silently proving nothing.
    expect(refused).toBeGreaterThan(20);
  });

  it('a check cannot be requested from feedback -- retry first', () => {
    const fb = feedback();
    expect(scenarioReducer(fb, { type: 'CHECK_REQUESTED' })).toBe(fb);
  });

  it('the board cannot be acted on while evaluating', () => {
    const ev = evaluating();
    expect(scenarioReducer(ev, { type: 'PLAYER_ACTED' })).toBe(ev);
    expect(scenarioReducer(ev, { type: 'PLAYER_ACTION_REJECTED', message: 'x' })).toBe(ev);
  });

  it('a second SCENARIO_READY cannot re-seed a board already in play', () => {
    const a = acting();
    expect(scenarioReducer(a, { type: 'SCENARIO_READY', seed: { other: true } })).toBe(a);
  });

  it('TRANSITIONS lists no event twice and exited has no outgoing edge', () => {
    for (const [phase, events] of Object.entries(TRANSITIONS)) {
      expect(new Set(events).size, `${phase} has a duplicate event`).toBe(events.length);
    }
    expect(TRANSITIONS.exited).toHaveLength(0);
  });
});
