// src/learn/hooks/useLearnProgress.ts
// React binding for src/learn/persistence.ts. Owns the onboarding-survey
// and reset surface LearnApp needs. Per-exercise attempt writes happen
// directly in useLessonPlayer.ts's event handlers (see
// docs/LEARN_L1_SPEC.md section 3, correction C1) and go straight to
// localStorage without passing through this hook's React state.

import { useCallback, useState } from 'react';
import {
  clearLearnSave,
  completeOnboarding,
  computeStartingTier,
  createEmptySave,
  loadLearnSave,
  overrideStartingTier,
  saveLearnSave,
} from '../persistence';
import type { LearnSaveV1, SurveyAnswers } from '../persistence';

export function useLearnProgress() {
  const [save, setSave] = useState<LearnSaveV1 | null>(() => loadLearnSave());

  const refresh = useCallback(() => {
    setSave(loadLearnSave());
  }, []);

  const completeSurvey = useCallback((answers: SurveyAnswers) => {
    const tier = computeStartingTier(answers);
    const next = completeOnboarding(loadLearnSave() ?? createEmptySave(), tier);
    saveLearnSave(next);
    setSave(next);
  }, []);

  const setStartingTier = useCallback((tier: number) => {
    const next = overrideStartingTier(loadLearnSave() ?? createEmptySave(), tier);
    saveLearnSave(next);
    setSave(next);
  }, []);

  const resetProgress = useCallback(() => {
    clearLearnSave();
    setSave(null);
  }, []);

  return { save, refresh, completeSurvey, setStartingTier, resetProgress };
}
