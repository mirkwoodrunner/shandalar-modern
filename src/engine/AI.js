// src/engine/AI.js
// AI decision generator — produces GameAction objects for DuelCore to execute.
// Per design spec §3 and SYSTEMS.md §6.
//
// STRICT CONSTRAINTS (ENGINE_CONTRACT_SPEC.md §5):
//   ✔ May read GameState snapshots
//   ✔ May generate valid GameAction objects
//   ✗ CANNOT mutate GameState
//   ✗ CANNOT simulate combat results directly
//   ✗ CANNOT bypass DuelCore validation
//   ✗ CANNOT make async calls or access the network

import { ARCHETYPES } from '../data/cards.js';
import {
  isLand, isCre, isInst, isSort,
  getBF, getPow, getTou, canBlockDuel,
  canPay, parseMana,
} from './DuelCore.js';
import { PHASE } from './phases.js';

// ─── OPPONENT PROFILES ────────────────────────────────────────────────────────
// Pure data — no logic. Weights range 0.0–1.0.

const AI_PROFILES = {
  GENERIC:  { aggression: 0.5, greedySpells: 0.5, removalPriority: 0.5 },
  DELENIA:  { aggression: 0.3, greedySpells: 0.4, removalPriority: 0.8 }, // White: defensive
  XYLOS:    { aggression: 0.2, greedySpells: 0.3, removalPriority: 0.9 }, // Blue: control
  MORTIS:   { aggression: 0.6, greedySpells: 0.7, removalPriority: 1.0 }, // Black: ruthless
  KARAG:    { aggression: 1.0, greedySpells: 1.0, removalPriority: 0.3 }, // Red: pure aggro
  SYLVARA:  { aggression: 0.7, greedySpells: 0.6, removalPriority: 0.5 }, // Green: ramp/stomp
  ARZAKON:  { aggression: 0.8, greedySpells: 0.8, removalPriority: 1.0 }, // Final boss: optimal
};

// ─── BOARD EVALUATION ─────────────────────────────────────────────────────────

function sumCreaturePower(creatures, state) {
  return creatures.filter(isCre).reduce((sum, c) => sum + getPow(c, state), 0);
}

// Higher score = better position for the AI opponent.
function evaluateBoard(state) {
  const myPower    = sumCreaturePower(state.o.bf, state);
  const theirPower = sumCreaturePower(state.p.bf, state);
  const lifeDelta  = state.o.life - state.p.life;
  const cardDelta  = state.o.hand.length - state.p.hand.length;
  return (myPower * 2) + lifeDelta + (cardDelta * 1.5) - (theirPower * 1.5);
}

// ─── MANA SIMULATION HELPERS ──────────────────────────────────────────────────
// Compute how much mana the AI can access (current pool + untapped lands).

function computeAvailableMana(state) {
  const pool = { ...state.o.mana };
  for (const c of state.o.bf) {
    if (isLand(c) && !c.tapped) {
      const color = c.produces?.[0] || 'C';
      pool[color] = (pool[color] || 0) + 1;
    }
    if (!isLand(c) && !c.tapped && c.activated?.effect?.startsWith('addMana')) {
      const ms = c.activated.mana || 'C';
      for (const ch of ms) {
        if ('WUBRGC'.includes(ch)) pool[ch] = (pool[ch] || 0) + 1;
      }
    }
  }
  return pool;
}

// Build TAP_LAND / TAP_ART_MANA actions to cover the cost of a spell.
// Returns { tapActions, affordable } where tapActions is the DuelCore action list.
function buildTapActions(state, cost) {
  const req = parseMana(cost);
  const vPool = { ...state.o.mana };
  const tapActions = [];
  const tappedIids = new Set();

  const vCanPay = () => {
    const a = { ...vPool };
    for (const c of ['W','U','B','R','G','C']) {
      if (a[c] < (req[c] || 0)) return false;
      a[c] -= req[c] || 0;
    }
    return Object.values(a).reduce((s, v) => s + v, 0) >= (req.generic || 0);
  };

  // Tap artifact mana sources first
  for (const c of state.o.bf.filter(x => !isLand(x) && !x.tapped && x.activated?.effect?.startsWith('addMana'))) {
    if (vCanPay()) break;
    tapActions.push({ type: 'TAP_ART_MANA', who: 'o', iid: c.iid });
    const ms = c.activated.mana || 'C';
    for (const ch of ms) if ('WUBRGC'.includes(ch)) vPool[ch] = (vPool[ch] || 0) + 1;
  }

  if (!vCanPay()) {
    const neededColors = ['W','U','B','R','G'].filter(cl => (req[cl] || 0) > 0);
    for (const cl of neededColors) {
      for (const l of state.o.bf.filter(x => isLand(x) && !x.tapped && !tappedIids.has(x.iid) && x.produces?.includes(cl))) {
        if ((vPool[cl] || 0) >= (req[cl] || 0)) break;
        tappedIids.add(l.iid);
        tapActions.push({ type: 'TAP_LAND', who: 'o', iid: l.iid, mana: cl });
        vPool[cl] = (vPool[cl] || 0) + 1;
      }
    }
    for (const l of state.o.bf.filter(x => isLand(x) && !x.tapped && !tappedIids.has(x.iid))) {
      if (vCanPay()) break;
      const m = l.produces?.[0] || 'C';
      tappedIids.add(l.iid);
      tapActions.push({ type: 'TAP_LAND', who: 'o', iid: l.iid, mana: m });
      vPool[m] = (vPool[m] || 0) + 1;
    }
  }

  return { tapActions, affordable: vCanPay() };
}

// ─── PHASE PLANNERS ───────────────────────────────────────────────────────────

function passPlan(phase) {
  return { phase, actions: [{ type: 'PASS_PRIORITY' }] };
}

function planUpkeep(state, profile) {
  // Check for activated abilities with upkeep relevance.
  // For now, safe fallback — upkeep triggers resolve automatically via DuelCore.
  return passPlan(PHASE.UPKEEP);
}

function planMain(state, profile, phase) {
  const actions = [];
  const availMana = computeAvailableMana(state);
  const totalMana = Object.values(availMana).reduce((s, v) => s + v, 0);

  const sorted = [...state.o.hand].sort((a, b) => b.cmc - a.cmc);

  for (const card of sorted) {
    // Land: always play one if available, no mana cost required.
    if (isLand(card) && state.landsPlayed < 1) {
      actions.push({ type: 'PLAY_CARD', cardId: card.iid, targets: [], isLand: true });
      continue;
    }

    if (isLand(card)) continue; // land already played this turn

    // Only cast at sorcery speed during MAIN phases with empty stack.
    const stackEmpty = !state.stack?.length;
    const isSorceryOk = (isCre(card) || isSort(card)) && stackEmpty;
    const isInstantOk = isInst(card);

    if (!isSorceryOk && !isInstantOk) continue;

    if (card.cmc > totalMana) continue; // can't afford even with all lands tapped
    if (!canPay(availMana, card.cost)) continue;

    // Removal: target highest-power threat on the player's battlefield.
    const isRemoval = ['destroy','exileCreature','bounce','destroyTapped',
      'destroyArtifact','destroyArtOrEnch'].includes(card.effect);
    if (isRemoval) {
      const threats = state.p.bf.filter(isCre);
      if (!threats.length) continue; // no valid target — skip to avoid mana burn
      const target = threats.reduce((a, b) => getPow(a, state) >= getPow(b, state) ? a : b);
      if (Math.random() < profile.removalPriority) {
        actions.push({ type: 'PLAY_CARD', cardId: card.iid, targets: [target.iid] });
      }
      continue;
    }

    // Damage/draw/burn spells targeting player.
    const targetsSelf = ['draw3','draw1','drawX','gainLife3','gainLifeX','gainLife1',
      'gainLife2','gainLife6','tutor','regrowth','reanimateOwn'].includes(card.effect);
    const targetsOpp  = ['damage3','damage5','damageX','psionicBlast','chainLightning',
      'damage1','damage2','ping'].includes(card.effect);

    if (isSorceryOk || isInstantOk) {
      if (Math.random() < profile.greedySpells) {
        const tgt = targetsSelf ? 'o' : targetsOpp ? 'p' : null;
        actions.push({ type: 'PLAY_CARD', cardId: card.iid, targets: tgt ? [tgt] : [] });
      }
    }
  }

  actions.push({ type: 'PASS_PRIORITY' });
  return { phase, actions };
}

function planAttack(state, profile) {
  const candidates = state.o.bf.filter(c => isCre(c) && !c.tapped && !c.summoningSick);
  if (!candidates.length) return passPlan(PHASE.COMBAT_ATTACKERS);

  const attackerIds = [];

  if (profile.aggression >= 1.0) {
    // Full aggro — always attack with everything.
    for (const c of candidates) attackerIds.push(c.iid);
  } else {
    const defBf = state.p.bf.filter(isCre);

    for (const att of candidates) {
      const ap = getPow(att, state);
      const at = getTou(att, state);
      const attHasFlying = (att.keywords || []).includes('FLYING');

      // Check if attacker is effectively unblockable (flying with no opposing flyers).
      const defFlyers = defBf.filter(b => (b.keywords || []).includes('FLYING'));
      const isUnblockable = attHasFlying && defFlyers.length === 0;

      if (isUnblockable) {
        attackerIds.push(att.iid);
        continue;
      }

      // Find best potential blocker.
      const validBlockers = defBf.filter(b => canBlockDuel(b, att));
      const bestBlocker = validBlockers.reduce((best, b) => {
        if (!best) return b;
        return getPow(b, state) > getPow(best, state) ? b : best;
      }, null);

      if (!bestBlocker) {
        // No blocker — safe to attack.
        attackerIds.push(att.iid);
        continue;
      }

      const bp = getPow(bestBlocker, state);
      const bt = getTou(bestBlocker, state);

      // Win the trade: kill blocker AND survive.
      const killsBlocker = ap >= bt;
      const survives = at > bp;

      if (killsBlocker && survives) {
        // Favorable trade — attack if board improves.
        attackerIds.push(att.iid);
        continue;
      }

      // Risky attack — defer to aggression roll.
      if (Math.random() < profile.aggression) {
        attackerIds.push(att.iid);
      }
    }
  }

  if (!attackerIds.length) return passPlan(PHASE.COMBAT_ATTACKERS);

  return {
    phase: PHASE.COMBAT_ATTACKERS,
    actions: [
      { type: 'ATTACK', attackerIds, defenderId: 'player' },
      { type: 'PASS_PRIORITY' },
    ],
  };
}

function planBlock(state, profile) {
  const incomingAttackerIds = state.attackers || [];
  if (!incomingAttackerIds.length) return passPlan(PHASE.COMBAT_BLOCKERS);

  const available = state.o.bf.filter(c => isCre(c) && !c.tapped && !c.attacking);
  const blockActions = [];
  const alreadyBlocking = new Set();

  for (const attId of incomingAttackerIds) {
    const att = getBF(state, attId);
    if (!att) continue;

    const ap = getPow(att, state);
    const at = getTou(att, state);

    const valid = available.filter(b =>
      !alreadyBlocking.has(b.iid) && canBlockDuel(b, att)
    );

    if (!valid.length) continue;

    // Priority: favorable trade > survive > prevent lethal > pass
    const favorableTrade = valid.find(b =>
      getPow(b, state) >= at && getTou(b, state) > ap
    );
    const survives = valid.find(b => getTou(b, state) > ap);
    const preventLethal = state.o.life <= ap ? valid[0] : null;

    // Never block if attacker is smaller than all blockers with no keyword benefit.
    const worthlessBlock = valid.find(b => getPow(b, state) > ap && getTou(b, state) > ap);

    const chosen = favorableTrade || survives || preventLethal;
    if (chosen && chosen !== worthlessBlock) {
      alreadyBlocking.add(chosen.iid);
      blockActions.push({ type: 'BLOCK', blockerId: chosen.iid, attackerId: attId });
    }
  }

  if (!blockActions.length) return passPlan(PHASE.COMBAT_BLOCKERS);

  return {
    phase: PHASE.COMBAT_BLOCKERS,
    actions: [...blockActions, { type: 'PASS_PRIORITY' }],
  };
}

function planEnd(state, profile) {
  // If AI is over hand size, discard lowest CMC card.
  // DuelCore handles discard-to-hand-size in CLEANUP, so this is a no-op here.
  return passPlan(PHASE.END);
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

/**
 * Evaluate the current GameState and return a structured AITurnPlan.
 * Pure, synchronous, deterministic given the same state + RNG seed.
 *
 * @param {object} gameState - Read-only GameState snapshot
 * @param {string} phase     - Current PHASE constant
 * @returns {AITurnPlan}     - { phase, actions: GameAction[] }
 */
export function getAIPlan(gameState, phase) {
  const profileId = gameState.oppArch?.profileId || gameState.oppArch?.id || 'GENERIC';
  const profile = AI_PROFILES[profileId] ?? AI_PROFILES.GENERIC;

  switch (phase) {
    case PHASE.UPKEEP:           return planUpkeep(gameState, profile);
    case PHASE.MAIN_1:           return planMain(gameState, profile, PHASE.MAIN_1);
    case PHASE.COMBAT_ATTACKERS: return planAttack(gameState, profile);
    case PHASE.COMBAT_BLOCKERS:  return planBlock(gameState, profile);
    case PHASE.MAIN_2:           return planMain(gameState, profile, PHASE.MAIN_2);
    case PHASE.END:              return planEnd(gameState, profile);
    default:                     return passPlan(phase);
  }
}

// ─── VALIDATE PLAN ────────────────────────────────────────────────────────────
// Before translating to DuelCore actions, validate each spec action.
// Invalid actions are skipped with a console warning — never crash.

function validateAction(action, state) {
  if (action.type === 'PLAY_CARD') {
    const card = state.o.hand.find(c => c.iid === action.cardId);
    if (!card) {
      console.warn(`[AI] PLAY_CARD: card ${action.cardId} not in hand.`);
      return false;
    }
  }
  if (action.type === 'ATTACK') {
    for (const iid of action.attackerIds || []) {
      const c = state.o.bf.find(x => x.iid === iid);
      if (!c || !isCre(c) || c.tapped || c.summoningSick) {
        console.warn(`[AI] ATTACK: invalid attacker ${iid}.`);
        return false;
      }
    }
  }
  return true;
}

// ─── COMPATIBILITY ADAPTER ────────────────────────────────────────────────────
// Converts AITurnPlan spec-format actions → DuelCore reducer action objects.
// Called by DuelScreen.jsx via applyAiActions().

/**
 * Evaluate the current GameState and return DuelCore-compatible action array.
 * This is the interface consumed by the existing UI (DuelScreen → applyAiActions).
 *
 * @param {object} state - Current GameState (read-only snapshot)
 * @returns {object[]}   - Array of DuelCore GameAction objects
 */
export function aiDecide(state) {
  const plan = getAIPlan(state, state.phase);
  const dcActions = [];

  for (const action of plan.actions) {
    if (!validateAction(action, state)) continue;

    switch (action.type) {
      case 'PLAY_CARD': {
        const card = state.o.hand.find(c => c.iid === action.cardId);
        if (!card) break;

        if (isLand(card)) {
          dcActions.push({ type: 'PLAY_LAND', who: 'o', iid: card.iid });
        } else {
          // Tap lands to cover cost before casting.
          const { tapActions, affordable } = buildTapActions(state, card.cost);
          if (!affordable) {
            console.warn(`[AI] PLAY_CARD: cannot afford ${card.name} — skipping.`);
            break;
          }
          dcActions.push(...tapActions);
          const tgt = action.targets?.[0] || null;
          dcActions.push({ type: 'CAST_SPELL', who: 'o', iid: card.iid, tgt, xVal: 3 });
        }
        break;
      }

      case 'ATTACK': {
        for (const iid of action.attackerIds || []) {
          dcActions.push({ type: 'DECLARE_ATTACKER', iid });
        }
        break;
      }

      case 'BLOCK': {
        dcActions.push({ type: 'DECLARE_BLOCKER', blId: action.blockerId, attId: action.attackerId });
        break;
      }

      case 'ACTIVATE_ABILITY': {
        dcActions.push({ type: 'ACTIVATE_ABILITY', iid: action.sourceId, tgt: action.targets?.[0] || null });
        break;
      }

      case 'PASS_PRIORITY':
        // No DuelCore action — phase advance is handled by DuelScreen after aiDecide returns.
        break;

      default:
        console.warn(`[AI] Unknown action type: ${action.type}`);
    }
  }

  return dcActions;
}

export default { getAIPlan, aiDecide, AI_PROFILES };
