// src/learn/LearnApp.tsx
// Top-level Learn Mode app. Reads ?exercise=<id> for deep linking, otherwise
// shows the unit list. Presentation + routing only, no rules logic.

import React, { useCallback, useMemo, useState } from 'react';
import { UNITS } from './data/units';
import { LessonPlayer } from './ui/LessonPlayer';
import { LearnFooter } from './ui/LearnFooter';
import { OnboardingSurvey } from './ui/OnboardingSurvey';
import { useLearnProgress } from './hooks/useLearnProgress';
import { deriveResumeIndex, loadLearnSave } from './persistence';
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

const TIER_OPTIONS = [1, 2, 3];

export function LearnApp() {
  // An explicit ?exercise= deep link always wins: it opens straight into
  // the lesson player and skips the onboarding gate below. Deep links are
  // used by e2e tests and for sharing a single exercise -- requiring a
  // three-question survey first would defeat both.
  const initial = useMemo(findDeepLink, []);
  const isDeepLink = initial !== null;
  const [view, setView] = useState<View>(initial);
  const { save, refresh, completeSurvey, setStartingTier, resetProgress } = useLearnProgress();

  const enterUnit = useCallback((unit: Unit) => {
    const latest = loadLearnSave();
    setView({ unit, startIndex: deriveResumeIndex(unit, latest) });
  }, []);

  const exitToUnitList = useCallback(() => {
    refresh();
    setView(null);
  }, [refresh]);

  const showSurvey = !isDeepLink && !save?.onboarding.completed;

  return (
    <div className="learn-app">
      {view ? (
        <LessonPlayer unit={view.unit} startIndex={view.startIndex} onExit={exitToUnitList} />
      ) : (
        <div className="learn-unit-list">
          <h1>Learn Mode</h1>
          {UNITS.map(unit => (
            <button
              key={unit.id}
              data-testid={`learn-unit-${unit.id}`}
              className="learn-unit-button"
              onClick={() => enterUnit(unit)}
            >
              <span className="learn-unit-title">{unit.title}</span>
              <span className="learn-unit-count">{unit.exercises.length} exercises</span>
            </button>
          ))}

          <div className="learn-profile-controls">
            <label className="learn-tier-override">
              Starting tier
              <select
                data-testid="starting-tier-select"
                value={save?.onboarding.startingTier ?? 1}
                onChange={e => setStartingTier(Number(e.target.value))}
              >
                {TIER_OPTIONS.map(tier => (
                  <option key={tier} value={tier}>Tier {tier}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="reset-progress-button"
              className="learn-button learn-button-secondary"
              onClick={resetProgress}
            >
              Reset progress
            </button>
          </div>
        </div>
      )}

      {showSurvey && <OnboardingSurvey onComplete={completeSurvey} />}

      <LearnFooter />
    </div>
  );
}
