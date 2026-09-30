// src/learn/engine/puzzleChecker.ts
// Authoring checks for Learn Mode exercises. Pure functions, no I/O.
// Imports only from ./types and ./puzzleRunner -- never from src/engine or src/data.
// Every check answers one question about an exercise BEFORE it ships:
//   solvable        does a listed solution reach the goal
//   complete        are all winning lines listed
//   discriminating  does at least one legal line fail
//   themed          does the tagged skill actually decide the outcome
//   phantom-free    do prompt/hint/explanation only name cards in the puzzle
//   division-invariant  (blocking) can the grade depend on how an attacker
//                   divides its damage among two or more blockers

import {
  buildPuzzleState,
  tryAction,
  canAttackReason,
  resolveAttack,
  resolveBlocks,
  declareBlocks,
  blockChoices,
  divisionInfo,
  achievableDeathSets,
  checkGoal,
  cardInfo,
  castableWith,
} from './puzzleRunner';
import { MSG, MAX_BLOCK_OUTCOMES } from './puzzleRunner';
import type { BlockPair, EngineExercise, Exercise, Goal, MultiSelectExercise, Step } from './types';

export const MAX_SEARCH_NODES = 20000;
export const MAX_SEARCH_DEPTH = 6;
export const MAX_ENUM_ATTACKERS = 8;

export type Finding = { exerciseId: string; check: string; severity: 'error' | 'warn'; detail: string };

// Blocking lines also carry the board with the blocks declared (before damage)
// and after combat, so the division gate and the theme checks read the same
// states the grade came from.
export type Line = { steps: Step[]; wins: boolean; declared?: any; final?: any };

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

// Every TAP_LAND step a land offers. A basic makes one colour so this is one
// step; a dual makes two, and both must be explored or half the search space is
// invisible to the checker.
function tapStepsFor(land: any): Step[] {
  const produces: string[] = land.produces ?? [];
  if (produces.length <= 1) return [{ type: 'TAP_LAND', iid: land.iid } as Step];
  return produces.map(color => ({ type: 'TAP_LAND', iid: land.iid, color }) as Step);
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
        ...node.state.p.bf.filter((c: any) => !c.tapped).flatMap(tapStepsFor),
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

// Every block assignment, graded. Opponent-attacks exercises only. Each
// untapped player creature chooses "no block" or one attacker it can legally
// block; the product is capped at MAX_BLOCK_OUTCOMES, the same cap the
// defender-side analysis in gradeBestDefense uses, since it bounds the same
// kind of product.
export function enumerateBlocks(ex: EngineExercise): Line[] {
  const base = buildPuzzleState(ex.setup);
  const choices = blockChoices(base).map(c => [null, ...c.attackers.map(a => ({ blockerIid: c.blockerIid, attackerIid: a }))]);
  const total = choices.reduce((n, c) => n * c.length, 1);
  if (total > MAX_BLOCK_OUTCOMES) throw new Error(`LEARN_CHECK_TOO_MANY_BLOCK_LINES: ${ex.id} has ${total}`);
  let combos: BlockPair[][] = [[]];
  for (const c of choices) combos = combos.flatMap(prev => c.map(x => (x ? [...prev, x] : prev)));
  return combos.map(blocks => {
    const declared = declareBlocks(base, blocks);
    const r = resolveBlocks(base, blocks);
    if (!declared.ok || !r.ok) throw new Error(`LEARN_CHECK_BLOCK_REFUSED: ${ex.id} ${JSON.stringify(blocks)}`);
    return {
      steps: [{ type: 'BLOCK', blocks }] as Step[],
      wins: checkGoal(r.finalState, ex.goal),
      declared: declared.state,
      final: r.finalState,
    };
  });
}

export function enumerateLines(ex: EngineExercise): Line[] {
  switch (ex.setup.phase) {
    case 'COMBAT_ATTACKERS': return enumerateAttacks(ex);
    case 'COMBAT_BLOCKERS': return enumerateBlocks(ex);
    default: return enumerateMainLines(ex);
  }
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
        ...state.p.bf.filter((c: any) => !c.tapped).flatMap(tapStepsFor),
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

function blocksOf(steps: Step[]): BlockPair[] {
  const b = steps.find(s => s.type === 'BLOCK');
  return b && b.type === 'BLOCK' ? b.blocks : [];
}

const pairKey = (b: BlockPair) => `${b.blockerIid}>${b.attackerIid}`;
const blockSetKey = (blocks: BlockPair[]) => blocks.map(pairKey).sort().join(',');

// Attacker iid -> the blocker iids on it, for one line.
function blockersByAttacker(blocks: BlockPair[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const b of blocks) m.set(b.attackerIid, [...(m.get(b.attackerIid) ?? []), b.blockerIid]);
  return m;
}

// --- DIVISION GATE -------------------------------------------------------------
// CR 510.1c lets the attacking player divide a multi-blocked creature's damage
// as they like. DuelCore picks one fixed division (lethal-then-remainder), so a
// grade is only safe when every legal division gives the same answer. The gate
// works per blocker: a blocker's fate is forced when it is in every achievable
// death set or in none. A goal naming a blocker whose fate is not forced is an
// error. Goals about the attacker, the player, or life do not depend on the
// division, since nothing allowed in this slice tramples.

function goalCreatureIids(goal: Goal): string[] {
  if (goal.kind === 'ALL_OF') return goal.goals.flatMap(goalCreatureIids);
  if (goal.kind === 'CREATURE_DIES' || goal.kind === 'CREATURE_SURVIVES') return [goal.iid];
  return [];
}

// For one multi-blocked attacker on a declared board: which blockers must die,
// which must survive, and which the attacker's controller gets to decide.
export function forcedFates(declared: any, attackerIid: string): { dies: string[]; survives: string[]; open: string[]; modifiers: string[]; sets: string[][] } {
  const info = divisionInfo(declared, attackerIid);
  const sets = achievableDeathSets(info.power, info.blockers);
  const dies: string[] = [];
  const survives: string[] = [];
  const open: string[] = [];
  for (const b of info.blockers) {
    const n = sets.filter(set => set.includes(b.iid)).length;
    if (n === sets.length) dies.push(b.iid);
    else if (n === 0) survives.push(b.iid);
    else open.push(b.iid);
  }
  return { dies, survives, open, modifiers: info.modifiers, sets };
}

export function divisionFindings(ex: EngineExercise, lines: Line[]): string[] {
  const named = new Set(goalCreatureIids(ex.goal));
  const out = new Set<string>();
  for (const line of lines) {
    if (!line.declared) continue;
    for (const [att, bls] of blockersByAttacker(blocksOf(line.steps))) {
      if (bls.length < 2) continue;
      const f = forcedFates(line.declared, att);
      if (f.modifiers.length) {
        out.add(`${att} blocked by ${bls.join(' + ')}: ${f.modifiers.join('; ')}. The division arithmetic only models plain damage.`);
        continue;
      }
      for (const iid of f.open) {
        if (named.has(iid)) out.add(`the goal names ${iid}, but when ${bls.join(' + ')} block ${att} its fate depends on how the attacker divides its damage`);
      }
    }
  }
  return [...out];
}

// Whether a blocker in this line dies. A single blocker's fate is the engine's;
// a multi-blocked one counts as dying only when every legal division kills it.
function blockerDies(line: Line, pair: BlockPair): boolean {
  const on = blockersByAttacker(blocksOf(line.steps)).get(pair.attackerIid) ?? [];
  if (on.length < 2) return !line.final.p.bf.some((c: any) => c.iid === pair.blockerIid);
  return forcedFates(line.declared, pair.attackerIid).dies.includes(pair.blockerIid);
}

const attackerDies = (line: Line, iid: string) => !line.final.o.bf.some((c: any) => c.iid === iid);

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
  // Noncreature permanents are the point, so the goal card must not be a
  // creature. Guards against an "artifacts are spells too" exercise that
  // quietly casts a creature.
  'cast-noncreature': (ex) => {
    if (ex.goal.kind !== 'CARD_ON_BATTLEFIELD') return 'goal is not CARD_ON_BATTLEFIELD';
    const type = cardInfo(ex.goal.cardId).type ?? '';
    return /Creature/.test(type) ? `the goal card is a ${type}, so nothing here is a noncreature spell` : null;
  },
  // Exact mana means no spare: every land on the battlefield must be tapped in
  // every winning line. One untapped land left over and the lesson is gone.
  'pay-exact-mana': (ex, winning) => {
    const untapped = (ex.setup.p.bf ?? []).filter(c => typeof c === 'string' || !c.tapped).length;
    if (!untapped) return 'no untapped lands in the setup';
    const short = winning.find(l => l.steps.filter(s => s.type === 'TAP_LAND').length < untapped);
    return short ? `a winning line taps only ${short.steps.filter(s => s.type === 'TAP_LAND').length} of ${untapped} lands, so the mana is not exact` : null;
  },
  // There must be a real alternative: another spell in hand that the player can
  // afford right now. Without one there is no choice, only a single play.
  'choose-what-to-cast': (ex) => {
    if (ex.goal.kind !== 'CARD_ON_BATTLEFIELD') return 'goal is not CARD_ON_BATTLEFIELD';
    const lands = (ex.setup.p.bf ?? []).map(c => (typeof c === 'string' ? c : c.id));
    const others = (ex.setup.p.hand ?? [])
      .map(c => (typeof c === 'string' ? c : c.id))
      .filter(id => id !== ex.goal.cardId && !/Land/.test(cardInfo(id).type));
    if (!others.length) return 'nothing else in hand, so there is no choice to make';
    return others.some(id => castableWith(lands, id)) ? null : 'no alternative in hand is affordable, so there is no choice to make';
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
  // A defender on your own board must be the reason the sum is tight. Two
  // conditions: some creature is barred from attacking for a reason that is
  // neither tapping nor sickness (which is what defender looks like from here),
  // and every winning set uses every legal attacker, so its absence is felt.
  'defender-cant-attack': (ex, winning) => {
    const base = buildPuzzleState(ex.setup);
    const specs = ex.setup.p.bf ?? [];
    const barred = base.p.bf.filter((c: any, i: number) => {
      const spec = specs[i];
      const tagged = typeof spec === 'string' ? {} : spec;
      if (tagged.tapped || tagged.summoningSick) return false;
      return canAttackReason(base, c.iid) !== null;
    });
    if (!barred.length) return 'no untapped, non-sick creature is barred from attacking, so there is no defender lesson here';
    const legal = base.p.bf.filter((c: any) => canAttackReason(base, c.iid) === null).map((c: any) => c.iid);
    const usesAll = winning.every(l => (attackersOf(l.steps) ?? []).length === legal.length);
    return usesAll ? null : 'a winning set leaves a legal attacker home, so the defender was never the constraint';
  },
  // Same shape, keyed on the tapped flag in the setup rather than on the
  // rejection reason, and with the same no-slack requirement.
  'tapped-cant-attack': (ex, winning) => {
    const specs = ex.setup.p.bf ?? [];
    if (!specs.some(c => typeof c !== 'string' && c.tapped)) return 'no tapped creature in the setup';
    const base = buildPuzzleState(ex.setup);
    const legal = base.p.bf.filter((c: any) => canAttackReason(base, c.iid) === null).map((c: any) => c.iid);
    const usesAll = winning.every(l => (attackersOf(l.steps) ?? []).length === legal.length);
    return usesAll ? null : 'a winning set leaves a legal attacker home, so the tapped creature was never the constraint';
  },
  // The tap must be load-bearing: untapping their blockers must close at least
  // one winning line. Same removal trick summoning-sickness uses, applied to the
  // opponent's side.
  'lethal-tapped-defender': (ex, winning) => {
    const specs = ex.setup.o.bf ?? [];
    if (!specs.some(c => typeof c !== 'string' && c.tapped)) return 'no tapped creature on the opponent side';
    const woken: EngineExercise = {
      ...ex,
      setup: { ...ex.setup, o: { ...ex.setup.o, bf: specs.map(c => (typeof c === 'string' ? c : { ...c, tapped: false })) } },
    };
    const wokenWins = enumerateLines(woken).filter(l => l.wins).length;
    return wokenWins < winning.length ? null : 'untapping their creatures removes no winning line, so the tap never mattered';
  },
  // The lesson is that flying stops being evasion when they fly too. Counted
  // through resolveAttack's outcome count rather than by reading keywords:
  // attacking alone with one creature, every defender that can block it doubles
  // the number of legal assignments, so log2(outcomes) is how many can block it.
  // Some attacker must be blockable by some defenders and not others (that is
  // the flyer meeting their flyer), and none may be unblockable outright --
  // an unblockable attacker would make this a lethal-evasion puzzle instead.
  'lethal-flying-defender': (ex) => {
    const base = buildPuzzleState(ex.setup);
    const defenders = base.o.bf.filter((c: any) => !c.tapped);
    if (defenders.length < 2) return 'needs at least two untapped defenders, or partial blocking cannot arise';
    const blockerCount = (iid: string) => {
      const r = resolveAttack(base, [iid]);
      return r.ok ? Math.round(Math.log2(r.outcomes)) : -1;
    };
    const counts = base.p.bf.map((c: any) => blockerCount(c.iid));
    if (counts.some((n: number) => n === 0)) return 'an attacker is unblockable by every defender, which makes this an evasion puzzle, not a flying-defender one';
    return counts.some((n: number) => n > 0 && n < defenders.length)
      ? null
      : 'no attacker is blockable by some defenders and not others, so their flyer is not the lesson';
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

// --- BLOCKING THEMES (L5 slice 1) --------------------------------------------

// Registered into THEME_CHECKS below. Each takes every line, not just winners,
// because blocking themes are about which families of blocks win and lose.
type BlockTheme = (ex: EngineExercise, winning: Line[], all: Line[]) => string | null;

const BLOCK_THEMES: Record<string, BlockTheme> = {
  // Adjusted from the drafted intent ("every winning line uses exactly one
  // blocker"). Every combat goal in this slice is monotone in extra blockers
  // unless it names a blocker whose fate the division decides, which the
  // division gate refuses. So once two creatures can block the same attacker,
  // adding the second to a winning single block always wins too. The check
  // instead pins the choice itself: one specific block is in every winning
  // line, and some other single block loses.
  'choose-a-blocker': (ex, winning, all) => {
    if (ex.setup.phase !== 'COMBAT_BLOCKERS') return 'not a blocking exercise';
    const base = buildPuzzleState(ex.setup);
    const counts = new Map<string, number>();
    for (const c of blockChoices(base)) for (const a of c.attackers) counts.set(a, (counts.get(a) ?? 0) + 1);
    if (![...counts.values()].some(n => n >= 2)) return 'no attacker can be blocked by two different creatures, so there is no choice of blocker';
    const singles = all.filter(l => blocksOf(l.steps).length === 1);
    if (!singles.some(l => l.wins)) return 'no single block wins';
    if (!singles.some(l => !l.wins)) return 'every single block wins, so the choice of blocker never matters';
    const common = winning
      .map(l => new Set(blocksOf(l.steps).map(pairKey)))
      .reduce((acc, set) => new Set([...acc].filter(k => set.has(k))));
    return common.size ? null : 'the winning lines share no block, so no one blocker is the right choice';
  },
  'chump-block': (ex, winning, all) => {
    if (ex.setup.phase !== 'COMBAT_BLOCKERS') return 'not a blocking exercise';
    const none = all.find(l => blocksOf(l.steps).length === 0);
    if (!none || none.wins) return 'not blocking wins, so there is nothing to chump for';
    if (none.final.p.life > 0) return 'not blocking loses, but not by the player dying';
    const chumps = (l: Line) => blocksOf(l.steps).some(b => blockerDies(l, b));
    return winning.every(chumps) ? null : 'a winning line loses no blocker, so nothing is chumped';
  },
  'double-block': (ex, winning, all) => {
    if (ex.setup.phase !== 'COMBAT_BLOCKERS') return 'not a blocking exercise';
    const doubled = (l: Line) => [...blockersByAttacker(blocksOf(l.steps)).values()].some(b => b.length >= 2);
    if (!winning.every(doubled)) return 'a winning line never puts two blockers on one attacker';
    if (all.some(l => !doubled(l) && l.wins)) return 'a line with at most one blocker per attacker wins, so the double block is not needed';
    // The division gate runs on every exercise; checkExercise reports it.
    return null;
  },
  'trade-or-take': (ex, winning, all) => {
    if (ex.setup.phase !== 'COMBAT_BLOCKERS') return 'not a blocking exercise';
    const take = all.find(l => blocksOf(l.steps).length === 0);
    const trades = all.filter(l => blocksOf(l.steps).some(b => blockerDies(l, b) && attackerDies(l, b.attackerIid)));
    if (!take) return 'no take-the-damage line';
    if (!trades.length) return 'no block trades a creature for the attacker';
    const tradeWins = trades.some(l => l.wins);
    if (tradeWins === take.wins) return tradeWins ? 'both trading and taking the damage win' : 'neither trading nor taking the damage wins';
    void winning;
    return null;
  },
};

for (const [skill, check] of Object.entries(BLOCK_THEMES)) {
  THEME_CHECKS[skill] = (ex, winning) => check(ex, winning, enumerateLines(ex));
}

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

  // Before solvability: on a board that fails the gate, which lines "win" is
  // the engine's one division, not the rules', so no later check is trustworthy.
  if (ex.setup.phase === 'COMBAT_BLOCKERS') {
    for (const why of divisionFindings(ex, lines)) add('division-invariant', 'error', why);
  }

  const winning = lines.filter(l => l.wins);
  if (!winning.length) { add('solvable', 'error', 'no legal line reaches the goal'); return f; }
  const losing = lines.length - winning.length;
  const combat = ex.setup.phase === 'COMBAT_ATTACKERS' || ex.setup.phase === 'COMBAT_BLOCKERS';
  const rejectable = combat ? 0 : countRejectableMoves(ex);
  if (losing === 0 && rejectable === 0) {
    add('discriminating', isGuided(ex) ? 'warn' : 'error', 'no legal line loses and no move is rejected, so the exercise tests nothing');
  }

  if (ex.setup.phase === 'COMBAT_BLOCKERS') {
    // Order-insensitive, like attacker sets: a line is its set of pairs.
    const listed = new Set(ex.solutions.map(s => blockSetKey(blocksOf(s))));
    for (const w of winning) {
      const key = blockSetKey(blocksOf(w.steps));
      if (!listed.has(key)) add('complete', 'error', `winning block set not listed in solutions: [${key}]`);
    }
    const found = new Set(winning.map(w => blockSetKey(blocksOf(w.steps))));
    for (const key of listed) if (!found.has(key)) add('complete', 'error', `listed solution is not a winning block set: [${key}]`);
  } else if (ex.setup.phase === 'COMBAT_ATTACKERS') {
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
