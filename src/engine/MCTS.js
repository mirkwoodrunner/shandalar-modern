// src/engine/MCTS.js
// Monte Carlo rollout-based move evaluation for the AI.
// ENGINE_CONTRACT_SPEC.md S5/S7: reads GameState only, all transitions via duelReducer.

import {
  duelReducer,
  isLand, isCre, isInst,
  getBF, canPay, getPow, getTou, canBlockDuel,
} from './DuelCore.js';
import { PHASE } from './phases.js';

function sumPower(bf, s) {
  return bf.filter(isCre).reduce((sum, c) => sum + getPow(c, s), 0);
}

function heuristicWinner(s) {
  const oScore = s.o.life + sumPower(s.o.bf, s) * 2;
  const pScore = s.p.life + sumPower(s.p.bf, s) * 2;
  return oScore >= pScore ? 'o' : 'p';
}

function randomMainAction(s) {
  const active = s.active;
  const hand = s[active].hand;
  const mana = s[active].mana;

  if (s.landsPlayed < 1) {
    const land = hand.find(isLand);
    if (land) return { type: 'PLAY_LAND', who: active, iid: land.iid };
  }

  const stackEmpty = !s.stack || s.stack.length === 0;

  for (const card of hand) {
    if (isLand(card)) continue;
    if (!canPay(mana, card.cost)) continue;
    if (!isInst(card) && !stackEmpty) continue;
    return { type: 'CAST_SPELL', who: active, iid: card.iid, tgt: null, xVal: 1 };
  }

  return null;
}

function randomAttack(s) {
  const active = s.active;
  const candidates = s[active].bf.filter(c => isCre(c) && !c.tapped && !c.summoningSick);
  return candidates.map(c => ({ type: 'DECLARE_ATTACKER', iid: c.iid }));
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
    const action = randomMainAction(s);
    if (action) s = duelReducer(s, action);
    return duelReducer(s, { type: 'ADVANCE_PHASE' });
  }

  if (phase === PHASE.COMBAT_ATTACKERS) {
    const attacks = randomAttack(s);
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

  return s.over?.winner ?? heuristicWinner(s);
}

export function scoreMoves(state, candidateMoves, budgetMs = 800) {
  if (!candidateMoves.length) return [];

  const perCandidateMs = budgetMs / candidateMoves.length;

  const results = candidateMoves.map(candidate => {
    const next = duelReducer(JSON.parse(JSON.stringify(state)), candidate.action);
    let wins = 0;
    let iterations = 0;
    const start = Date.now();

    while (Date.now() - start < perCandidateMs) {
      if (rollout(next) === 'o') wins++;
      iterations++;
    }

    return { ...candidate, wins, iterations, winRate: iterations > 0 ? wins / iterations : 0 };
  });

  return results.sort((a, b) => b.winRate - a.winRate);
}

export function getBestMove(state, candidateMoves, budgetMs = 800) {
  if (!candidateMoves.length) return null;
  const scored = scoreMoves(state, candidateMoves, budgetMs);
  return scored[0] ?? null;
}
