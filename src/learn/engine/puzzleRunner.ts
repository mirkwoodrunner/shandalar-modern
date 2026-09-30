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
  getPow,
  getTou,
  isCre,
  isLand,
  hasKw,
} from '../../engine/DuelCore.js';
import { RULESETS } from '../../data/rulesets.js';
import KEYWORDS from '../../data/keywords.js';
import { CARD_DB } from '../../data/cards.js';
import { CARD_DB_LEARN } from '../../data/cardsLearn.js';
import type {
  ActionKind,
  ActionResult,
  AttackResult,
  BlockPair,
  BlockResult,
  CardSpec,
  CombatGoal,
  EngineExercise,
  Goal,
  PoolName,
  PuzzleSetup,
  Step,
} from './types';

// The card databases an exercise may resolve its ids against. Imported directly
// from src/data/ -- the same house style as RULESETS above, and permitted because
// puzzleRunner is the one module under src/learn/ allowed to reach src/data/.
// Both satisfy the shared shape in src/data/cardShape.js.
const POOLS: Record<PoolName, any[]> = { shandalar: CARD_DB, learn: CARD_DB_LEARN };

// Every makeCardInstance call below routes through here. An omitted pool is
// 'shandalar', which is CARD_DB -- makeCardInstance's own default, so behaviour
// for every exercise authored before L4a is unchanged.
function poolFor(pool?: PoolName): any[] {
  return POOLS[pool ?? 'shandalar'];
}

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
  tappedBlocker: (name: string) => `${name} is tapped. A tapped creature can't block.`,
  blockFlyer: (blocker: string, attacker: string) =>
    `${blocker} can't block ${attacker}. A creature without flying or reach can't block a flyer.`,
  cantBlock: (blocker: string, attacker: string) => `${blocker} can't block ${attacker}.`,
  blockOnce: (name: string) => `${name} can only block one attacker.`,
  notAttacking: (name: string) => `${name} isn't attacking, so there is nothing to block.`,
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

/**
 * The ruleset a scenario duel runs under -- the same one buildPuzzleState seeds
 * with. Re-exported from here because puzzleRunner is the only module under
 * src/learn/ permitted to import src/data/, so the Learn UI reads this instead
 * of importing RULESETS itself.
 */
export const SCENARIO_RULESET = RULESETS.CONTEMPORARY;

/**
 * The opponent archetype key a scenario duel's config carries. Inert: with a
 * pre-built state supplied, useDuel never calls buildDuelState, so no deck is
 * ever generated from it. It exists only because DuelConfig requires the field.
 */
export const SCENARIO_OPP_ARCH = 'RED_BURN';

export const MAX_BLOCK_OUTCOMES = 5000;
const MAX_RESOLVE_STACK = 5;
const MAX_ADVANCE = 6;

const STEP_KIND: Record<Step['type'], ActionKind> = {
  TAP_LAND: 'TAP_LAND',
  PLAY_LAND: 'PLAY_LAND',
  CAST_SPELL: 'CAST_SPELL',
  UNDO_MANA_TAPS: 'UNDO_MANA_TAPS',
  ATTACK: 'DECLARE_ATTACKER',
  BLOCK: 'DECLARE_BLOCKER',
};

function toSpec(spec: CardSpec): { id: string; tapped?: boolean; summoningSick?: boolean; attacking?: boolean } {
  return typeof spec === 'string' ? { id: spec } : spec;
}

function instance(spec: CardSpec, side: 'p' | 'o', zone: 'hand' | 'bf', index: number, ts: number, pool?: PoolName) {
  const s = toSpec(spec);
  const base = makeCardInstance(s.id, side, poolFor(pool));
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
      hand: (cfg.hand ?? []).map((c, i) => instance(c, w, 'hand', i, 0, setup.pool)),
      bf: (cfg.bf ?? []).map((c, i) => instance(c, w, 'bf', i, ++ts, setup.pool)),
      binderIds: [],
    };
  };
  const p = side('p');
  const o = side('o');
  const flagged = (w: 'p' | 'o') => (setup[w].bf ?? []).flatMap((c, i) => (toSpec(c).attacking ? [`${w}-bf-${i}`] : []));
  if (flagged('p').length) throw new Error(`LEARN_ATTACKING_ON_PLAYER_SIDE: ${flagged('p').join(', ')}`);
  if (setup.phase !== 'COMBAT_BLOCKERS') {
    if (flagged('o').length) throw new Error(`LEARN_ATTACKING_OUTSIDE_BLOCKERS: ${flagged('o').join(', ')}`);
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
  return buildBlockersState({ ...base, p, o, turn: 3, landsPlayed: 0, layerClock: ts, log: [] }, flagged('o'));
}

// COMBAT_BLOCKERS entry (L5 slice 1). The opponent is the active player. Its
// flagged creatures are declared through DuelCore's own DECLARE_ATTACKER --
// which attacks with s.active, hence active: 'o' -- and the board is walked to
// the blocker step with the same advanceTo every other path uses. Each flagged
// attacker is confirmed on the board afterwards, so a creature the engine
// refuses (summoning sick, tapped, defender) is a build error, not a board that
// silently has one attacker fewer than the author wrote.
function buildBlockersState(start: any, attackerIids: string[]): any {
  if (!attackerIids.length) throw new Error('LEARN_NO_ATTACKERS: a COMBAT_BLOCKERS setup needs at least one o.bf card flagged attacking');
  let s = { ...start, phase: 'COMBAT_ATTACKERS', active: 'o' };
  for (const iid of attackerIids) {
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid });
    if (!s.attackers.includes(iid)) throw new Error(`LEARN_ATTACKER_REFUSED: ${iid}`);
  }
  s = advanceTo(s, x => x.phase === 'COMBAT_BLOCKERS');
  for (const iid of attackerIids) {
    if (!s.attackers.includes(iid)) throw new Error(`LEARN_ATTACKER_REFUSED: ${iid}`);
  }
  return s;
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

export function tryAction(state: any, step: Exclude<Step, { type: 'ATTACK' } | { type: 'BLOCK' }>, allowed: ActionKind[]): ActionResult {
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

// Grades a state that has ALREADY reached COMBAT_BLOCKERS with its attackers
// declared, against EVERY legal block assignment the defender could make.
// lethal === true only if the opponent dies under all of them (best defense).
//
// Split out of resolveAttack at L3b so scenario mode can grade a board the
// learner declared attackers on themselves. There is exactly one implementation
// of best-defense analysis; both entry points below call this.
function gradeBestDefense(s: any, attackerIids: string[]): AttackResult {
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

// Commits the chosen attackers and walks the board to the blocker step, which
// is what the duel screen does for itself when a learner declares attackers in
// scenario mode. Split out so there is one definition of "a board with these
// attackers declared", shared by resolveAttack and by the tests that need a
// mid-combat state the engine actually produced.
export function declareAttackers(
  state: any,
  attackerIids: string[],
): { ok: false; reason: string } | { ok: true; state: any } {
  if (attackerIids.length === 0) return { ok: false, reason: MSG.GENERIC };
  for (const iid of attackerIids) {
    const reason = canAttackReason(state, iid);
    if (reason) return { ok: false, reason };
  }
  let s = state;
  for (const iid of attackerIids) s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid });
  return { ok: true, state: s };
}

// Commits the chosen attackers, then grades them. Used by the bespoke lesson
// player, which hands over an attacker list rather than a board mid-combat.
export function resolveAttack(state: any, attackerIids: string[]): AttackResult {
  const declared = declareAttackers(state, attackerIids);
  if (!declared.ok) return declared;
  const s = advanceTo(declared.state, x => x.phase === 'COMBAT_BLOCKERS');
  return gradeBestDefense(s, attackerIids);
}

// The analysis walks duelReducer forward over the board the learner is actually
// looking at. duelReducer is expected to return new state rather than mutate,
// and resolveAttack above has always relied on that -- but there it runs on a
// throwaway state, whereas here a stray mutation would corrupt a lesson in
// progress. The walk runs on a copy instead of betting on that expectation.
// GameState is structured-cloneable: the e2e escape hatch already round-trips
// it through page.evaluate.
function snapshot(state: any): any {
  return structuredClone(state);
}

// Scenario-mode grading for OPPONENT_DEAD_THIS_TURN (Learn Mode L3b).
//
// The bespoke lesson player collects an attacker list and calls resolveAttack.
// Scenario mode cannot: the learner declares attackers on the real duel screen,
// so by the time they press Check the board already holds them and DuelCore has
// already ruled on their legality. This reads that board and asks the harder
// question resolveAttack asks -- does the opponent die against EVERY legal
// block? -- rather than the easier one checkGoal asks, which is whether combat
// happens to have resolved lethally.
//
// Returns null when the board is not in a gradeable shape, which the caller
// reports as "not there yet" rather than as a failure.
export function gradeDeclaredAttack(liveState: any): AttackResult | null {
  const attackerIids: string[] = liveState?.attackers ?? [];
  if (!attackerIids.length) return null;
  // Past the blocker step there is nothing left to analyse -- the defender's
  // choice has already been made on the board.
  if (liveState.phase !== 'COMBAT_ATTACKERS' && liveState.phase !== 'COMBAT_BLOCKERS') return null;

  let s = snapshot(liveState);
  if (s.phase !== 'COMBAT_BLOCKERS') s = advanceTo(s, x => x.phase === 'COMBAT_BLOCKERS');
  return gradeBestDefense(s, attackerIids);
}

// --- BLOCKING (L5 slice 1) ---------------------------------------------------

// Every path in DuelCore.js that calls Math.random() (directly or through
// makeId) while a combat is being declared or resolved, keyed by what puts a
// creature on that path:
//   - DECLARE_BLOCKER, `coinFlipOnBlock` (Ydwen Efreet): a coin flip decides
//     whether the block stays.
//   - resolveCombat -> getNextBandingChoice -> createPendingChoice -> makeId,
//     and FORM_BAND -> makeId: banding. Also banned by content rules, and the
//     pending choice alone already stops the runner (LEARN_PENDING_CHOICE).
// Triggered abilities that combat can fire (ON_ATTACKS_DECLARED,
// ON_DAMAGE_DEALT, ON_PLAYER_DAMAGED, ON_CREATURE_DIES, ON_COMBAT_BEGIN) were
// read too. None of their effect handlers roll dice; the ones that call makeId
// (titaniasSongPersist, createCyclopeanTombEmblem) belong to noncreature
// permanents, and any trigger that pauses for a choice stops the runner.
export function randomCombatPath(card: any, state?: any): string | null {
  if (card?.coinFlipOnBlock) return `${card.name} flips a coin when it blocks`;
  if (card && hasKw(card, KEYWORDS.BANDING.id, state)) return `${card.name} has banding, whose damage choice is not deterministic here`;
  return null;
}

// Everything that changes combat damage or death outside the plain model the
// division gate reasons about (power P, remaining toughness L, damage piles up
// wherever the attacker's controller likes). Built by reading resolveCombat,
// dmgWithShield, consumeCreatureDamageShields, checkDeath, DECLARE_BLOCKER and
// advPhase's COMBAT_BLOCKERS / COMBAT_END steps. Deliberately conservative:
// any Aura or triggered ability at all counts, since Auras carry Venom,
// Gaseous Form, Spirit Link-style and prevention mods, and ON_CREATURE_DIES
// triggers (Abu Ja'far) can kill creatures the arithmetic thinks survive.
const DIVISION_KEYWORDS = [
  'FIRST_STRIKE', 'DOUBLE_STRIKE', 'DEATHTOUCH', 'TRAMPLE', 'BANDING',
  'RAMPAGE', 'INDESTRUCTIBLE', 'REGENERATION', 'PROTECTION', 'INFECT',
] as const;
const DIVISION_FLAGS: [string, string][] = [
  ['regenerating', 'a regeneration shield'],
  ['damageShield', 'a damage prevention shield'],
  ['preventAllDamageToThisTurn', 'all damage to it prevented'],
  ['cantPreventOrRedirectDamage', "damage that can't be prevented"],
  ['preventCombatDamageDealt', 'its combat damage prevented'],
  ['preventDamageFromEnchanted', 'damage from enchanted creatures prevented'],
  ['preventDamageFromBlocked', 'damage from the creature it blocks prevented'],
  ['preventDamageFromWalls', 'damage from Walls prevented'],
  ['blocksDestroyFilter', 'a destroy-at-end-of-combat effect'],
  ['blockedByDestroyFilter', 'a destroy-at-end-of-combat effect'],
  ['sacrificeAtEndOfCombat', 'a sacrifice-at-end-of-combat effect'],
  ['coinFlipOnBlock', 'a coin flip on block'],
];
// Card-name hooks inside resolveCombat that change toughness or counters
// before the final death check.
const DIVISION_NAMES = ['Giant Badger', 'Sengir Vampire'];

export function combatModifiers(card: any, state: any): string[] {
  const out: string[] = [];
  for (const k of DIVISION_KEYWORDS) {
    const kw = (KEYWORDS as any)[k];
    if (kw && hasKw(card, kw.id, state)) out.push(`${card.name} has ${k.toLowerCase().replace('_', ' ')}`);
  }
  const prot = card.protection;
  if (Array.isArray(prot) ? prot.length : prot) out.push(`${card.name} has protection`);
  for (const [flag, what] of DIVISION_FLAGS) if (card[flag]) out.push(`${card.name} has ${what}`);
  if ((card.enchantments ?? []).length) out.push(`${card.name} is enchanted`);
  if ((card.triggeredAbilities ?? []).length) out.push(`${card.name} has a triggered ability`);
  if (DIVISION_NAMES.includes(card.name)) out.push(`${card.name} changes itself during combat`);
  if (state?.turnState?.creatureDamageShields?.[card.iid]?.length) out.push(`${card.name} has a damage redirect shield`);
  return out;
}

// The creatures in one attacker's combat, as the division gate needs them.
// Power and remaining toughness come from the engine (getPow/getTou), never from
// card data, so lords and pumps are counted the way DuelCore counts them.
export type DivisionInfo = {
  attackerIid: string;
  power: number;
  blockers: { iid: string; name: string; lethal: number }[];
  modifiers: string[];
};

export function divisionInfo(state: any, attackerIid: string): DivisionInfo {
  const att = getBF(state, attackerIid);
  const blockers = Object.entries(state.blockers ?? {})
    .filter(([, a]) => a === attackerIid)
    .map(([bl]) => getBF(state, bl))
    .filter(Boolean);
  const modifiers = [att, ...blockers].flatMap((c: any) => combatModifiers(c, state));
  if (state.fogActive) modifiers.push('a Fog effect is active');
  return {
    attackerIid,
    power: getPow(att, state),
    blockers: blockers.map((b: any) => ({ iid: b.iid, name: b.name, lethal: Math.max(0, getTou(b, state) - (b.damage ?? 0)) })),
    modifiers,
  };
}

// CR 510.1c: a creature blocked by two or more divides its damage as its
// controller chooses. Which blocker death sets can that controller produce?
// A set S dies when sum(L over S) <= P -- excess can pile onto a member of S.
// The empty set needs P spread with nobody reaching lethal: P <= sum(L - 1).
// Returned as sorted iid lists, one per achievable set.
export function achievableDeathSets(power: number, blockers: { iid: string; lethal: number }[]): string[][] {
  const out: string[][] = [];
  const n = blockers.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const set = blockers.filter((_, i) => mask & (1 << i));
    const ok = set.length === 0
      ? power <= blockers.reduce((t, b) => t + Math.max(0, b.lethal - 1), 0)
      : set.reduce((t, b) => t + b.lethal, 0) <= power;
    if (ok) out.push(set.map(b => b.iid).sort());
  }
  return out;
}

// Runs fn with Math.random() swapped for a thrower, and always puts it back.
// Backstop for randomCombatPath above: that list is what was found by reading
// DuelCore.js, and this catches anything the reading missed. Synchronous, so
// nothing else can observe the swap.
function withoutRandomness<T>(fn: () => T): T {
  const real = Math.random;
  Math.random = () => { throw new Error('LEARN_NONDETERMINISTIC_COMBAT: the engine reached for Math.random() during combat'); };
  try { return fn(); } finally { Math.random = real; }
}

function blockSummary(before: any, after: any, blocks: BlockPair[]): string {
  const name = (iid: string) => getBF(before, iid)?.name ?? iid;
  const blockText = blocks.length
    ? blocks.map(b => `${name(b.blockerIid)} blocks ${name(b.attackerIid)}.`).join(' ')
    : 'Nothing blocks.';
  const dead = [...before.p.bf, ...before.o.bf]
    .filter((c: any) => isCre(c) && getBF(after, c.iid) === null)
    .map((c: any) => c.name);
  const deadText = dead.length ? ` ${dead.join(' and ')} ${dead.length > 1 ? 'die' : 'dies'}.` : '';
  const taken = before.p.life - after.p.life;
  const lifeText = after.p.life <= 0
    ? ` You take ${taken} and you're at ${after.p.life}. You lose.`
    : taken > 0 ? ` You take ${taken}. You're at ${after.p.life}.` : ' You take no damage.';
  return `${blockText}${deadText}${lifeText}`;
}

// The reason a block would be refused, in the learner's terms, or null.
// Mirrors DECLARE_BLOCKER's own gates (untapped, attacker in combat,
// canBlockDuel) so a refusal is explained rather than silently dropped.
export function canBlockReason(state: any, pair: BlockPair): string | null {
  const bl = state.p.bf.find((c: any) => c.iid === pair.blockerIid);
  const att = state.o.bf.find((c: any) => c.iid === pair.attackerIid);
  if (!bl || !isCre(bl) || !att) return MSG.GENERIC;
  if (!(state.attackers ?? []).includes(att.iid)) return MSG.notAttacking(att.name);
  if (bl.tapped) return MSG.tappedBlocker(bl.name);
  if (!canBlockDuel(bl, att, state.p.bf, state)) {
    const flyer = hasKw(att, KEYWORDS.FLYING.id, state);
    const canReachUp = hasKw(bl, KEYWORDS.FLYING.id, state) || hasKw(bl, KEYWORDS.REACH.id, state);
    return flyer && !canReachUp ? MSG.blockFlyer(bl.name, att.name) : MSG.cantBlock(bl.name, att.name);
  }
  return null;
}

// Every creature in one of the given blocks, plus every attacker.
function combatants(state: any, blocks: BlockPair[]): any[] {
  const iids = new Set<string>([...(state.attackers ?? []), ...blocks.map(b => b.blockerIid)]);
  return [...iids].map(iid => getBF(state, iid)).filter(Boolean);
}

function assertDeterministic(state: any, blocks: BlockPair[]): void {
  for (const c of combatants(state, blocks)) {
    const why = randomCombatPath(c, state);
    if (why) throw new Error(`LEARN_NONDETERMINISTIC_COMBAT: ${why}`);
  }
}

// Validates a whole block assignment and declares it on the board, stopping at
// the blocker step. Every pair is checked before anything is dispatched, and
// each is dispatched exactly once -- DECLARE_BLOCKER is a toggle, so a second
// dispatch would take the block back -- then confirmed on the board. A block
// already on the board (scenario mode) is re-validated, never re-dispatched.
// Split out of resolveBlocks so the checker's division gate can read the
// declared combat before damage.
export function declareBlocks(state: any, blocks: BlockPair[]): { ok: false; reason: string } | { ok: true; state: any } {
  if (state?.phase !== 'COMBAT_BLOCKERS' || state.active !== 'o') return { ok: false, reason: MSG.GENERIC };
  const used = new Set<string>();
  for (const pair of blocks) {
    const bl = state.p.bf.find((c: any) => c.iid === pair.blockerIid);
    if (used.has(pair.blockerIid)) return { ok: false, reason: MSG.blockOnce(bl?.name ?? pair.blockerIid) };
    used.add(pair.blockerIid);
    if (state.blockers?.[pair.blockerIid] === pair.attackerIid) continue;
    const reason = canBlockReason(state, pair);
    if (reason) return { ok: false, reason };
  }
  assertDeterministic(state, blocks);
  return withoutRandomness(() => {
    let s = state;
    for (const pair of blocks) {
      if (s.blockers?.[pair.blockerIid] === pair.attackerIid) continue;
      s = duelReducer(s, { type: 'DECLARE_BLOCKER', blId: pair.blockerIid, attId: pair.attackerIid });
      if (s.blockers?.[pair.blockerIid] !== pair.attackerIid) return { ok: false as const, reason: MSG.GENERIC };
    }
    // A block on the board that is not in the list would be graded as if the
    // learner had declared it. Refuse rather than guess.
    if (Object.keys(s.blockers ?? {}).length !== blocks.length) return { ok: false as const, reason: MSG.GENERIC };
    return { ok: true as const, state: s };
  });
}

// The blocking counterpart of resolveAttack. Takes a board at COMBAT_BLOCKERS
// with the opponent's attackers declared (buildPuzzleState's COMBAT_BLOCKERS
// path) and the learner's whole block assignment, declares it, and resolves
// combat.
export function resolveBlocks(state: any, blocks: BlockPair[]): BlockResult {
  const declared = declareBlocks(state, blocks);
  if (!declared.ok) return declared;
  const finalState = withoutRandomness(() =>
    advanceTo(declared.state, x => x.phase === 'COMBAT_END' || checkWinConditions(x) !== null));
  return { ok: true, finalState, blocks, summary: blockSummary(state, finalState, blocks) };
}

// Every legal choice each untapped player creature has: no block, or one
// attacker it can legally block. The checker enumerates the product.
export function blockChoices(state: any): { blockerIid: string; attackers: string[] }[] {
  return state.p.bf
    .filter((c: any) => isCre(c) && !c.tapped)
    .map((c: any) => ({
      blockerIid: c.iid,
      attackers: (state.attackers ?? []).filter((a: string) => canBlockReason(state, { blockerIid: c.iid, attackerIid: a }) === null),
    }));
}

// The blocks currently declared on a board, as pairs.
export function blocksOnBoard(state: any): BlockPair[] {
  return Object.entries(state?.blockers ?? {}).map(([blockerIid, attackerIid]) => ({ blockerIid, attackerIid: attackerIid as string }));
}

// Scenario-mode grading for combat goals (L5 slice 1), the counterpart of
// gradeDeclaredAttack. The learner declares blocks on the real duel screen, so
// by Check time the board holds them. This reads those blocks, resolves combat
// on a snapshot, and never touches the live state. No blocks declared is a real
// answer ("don't block"), graded like any other.
//
// Returns null when the board is not gradeable: not the blocker step of an
// opponent-attacks board.
export function gradeDeclaredBlocks(liveState: any): BlockResult | null {
  if (!liveState || liveState.phase !== 'COMBAT_BLOCKERS' || liveState.active !== 'o') return null;
  if (!(liveState.attackers ?? []).length) return null;
  const s = snapshot(liveState);
  return resolveBlocks(s, blocksOnBoard(s));
}

// Combat goals are read off the board after combat has resolved. A creature
// "dies" when its setup iid is no longer on either battlefield: nothing in a
// blocking exercise can move a creature anywhere but the graveyard.
function checkCombatGoal(state: any, goal: CombatGoal): boolean {
  switch (goal.kind) {
    case 'SURVIVE_COMBAT':
      return state.p.life > 0 && checkWinConditions(state)?.winner !== 'o';
    case 'LIFE_AT_LEAST':
      return state.p.life >= goal.amount;
    case 'CREATURE_DIES':
      return getBF(state, goal.iid) === null;
    case 'CREATURE_SURVIVES':
      return getBF(state, goal.iid) !== null;
  }
}

export const isCombatGoal = (goal: Goal): boolean =>
  goal.kind === 'SURVIVE_COMBAT' || goal.kind === 'LIFE_AT_LEAST' || goal.kind === 'CREATURE_DIES' ||
  goal.kind === 'CREATURE_SURVIVES' || goal.kind === 'ALL_OF';

export function checkGoal(state: any, goal: Goal): boolean {
  switch (goal.kind) {
    case 'MANA_IN_POOL':
      return (state.p.mana?.[goal.color] ?? 0) >= goal.amount;
    case 'CARD_ON_BATTLEFIELD':
      return state.p.bf.some((c: any) => c.id === goal.cardId);
    case 'OPPONENT_DEAD_THIS_TURN':
      return checkWinConditions(state)?.winner === 'p';
    case 'ALL_OF':
      return goal.goals.every(g => checkCombatGoal(state, g));
    default:
      return checkCombatGoal(state, goal);
  }
}

export type ReplayResult =
  | { goalMet: true }
  // goalNotMet on a BLOCK step carries the combat summary as its reason, so a
  // wrong line's reasonIncludes can quote what happened.
  | { goalMet: false; failedAt: number; reason: string; kind: 'rejected' | 'notLethal' | 'goalNotMet' };

// Replays a list of steps from the exercise's setup. Used by tests.
// The UI resets an exercise by calling buildPuzzleState directly.
export function replay(ex: EngineExercise, steps: Step[]): ReplayResult {
  let s = buildPuzzleState(ex.setup);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === 'BLOCK') {
      if (!ex.allowed.includes('DECLARE_BLOCKER')) return { goalMet: false, failedAt: i, reason: MSG.NOT_IN_LESSON, kind: 'rejected' };
      const r = resolveBlocks(s, step.blocks);
      if (!r.ok) return { goalMet: false, failedAt: i, reason: r.reason, kind: 'rejected' };
      if (!checkGoal(r.finalState, ex.goal)) return { goalMet: false, failedAt: i, reason: r.summary, kind: 'goalNotMet' };
      s = r.finalState;
      continue;
    }
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
export function poolFromLands(landIds: string[], cardPool?: PoolName): Record<string, number> {
  const pool: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const id of landIds) {
    const c = makeCardInstance(id, 'p', poolFor(cardPool));
    const m = c?.produces?.[0] ?? 'C';
    pool[m] = (pool[m] ?? 0) + 1;
  }
  return pool;
}

export function castableWith(landIds: string[], cardId: string, cardPool?: PoolName): boolean {
  const c = makeCardInstance(cardId, 'p', poolFor(cardPool));
  return !!c && canPay(poolFromLands(landIds, cardPool), c.cost);
}

// Display data for a card id, for UI that shows cards outside any GameState
// (multiSelect lands and options). Keeps CARD_DB access inside the runner.
export function cardInfo(cardId: string, cardPool?: PoolName): { name: string; cost: string; type: string; text: string; power?: number; toughness?: number } {
  const c = makeCardInstance(cardId, 'p', poolFor(cardPool));
  if (!c) throw new Error(`LEARN_UNKNOWN_CARD: ${cardId}`);
  return { name: c.name, cost: c.cost ?? '', type: c.type, text: c.text ?? '', power: c.power, toughness: c.toughness };
}
