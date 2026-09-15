// src/learn/LearnApp.tsx
// Top-level Learn Mode app. Reads ?exercise=<id> for deep linking, otherwise
// shows the unit list. Presentation + routing only, no rules logic.

import React, { useMemo, useState } from 'react';
import { UNITS } from './data/units';
import { LessonPlayer } from './ui/LessonPlayer';
import { LearnFooter } from './ui/LearnFooter';
import type { Unit } from './engine/types';

type View = { unit: Unit; startIndex: number } | null;

function findDeepLink(): View {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const exId = params.get('exercise');
  if (!exId) return null;
  for (const unit of UNITS) {
    const idx = unit.exercises.findIndex(e => e.id === exId);
    if (idx !== -1) return { unit, startIndex: idx };
  }
  return null;
}

export function LearnApp() {
  const initial = useMemo(findDeepLink, []);
  const [view, setView] = useState<View>(initial);

  return (
    <div className="learn-app">
      {view ? (
        <LessonPlayer unit={view.unit} startIndex={view.startIndex} onExit={() => setView(null)} />
      ) : (
        <div className="learn-unit-list">
          <h1>Learn Mode</h1>
          {UNITS.map(unit => (
            <button
              key={unit.id}
              data-testid={`learn-unit-${unit.id}`}
              className="learn-unit-button"
              onClick={() => setView({ unit, startIndex: 0 })}
            >
              <span className="learn-unit-title">{unit.title}</span>
              <span className="learn-unit-count">{unit.exercises.length} exercises</span>
            </button>
          ))}
        </div>
      )}
      <LearnFooter />
    </div>
  );
}
