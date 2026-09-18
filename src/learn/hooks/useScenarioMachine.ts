// src/learn/hooks/useScenarioMachine.ts
// React binding for the scenario lesson lifecycle machine.
//
// Holds exactly one piece of state: the machine. Every lesson-lifecycle
// question ("can the learner act?", "is the hint showing?", "what does the
// retry button do?") is answered by reading `state.phase`, never by a second
// flag kept alongside it. That is the whole point of this hook existing
// separately from useLessonPlayer.ts, which is four loose useState calls.
//
// Building the seed GameState is delegated to buildPuzzleState in
// puzzleRunner.ts -- the only module under src/learn/ allowed to import from
// src/engine/. Nothing in this file touches DuelCore.

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { buildPuzzleState } from '../engine/puzzleRunner';
import {
  canAct,
  initialScenarioState,
  scenarioMountKey,
  scenarioReducer,
} from '../engine/scenarioMachine';
import type { ScenarioEvent, ScenarioState } from '../engine/scenarioMachine';
import type { EngineExercise } from '../engine/types';

const LOAD_FAILED = 'This lesson could not be set up. Try another exercise.';

export type ScenarioMachine = {
  state: ScenarioState;
  send: (event: ScenarioEvent) => void;
  /** Remount key for the duel screen. Changes on retry; that is the reset. */
  mountKey: string;
  /** True only in playerActing. */
  canAct: boolean;
  /** The seed the board is mounted with, or null before it is built. */
  seed: unknown;
  // Named senders, one per transition the chrome can trigger.
  reportAction: () => void;
  reportRejection: (message: string) => void;
  revealHint: () => void;
  requestCheck: () => void;
  reportEvaluation: (outcome: 'success' | 'fail', message: string) => void;
  requestRetry: () => void;
  requestExit: () => void;
};

export function useScenarioMachine(exercise: EngineExercise): ScenarioMachine {
  const [state, send] = useReducer(
    scenarioReducer,
    exercise.id,
    initialScenarioState,
  );

  // scenarioLoad -> playerActing. Builds the seed once per attempt. Keyed on
  // the mount key so a retry (attempt + 1) rebuilds it, and on the phase so it
  // does not re-run while the learner is acting.
  const mountKey = scenarioMountKey(state);
  useEffect(() => {
    if (state.phase !== 'scenarioLoad') return;
    try {
      send({ type: 'SCENARIO_READY', seed: buildPuzzleState(exercise.setup) });
    } catch (e) {
      console.error(e);
      send({ type: 'SCENARIO_LOAD_FAILED', message: LOAD_FAILED });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountKey, state.phase]);

  const reportAction = useCallback(() => send({ type: 'PLAYER_ACTED' }), []);
  const reportRejection = useCallback(
    (message: string) => send({ type: 'PLAYER_ACTION_REJECTED', message }),
    [],
  );
  const revealHint = useCallback(() => send({ type: 'HINT_REVEALED' }), []);
  const requestCheck = useCallback(() => send({ type: 'CHECK_REQUESTED' }), []);
  const reportEvaluation = useCallback(
    (outcome: 'success' | 'fail', message: string) =>
      send({ type: 'EVALUATED', outcome, message }),
    [],
  );
  const requestRetry = useCallback(() => send({ type: 'RETRY_REQUESTED' }), []);
  const requestExit = useCallback(() => send({ type: 'EXIT_REQUESTED' }), []);

  const seed = useMemo(
    () => ('seed' in state ? state.seed : null),
    [state],
  );

  return {
    state,
    send,
    mountKey,
    canAct: canAct(state),
    seed,
    reportAction,
    reportRejection,
    revealHint,
    requestCheck,
    reportEvaluation,
    requestRetry,
    requestExit,
  };
}
