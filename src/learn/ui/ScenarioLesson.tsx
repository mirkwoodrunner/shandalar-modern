// src/learn/ui/ScenarioLesson.tsx
// Scenario mode host (Learn Mode L3). Renders one engine exercise on the real
// duel screen instead of the bespoke Learn board.
//
// This is the single place Learn Mode reaches into the duel UI. What it imports
// from outside src/learn/ is exactly: the two duel screens, the mobile
// breakpoint hook, and the DuelConfig types. It imports no engine module and no
// card data -- puzzleRunner.ts remains the only file under src/learn/ that may.
// See CLAUDE.md, "Learn Mode", for the binding form of that rule.
//
// Reset works by remount: the duel screen is keyed on the machine's mount key,
// which changes on retry, so a retry rebuilds the seed state and discards every
// reducer-held mutation with it. Nothing has to be un-done by hand.

import { useCallback, useMemo } from 'react';
import DuelScreen from '../../DuelScreen';
import DuelScreenMobile from '../../ui/Mobile/DuelScreenMobile';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SCENARIO_OPP_ARCH, SCENARIO_RULESET } from '../engine/puzzleRunner';
import { useScenarioMachine } from '../hooks/useScenarioMachine';
import { ScenarioChrome, NOT_IN_LESSON } from './ScenarioChrome';
import type { DuelConfig, ScenarioPanelContext } from '../../types/duel';
import type { EngineExercise } from '../engine/types';

export interface ScenarioLessonProps {
  exercise: EngineExercise;
  onExit: () => void;
}

export function ScenarioLesson({ exercise, onExit }: ScenarioLessonProps) {
  const isMobile = useIsMobile();
  const machine = useScenarioMachine(exercise);
  const { state, seed, mountKey, reportRejection, requestExit } = machine;

  const handleExit = useCallback(() => {
    requestExit();
    onExit();
  }, [requestExit, onExit]);

  const config: DuelConfig | null = useMemo(() => {
    if (seed === null || seed === undefined) return null;
    return {
      // Inert on this path: with `initialState` supplied, useDuel short-circuits
      // and buildDuelState is never called, so no deck is generated from these.
      pDeckIds: [],
      oppArchKey: SCENARIO_OPP_ARCH,
      ruleset: SCENARIO_RULESET,
      // The scenario contract.
      scenario: true,
      initialState: seed,
      allowedActions: exercise.allowed,
      onActionRefused: () => reportRejection(NOT_IN_LESSON),
      anteEnabled: false,
    };
  }, [seed, exercise.allowed, reportRejection]);

  // The board is not built yet (scenarioLoad) or the build failed
  // (feedback/error). Either way there is nothing to mount.
  if (config === null) {
    return (
      <div className="learn-scenario-shell" data-testid="scenario-shell">
        {state.phase === 'feedback' && state.outcome === 'error' ? (
          <div data-testid="scenario-load-error">
            <p>{state.message}</p>
            <button type="button" data-testid="scenario-exit-button" onClick={handleExit}>
              Exit
            </button>
          </div>
        ) : (
          <p data-testid="scenario-loading">Setting up the lesson...</p>
        )}
      </div>
    );
  }

  const panel = (ctx: ScenarioPanelContext) => (
    <ScenarioChrome
      exercise={exercise}
      machine={machine}
      liveState={ctx.state}
      isMobile={ctx.isMobile}
      onExit={handleExit}
    />
  );

  // onDuelEnd is a no-op here: scenario mode suppresses the campaign's
  // game-over auto-exit (useDuelController), so the only way out is the
  // chrome's own exit button, which runs the machine's exit transition.
  const noop = () => {};

  return isMobile ? (
    <DuelScreenMobile key={mountKey} config={config} onDuelEnd={noop} scenarioPanel={panel} />
  ) : (
    <DuelScreen key={mountKey} config={config} onDuelEnd={noop} scenarioPanel={panel} />
  );
}

export default ScenarioLesson;
