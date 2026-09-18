// src/learn/persistence.ts
// Learn Mode save layer. Mirrors the shape-validation pattern in
// src/hooks/usePersistence.ts (read for reference, never imported --
// see docs/LEARN_L1_SPEC.md section 2): shallow, presence-based validation,
// every localStorage call in try/catch, a bad or missing save degrades to
// "no save" rather than a partial repair.
//
// Every attempt write below is a pure function. The caller persists the
// result. Callers must call it from an event handler, never from inside a
// React state updater callback -- React.StrictMode (src/learn/main.tsx)
// double-invokes updater functions in development, which would silently
// double-count `attempts`. See docs/LEARN_L1_SPEC.md section 3, correction C1.

import type { Unit } from './engine/types';

export const SAVE_KEY = 'learn:progress';
const SCHEMA_VERSION = 1 as const;

export interface ExerciseRecord {
  attempts: number;
  firstTrySuccess: boolean;
  hintUsed: boolean;
  lastCompletedAt?: string;
}

export interface DailyActivityRecord {
  attemptsCompleted: number;
  successfulCompletions: number;
}

// Reserved for L9's streak roll-up. L1 writes empty/zero defaults and never
// modifies them. When L9 lands, days older than 400 collapse into monthly
// totals here, with longestStreak computed before day granularity is
// discarded. See docs/LEARN_L1_SPEC.md section 1, correction C3.
export interface MonthlyActivityRecord {
  attemptsCompleted: number;
  successfulCompletions: number;
}

export interface LearnSaveV1 {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  onboarding: {
    completed: boolean;
    startingTier: number;
  };
  exercises: Record<string, ExerciseRecord>;
  dailyActivity: Record<string, DailyActivityRecord>;
  monthlyActivity: Record<string, MonthlyActivityRecord>;
  longestStreak: number;
}

function isValidLearnSave(value: unknown): value is LearnSaveV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== SCHEMA_VERSION) return false;
  const topLevelKeys = ['createdAt', 'updatedAt', 'onboarding', 'exercises', 'dailyActivity', 'monthlyActivity', 'longestStreak'];
  for (const key of topLevelKeys) {
    if (!(key in v)) return false;
  }
  if (typeof v.onboarding !== 'object' || v.onboarding === null) return false;
  if (typeof v.exercises !== 'object' || v.exercises === null) return false;
  if (typeof v.dailyActivity !== 'object' || v.dailyActivity === null) return false;
  if (typeof v.monthlyActivity !== 'object' || v.monthlyActivity === null) return false;
  if (typeof v.longestStreak !== 'number') return false;
  return true;
}

export function createEmptySave(): LearnSaveV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    onboarding: { completed: false, startingTier: 1 },
    exercises: {},
    dailyActivity: {},
    monthlyActivity: {},
    longestStreak: 0,
  };
}

export function loadLearnSave(): LearnSaveV1 | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!isValidLearnSave(parsed)) {
      clearLearnSave();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLearnSave(save: LearnSaveV1): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // quota exceeded or private browsing
  }
}

export function clearLearnSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // private browsing
  }
}

// Device-local calendar date, not the UTC date ISO strings carry.
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// One completed attempt (FEEDBACK_SUCCESS or FEEDBACK_FAIL arrival only --
// never FEEDBACK_REJECTED). Pure: the caller persists the result with
// saveLearnSave(). See docs/LEARN_L1_SPEC.md section 3.
export function recordAttempt(
  save: LearnSaveV1,
  stableId: string,
  result: 'success' | 'fail',
  hintUsedThisAttempt: boolean,
): LearnSaveV1 {
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = save.exercises[stableId];
  const isFirstAttempt = !existing;

  const record: ExerciseRecord = {
    attempts: (existing?.attempts ?? 0) + 1,
    firstTrySuccess: isFirstAttempt ? result === 'success' : existing.firstTrySuccess,
    hintUsed: (existing?.hintUsed ?? false) || hintUsedThisAttempt,
    ...(result === 'success'
      ? { lastCompletedAt: nowIso }
      : existing?.lastCompletedAt !== undefined
        ? { lastCompletedAt: existing.lastCompletedAt }
        : {}),
  };

  const dateKey = localDateKey(now);
  const existingDay = save.dailyActivity[dateKey];
  const dayRecord: DailyActivityRecord = {
    attemptsCompleted: (existingDay?.attemptsCompleted ?? 0) + 1,
    successfulCompletions: (existingDay?.successfulCompletions ?? 0) + (result === 'success' ? 1 : 0),
  };

  return {
    ...save,
    updatedAt: nowIso,
    exercises: { ...save.exercises, [stableId]: record },
    dailyActivity: { ...save.dailyActivity, [dateKey]: dayRecord },
  };
}

// Convenience wrapper for callers (an event handler in useLessonPlayer.ts)
// that don't hold their own copy of the save in React state: load, apply
// recordAttempt, persist, return the result.
export function recordAttemptAndPersist(
  stableId: string,
  result: 'success' | 'fail',
  hintUsedThisAttempt: boolean,
): LearnSaveV1 {
  const current = loadLearnSave() ?? createEmptySave();
  const next = recordAttempt(current, stableId, result, hintUsedThisAttempt);
  saveLearnSave(next);
  return next;
}

export type SurveyAnswers = {
  playedBefore: 'never' | 'few' | 'regularly';
  playedOrganized: boolean;
  studyingJudge: boolean;
};

export function computeStartingTier(answers: SurveyAnswers): number {
  if (answers.studyingJudge) return 3;
  if (answers.playedBefore === 'regularly') return answers.playedOrganized ? 3 : 2;
  return 1;
}

export function completeOnboarding(save: LearnSaveV1, startingTier: number): LearnSaveV1 {
  return {
    ...save,
    updatedAt: new Date().toISOString(),
    onboarding: { completed: true, startingTier },
  };
}

export function overrideStartingTier(save: LearnSaveV1, startingTier: number): LearnSaveV1 {
  return {
    ...save,
    updatedAt: new Date().toISOString(),
    onboarding: { ...save.onboarding, startingTier },
  };
}

// The only resume mechanism: the first exercise (in unit order) that has
// never been completed successfully. No stored resume position exists --
// see docs/LEARN_L1_SPEC.md section 4, correction C4. Completion is judged
// by `lastCompletedAt` (has this exercise EVER succeeded), not by
// `firstTrySuccess` (was the FIRST attempt a success) -- the latter would
// leave an exercise that failed once and then succeeded on retry looking
// permanently unresumed.
export function deriveResumeIndex(unit: Unit, save: LearnSaveV1 | null): number {
  if (!save) return 0;
  const idx = unit.exercises.findIndex(ex => save.exercises[ex.stableId]?.lastCompletedAt === undefined);
  return idx === -1 ? unit.exercises.length : idx;
}
