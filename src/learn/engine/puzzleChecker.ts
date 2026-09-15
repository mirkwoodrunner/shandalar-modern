// src/learn/engine/puzzleChecker.ts
// Authoring checks for Learn Mode exercises. Pure functions, no I/O.
// Imports only from ./types and ./puzzleRunner -- never from src/engine or src/data.
// Every check answers one question about an exercise BEFORE it ships:
//   solvable        does a listed solution reach the goal
//   complete        are all winning lines listed
//   discriminating  does at least one legal line fail
//   themed          does the tagged skill actually decide the outcome
//   phantom-free    do prompt/hint/explanation only name cards in the puzzle

import {
  buildPuzzleState,
  tryAction,
  canAttackReason,
  resolveAttack,
  checkGoal,
  cardInfo,
  castableWith,
} from './puzzleRunner';
import { MSG } from './puzzleRunner';
import type { EngineExercise, Exercise, MultiSelectExercise, Step } from './types';

export const MAX_SEARCH_NODES = 20000;
export const MAX_SEARCH_DEPTH = 6;
export const MAX_ENUM_ATTACKERS = 8;

export type Finding = { exerciseId: string; check: string; severity: 'error' | 'warn'; detail: string };

export type Line = { steps: Step[]; wins: boolean };

// A main-phase exercise where every legal line wins is a guided first step,
// not a broken puzzle. Data marks those with guided: true.
const isGuided = (ex: EngineExercise) => (ex as any).guided === true;

// Generic cost may be multi-digit ("10"). Parse the leading digit run as one
// number, then add 1 per remaining (colored) symbol. Do not sum characters
// individually -- that undercounts any cost with generic mana >= 10.
function calcCmc(cost: string): number {
  const m = cost.match(/^\d+/);
  const generic = m ? Number(m[0]) : 0;
  const pips = cost.slice(m ? m[0].length : 0).length;
  return generic + pips;
}

// --- LINE ENUMERATION --------------------------------------------------------

function stateKey(s: any): string {
  const zone = (cs: any[]) => cs.map(c => `${c.iid}${c.tapped ? 'T' : ''}`).join(',');
  const mana = ['W', 'U', 'B', 'R', 'G', 'C'].map(k => s.p.mana[k] ?? 0).join('');
  return `${zone(s.p.bf)}|${zone(s.p.hand)}|${mana}|${s.landsPlayed}`;
}

function subsets<T>(items: T[]): T[][] {
  return items.reduce<T[][]>((acc, item) => [...acc, ...acc.map(s => [...s, item])], [[]]);
}

// Every legal attacker set, graded. Combat exercises only.
export function enumerateAttacks(ex: EngineExercise): Line[] {
  const base = buildPuzzleState(ex.setup);
  const legal = base.p.bf.filter((c: any) => canAttackReason(base, c.iid) === null).map((c: any) => c.iid);
  if (legal.length > MAX_ENUM_ATTACKERS) throw new Error(`LEARN_CHECK_TOO_MANY_ATTACKERS: ${ex.id} has ${legal.length}`);
  return subsets(legal)
    .filter(set => set.length > 0)
    .map(set => {
      const r = resolveAttack(base, set);
      return { steps: [{ type: 'ATTACK', attackers: set }] as Step[], wins: r.ok && r.lethal };
    });
}

// Breadth-first search over legal non-combat actions. Main-phase exercises only.
// UNDO_MANA_TAPS is deliberately excluded from the search: it makes every state
// recoverable, so including it would erase every dead end.
// A line is terminal and losing when no legal action remains, or when the depth
// cap is reached without meeting the goal.
export function enumerateMainLines(ex: EngineExercise): Line[] {
  const start = buildPuzzleState(ex.setup);
  const out: Line[] = [];
  const seen = new Set<string>([stateKey(start)]);
  let frontier: { state: any; steps: Step[] }[] = [{ state: start, steps: [] }];
  let nodes = 0;

  for (let depth = 0; depth < MAX_SEARCH_DEPTH && frontier.length; depth++) {
    const next: { state: any; steps: Step[] }[] = [];
    for (const node of frontier) {
      const candidates: Step[] = [
        ...node.state.p.bf.filter((c: any) => !c.tapped).map((c: any) => ({ type: 'TAP_LAND', iid: c.iid }) as Step),
        ...node.state.p.hand.map((c: any) => ({ type: 'PLAY_LAND', iid: c.iid }) as Step),
        ...node.state.p.hand.map((c: any) => ({ type: 'CAST_SPELL', iid: c.iid }) as Step),
      ];
      let advanced = 0;
      for (const step of candidates) {
        if (++nodes > MAX_SEARCH_NODES) throw new Error(`LEARN_CHECK_SEARCH_BLOWUP: ${ex.id}`);
        const r = tryAction(node.state, step as any, ex.allowed);
        if (!r.ok) continue;
        advanced++;
        const steps = [...node.steps, step];
        if (checkGoal(r.state, ex.goal)) { out.push({ steps, wins: true }); continue; }
        const key = stateKey(r.state);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ state: r.state, steps });
      }
      // Dead end: legal moves exhausted with the goal unmet.
      if (advanced === 0 && node.steps.length > 0) out.push({ steps: node.steps, wins: false });
    }
    frontier = next;
  }
  // Depth cap reached with the goal unmet.
  for (const node of frontier) out.push({ steps: node.steps, wins: false });
  return out;
}

export function enumerateLines(ex: EngineExercise): Line[] {
  return ex.setup.phase === 'COMBAT_ATTACKERS' ? enumerateAttacks(ex) : enumerateMainLines(ex);
}

// A main-phase exercise discriminates when the player can make a move the UI
// offers and the runner rejects on rules grounds -- casting before paying, a
// second land drop. Dead ends alone miss this, because tapping one more land
// is usually still available. NOT_IN_LESSON rejections do not count: those are
// lesson scoping, not a rules mistake.
export function countRejectableMoves(ex: EngineExercise): number {
  const start = buildPuzzleState(ex.setup);
  const seen = new Set<string>([stateKey(start)]);
  let frontier = [start];
  let rejections = 0;
  let nodes = 0;

  for (let depth = 0; depth < MAX_SEARCH_DEPTH && frontier.length; depth++) {
    const next: any[] = [];
    for (const state of frontier) {
      const candidates: Step[] = [
        ...state.p.bf.filter((c: any) => !c.tapped).map((c: any) => ({ type: 'TAP_LAND', iid: c.iid }) as Step),
        ...state.p.hand.map((c: any) => ({ type: 'PLAY_LAND', iid: c.iid }) as Step),
        ...state.p.hand.map((c: any) => ({ type: 'CAST_SPELL', iid: c.iid }) as Step),
      ];
      for (const step of candidates) {
        if (++nodes > MAX_SEARCH_NODES) throw new Error(`LEARN_CHECK_SEARCH_BLOWUP: ${ex.id}`);
        const r = tryAction(state, step as any, ex.allowed);
        if (!r.ok) { if (r.reason !== MSG.NOT_IN_LESSON) rejections++; continue; }
        if (checkGoal(r.state, ex.goal)) continue;
        const key = stateKey(r.state);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(r.state);
      }
    }
    frontier = next;
  }
  return rejections;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

function attackersOf(steps: Step[]): string[] | null {
  const a = steps.find(s => s.type === 'ATTACK');
  return a && a.type === 'ATTACK' ? a.attackers : null;
}

// --- THEME CHECKS ------------------------------------------------------------
// One entry per skill tag. A skill with no entry is an error, so new content
// cannot ship a tag whose theme nothing verifies.

type ThemeCheck = (ex: EngineExercise, winning: Line[]) => string | null;

export const THEME_CHECKS: Record<string, ThemeCheck> = {
  'tap-for-mana': (ex, winning) => {
    if (ex.goal.kind !== 'MANA_IN_POOL') return 'goal is not MANA_IN_POOL';
    return winning.every(l => l.steps.every(s => s.type === 'TAP_LAND')) ? null : 'a winning line does something other than tapping lands';
  },
  'cast-creature': (ex, winning) => {
    if (ex.goal.kind !== 'CARD_ON_BATTLEFIELD') return 'goal is not CARD_ON_BATTLEFIELD';
    return winning.every(l => l.steps.some(s => s.type === 'CAST_SPELL')) ? null : 'a winning line never casts a spell';
  },
  // The point is that colors matter, so some land set with enough total mana
  // must still be unable to pay.
  'colored-vs-generic': (ex) => {
    if (ex.goal.kind !== 'CARD_ON_BATTLEFIELD') return 'goal is not CARD_ON_BATTLEFIELD';
    const target = cardInfo(ex.goal.cardId);
    const lands = (ex.setup.p.bf ?? []).map(c => (typeof c === 'string' ? c : c.id));
    const cmc = calcCmc(target.cost);
    const wrongColorSet = subsets(lands).some(set => set.length >= cmc && !castableWith(set, ex.goal.kind === 'CARD_ON_BATTLEFIELD' ? ex.goal.cardId : ''));
    return wrongColorSet ? null : 'every land set with enough total mana can also pay the colors, so color never matters';
  },
  // The land drop must be load-bearing: no line wins without one.
  'land-per-turn': (_ex, winning) =>
    winning.every(l => l.steps.some(s => s.type === 'PLAY_LAND')) ? null : 'a winning line never plays a land, so the land drop is not required',
  // Evasion decides it: every winning set includes a creature some untapped
  // defender cannot block.
  'lethal-evasion': (ex, winning) => {
    const base = buildPuzzleState(ex.setup);
    const defenders = base.o.bf.filter((c: any) => !c.tapped);
    if (!defenders.length) return 'no defenders, so evasion cannot be the lesson';
    const evasive = (iid: string) => {
      const r = resolveAttack(base, [iid]);
      return r.ok && r.outcomes >= 1 && r.worstCase.blocks.length === 0;
    };
    return winning.every(l => (attackersOf(l.steps) ?? []).some(evasive)) ? null : 'a winning line uses no unblockable attacker';
  },
  // Numbers decide it: every winning set sends more attackers than they have
  // untapped blockers.
  'lethal-outnumber': (ex, winning) => {
    const base = buildPuzzleState(ex.setup);
    const blockerCount = base.o.bf.filter((c: any) => !c.tapped).length;
    if (!blockerCount) return 'no untapped defenders, so outnumbering is not the lesson';
    return winning.every(l => (attackersOf(l.steps) ?? []).length > blockerCount) ? null : 'a winning line does not outnumber the blockers';
  },
  // Sickness must be load-bearing: healing it must open a new winning set.
  'summoning-sickness': (ex, winning) => {
    const specs = ex.setup.p.bf ?? [];
    if (!specs.some(c => typeof c !== 'string' && c.summoningSick)) return 'no summoning-sick creature in the setup';
    const healed: EngineExercise = {
      ...ex,
      setup: { ...ex.setup, p: { ...ex.setup.p, bf: specs.map(c => (typeof c === 'string' ? c : { ...c, summoningSick: false })) } },
    };
    const healedWins = enumerateLines(healed).filter(l => l.wins).length;
    return healedWins > winning.length ? null : 'removing summoning sickness opens no new winning line, so it never mattered';
  },
};

export const MULTI_THEME_CHECKS: Record<string, (ex: MultiSelectExercise) => string | null> = {
  'read-costs': ex => {
    const excluded = ex.options.filter(id => !ex.answer.includes(id));
    if (!excluded.length) return 'every option is castable, so there is nothing to discriminate';
    if (!ex.answer.length) return 'no option is castable';
    const total = ex.lands.length;
    const byColor = excluded.some(id => calcCmc(cardInfo(id).cost) <= total);
    const byAmount = excluded.some(id => calcCmc(cardInfo(id).cost) > total);
    return byColor && byAmount ? null : 'excluded options must include one that fails on color and one that fails on total mana';
  },
};

// --- WHOLE-EXERCISE CHECK ----------------------------------------------------

export function checkExercise(ex: Exercise): Finding[] {
  const f: Finding[] = [];
  const add = (check: string, severity: 'error' | 'warn', detail: string) => f.push({ exerciseId: ex.id, check, severity, detail });

  if (ex.kind === 'multiSelect') {
    const themed = MULTI_THEME_CHECKS[ex.skill];
    if (!themed) add('theme', 'error', `no theme check defined for skill "${ex.skill}"`);
    else { const why = themed(ex); if (why) add('theme', 'error', why); }
    return f;
  }

  let lines: Line[];
  try { lines = enumerateLines(ex); }
  catch (e: any) { add('enumerate', 'error', e.message); return f; }

  const winning = lines.filter(l => l.wins);
  if (!winning.length) { add('solvable', 'error', 'no legal line reaches the goal'); return f; }
  const losing = lines.length - winning.length;
  const rejectable = ex.setup.phase === 'COMBAT_ATTACKERS' ? 0 : countRejectableMoves(ex);
  if (losing === 0 && rejectable === 0) {
    add('discriminating', isGuided(ex) ? 'warn' : 'error', 'no legal line loses and no move is rejected, so the exercise tests nothing');
  }

  if (ex.setup.phase === 'COMBAT_ATTACKERS') {
    const listed = ex.solutions.map(s => attackersOf(s) ?? []);
    for (const w of winning) {
      const set = attackersOf(w.steps) ?? [];
      if (!listed.some(l => sameSet(l, set))) {
        add('complete', 'error', `winning attacker set not listed in solutions: [${set.join(', ')}]`);
      }
    }
  } else {
    // Main phase. Steps commute (tap order does not matter), so compare as
    // multisets of action+iid rather than as ordered arrays.
    const bag = (steps: Step[]) => steps.map(s => `${s.type}:${(s as any).iid ?? ''}`).sort().join('|');
    const found = new Set(winning.map(w => bag(w.steps)));
    for (const sol of ex.solutions) {
      if (!found.has(bag(sol))) add('complete', 'error', `listed solution is not a winning line the search found: ${bag(sol)}`);
    }
    const shortest = Math.min(...winning.map(w => w.steps.length));
    const listedShortest = Math.min(...ex.solutions.map(s => s.length));
    if (listedShortest > shortest) add('complete', 'warn', `search found a ${shortest}-step win but the shortest listed solution is ${listedShortest} steps`);
  }

  const themed = THEME_CHECKS[ex.skill];
  if (!themed) add('theme', 'error', `no theme check defined for skill "${ex.skill}"`);
  else { const why = themed(ex, winning); if (why) add('theme', 'error', why); }

  return f;
}

export function checkAll(exercises: Exercise[]): Finding[] {
  return exercises.flatMap(checkExercise);
}
