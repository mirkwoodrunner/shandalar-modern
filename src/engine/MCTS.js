// src/engine/MCTS.js
// Monte Carlo rollout-based move evaluation for the AI.
// ENGINE_CONTRACT_SPEC.md S5/S7: reads GameState only, all transitions via duelReducer.

/*
 * MCTS INTEGRATION AUDIT — 2026-05-23
 * ====================================
 *
 * A1 — CALL SITE INVENTORY
 * -------------------------
 * getBestMove:
 *   AI.js:603  planMain   budgetMs=600  candidateMoves=2 [{type:'PLAN',...}] entries
 *              Guard: only called when primaryActions.length > 0 && altActions.length > 0.
 *              CRITICAL: 'PLAN' is not a valid duelReducer action type — duelReducer returns
 *              state unchanged (default: return s). Both candidates produce identical next-
 *              states, so all rollouts compare equivalent positions. MCTS output here is
 *              statistically meaningless. Noted; not fixed (out of scope for Part B).
 *
 *   AI.js:693  planAttack budgetMs=400  candidateMoves=2 [{DECLARE_ATTACKER},{ADVANCE_PHASE}]
 *              Both are valid duelReducer action types. This call site is correct.
 *              candidateMoves is always 2 elements (never empty at this site).
 *
 * scoreMoves:  internal only — called by getBestMove (MCTS.js, formerly line 158).
 * rollout:     internal only — called by scoreMoves.
 *
 * A2 — ACTION TYPE MISMATCH CHECK
 * ---------------------------------
 * CAST_SPELL IS a valid duelReducer action type (DuelCore.js:1747-1807). No mismatch
 * for MCTS rollouts. PLAY_CARD is NOT a valid duelReducer action type — it is an
 * AI-internal plan format converted to DuelCore actions in aiDecide() at the UI adapter
 * layer. duelReducer's default case (return s) silently ignores PLAY_CARD.
 * Conclusion: policyMainAction correctly continues using CAST_SPELL.
 *
 * A3 — MANA TAP GAP (CRITICAL)
 * -----------------------------
 * CAST_SPELL reads from s[w].mana (the mana pool) and does NOT auto-tap lands.
 * burnMana() (called in advPhase at every phase boundary) clears the mana pool
 * regardless of ruleset.manaBurn.
 * Neither randomMainAction nor policyMainAction dispatches TAP_LAND before CAST_SPELL.
 * Result: the mana pool is empty at rollout main-phase time; canPay() returns false for
 * all nonzero-cost cards; rollouts never cast spells. Every rollout is a pass-fest.
 * Fix requires dispatching TAP_LAND per card cost before each CAST_SPELL in rollout
 * policy — deferred to a future engine-aware rollout pass (touches tap logic).
 *
 * A4 — PRIORITY WINDOW INTERACTION
 * ----------------------------------
 * ADVANCE_PHASE is silently blocked (returns s unchanged) when priorityWindow: true.
 * If priorityWindow is true in the rollout start state, stepOnce loops forever
 * (s.turn never changes; depthLimit condition never fires — latent infinite-loop risk).
 * At all current call sites, MCTS is invoked during the AI's own turn where
 * priorityWindow is false. stepOnce never dispatches OPEN_PRIORITY_WINDOW.
 * Conclusion: rollouts are immune to priority window blocking in practice. Latent risk
 * remains if getBestMove is ever called during an open priority window.
 *
 * A5 — evaluateBoard NAME COLLISION
 * -----------------------------------
 * AI.js has a private (non-exported) evaluateBoard(state) at line 47.
 * MCTS.js introduces a private (non-exported) evaluateBoard(s, who) below.
 * Different module scopes, different signatures. No import shadows either symbol.
 * No conflict.
 */

import {
  duelReducer,
  isLand, isCre, isInst,
  getBF, canPay, getPow, getTou, canBlockDuel,
} from './DuelCore.js';
import { PHASE } from './phases.js';

// --- BOARD EVALUATION ---------------------------------------------------------

function evaluateBoard(s, who) {
  const me = s[who];
  const opp = who === 'o' ? s.p : s.o;

  const myCreatures = me.bf.filter(isCre);
  const oppCreatures = opp.bf.filter(isCre);

  const creatureScore = (creatures, state) =>
    creatures.reduce((sum, c) => {
      const p = getPow(c, state);
      const t = getTou(c, state);
      const flying = (c.keywords || []).includes('flying') ? 1.4 : 1.0;
      const trample = (c.keywords || []).includes('trample') ? 1.1 : 1.0;
      return sum + (p * flying * trample) + (t * 0.3);
    }, 0);

  const myBoard  = creatureScore(myCreatures, s);
  const oppBoard = creatureScore(oppCreatures, s);

  const manaScore = (player) => {
    const pool = Object.values(player.mana || {}).reduce((a, b) => a + b, 0);
    const lands = player.bf.filter(c => isLand(c) && !c.tapped).length;
    return pool + lands;
  };

  const score =
    (me.life - opp.life) * 1.5 +
    (myBoard - oppBoard) * 2.0 +
    (me.hand.length - opp.hand.length) * 1.2 +
    (manaScore(me) - manaScore(opp)) * 0.5;

  return score;
}

// --- ROLLOUT POLICIES ---------------------------------------------------------

function policyMainAction(s) {
  const active = s.active;
  const hand = s[active].hand;
  const mana = s[active].mana;

  if (s.landsPlayed < 1) {
    const land = hand.find(isLand);
    if (land) return { type: 'PLAY_LAND', who: active, iid: land.iid };
  }

  const stackEmpty = !s.stack || s.stack.length === 0;

  const castable = hand.filter(c => {
    if (isLand(c)) return false;
    if (!canPay(mana, c.cost)) return false;
    if (!isInst(c) && !stackEmpty) return false;
    return true;
  });

  if (!castable.length) return null;

  castable.sort((a, b) => {
    const cmc = (cost) => {
      if (!cost) return 0;
      return Object.values(cost).reduce((sum, v) => sum + (typeof v === 'number' ? v : 1), 0);
    };
    return cmc(b.cost) - cmc(a.cost);
  });

  const best = castable[0];
  return { type: 'CAST_SPELL', who: active, iid: best.iid, tgt: null, xVal: 1 };
}

function policyAttack(s) {
  const active = s.active;
  const candidates = s[active].bf.filter(c => isCre(c) && !c.tapped && !c.summoningSick);
  const defender = active === 'p' ? 'o' : 'p';
  const defCreatures = s[defender].bf.filter(isCre);

  return candidates
    .filter(att => {
      const ap = getPow(att, s);
      const at = getTou(att, s);
      const hasFlying = (att.keywords || []).includes('flying');

      const oppFlyers = defCreatures.filter(b => (b.keywords || []).includes('flying'));
      if (hasFlying && oppFlyers.length === 0) return true;

      const blockers = defCreatures.filter(b => canBlockDuel(b, att, defCreatures));
      if (!blockers.length) return true;

      const bestBlocker = blockers.reduce((best, b) =>
        getPow(b, s) > getPow(best, s) ? b : best
      );
      const bt = getTou(bestBlocker, s);

      return ap >= bt;
    })
    .map(c => ({ type: 'DECLARE_ATTACKER', iid: c.iid }));
}

function randomBlock(s) {
  const active = s.active;
  const defender = active === 'p' ? 'o' : 'p';
  const defLife = s[defender].life;

  const totalAttPower = (s.attackers || []).reduce((sum, attId) => {
    const att = getBF(s, attId);
    return sum + (att ? getPow(att, s) : 0);
  }, 0);

  const lifeAtRisk = defLife <= totalAttPower;
  const defBf = s[defender].bf.filter(c => isCre(c) && !c.tapped && !c.attacking);
  const usedBlockers = new Set();
  const blockActions = [];

  for (const attId of (s.attackers || [])) {
    const att = getBF(s, attId);
    if (!att) continue;
    const ap = getPow(att, s);
    const at = getTou(att, s);

    const legal = defBf.filter(b => !usedBlockers.has(b.iid) && canBlockDuel(b, att, defBf));
    if (!legal.length) continue;

    let chosen = null;
    for (const bl of legal) {
      const bp = getPow(bl, s);
      const bt = getTou(bl, s);
      if (bp >= at && bt > ap) {
        chosen = bl;
        break;
      }
    }

    if (!chosen && lifeAtRisk) chosen = legal[0];

    if (chosen) {
      usedBlockers.add(chosen.iid);
      blockActions.push({ type: 'DECLARE_BLOCKER', blId: chosen.iid, attId });
    }
  }

  return blockActions;
}

function stepOnce(s) {
  const { phase } = s;

  if (phase === PHASE.MAIN_1 || phase === PHASE.MAIN_2) {
    const action = policyMainAction(s);
    if (action) s = duelReducer(s, action);
    return duelReducer(s, { type: 'ADVANCE_PHASE' });
  }

  if (phase === PHASE.COMBAT_ATTACKERS) {
    const attacks = policyAttack(s);
    for (const a of attacks) s = duelReducer(s, a);
    return duelReducer(s, { type: 'ADVANCE_PHASE' });
  }

  if (phase === PHASE.COMBAT_BLOCKERS) {
    const blocks = randomBlock(s);
    for (const a of blocks) s = duelReducer(s, a);
    return duelReducer(s, { type: 'ADVANCE_PHASE' });
  }

  return duelReducer(s, { type: 'ADVANCE_PHASE' });
}

// --- PUBLIC API ---------------------------------------------------------------

export function rollout(state, depthLimit = 20) {
  let s = JSON.parse(JSON.stringify(state));
  const startTurn = s.turn;

  try {
    while (!s.over && (s.turn - startTurn) < depthLimit) {
      s = stepOnce(s);
    }
  } catch {
    // State became unresolvable; fall through to heuristic
  }

  const oScore = evaluateBoard(s, 'o');
  const pScore = evaluateBoard(s, 'p');
  return s.over?.winner ?? (oScore >= pScore ? 'o' : 'p');
}

export function scoreMoves(state, candidateMoves, budgetMs = 800) {
  if (!candidateMoves.length) return [];

  const C = Math.SQRT2;
  const minIterations = 3;

  const stats = candidateMoves.map(candidate => {
    // If the caller has already pre-simulated the resulting state (e.g. planMain
    // virtual states), use that directly. Otherwise derive it via duelReducer.
    // This avoids the PLAN pseudo-action bug (TD-002) while keeping the planAttack
    // call site unchanged (it passes real action types with no nextState field).
    const next = candidate.nextState
      ? JSON.parse(JSON.stringify(candidate.nextState))
      : duelReducer(JSON.parse(JSON.stringify(state)), candidate.action);
    return { ...candidate, next, wins: 0, iterations: 0, winRate: 0 };
  });

  for (const entry of stats) {
    for (let i = 0; i < minIterations; i++) {
      if (rollout(entry.next) === 'o') entry.wins++;
      entry.iterations++;
    }
    entry.winRate = entry.wins / entry.iterations;
  }

  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    const totalN = stats.reduce((sum, e) => sum + e.iterations, 0);

    const best = stats.reduce((best, e) => {
      const ucb = e.winRate + C * Math.sqrt(Math.log(totalN + 1) / e.iterations);
      const bestUcb = best.winRate + C * Math.sqrt(Math.log(totalN + 1) / best.iterations);
      return ucb > bestUcb ? e : best;
    });

    if (rollout(best.next) === 'o') best.wins++;
    best.iterations++;
    best.winRate = best.wins / best.iterations;
  }

  return stats
    .map(({ next: _next, ...rest }) => rest)
    .sort((a, b) => b.winRate - a.winRate);
}

export function getBestMove(state, candidateMoves, budgetMs = 800) {
  if (!candidateMoves.length) return null;
  const scored = scoreMoves(state, candidateMoves, budgetMs);
  return scored[0] ?? null;
}
