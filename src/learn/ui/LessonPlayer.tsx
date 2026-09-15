// src/learn/ui/LessonPlayer.tsx
// Presentation + wiring to useLessonPlayer. No rules logic.

import React from 'react';
import { useLessonPlayer } from '../hooks/useLessonPlayer';
import { EngineExercise } from './EngineExercise';
import { MultiSelectExercise } from './MultiSelectExercise';
import { FeedbackPanel } from './FeedbackPanel';
import type { Unit } from '../engine/types';

type LessonPlayerProps = {
  unit: Unit;
  startIndex: number;
  onExit: () => void;
};

export function LessonPlayer({ unit, startIndex, onExit }: LessonPlayerProps) {
  const player = useLessonPlayer(unit, startIndex);
  const { exercise, index, total, state, selectedAttackers, selectedOptions, msLands, msOptions, feedback, hintShown, done } = player;

  return (
    <div className="learn-lesson-player">
      <button data-testid="lesson-exit" className="learn-button learn-button-secondary" onClick={onExit}>
        Back to units
      </button>

      {done ? (
        <div data-testid="unit-complete" className="learn-unit-complete">
          <h2>Unit complete</h2>
          <p>You finished {unit.title}.</p>
          <button className="learn-button learn-button-primary" onClick={onExit}>
            Back to units
          </button>
        </div>
      ) : (
        <>
          <p data-testid="lesson-progress" className="learn-progress">
            {index + 1} / {total}
          </p>
          <div className="learn-progress-bar">
            <div className="learn-progress-bar-fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>

          <h2 data-testid="exercise-title">{exercise.title}</h2>
          <p data-testid="exercise-prompt">{exercise.prompt}</p>

          <button data-testid="hint-button" className="learn-button learn-button-secondary" onClick={player.showHint}>
            Hint
          </button>
          {hintShown && <p data-testid="hint-text">{exercise.hint}</p>}

          {exercise.kind === 'engine' ? (
            <EngineExercise
              ex={exercise}
              state={state}
              selectedAttackers={selectedAttackers}
              tapCard={player.tapCard}
              undoTaps={player.undoTaps}
              attack={player.attack}
            />
          ) : (
            <MultiSelectExercise
              msLands={msLands}
              msOptions={msOptions}
              selectedOptions={selectedOptions}
              toggleOption={player.toggleOption}
              checkMultiSelect={player.checkMultiSelect}
            />
          )}

          <FeedbackPanel feedback={feedback} onContinue={player.next} onRetry={player.retry} />
        </>
      )}
    </div>
  );
}
