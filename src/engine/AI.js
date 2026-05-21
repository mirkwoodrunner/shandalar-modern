// src/engine/AI.js
// AI decision generator ? produces GameAction objects for DuelCore to execute.
// Per design spec S3 and SYSTEMS.md S6.
//
// STRICT CONSTRAINTS (ENGINE_CONTRACT_SPEC.md S5):
//   ? May read GameState snapshots
//   ? May generate valid GameAction objects
//   ? CANNOT mutate GameState
//   ? CANNOT simulate combat results directly
//   ? CANNOT bypass DuelCore validation
//   ? CANNOT make async calls or access the network

import { ARCHETYPES } from '../data/cards.js';
import KEYWORDS from '../data/keywords.js';
import {
  isLand, isCre, isInst, isSort,
  getBF, getPow, getTou, canBlockDuel,
  canPay, parseMana,
} from './DuelCore.js';
import { PHASE } from './phases.js';
import { getBestMove } from './MCTS.js';

// --- OPPONENT PROFILES --------------------------------------------------------
// Pure data ? no logic. Weights range 0.0?1.0.

const AI_PROFILES = {
  GENERIC:  { aggression: 0.5, greedySpells: 0.5, removalPriority: 0.5 },
  DELENIA:  { aggression: 0.3, greedySpells: 0.4, removalPriority: 0.8 }, // White: defensive
  XYLOS:    { aggression: 0.2, greedySpells: 0.3, removalPriority: 0.9 }, // Blue: control
  MORTIS:   { aggression: 0.6, greedySpells: 0.7, removalPriority: 1.0 }, // Black: ruthless
  KARAG:    { aggression: 1.0, greedySpells: 1.0, removalPriority: 0.3 }, // Red: pure aggro
  SYLVARA:  { aggression: 0.7, greedySpells: 0.6, removalPriority: 0.5 }, // Green: ramp/stomp
  ARZAKON:  { aggression: 0.8, greedySpells: 0.8, removalPriority: 1.0 }, // Final boss: optimal
};

// --- BOARD EVALUATION ---------------------------------------------------------

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

// Score a spell's situational value in [0, 1].
// Returns 1 = high value, 0 = no value. Profile weights still modulate.
function scoreSpellValue(card, state, profile) {
  const e = card.effect;

  // Burn / direct damage to opponent: scales with damage vs life.
  if (e === 'damage3' || e === 'damage5' || e === 'damage1' || e === 'damage2' ||
      e === 'psionicBlast' || e === 'damageX' || e === 'disintegrate' ||
      e === 'chainLightning' || e === 'drainLife') {
    const dmg = e === 'damage1' ? 1
              : e === 'damage2' ? 2
              : e === 'damage3' ? 3
              : e === 'damage5' ? 5
              : e === 'psionicBlast' ? 4
              : 3; // X spells, drainLife: assume X=3 baseline
    if (dmg >= state.p.life) return 1.0;             // lethal: always cast
    if (state.p.life <= 6) return 0.9;               // close to lethal
    return Math.min(1.0, dmg / 8);                   // proportional otherwise
  }

  // Card draw: more valuable when hand is empty.
  if (e === 'draw3' || e === 'draw1' || e === 'drawX') {
    const handDeficit = Math.max(0, 5 - state.o.hand.length);
    return 0.4 + (handDeficit * 0.1);
  }

  // Life gain: only valuable when low life.
  if (e === 'gainLife3' || e === 'gainLife6' || e === 'gainLifeX' ||
      e === 'gainLife1' || e === 'gainLife2') {
    if (state.o.life <= 5) return 0.9;
    if (state.o.life <= 10) return 0.5;
    return 0.1;
  }

  // Tutor / regrowth: always reasonable.
  if (e === 'tutor' || e === 'regrowth' || e === 'regrowthCreature') return 0.7;

  // Default: neutral.
  return 0.5;
}

// Threat score for an opposing creature. Higher = more dangerous.
function scoreThreat(creature, state) {
  const pow = getPow(creature, state);
  const tou = getTou(creature, state);
  const kws = creature.keywords || [];
  let score = pow * 2 + tou;

  if (kws.includes(KEYWORDS.FLYING.id))    score += 3;
  if (kws.includes(KEYWORDS.TRAMPLE.id))   score += 2;
  if (kws.includes(KEYWORDS.LIFELINK.id))  score += 3;
  if (kws.includes(KEYWORDS.DEATHTOUCH.id))score += 4;
  if (kws.includes(KEYWORDS.FIRST_STRIKE.id)) score += 2;

  // Tapped creatures are less of an immediate threat.
  if (creature.tapped) score -= 2;

  // Summoning sick creatures threaten next turn, not this turn.
  if (creature.summoningSick && !creature.keywords?.includes(KEYWORDS.HASTE.id)) score -= 1;

  return score;
}

// --- MANA SIMULATION HELPERS --------------------------------------------------
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

// --- ACTIVATED ABILITIES ------------------------------------------------------

function planActivatedAbilities(state, profile) {
  const actions = [];

  for (const c of state.o.bf) {
    if (c.tapped) continue;

    // Triskelion-style ping: spend a +1/+1 counter to deal 1 damage.
    if (c.activated?.effect === 'triskelionPing' && (c.counters?.P1P1 || 0) > 0) {
      // Target the smallest threat we can outright kill, else opponent face.
      const killable = state.p.bf.filter(t =>
        isCre(t) && getTou(t, state) - (t.damage || 0) === 1
      );
      if (killable.length) {
        const tgt = killable.reduce((a, b) => scoreThreat(b, state) > scoreThreat(a, state) ? b : a);
        actions.push({ type: 'ACTIVATE_ABILITY', sourceId: c.iid, targets: [tgt.iid] });
        continue;
      }
      // Fire face only if low player life — otherwise hold counters.
      if (state.p.life <= 5) {
        actions.push({ type: 'ACTIVATE_ABILITY', sourceId: c.iid, targets: ['p'] });
      }
    }
  }

  return actions;
}

// --- PHASE PLANNERS -----------------------------------------------------------

function passPlan(phase) {
  return { phase, actions: [{ type: 'PASS_PRIORITY' }] };
}

function planUpkeep(state, profile) {
  // Check for activated abilities with upkeep relevance.
  // For now, safe fallback ? upkeep triggers resolve automatically via DuelCore.
  return passPlan(PHASE.UPKEEP);
}

const BEFORE_COMBAT_DAMAGE_PHASES = new Set([
  'MAIN_1', 'COMBAT_BEGIN', 'COMBAT_ATTACKERS', 'COMBAT_BLOCKERS',
]);

function planMain(state, profile, phase) {
  const actions = [];
  let availMana = computeAvailableMana(state);
  let totalMana = Object.values(availMana).reduce((s, v) => s + v, 0);

  const sorted = [...state.o.hand].sort((a, b) => b.cmc - a.cmc);

  // Virtual state tracks which lands have already been designated for spells this
  // turn, so we don't over-commit mana across multiple PLAY_CARDs in one plan.
  let virtualState = state;

  // Channel: if active, greedily add USE_CHANNEL actions to top up mana for best spell
  if (state.o.channelActive && state.o.life > 2) {
    const bestSpell = sorted.filter(c => !isLand(c))[0];
    if (bestSpell) {
      const { affordable } = buildTapActions(state, bestSpell.cost);
      if (!affordable) {
        const shortfall = Math.max(0, bestSpell.cmc - totalMana);
        const channelCount = Math.min(shortfall, state.o.life - 2);
        for (let i = 0; i < channelCount; i++) {
          actions.push({ type: 'USE_CHANNEL', who: 'o' });
        }
        if (channelCount > 0) {
          virtualState = {
            ...state,
            o: {
              ...state.o,
              mana: { ...state.o.mana, C: (state.o.mana.C || 0) + channelCount },
              life: state.o.life - channelCount,
            },
          };
          availMana = computeAvailableMana(virtualState);
          totalMana = Object.values(availMana).reduce((s, v) => s + v, 0);
        }
      }
    }
  }

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

    if (card.castRestriction === 'beforeCombatDamage') {
      if (!BEFORE_COMBAT_DAMAGE_PHASES.has(phase)) continue;
    }

    const isCounter = card.effect === 'counter' || card.effect === 'counterCreature';
    if (isCounter && (state.stack.length === 0 || state.stack[state.stack.length - 1]?.controller !== 'p')) continue;

    if (card.cmc > totalMana) continue; // can't afford even with all lands tapped

    // X spells: strip X from cost, derive xVal from available mana, skip if can't pump X >= 1
    let effectiveCost = card.cost;
    let cardXVal = null;
    if (/X/i.test(card.cost)) {
      const baseCost = card.cost.replace(/X/gi, '');
      const baseReq = parseMana(baseCost);
      const baseManaNeeded = Object.values(baseReq).reduce((s, v) => s + v, 0);
      const vMana = computeAvailableMana(virtualState);
      const vTotal = Object.values(vMana).reduce((s, v) => s + v, 0);
      cardXVal = vTotal - baseManaNeeded;
      if (cardXVal < 1) continue;
      effectiveCost = String(cardXVal) + baseCost.replace(/[{}]/g, '');
    }

    // --- Build the spell action FIRST; only tap if the spell is actually valid ---

    let spellTargets = null; // null = not yet resolved; [] = no target; [id] = targeted

    // Removal: target highest-threat creature on the player's battlefield.
    const isRemoval = ['destroy','exileCreature','bounce','destroyTapped',
      'destroyArtifact','destroyArtOrEnch'].includes(card.effect);
    if (isRemoval) {
      const threats = state.p.bf.filter(isCre);
      if (!threats.length) continue; // no valid target — skip without tapping
      const target = threats.reduce((a, b) => scoreThreat(a, state) >= scoreThreat(b, state) ? a : b);
      // Don't waste expensive removal on a trivial threat.
      const targetScore = scoreThreat(target, state);
      const minThreatForRemoval = card.cmc >= 4 ? 5 : 2;
      if (targetScore < minThreatForRemoval && state.p.life > 8) continue;
      spellTargets = [target.iid];
    }

    // Pump spells that need a target creature on the AI's battlefield.
    if (spellTargets === null) {
      const needsOwnCreature = ['pumpCreature','gainFlying','pumpPower','enchantCreature'].includes(card.effect);
      if (needsOwnCreature) {
        const ownCreatures = state.o.bf.filter(isCre);
        if (!ownCreatures.length) continue; // no valid target — skip without tapping
        const target = ownCreatures.reduce((a, b) => getPow(a, state) >= getPow(b, state) ? a : b);
        if (profile.greedySpells >= 0.5) spellTargets = [target.iid];
        else continue;
      }
    }

    // Berserk.
    if (spellTargets === null && card.effect === 'berserk') {
      // Prefer opposing attackers (they die EOT, so we're "removing" them).
      const oppAttackers = state.p.bf.filter(c => isCre(c) && c.attacking);
      if (oppAttackers.length) {
        const target = oppAttackers.reduce((a, b) => getPow(b, state) >= getPow(a, state) ? b : a);
        spellTargets = [target.iid];
      } else {
        // Fall back to own attackers for a lethal swing.
        const ownAttackers = state.o.bf.filter(c => isCre(c) && c.attacking);
        const pool = ownAttackers.length ? ownAttackers : state.o.bf.filter(isCre);
        if (!pool.length) continue; // no valid target — skip without tapping
        const target = pool.reduce((a, b) => getPow(a, state) >= getPow(b, state) ? a : b);
        spellTargets = [target.iid];
      }
    }

    // Disintegrate / Drain Life: kill smallest creature if one can be eliminated, else go face.
    if (spellTargets === null && (card.effect === "disintegrate" || card.effect === "drainLife")) {
      const threats = state.p.bf.filter(isCre);
      const killable = threats.filter(t => getTou(t, state) <= (cardXVal ?? 3));
      const target = killable.length
        ? killable.reduce((a, b) => scoreThreat(b, state) > scoreThreat(a, state) ? b : a)
        : "p";
      spellTargets = [typeof target === "string" ? target : target.iid];
    }

    // Raise Dead / Resurrection.
    if (spellTargets === null && (card.effect === "regrowthCreature" || card.effect === "reanimateOwn")) {
      if (!state.o.gy.some(isCre)) continue; // nothing to recur — skip without tapping
      spellTargets = [];
    }

    // Generic spells (damage/draw/burn): score by situational value.
    if (spellTargets === null) {
      const targetsSelf = ['draw3','draw1','drawX','gainLife3','gainLifeX','gainLife1',
        'gainLife2','gainLife6','tutor','regrowth'].includes(card.effect);
      const targetsOpp  = ['damage3','damage5','damageX','psionicBlast','chainLightning',
        'damage1','damage2','ping'].includes(card.effect);
      const score = scoreSpellValue(card, state, profile);
      if (score * profile.greedySpells < 0.35) continue;
      const tgt = targetsSelf ? 'o' : targetsOpp ? 'p' : null;
      spellTargets = tgt ? [tgt] : [];
    }

    // spellTargets is now resolved. Only NOW check affordability and build tap actions.
    const { tapActions, affordable } = buildTapActions(virtualState, effectiveCost);
    if (!affordable) continue;

    // Mark the virtually tapped lands so subsequent spells don't over-commit.
    for (const ta of tapActions) {
      if (ta.type === 'TAP_LAND' || ta.type === 'TAP_ART_MANA') {
        virtualState = {
          ...virtualState,
          o: {
            ...virtualState.o,
            bf: virtualState.o.bf.map(c => c.iid === ta.iid ? { ...c, tapped: true } : c),
          },
        };
      }
    }

    actions.push({ type: 'PLAY_CARD', cardId: card.iid, targets: spellTargets, _tapActions: tapActions, _xVal: cardXVal });
  }

  // Append activated ability actions (Triskelion, etc.).
  const activated = planActivatedAbilities(virtualState, profile);
  for (const a of activated) actions.push(a);

  actions.push({ type: 'PASS_PRIORITY' });
  return { phase, actions };
}

function planAttack(state, profile) {
  const candidates = state.o.bf.filter(c => isCre(c) && !c.tapped && !c.summoningSick);
  if (!candidates.length) return passPlan(PHASE.COMBAT_ATTACKERS);

  const attackerIds = [];

  if (profile.aggression >= 1.0) {
    // Full aggro ? always attack with everything.
    for (const c of candidates) attackerIds.push(c.iid);
  } else {
    const defBf = state.p.bf.filter(isCre);

    for (const att of candidates) {
      const ap = getPow(att, state);
      const at = getTou(att, state);
      const attHasFlying = (att.keywords || []).includes(KEYWORDS.FLYING.id);

      // Check if attacker is effectively unblockable (flying with no opposing flyers).
      const defFlyers = defBf.filter(b => (b.keywords || []).includes(KEYWORDS.FLYING.id));
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
        // No blocker ? safe to attack.
        attackerIds.push(att.iid);
        continue;
      }

      const bp = getPow(bestBlocker, state);
      const bt = getTou(bestBlocker, state);

      // Win the trade: kill blocker AND survive.
      const killsBlocker = ap >= bt;
      const survives = at > bp;

      if (killsBlocker && survives) {
        // Favorable trade ? attack if board improves.
        attackerIds.push(att.iid);
        continue;
      }

      // Risky attack: use MCR to evaluate if aggression profile warrants it.
      if (profile.aggression >= 0.8) {
        // High aggression profiles (KARAG, ARZAKON, MORTIS) use MCR for risky attacks.
        const candidateMoves = [
          { action: { type: 'DECLARE_ATTACKER', iid: att.iid }, label: `attack_${att.iid}` },
          { action: { type: 'ADVANCE_PHASE' }, label: 'pass' },
        ];
        const best = getBestMove(state, candidateMoves, 400);
        if (best?.label?.startsWith('attack')) attackerIds.push(att.iid);
      } else if (Math.random() < profile.aggression) {
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

  // Lure: all able blockers must block the lure attacker first.
  const lureAttId = incomingAttackerIds.find(id => {
    const att = getBF(state, id);
    return att?.enchantments?.some(e => e.mod?.keywords?.includes("LURE"));
  });
  if (lureAttId) {
    const lureAtt = getBF(state, lureAttId);
    for (const bl of available) {
      if (!alreadyBlocking.has(bl.iid) && canBlockDuel(bl, lureAtt)) {
        alreadyBlocking.add(bl.iid);
        blockActions.push({ type: 'BLOCK', blockerId: bl.iid, attackerId: lureAttId });
      }
    }
  }

  // Aggregate lethal check: sum unblocked damage and force chumps if needed.
  const totalIncoming = incomingAttackerIds.reduce((sum, id) => {
    const att = getBF(state, id);
    return att ? sum + getPow(att, state) : sum;
  }, 0);

  const isLethal = totalIncoming >= state.o.life;
  const forcedChumps = new Set();

  if (isLethal) {
    // Sort attackers by power descending; chump the biggest first.
    const sortedAttackers = [...incomingAttackerIds]
      .map(id => getBF(state, id))
      .filter(Boolean)
      .sort((a, b) => getPow(b, state) - getPow(a, state));

    let remainingDamage = totalIncoming;
    const availableChumps = [...available];

    for (const att of sortedAttackers) {
      if (remainingDamage < state.o.life) break;
      const chump = availableChumps.find(b =>
        !alreadyBlocking.has(b.iid) && canBlockDuel(b, att)
      );
      if (!chump) continue;
      alreadyBlocking.add(chump.iid);
      forcedChumps.add(`${chump.iid}|${att.iid}`);
      blockActions.push({ type: 'BLOCK', blockerId: chump.iid, attackerId: att.iid });
      remainingDamage -= getPow(att, state);
      const idx = availableChumps.indexOf(chump);
      if (idx >= 0) availableChumps.splice(idx, 1);
    }
  }

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

    const chosen = favorableTrade || survives || preventLethal;
    if (chosen) {
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

// --- MULLIGAN DECISION --------------------------------------------------------

function shouldMulligan(state) {
  // Only legal at the very start of the AI's first opportunity.
  if (state.turn !== 1) return false;
  if (state.o.bf.length > 0) return false;
  if (state.landsPlayed > 0) return false;
  if ((state.o.mulls || 0) >= 2) return false;

  const handSize = state.o.hand.length;
  if (handSize < 5) return false; // never mulligan to 4 or below

  const landCount = state.o.hand.filter(isLand).length;
  if (landCount <= 1) return true;
  if (landCount >= handSize - 1) return true; // 6 of 7, or 5 of 6
  return false;
}

// --- MAIN ENTRY POINT ---------------------------------------------------------

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

// --- VALIDATE PLAN ------------------------------------------------------------
// Before translating to DuelCore actions, validate each spec action.
// Invalid actions are skipped with a console warning ? never crash.

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

// --- COMPATIBILITY ADAPTER ----------------------------------------------------
// Converts AITurnPlan spec-format actions ? DuelCore reducer action objects.
// Called by DuelScreen.jsx via applyAiActions().

/**
 * Evaluate the current GameState and return DuelCore-compatible action array.
 * This is the interface consumed by the existing UI (DuelScreen ? applyAiActions).
 *
 * @param {object} state - Current GameState (read-only snapshot)
 * @returns {object[]}   - Array of DuelCore GameAction objects
 */
export function aiDecide(state) {
  if (shouldMulligan(state)) {
    return [{ type: 'MULLIGAN', who: 'o' }];
  }

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
          // Use pre-built tap actions from planMain if present (avoids double-tapping
          // when multiple spells are planned in the same turn — see Bug B13).
          const tapActions = action._tapActions || (() => {
            const r = buildTapActions(state, card.cost);
            if (!r.affordable) {
              console.warn(`[AI] PLAY_CARD: cannot afford ${card.name} — skipping.`);
              return null;
            }
            return r.tapActions;
          })();
          if (!tapActions) break;
          if (action._xVal != null) dcActions.push({ type: 'SET_X', val: action._xVal });
          dcActions.push(...tapActions);
          const tgt = action.targets?.[0] || null;
          dcActions.push({ type: 'CAST_SPELL', who: 'o', iid: card.iid, tgt, xVal: action._xVal ?? null });
          // Only emit RESOLVE_STACK for instants under stack-based ruleset.
          // Sorceries, permanents, and batch-mode spells are already resolved by CAST_SPELL.
          if (isInst(card) && state.ruleset?.stackType !== 'batch') {
            dcActions.push({ type: 'RESOLVE_STACK' });
          }
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
        // No DuelCore action ? phase advance is handled by DuelScreen after aiDecide returns.
        break;

      default:
        console.warn(`[AI] Unknown action type: ${action.type}`);
    }
  }

  return dcActions;
}

export default { getAIPlan, aiDecide, AI_PROFILES };
