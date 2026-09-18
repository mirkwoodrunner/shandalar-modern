// src/learn/engine/scenarioMachine.ts
// The lesson lifecycle state machine for Learn Mode scenario mode (L3).
//
// Pure. Imports nothing -- not from src/engine/, not from src/data/, not even
// from ./types. It is a reducer over its own union and is unit-testable with no
// React, no DOM, and no GameState.
//
// Design rules this file exists to enforce (docs/LEARN_MODE_ROADMAP.md, L3):
//
//   1. One discriminated union. The learner is in exactly one phase and the
//      phase is the only thing that says so. There is no second flag, no
//      `isChecking` boolean, no `feedback === null` inference.
//
//   2. Every transition is named. A (phase, event) pair absent from TRANSITIONS
//      is not a transition, and the reducer refuses it rather than inventing a
//      half-state between a failed attempt and a retry.
//
//   3. Data that only makes sense in one phase lives only on that phase's
//      variant. `seed` is absent in scenarioLoad; `outcome` exists only in
//      feedback.
//
//   4. THE MACHINE DOES NOT HOLD THE LIVE GameState. DuelCore owns it, through
//      the duel screen's reducer. What the machine holds is `seed`: the
//      pre-built state the duel screen was MOUNTED with, which never changes
//      during an attempt. Holding a copy of the live state here would create
//      exactly the two-sources-that-can-disagree problem this milestone set out
//      to avoid. The live state reaches the lesson chrome from the screen, via
//      the scenarioPanel render prop.
//
// Reset works by remounting: RETRY_REQUESTED returns to scenarioLoad with
// `attempt` incremented, and the host keys the duel screen on
// `exerciseId + attempt`, so a retry rebuilds the seed and throws away every
// reducer-held mutation with it. That is the whole reset mechanism.

// ── Phases ───────────────────────────────────────────────────────────────────

export type ScenarioPhase =
  /** The exercise has been chosen; its GameState has not been built yet. */
  | 'scenarioLoad'
  /** The board is mounted and the learner's allowed actions are live. */
  | 'playerActing'
  /** A check was requested; the goal has not been graded yet. */
  | 'evaluating'
  /** The attempt has been graded. Only retry and exit remain. */
  | 'feedback'
  /** The learner left. Terminal -- no event leaves this phase. */
  | 'exited';

export type ScenarioOutcome = 'success' | 'fail' | 'error';

/** Carried through every phase of one exercise. `attempt` increments on retry. */
type ScenarioCommon = {
  exerciseId: string;
  attempt: number;
  hintShown: boolean;
};

export type ScenarioState =
  | (ScenarioCommon & { phase: 'scenarioLoad' })
  | (ScenarioCommon & {
      phase: 'playerActing';
      /** The state the board was mounted with. Not the live state. */
      seed: unknown;
      /**
       * The last refused action's explanation, or null. A refusal does NOT move
       * the learner out of playerActing -- they are still acting -- so it lives
       * here instead of becoming a feedback phase of its own.
       */
      rejection: string | null;
    })
  | (ScenarioCommon & { phase: 'evaluating'; seed: unknown })
  | (ScenarioCommon & {
      phase: 'feedback';
      /** Null only when the load itself failed, so there is no board to show. */
      seed: unknown;
      outcome: ScenarioOutcome;
      message: string;
    })
  | (ScenarioCommon & { phase: 'exited' });

// ── Events ───────────────────────────────────────────────────────────────────

export type ScenarioEvent =
  /** scenarioLoad -> playerActing. The seed state was built successfully. */
  | { type: 'SCENARIO_READY'; seed: unknown }
  /** scenarioLoad -> feedback('error'). The seed state could not be built. */
  | { type: 'SCENARIO_LOAD_FAILED'; message: string }
  /** playerActing -> playerActing. An offered action went through; clears any refusal. */
  | { type: 'PLAYER_ACTED' }
  /** playerActing -> playerActing. An action was refused; the learner acts on. */
  | { type: 'PLAYER_ACTION_REJECTED'; message: string }
  /** Reveals the hint for the current attempt. Does not change phase. */
  | { type: 'HINT_REVEALED' }
  /** playerActing -> evaluating. */
  | { type: 'CHECK_REQUESTED' }
  /** evaluating -> feedback. */
  | { type: 'EVALUATED'; outcome: 'success' | 'fail'; message: string }
  /** playerActing | feedback -> scenarioLoad, attempt + 1. The reset edge. */
  | { type: 'RETRY_REQUESTED' }
  /** Any non-terminal phase -> exited. The exit edge. */
  | { type: 'EXIT_REQUESTED' };

export type ScenarioEventType = ScenarioEvent['type'];

/**
 * The complete transition table. This is the specification, not a convenience:
 * a (phase, event) pair absent from this table is not a transition, and
 * `scenarioReducer` refuses it.
 */
export const TRANSITIONS: Record<ScenarioPhase, readonly ScenarioEventType[]> = {
  scenarioLoad: ['SCENARIO_READY', 'SCENARIO_LOAD_FAILED', 'EXIT_REQUESTED'],
  playerActing: [
    'PLAYER_ACTED',
    'PLAYER_ACTION_REJECTED',
    'HINT_REVEALED',
    'CHECK_REQUESTED',
    'RETRY_REQUESTED',
    'EXIT_REQUESTED',
  ],
  evaluating: ['EVALUATED', 'EXIT_REQUESTED'],
  feedback: ['RETRY_REQUESTED', 'EXIT_REQUESTED'],
  exited: [],
};

// ── Reducer ──────────────────────────────────────────────────────────────────

export function initialScenarioState(exerciseId: string): ScenarioState {
  return { phase: 'scenarioLoad', exerciseId, attempt: 1, hintShown: false };
}

/** True when this event is a named transition out of this state's phase. */
export function canTransition(state: ScenarioState, event: ScenarioEventType): boolean {
  return TRANSITIONS[state.phase].includes(event);
}

/** True only while the learner is allowed to touch the board. */
export function canAct(state: ScenarioState): boolean {
  return state.phase === 'playerActing';
}

/**
 * The mount key for the duel screen. Changing it remounts the screen, which is
 * how RETRY_REQUESTED resets the board: a new reducer, built from a freshly
 * constructed seed, with no residue from the previous attempt.
 */
export function scenarioMountKey(state: ScenarioState): string {
  return `${state.exerciseId}#${state.attempt}`;
}

export function scenarioReducer(state: ScenarioState, event: ScenarioEvent): ScenarioState {
  // An unnamed transition is not a transition. No implicit edges, ever.
  if (!canTransition(state, event.type)) return state;

  const { exerciseId, attempt, hintShown } = state;
  const common = { exerciseId, attempt, hintShown };

  switch (event.type) {
    case 'SCENARIO_READY':
      return { ...common, phase: 'playerActing', seed: event.seed, rejection: null };

    case 'SCENARIO_LOAD_FAILED':
      return { ...common, phase: 'feedback', seed: null, outcome: 'error', message: event.message };

    case 'PLAYER_ACTED':
      // canTransition above admits this only from playerActing, so `seed` is present.
      return {
        ...common,
        phase: 'playerActing',
        seed: (state as Extract<ScenarioState, { phase: 'playerActing' }>).seed,
        rejection: null,
      };

    case 'PLAYER_ACTION_REJECTED':
      return {
        ...common,
        phase: 'playerActing',
        seed: (state as Extract<ScenarioState, { phase: 'playerActing' }>).seed,
        rejection: event.message,
      };

    case 'HINT_REVEALED':
      return { ...state, hintShown: true };

    case 'CHECK_REQUESTED':
      return {
        ...common,
        phase: 'evaluating',
        seed: (state as Extract<ScenarioState, { phase: 'playerActing' }>).seed,
      };

    case 'EVALUATED':
      return {
        ...common,
        phase: 'feedback',
        seed: (state as Extract<ScenarioState, { phase: 'evaluating' }>).seed,
        outcome: event.outcome,
        message: event.message,
      };

    case 'RETRY_REQUESTED':
      // The reset edge. A clean load of the same exercise, hint re-hidden,
      // attempt advanced so the mount key changes and the board is rebuilt.
      return { phase: 'scenarioLoad', exerciseId, attempt: attempt + 1, hintShown: false };

    case 'EXIT_REQUESTED':
      return { ...common, phase: 'exited' };

    default: {
      // Exhaustiveness guard: adding an event without a case is a type error.
      const never: never = event;
      return never;
    }
  }
}
