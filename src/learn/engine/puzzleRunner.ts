// src/learn/engine/puzzleRunner.ts
// Learn Mode puzzle runner. Pure functions only.
// The ONLY module under src/learn/ allowed to import from src/engine/ or src/data/.
// Never mutates GameState directly. Every state change goes through duelReducer.
// No Math.random() here. Card iids are assigned deterministically by buildPuzzleState.

import {
  duelReducer,
  buildDuelState,
  makeCardInstance,
  canPay,
  canBlockDuel,
  checkWinConditions,
  getBF,
  isCre,
  isLand,
  hasKw,
} from '../../engine/DuelCore.js';
import { RULESETS } from '../../data/rulesets.js';
import KEYWORDS from '../../data/keywords.js';
import type {
  ActionKind,
  ActionResult,
  AttackResult,
  BlockPair,
  CardSpec,
  EngineExercise,
  Goal,
  PuzzleSetup,
  Step,
} from './types';

export const MSG = {
  NOT_IN_LESSON: "That isn't part of this lesson.",
  LAND_LIMIT: 'You can only play one land each turn.',
  LAND_TAPPED: 'That land is already tapped.',
  GENERIC: "That doesn't work right now.",
  noMana: (name: string, cost: string) => `Not enough of the right mana. ${name} costs ${cost}.`,
  sick: (name: string) => `${name} came into play this turn. It can't attack yet.`,
  tappedAttacker: (name: string) => `${name} is tapped. It can't attack.`,
  cantAttack: (name: string) => `${name} can't attack.`,
  wrongColor: (name: string, color: string) => `${name} can't make ${color} mana.`,
  needsTarget: (name: string) => `${name} needs a target. Choose one.`,
};

// A spell that must be pointed at something before it does anything. Scoped to
// instants and sorceries on purpose: permanents in this pool are cast without a
// target even when their rules text says "target" -- a Circle of Protection's
// activated ability targets, its casting does not.
function needsTargetOnCast(card: any): boolean {
  const type: string = card.type ?? '';
  if (!/^(Instant|Sorcery)$/.test(type)) return false;
  return /\btarget\b/i.test(card.text ?? '');
}

export const MAX_BLOCK_OUTCOMES = 5000;
const MAX_RESOLVE_STACK = 5;
const MAX_ADVANCE = 6;

const STEP_KIND: Record<Step['type'], ActionKind> = {
  TAP_LAND: 'TAP_LAND',
  PLAY_LAND: 'PLAY_LAND',
  CAST_SPELL: 'CAST_SPELL',
  UNDO_MANA_TAPS: 'UNDO_MANA_TAPS',
  ATTACK: 'DECLARE_ATTACKER',
};

function toSpec(spec: CardSpec): { id: string; tapped?: boolean; summoningSick?: boolean } {
  return typeof spec === 'string' ? { id: spec } : spec;
}

function instance(spec: CardSpec, side: 'p' | 'o', zone: 'hand' | 'bf', index: number, ts: number) {
  const s = toSpec(spec);
  const base = makeCardInstance(s.id, side);
  if (!base) throw new Error(`LEARN_UNKNOWN_CARD: ${s.id}`);
  const card = { ...base, iid: `${side}-${zone}-${index}` };
  if (zone === 'hand') return card;
  // Battlefield shape mirrors zMove's battlefield entry in DuelCore.js.
  return {
    ...card,
    tapped: !!s.tapped,
    summoningSick: !!s.summoningSick,
    attacking: false,
    blocking: null,
    damage: 0,
    eotBuffs: [],
    enchantments: [],
    enterTs: ts,
  };
}

export function buildPuzzleState(setup: PuzzleSetup): any {
  const base = buildDuelState([], 'RED_BURN', RULESETS.CONTEMPORARY, null, null, false, null, []);
  let ts = 0;
  const side = (w: 'p' | 'o') => {
    const cfg = setup[w];
    return {
      ...base[w],
      life: cfg.life ?? RULESETS.CONTEMPORARY.startingLife,
      lib: [],
      hand: (cfg.hand ?? []).map((c, i) => instance(c, w, 'hand', i, 0)),
      bf: (cfg.bf ?? []).map((c, i) => instance(c, w, 'bf', i, ++ts)),
      binderIds: [],
    };
  };
  const p = side('p');
  const o = side('o');
  return {
    ...base,
    p,
    o,
    phase: setup.phase,
    active: 'p',
    turn: 3,
    landsPlayed: 0,
    layerClock: ts,
    log: [],
  };
}

function findIn(state: any, zone: 'hand' | 'bf', iid: string) {
  return state.p[zone].find((c: any) => c.iid === iid) ?? null;
}

export function canAttackReason(state: any, iid: string): string | null {
  const c = findIn(state, 'bf', iid);
  if (!c || !isCre(c)) return MSG.GENERIC;
  if (c.tapped) return MSG.tappedAttacker(c.name);
  if (c.summoningSick && !hasKw(c, KEYWORDS.HASTE.id, state)) return MSG.sick(c.name);
  if (hasKw(c, KEYWORDS.DEFENDER.id, state)) return MSG.cantAttack(c.name);
  const probe = duelReducer(state, { type: 'DECLARE_ATTACKER', iid });
  return probe.attackers.includes(iid) ? null : MSG.cantAttack(c.name);
}

function resolveStack(state: any): any {
  let s = state;
  let n = 0;
  while ((s.stack?.length ?? 0) > 0) {
    if (s.pendingChoice || s.pendingTriggerTarget) throw new Error('LEARN_PENDING_CHOICE');
    if (++n > MAX_RESOLVE_STACK) throw new Error('LEARN_STACK_LOOP');
    s = duelReducer(s, { type: 'RESOLVE_STACK' });
  }
  return s;
}

export function tryAction(state: any, step: Exclude<Step, { type: 'ATTACK' }>, allowed: ActionKind[]): ActionResult {
  if (!allowed.includes(STEP_KIND[step.type])) return { ok: false, reason: MSG.NOT_IN_LESSON };

  switch (step.type) {
    case 'TAP_LAND': {
      const land = findIn(state, 'bf', step.iid);
      if (!land || !isLand(land)) return { ok: false, reason: MSG.GENERIC };
      if (land.tapped) return { ok: false, reason: MSG.LAND_TAPPED };
      const produces: string[] = land.produces ?? [];
      if (step.color && !produces.includes(step.color)) {
        return { ok: false, reason: MSG.wrongColor(land.name, step.color) };
      }
      const mana = step.color ?? produces[0];
      const next = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: step.iid, mana });
      return findIn(next, 'bf', step.iid)?.tapped ? { ok: true, state: next } : { ok: false, reason: MSG.GENERIC };
    }
    case 'PLAY_LAND': {
      const card = findIn(state, 'hand', step.iid);
      if (!card || !isLand(card)) return { ok: false, reason: MSG.GENERIC };
      if (state.landsPlayed >= 1) return { ok: false, reason: MSG.LAND_LIMIT };
      const next = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: step.iid });
      return findIn(next, 'hand', step.iid) ? { ok: false, reason: MSG.GENERIC } : { ok: true, state: next };
    }
    case 'CAST_SPELL': {
      const card = findIn(state, 'hand', step.iid);
      if (!card || isLand(card)) return { ok: false, reason: MSG.GENERIC };
      if (!canPay(state.p.mana, card.cost)) return { ok: false, reason: MSG.noMana(card.name, card.cost) };
      // Without this, a targeted spell cast with no target is accepted, leaves
      // hand, resolves, and changes nothing. Silent no-ops are the worst thing
      // an authoring tool can do, so reject instead.
      if (needsTargetOnCast(card) && !step.tgt) return { ok: false, reason: MSG.needsTarget(card.name) };
      const cast = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: step.iid, tgt: step.tgt ?? null });
      if (findIn(cast, 'hand', step.iid)) return { ok: false, reason: MSG.GENERIC };
      return { ok: true, state: resolveStack(cast) };
    }
    case 'UNDO_MANA_TAPS': {
      return { ok: true, state: duelReducer(state, { type: 'UNDO_MANA_TAPS' }) };
    }
    default:
      return { ok: false, reason: MSG.GENERIC };
  }
}

function advanceTo(state: any, done: (s: any) => boolean): any {
  let s = state;
  let n = 0;
  while (!done(s)) {
    if (s.pendingChoice || s.pendingTriggerTarget) throw new Error('LEARN_PENDING_CHOICE');
    if (++n > MAX_ADVANCE) throw new Error(`LEARN_ADVANCE_STUCK at ${s.phase}`);
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
  }
  return s;
}

function summarize(state: any, blocks: BlockPair[], startLife: number, lifeAfter: number): string {
  const name = (iid: string) => getBF(state, iid)?.name ?? iid;
  const blockText = blocks.length
    ? blocks.map(b => `${name(b.blockerIid)} blocks ${name(b.attackerIid)}.`).join(' ')
    : 'Nothing blocks.';
  return `${blockText} You deal ${startLife - lifeAfter}. They're at ${lifeAfter}.`;
}

// Commits the chosen attackers, then grades against EVERY legal block assignment.
// lethal === true only if the opponent dies under all of them (best defense).
export function resolveAttack(state: any, attackerIids: string[]): AttackResult {
  if (attackerIids.length === 0) return { ok: false, reason: MSG.GENERIC };
  for (const iid of attackerIids) {
    const reason = canAttackReason(state, iid);
    if (reason) return { ok: false, reason };
  }
  let s = state;
  for (const iid of attackerIids) s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid });
  s = advanceTo(s, x => x.phase === 'COMBAT_BLOCKERS');

  const defenders = s.o.bf.filter((c: any) => isCre(c) && !c.tapped);
  const choices: (string | null)[][] = defenders.map((bl: any) => [
    null,
    ...attackerIids.filter(a => canBlockDuel(bl, getBF(s, a), s.o.bf, s)),
  ]);
  const total = choices.reduce((n, c) => n * c.length, 1);
  if (total > MAX_BLOCK_OUTCOMES) throw new Error(`LEARN_TOO_MANY_OUTCOMES: ${total}`);

  let combos: (string | null)[][] = [[]];
  for (const c of choices) combos = combos.flatMap(prev => c.map(x => [...prev, x]));

  const startLife = s.o.life;
  let lethal = true;
  let worst: { blocks: BlockPair[]; oppLifeAfter: number; finalState: any } | null = null;
  let outcomes = 0;

  for (const combo of combos) {
    let t = s;
    const blocks: BlockPair[] = [];
    combo.forEach((attId, i) => {
      if (!attId) return;
      t = duelReducer(t, { type: 'DECLARE_BLOCKER', blId: defenders[i].iid, attId });
      if (t.blockers?.[defenders[i].iid] === attId) blocks.push({ blockerIid: defenders[i].iid, attackerIid: attId });
    });
    if (blocks.length !== combo.filter(Boolean).length) continue; // engine refused this assignment
    t = advanceTo(t, x => x.phase === 'COMBAT_END' || checkWinConditions(x) !== null);
    outcomes++;
    const dead = checkWinConditions(t)?.winner === 'p';
    if (!dead) lethal = false;
    if (!worst || t.o.life > worst.oppLifeAfter) worst = { blocks, oppLifeAfter: t.o.life, finalState: t };
  }

  if (!worst) return { ok: false, reason: MSG.GENERIC };
  return {
    ok: true,
    lethal,
    outcomes,
    worstCase: worst,
    summary: summarize(s, worst.blocks, startLife, worst.oppLifeAfter),
  };
}

export function checkGoal(state: any, goal: Goal): boolean {
  switch (goal.kind) {
    case 'MANA_IN_POOL':
      return (state.p.mana?.[goal.color] ?? 0) >= goal.amount;
    case 'CARD_ON_BATTLEFIELD':
      return state.p.bf.some((c: any) => c.id === goal.cardId);
    case 'OPPONENT_DEAD_THIS_TURN':
      return checkWinConditions(state)?.winner === 'p';
  }
}

export type ReplayResult =
  | { goalMet: true }
  | { goalMet: false; failedAt: number; reason: string; kind: 'rejected' | 'notLethal' | 'goalNotMet' };

// Replays a list of steps from the exercise's setup. Used by tests.
// The UI resets an exercise by calling buildPuzzleState directly.
export function replay(ex: EngineExercise, steps: Step[]): ReplayResult {
  let s = buildPuzzleState(ex.setup);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === 'ATTACK') {
      if (!ex.allowed.includes('DECLARE_ATTACKER')) return { goalMet: false, failedAt: i, reason: MSG.NOT_IN_LESSON, kind: 'rejected' };
      const r = resolveAttack(s, step.attackers);
      if (!r.ok) return { goalMet: false, failedAt: i, reason: r.reason, kind: 'rejected' };
      if (!r.lethal) return { goalMet: false, failedAt: i, reason: r.summary, kind: 'notLethal' };
      s = r.worstCase.finalState;
      continue;
    }
    const r = tryAction(s, step, ex.allowed);
    if (!r.ok) return { goalMet: false, failedAt: i, reason: r.reason, kind: 'rejected' };
    s = r.state;
  }
  return checkGoal(s, ex.goal)
    ? { goalMet: true }
    : { goalMet: false, failedAt: steps.length, reason: 'Goal not met', kind: 'goalNotMet' };
}

// Mana pool an untapped set of basic lands would produce. Used to derive
// multiSelect answers from the engine's own canPay instead of trusting data.
export function poolFromLands(landIds: string[]): Record<string, number> {
  const pool: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const id of landIds) {
    const c = makeCardInstance(id, 'p');
    const m = c?.produces?.[0] ?? 'C';
    pool[m] = (pool[m] ?? 0) + 1;
  }
  return pool;
}

export function castableWith(landIds: string[], cardId: string): boolean {
  const c = makeCardInstance(cardId, 'p');
  return !!c && canPay(poolFromLands(landIds), c.cost);
}

// Display data for a card id, for UI that shows cards outside any GameState
// (multiSelect lands and options). Keeps CARD_DB access inside the runner.
export function cardInfo(cardId: string): { name: string; cost: string; type: string; text: string; power?: number; toughness?: number } {
  const c = makeCardInstance(cardId, 'p');
  if (!c) throw new Error(`LEARN_UNKNOWN_CARD: ${cardId}`);
  return { name: c.name, cost: c.cost ?? '', type: c.type, text: c.text ?? '', power: c.power, toughness: c.toughness };
}
