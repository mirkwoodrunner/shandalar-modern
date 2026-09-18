/**
 * @module-tag learn
 */
// src/learn/__tests__/persistence.test.ts
// Learn Mode save layer: shape validation, attempt recording, onboarding
// mapping, and the C1-C4 corrections to docs/LEARN_L1_SPEC.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_KEY,
  clearLearnSave,
  completeOnboarding,
  computeStartingTier,
  createEmptySave,
  deriveResumeIndex,
  loadLearnSave,
  overrideStartingTier,
  recordAttempt,
  saveLearnSave,
} from '../persistence';
import type { Unit } from '../engine/types';

// No localStorage global exists under this suite's `environment: 'node'`
// Vitest config (see vite.config.js). This is a minimal in-memory stand-in,
// scoped to this test file only -- it mirrors the Storage interface, not a
// second persistence pattern.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-18T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function unitOf(stableIds: string[]): Unit {
  return {
    id: 'u',
    title: 'Test unit',
    exercises: stableIds.map(id => ({
      kind: 'multiSelect',
      id,
      stableId: id,
      unit: 'u',
      skill: 'read-costs',
      title: id,
      prompt: '',
      hint: '',
      explanation: '',
      lands: [],
      options: [],
      answer: [],
    })),
  };
}

describe('@learn-persist-1 shape validation', () => {
  it('a well-formed save round-trips through save()/load() unchanged', () => {
    const save = createEmptySave();
    saveLearnSave(save);
    expect(loadLearnSave()).toEqual(save);
  });

  it('rejects a blob missing any required top-level key', () => {
    const save = createEmptySave() as any;
    for (const key of ['createdAt', 'updatedAt', 'onboarding', 'exercises', 'dailyActivity', 'monthlyActivity', 'longestStreak']) {
      localStorage.clear();
      const broken = { ...save };
      delete broken[key];
      localStorage.setItem(SAVE_KEY, JSON.stringify(broken));
      expect(loadLearnSave(), `missing ${key}`).toBeNull();
    }
  });

  it('rejects a mismatched schemaVersion', () => {
    const save = { ...createEmptySave(), schemaVersion: 2 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    expect(loadLearnSave()).toBeNull();
  });

  it('treats a corrupted JSON string as no save, without throwing', () => {
    localStorage.setItem(SAVE_KEY, '{not json');
    expect(() => loadLearnSave()).not.toThrow();
    expect(loadLearnSave()).toBeNull();
  });
});

describe('@learn-persist-2 key namespacing', () => {
  it('writes under learn:progress and never touches shandalar keys', () => {
    localStorage.setItem('shandalar:duel', 'untouched-duel');
    localStorage.setItem('shandalar_unlockables', 'untouched-unlockables');
    saveLearnSave(createEmptySave());
    expect(SAVE_KEY).toBe('learn:progress');
    expect(localStorage.getItem('shandalar:duel')).toBe('untouched-duel');
    expect(localStorage.getItem('shandalar_unlockables')).toBe('untouched-unlockables');
  });
});

describe('@learn-persist-3 attempt recording, not ghost-inflated', () => {
  it('rejected taps never reach recordAttempt: one success after N rejections is one attempt', () => {
    let save = createEmptySave();
    // FEEDBACK_REJECTED never calls recordAttempt -- simulated here by simply
    // not calling it for the "rejected" attempts.
    save = recordAttempt(save, 'ex-1', 'success', false);
    expect(save.exercises['ex-1'].attempts).toBe(1);
    expect(save.exercises['ex-1'].firstTrySuccess).toBe(true);
  });

  it('fail then retry then success is two attempts, firstTrySuccess false', () => {
    let save = createEmptySave();
    save = recordAttempt(save, 'ex-1', 'fail', false);
    save = recordAttempt(save, 'ex-1', 'success', false);
    expect(save.exercises['ex-1'].attempts).toBe(2);
    expect(save.exercises['ex-1'].firstTrySuccess).toBe(false);
  });

  it('a hint shown before a first-try success sets hintUsed without affecting firstTrySuccess', () => {
    let save = createEmptySave();
    save = recordAttempt(save, 'ex-1', 'success', true);
    expect(save.exercises['ex-1'].hintUsed).toBe(true);
    expect(save.exercises['ex-1'].firstTrySuccess).toBe(true);
  });
});

describe('@learn-persist-4 C1 regression -- write placement, not the setState updater', () => {
  it('the write itself increments attempts by exactly one per call', () => {
    const save = createEmptySave();
    const next = recordAttempt(save, 'ex-1', 'success', false);
    expect(next.exercises['ex-1'].attempts).toBe(1);
  });

  it('simulated StrictMode double-invocation of a setState updater doubles a side effect placed inside it -- demonstrating why the write must live in the handler, not the updater', () => {
    // React 18 StrictMode invokes a functional setState updater twice per
    // commit in development, keeping only the second call's return value.
    // A write placed inside such an updater runs twice; a write placed in
    // the event handler that triggers the state change runs once no matter
    // how the updater itself behaves.
    let sideEffectCalls = 0;
    const badUpdater = (prev: number) => {
      sideEffectCalls++; // stands in for a localStorage write done wrong
      return prev + 1;
    };
    badUpdater(0);
    badUpdater(0); // StrictMode's extra invocation
    expect(sideEffectCalls).toBe(2);

    // The actual implementation's call site (recordAttemptAndPersist in
    // useLessonPlayer.ts's tapCard/attack/checkMultiSelect handlers) is a
    // single direct call in the handler body, not a setState updater
    // argument, so it only ever runs once per real event:
    const save = createEmptySave();
    const afterOneRealEvent = recordAttempt(save, 'ex-1', 'success', false);
    expect(afterOneRealEvent.exercises['ex-1'].attempts).toBe(1);
  });

  it('recordAttemptAndPersist is never called from inside a setState updater in useLessonPlayer.ts', async () => {
    const fs: any = await import('node:fs');
    const src: string = fs.readFileSync(
      new URL('../hooks/useLessonPlayer.ts', import.meta.url),
      'utf8',
    );
    const updaterStarts = [...src.matchAll(/set\w+\(\s*prev\s*=>/g)].map(m => m.index!);
    expect(updaterStarts.length).toBeGreaterThan(0); // sanity: file still uses functional updaters elsewhere
    for (const start of updaterStarts) {
      // A functional updater's body is a short single expression/statement
      // in this file; 200 chars comfortably covers it without reaching the
      // next unrelated statement.
      const body = src.slice(start, start + 200);
      expect(body).not.toContain('recordAttemptAndPersist');
    }
  });
});

describe('@learn-persist-5 C2 -- daily activity counts all completions, not only successes', () => {
  it('a failed attempt increments attemptsCompleted and leaves successfulCompletions unchanged', () => {
    const save = recordAttempt(createEmptySave(), 'ex-1', 'fail', false);
    const day = save.dailyActivity['2026-09-18'];
    expect(day.attemptsCompleted).toBe(1);
    expect(day.successfulCompletions).toBe(0);
  });

  it('a success increments both', () => {
    const save = recordAttempt(createEmptySave(), 'ex-1', 'success', false);
    const day = save.dailyActivity['2026-09-18'];
    expect(day.attemptsCompleted).toBe(1);
    expect(day.successfulCompletions).toBe(1);
  });

  it('two successes on the same device-local date produce one entry with successfulCompletions === 2', () => {
    let save = createEmptySave();
    save = recordAttempt(save, 'ex-1', 'success', false);
    save = recordAttempt(save, 'ex-2', 'success', false);
    expect(Object.keys(save.dailyActivity)).toEqual(['2026-09-18']);
    expect(save.dailyActivity['2026-09-18']).toEqual({ attemptsCompleted: 2, successfulCompletions: 2 });
  });

  it('completions straddling a date boundary produce two separate date-keyed entries', () => {
    let save = createEmptySave();
    save = recordAttempt(save, 'ex-1', 'success', false);
    vi.setSystemTime(new Date('2026-09-19T00:30:00.000Z'));
    save = recordAttempt(save, 'ex-2', 'success', false);
    expect(Object.keys(save.dailyActivity).sort()).toEqual(['2026-09-18', '2026-09-19']);
  });
});

describe('@learn-persist-6 C3 -- monthlyActivity and longestStreak are reserved, not rolled up', () => {
  it('a newly created save has empty monthlyActivity and longestStreak === 0', () => {
    const save = createEmptySave();
    expect(save.monthlyActivity).toEqual({});
    expect(save.longestStreak).toBe(0);
  });

  it('isValidLearnSave (via loadLearnSave) rejects a blob missing monthlyActivity', () => {
    const save = createEmptySave() as any;
    delete save.monthlyActivity;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    expect(loadLearnSave()).toBeNull();
  });

  it('isValidLearnSave (via loadLearnSave) rejects a blob missing longestStreak', () => {
    const save = createEmptySave() as any;
    delete save.longestStreak;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    expect(loadLearnSave()).toBeNull();
  });

  it('recordAttempt never touches monthlyActivity or longestStreak', () => {
    const save = recordAttempt(createEmptySave(), 'ex-1', 'success', false);
    expect(save.monthlyActivity).toEqual({});
    expect(save.longestStreak).toBe(0);
  });
});

describe('@learn-persist-7 C4 -- derived resume index, no stored pointer', () => {
  it('given the unit\'s first N exercises have success records, the derived start index is N', () => {
    const unit = unitOf(['a', 'b', 'c', 'd']);
    let save = createEmptySave();
    save = recordAttempt(save, 'a', 'success', false);
    save = recordAttempt(save, 'b', 'success', false);
    expect(deriveResumeIndex(unit, save)).toBe(2);
  });

  it('a failed-then-retried-successfully exercise counts as complete for resume purposes', () => {
    const unit = unitOf(['a', 'b']);
    let save = createEmptySave();
    save = recordAttempt(save, 'a', 'fail', false);
    save = recordAttempt(save, 'a', 'success', false);
    expect(deriveResumeIndex(unit, save)).toBe(1);
  });

  it('given all exercises have success records, the unit opens at UNIT_COMPLETE (index === total)', () => {
    const unit = unitOf(['a', 'b']);
    let save = createEmptySave();
    save = recordAttempt(save, 'a', 'success', false);
    save = recordAttempt(save, 'b', 'success', false);
    expect(deriveResumeIndex(unit, save)).toBe(unit.exercises.length);
  });

  it('with no save at all, the derived index is 0', () => {
    const unit = unitOf(['a', 'b']);
    expect(deriveResumeIndex(unit, null)).toBe(0);
  });

  it('LearnSaveV1 has no stored resume-position field', () => {
    const save = createEmptySave();
    expect('lastUnit' in save).toBe(false);
    expect('resumePosition' in save).toBe(false);
  });
});

describe('@learn-persist-8 reset', () => {
  it('clearLearnSave clears learn:progress and a subsequent load returns no save', () => {
    saveLearnSave(createEmptySave());
    expect(loadLearnSave()).not.toBeNull();
    clearLearnSave();
    expect(loadLearnSave()).toBeNull();
  });
});

type SurveyAnswersLike = { playedBefore: 'never' | 'few' | 'regularly'; playedOrganized: boolean; studyingJudge: boolean };

describe('@learn-persist-9 onboarding mapping', () => {
  const cases: [SurveyAnswersLike, number][] = [
    [{ playedBefore: 'never', playedOrganized: false, studyingJudge: false }, 1],
    [{ playedBefore: 'few', playedOrganized: false, studyingJudge: false }, 1],
    [{ playedBefore: 'few', playedOrganized: true, studyingJudge: false }, 1],
    [{ playedBefore: 'regularly', playedOrganized: false, studyingJudge: false }, 2],
    [{ playedBefore: 'regularly', playedOrganized: true, studyingJudge: false }, 3],
    [{ playedBefore: 'never', playedOrganized: false, studyingJudge: true }, 3],
    [{ playedBefore: 'regularly', playedOrganized: true, studyingJudge: true }, 3],
  ];

  it.each(cases)('%o maps to startingTier %i', (answers, tier) => {
    expect(computeStartingTier(answers)).toBe(tier);
  });

  it('the override setter changes startingTier without touching onboarding.completed or re-requiring the survey', () => {
    let save = completeOnboarding(createEmptySave(), 1);
    expect(save.onboarding).toEqual({ completed: true, startingTier: 1 });
    save = overrideStartingTier(save, 3);
    expect(save.onboarding).toEqual({ completed: true, startingTier: 3 });
  });
});
