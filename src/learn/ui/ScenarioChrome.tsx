// src/learn/ui/ScenarioChrome.tsx
// The lesson chrome rendered over a scenario duel board (Learn Mode L3).
//
// This is the piece that knows about exercises. It reads the LIVE GameState the
// duel screen hands it, grades against the exercise's goal when the learner
// asks, and drives the lifecycle machine. It resolves no rules of its own:
// grading is `checkGoal` in puzzleRunner.ts, and every state change on the
// board came from DuelCore via the screen's reducer.
//
// It renders through ScenarioOverlay (src/ui/duel/), which is a dumb shell.
// Layout lives there; what to say lives here.

import { useEffect, useRef } from 'react';
import { checkGoal } from '../engine/puzzleRunner';
import { ScenarioOverlay } from '../../ui/duel/ScenarioOverlay';
import type { ScenarioOverlayButton } from '../../ui/duel/ScenarioOverlay';
import type { ScenarioMachine } from '../hooks/useScenarioMachine';
import type { EngineExercise } from '../engine/types';

const NOT_IN_LESSON = "That isn't part of this lesson.";
const NOT_YET = 'Not there yet. Look at the board and try the next step.';

export interface ScenarioChromeProps {
  exercise: EngineExercise;
  machine: ScenarioMachine;
  /** The live GameState, supplied by the duel screen. Never copied into state. */
  liveState: unknown;
  isMobile: boolean;
  onExit: () => void;
}

export function ScenarioChrome({
  exercise,
  machine,
  liveState,
  isMobile,
  onExit,
}: ScenarioChromeProps) {
  const { state, canAct, reportAction, revealHint, requestCheck, reportEvaluation, requestRetry } = machine;

  // Board-change watcher. With the AI suppressed, the only thing that can move
  // a scenario board is the learner, so a new state object means they acted.
  // PLAYER_ACTED is refused by the machine outside playerActing, so a state
  // change arriving during evaluating or feedback cannot resurrect the attempt.
  const seenState = useRef<unknown>(null);
  useEffect(() => {
    if (seenState.current === null) {
      seenState.current = liveState;
      return;
    }
    if (seenState.current === liveState) return;
    seenState.current = liveState;
    reportAction();
  }, [liveState, reportAction]);

  // evaluating -> feedback. Grading is one call into puzzleRunner; the result
  // is reported straight back to the machine, which owns what happens next.
  useEffect(() => {
    if (state.phase !== 'evaluating') return;
    let met = false;
    try {
      met = checkGoal(liveState, exercise.goal);
    } catch (e) {
      console.error(e);
      met = false;
    }
    reportEvaluation(met ? 'success' : 'fail', met ? exercise.explanation : NOT_YET);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const hintShown = state.hintShown;
  const rejection = state.phase === 'playerActing' ? state.rejection : null;
  const feedback =
    state.phase === 'feedback'
      ? { tone: state.outcome, text: state.message }
      : null;

  const buttons: ScenarioOverlayButton[] = [];

  if (!hintShown && state.phase !== 'feedback') {
    buttons.push({ id: 'hint', label: 'Hint', onClick: revealHint, disabled: !canAct });
  }

  if (state.phase !== 'feedback') {
    buttons.push({
      id: 'check',
      label: 'Check',
      onClick: requestCheck,
      disabled: !canAct,
      primary: true,
    });
  }

  buttons.push({
    id: 'retry',
    label: 'Retry',
    onClick: requestRetry,
    // Refused from evaluating by the machine; disabled here so the button does
    // not look live while a check is in flight.
    disabled: state.phase === 'evaluating',
    primary: state.phase === 'feedback' && state.outcome !== 'success',
  });

  buttons.push({ id: 'exit', label: 'Exit', onClick: onExit });

  return (
    <ScenarioOverlay
      title={exercise.title}
      prompt={exercise.prompt}
      hint={hintShown ? exercise.hint : null}
      rejection={rejection}
      feedback={feedback}
      buttons={buttons}
      isMobile={isMobile}
    />
  );
}

export { NOT_IN_LESSON };
export default ScenarioChrome;
