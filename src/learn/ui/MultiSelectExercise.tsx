// src/learn/ui/MultiSelectExercise.tsx
// Presentation only. Calls hook callbacks; no rules logic.

import React from 'react';
import { LearnCard } from './LearnCard';
import type { CardView } from '../hooks/useLessonPlayer';

type MultiSelectExerciseProps = {
  msLands: CardView[];
  msOptions: CardView[];
  selectedOptions: string[];
  toggleOption: (cardId: string) => void;
  checkMultiSelect: () => void;
};

export function MultiSelectExercise({ msLands, msOptions, selectedOptions, toggleOption, checkMultiSelect }: MultiSelectExerciseProps) {
  return (
    <div className="learn-multiselect-exercise">
      <p className="learn-multiselect-label">Your untapped lands</p>
      <div className="learn-card-row">
        {msLands.map((land, i) => (
          <LearnCard key={`${land.id}-${i}`} card={land} />
        ))}
      </div>
      <p className="learn-multiselect-label">Options</p>
      <div className="learn-card-row">
        {msOptions.map(opt => (
          <button
            key={opt.id}
            data-testid={`ms-option-${opt.id}`}
            aria-pressed={selectedOptions.includes(opt.id)}
            className={`learn-ms-option${selectedOptions.includes(opt.id) ? ' learn-ms-option-selected' : ''}`}
            onClick={() => toggleOption(opt.id)}
          >
            <LearnCard card={opt} />
          </button>
        ))}
      </div>
      <button data-testid="ms-check" className="learn-button learn-button-primary" onClick={checkMultiSelect}>
        Check
      </button>
    </div>
  );
}
