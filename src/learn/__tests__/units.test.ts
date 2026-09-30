/**
 * @module-tag learn
 */
// src/learn/__tests__/units.test.ts
// Content checks for authored Learn Mode exercises. These are the slice-1
// versions of the plan's quality checks: solvable, wrong lines fail for the
// stated reason, answers derived from the engine, no phantom card references,
// and no cards that touch known combat-damage gaps.
//
// Card lookups are pool-aware (L5 slice 1): an exercise with setup.pool 'learn'
// resolves its ids against CARD_DB_LEARN, everything else against CARD_DB. A
// card missing from its pool fails loudly rather than defaulting to no keywords.

import { describe, it, expect } from 'vitest';
import { CARD_DB } from '../../data/cards.js';
import { CARD_DB_LEARN } from '../../data/cardsLearn.js';
import { UNITS } from '../data/units';
import { replay, castableWith, randomCombatPath } from '../engine/puzzleRunner';
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

// The card database this exercise's ids resolve against. multiSelect
// exercises carry no pool and always use CARD_DB.
const poolOf = (e: Exercise): any[] =>
  e.kind === 'engine' && e.setup.pool === 'learn' ? (CARD_DB_LEARN as any[]) : (CARD_DB as any[]);
const cardOf = (e: Exercise, id: string): any => poolOf(e).find((c: any) => c.id === id);

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

  it('every referenced card id exists in the exercise\'s own pool', () => {
    for (const e of ALL) for (const id of cardIds(e)) {
      expect(cardOf(e, id), `${e.id}: ${id}`).toBeTruthy();
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
        .map(id => cardOf(e, id)?.name)
        .filter((n): n is string => !!n)
        .sort((a, b) => b.length - a.length);
      for (const field of ['prompt', 'hint', 'explanation'] as const) {
        let rest: string = e[field];
        for (const n of presentNames) rest = rest.split(n).join(' ');
        for (const c of poolOf(e)) {
          if (new RegExp(`\\b${escapeRe(c.name)}\\b`).test(rest)) {
            expect(present.has(c.id), `${e.id}.${field} names ${c.name}, which is not in the exercise`).toBe(true);
          }
        }
      }
    }
  });

  it('no exercise uses a card with a keyword that has known damage-rule gaps', () => {
    for (const e of ALL) for (const id of cardIds(e)) {
      const card = cardOf(e, id);
      // An unknown card must fail here, not pass with no keywords.
      expect(card, `${e.id}: ${id} is not in its pool`).toBeTruthy();
      const bad = (card.keywords ?? []).filter((k: string) => BLOCKED_KEYWORDS.includes(k));
      expect(bad, `${e.id}: ${id}`).toEqual([]);
    }
  });

  // A graded exercise must never depend on a coin flip. randomCombatPath is the
  // runner's list of cards whose combat handling calls Math.random().
  it('no exercise uses a card whose combat handling is random', () => {
    for (const e of ALL) for (const id of cardIds(e)) {
      const card = cardOf(e, id);
      expect(card, `${e.id}: ${id} is not in its pool`).toBeTruthy();
      expect(randomCombatPath(card), `${e.id}: ${id}`).toBeNull();
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

describe('@learn-units-3 Unit 2.1 blocking content', () => {
  it('Unit 2.1 exercises are blocking only, with nothing in either hand', () => {
    const blocking = ENGINE.filter(x => x.unit === '2.1');
    expect(blocking.length).toBeGreaterThan(0);
    for (const e of blocking) {
      expect(e.allowed).toEqual(['DECLARE_BLOCKER']);
      expect(e.setup.phase).toBe('COMBAT_BLOCKERS');
      expect(e.setup.p.hand ?? []).toEqual([]);
      expect(e.setup.o.hand ?? []).toEqual([]);
    }
  });

  it('Unit 2.1 is unlisted until lessons can route into scenario mode', () => {
    expect(UNITS.find(u => u.id === '2.1')?.listed).toBe(false);
    for (const u of UNITS.filter(x => x.id.startsWith('1.'))) expect(u.listed).not.toBe(false);
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
