/**
 * @module-tag learn
 */
// src/learn/__tests__/units.test.ts
// Content checks for authored Learn Mode exercises. These are the slice-1
// versions of the plan's quality checks: solvable, wrong lines fail for the
// stated reason, answers derived from the engine, no phantom card references,
// and no cards that touch known combat-damage gaps.

import { describe, it, expect } from 'vitest';
import { CARD_DB } from '../../data/cards.js';
import { UNITS } from '../data/units';
import { replay, castableWith } from '../engine/puzzleRunner';
import type { EngineExercise, Exercise, MultiSelectExercise } from '../engine/types';

const ALL: Exercise[] = UNITS.flatMap(u => u.exercises);
const ENGINE = ALL.filter((e): e is EngineExercise => e.kind === 'engine');
const MULTI = ALL.filter((e): e is MultiSelectExercise => e.kind === 'multiSelect');
const WRONG = ENGINE.flatMap(e => (e.wrongLines ?? []).map((w, i) => ({ ex: e, w, i })));

const cardIds = (e: Exercise): string[] =>
  e.kind === 'multiSelect'
    ? [...e.lands, ...e.options]
    : [...(e.setup.p.bf ?? []), ...(e.setup.p.hand ?? []), ...(e.setup.o.bf ?? []), ...(e.setup.o.hand ?? [])]
        .map(c => (typeof c === 'string' ? c : c.id));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Keywords whose combat damage handling has known gaps under current rules
// (damage assignment order, deathtouch lethal damage). Excluded until fixed.
const BLOCKED_KEYWORDS = ['TRAMPLE', 'BANDING', 'FIRST_STRIKE', 'DOUBLE_STRIKE', 'DEATHTOUCH'];

describe('@learn-units-1 exercise data integrity', () => {
  it('unit ids and exercise ids are unique, and every exercise sits in its declared unit', () => {
    const ids = ALL.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(UNITS.map(u => u.id)).size).toBe(UNITS.length);
    for (const u of UNITS) for (const e of u.exercises) expect(e.unit).toBe(u.id);
  });

  it('every referenced card id exists in CARD_DB', () => {
    for (const e of ALL) for (const id of cardIds(e)) {
      expect(CARD_DB.find((c: any) => c.id === id), `${e.id}: ${id}`).toBeTruthy();
    }
  });

  // Several card names are whole-word substrings of others -- Savannah inside
  // Savannah Lions, Island inside Volcanic Island, Tundra inside Tundra Wolves.
  // Scanning raw text flags the shorter card as a phantom every time the longer
  // one is legitimately named. Blank out the names that ARE present first,
  // longest first, and scan what is left.
  it('prompt, hint, and explanation only name cards present in the exercise', () => {
    for (const e of ALL) {
      const present = new Set(cardIds(e));
      const presentNames = [...present]
        .map(id => (CARD_DB as any[]).find(c => c.id === id)?.name)
        .filter((n): n is string => !!n)
        .sort((a, b) => b.length - a.length);
      for (const field of ['prompt', 'hint', 'explanation'] as const) {
        let rest: string = e[field];
        for (const n of presentNames) rest = rest.split(n).join(' ');
        for (const c of CARD_DB as any[]) {
          if (new RegExp(`\\b${escapeRe(c.name)}\\b`).test(rest)) {
            expect(present.has(c.id), `${e.id}.${field} names ${c.name}, which is not in the exercise`).toBe(true);
          }
        }
      }
    }
  });

  it('no exercise uses a card with a keyword that has known damage-rule gaps', () => {
    for (const e of ALL) for (const id of cardIds(e)) {
      const kws: string[] = (CARD_DB.find((c: any) => c.id === id) as any)?.keywords ?? [];
      const bad = kws.filter(k => BLOCKED_KEYWORDS.includes(k));
      expect(bad, `${e.id}: ${id}`).toEqual([]);
    }
  });

  it('Units 1.3 and 1.4 exercises are combat only, with nothing in either hand', () => {
    for (const e of ENGINE.filter(x => x.unit === '1.3' || x.unit === '1.4')) {
      expect(e.allowed).toEqual(['DECLARE_ATTACKER']);
      expect(e.setup.p.hand ?? []).toEqual([]);
      expect(e.setup.o.hand ?? []).toEqual([]);
    }
  });
});

describe('@learn-units-2 solutions and wrong lines replay through the engine', () => {
  it.each(ENGINE.map(e => [e.id, e] as const))('%s: every listed solution reaches the goal', (_id, e) => {
    expect(e.solutions.length).toBeGreaterThan(0);
    for (const sol of e.solutions) expect(replay(e, sol)).toEqual({ goalMet: true });
  });

  it.each(WRONG.map(x => [`${x.ex.id} wrong line ${x.i}`, x] as const))('%s fails for the stated reason', (_label, { ex, w }) => {
    const r = replay(ex, w.steps);
    expect(r.goalMet).toBe(false);
    if (r.goalMet) return;
    expect(r.kind).toBe(w.expect);
    expect(r.reason).toContain(w.reasonIncludes);
  });

  it.each(MULTI.map(e => [e.id, e] as const))('%s: answer matches the engine\'s canPay for those lands', (_id, e) => {
    const derived = e.options.filter(id => castableWith(e.lands, id)).sort();
    expect(derived).toEqual([...e.answer].sort());
  });
});
