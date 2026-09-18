/**
 * @module-tag learn
 */
// src/learn/__tests__/puzzleChecker.test.ts
// Two jobs. First, every shipped exercise passes the checker. Second, the
// checker actually catches deliberately broken exercises -- a checker that
// never fires is worse than no checker, because it looks like coverage.

import { describe, it, expect } from 'vitest';
import { UNITS } from '../data/units';
import { checkAll, checkExercise, enumerateLines, countRejectableMoves, THEME_CHECKS, MULTI_THEME_CHECKS } from '../engine/puzzleChecker';
import type { EngineExercise, Exercise } from '../engine/types';

const ALL: Exercise[] = UNITS.flatMap(u => u.exercises);
const byId = (id: string) => ALL.find(e => e.id === id) as EngineExercise;
const errorsOf = (ex: Exercise) => checkExercise(ex).filter(f => f.severity === 'error');
const checksFired = (ex: Exercise) => errorsOf(ex).map(f => f.check);

describe('@learn-checker-1 shipped content passes', () => {
  it('no shipped exercise produces an error finding', () => {
    const errors = checkAll(ALL).filter(f => f.severity === 'error');
    expect(errors, JSON.stringify(errors, null, 1)).toEqual([]);
  });

  it('every skill tag in the content has a theme check defined', () => {
    for (const e of ALL) {
      const table = e.kind === 'multiSelect' ? MULTI_THEME_CHECKS : THEME_CHECKS;
      expect(table[e.skill], `no theme check for skill "${e.skill}" (${e.id})`).toBeTypeOf('function');
    }
  });

  it('enumeration finds the expected shape of the solution space', () => {
    // 1.4-02: three attackers, one blocker. Seven non-empty sets, one wins.
    const lines = enumerateLines(byId('1.4-02'));
    expect(lines).toHaveLength(7);
    expect(lines.filter(l => l.wins)).toHaveLength(1);
    // 1.1-03: four lands, so three land sets pay 1RR.
    expect(enumerateLines(byId('1.1-03')).filter(l => l.wins)).toHaveLength(3);
  });

  it('main-phase exercises offer a real wrong move, except the guided first one', () => {
    expect(countRejectableMoves(byId('1.1-03'))).toBeGreaterThan(0);
    expect(countRejectableMoves(byId('1.1-05'))).toBeGreaterThan(0);
    expect(countRejectableMoves(byId('1.1-01'))).toBe(0);
  });
});

describe('@learn-checker-2 the checker catches broken exercises', () => {
  it('flags an unsolvable puzzle', () => {
    const broken = { ...byId('1.4-02'), setup: { ...byId('1.4-02').setup, o: { life: 40, bf: ['wall_of_wood'] } } };
    expect(checksFired(broken)).toContain('solvable');
  });

  it('flags a puzzle where every legal line wins', () => {
    const broken: EngineExercise = {
      ...byId('1.4-02'),
      setup: { phase: 'COMBAT_ATTACKERS', p: { bf: ['craw_wurm', 'hill_giant'] }, o: { life: 1, bf: [] } },
      solutions: [[{ type: 'ATTACK', attackers: ['p-bf-0'] }]] as any,
    };
    expect(checksFired(broken)).toContain('discriminating');
  });

  it('flags a winning attacker set that the solutions list omits', () => {
    // Air Elemental alone wins and is listed; dropping that entry must be caught.
    const ex = byId('1.4-01');
    const broken: EngineExercise = { ...ex, solutions: [ex.solutions[1]] };
    expect(checksFired(broken)).toContain('complete');
  });

  it('flags a skill tag with no theme check', () => {
    const broken = { ...byId('1.4-02'), skill: 'not-a-real-skill' };
    expect(checksFired(broken)).toContain('theme');
  });

  it('flags a lethal-evasion puzzle whose winning line needs no evasion', () => {
    // Same board tagged as evasion, but the win comes from raw numbers.
    const broken: EngineExercise = {
      ...byId('1.4-01'),
      skill: 'lethal-evasion',
      setup: { phase: 'COMBAT_ATTACKERS', p: { bf: ['craw_wurm', 'hill_giant'] }, o: { life: 3, bf: ['wall_of_wood'] } },
      solutions: [{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1'] }].map(s => [s]) as any,
    };
    expect(checksFired(broken)).toContain('theme');
  });

  it('flags a lethal-outnumber puzzle won without outnumbering', () => {
    const broken: EngineExercise = {
      ...byId('1.4-02'),
      skill: 'lethal-outnumber',
      setup: { phase: 'COMBAT_ATTACKERS', p: { bf: ['air_elemental'] }, o: { life: 3, bf: ['scathe_zombies'] } },
      solutions: [[{ type: 'ATTACK', attackers: ['p-bf-0'] }]] as any,
    };
    expect(checksFired(broken)).toContain('theme');
  });

  it('flags a summoning-sickness puzzle where the sickness changes nothing', () => {
    // Hill Giant is sick, but healing it opens no new winning set because the
    // two healthy creatures are already exactly lethal and adding the Giant
    // only makes the same attack bigger.
    const broken: EngineExercise = {
      ...byId('1.4-04'),
      setup: { phase: 'COMBAT_ATTACKERS', p: { bf: ['grizzly_bears', 'gray_ogre'] }, o: { life: 4, bf: [] } },
      solutions: [[{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1'] }]] as any,
    };
    expect(checksFired(broken)).toContain('theme');
  });

  it('flags a land-per-turn puzzle winnable without the land drop', () => {
    const broken: EngineExercise = {
      ...byId('1.1-05'),
      setup: { phase: 'MAIN_1', p: { bf: ['forest', 'forest'], hand: ['forest', 'grizzly_bears'] }, o: { bf: [] } },
      solutions: [[{ type: 'TAP_LAND', iid: 'p-bf-0' }, { type: 'TAP_LAND', iid: 'p-bf-1' }, { type: 'CAST_SPELL', iid: 'p-hand-1' }]] as any,
    };
    expect(checksFired(broken)).toContain('theme');
  });

  it('flags a read-costs multiSelect where nothing is excluded', () => {
    const ex = ALL.find(e => e.id === '1.1-04') as any;
    const broken = { ...ex, options: [...ex.answer], answer: [...ex.answer] };
    expect(checksFired(broken)).toContain('theme');
  });
});
