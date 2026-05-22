// src/engine/AI.js
// AI decision generator — produces GameAction objects for DuelCore to execute.
// Per design spec S3 and SYSTEMS.md S6.
//
// STRICT CONSTRAINTS (ENGINE_CONTRACT_SPEC.md S5):
//   ✓ May read GameState snapshots
//   ✓ May generate valid GameAction objects
//   ✗ CANNOT mutate GameState
//   ✗ CANNOT simulate combat results directly
//   ✗ CANNOT bypass DuelCore validation
//   ✗ CANNOT make async calls or access the network
//
// Tier 5 adds curve-fitting and multi-plan evaluation. MCTS may be consulted
// for high-aggression profiles (aggression >= 0.9). All evaluation uses virtual
// state — DuelCore remains the sole mutator.

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
//
// Planner single-responsibility helpers (Tier 4 extraction, Tier 5 augmented):
//
// selectPlayableCards(state, phase) -> { card, effectiveCost, xVal, effectiveCmc }[]
//   Pure filter: which cards in AI hand could legally be cast right now?
//   Considers timing (sorcery vs instant speed), cast restrictions, and mana ceiling.
//   Does NOT evaluate strategic value. Order is determined by selectBestCurve.
//
// selectBestCurve(candidates, manaBudget) -> candidates[]
//   Greedy mana-fit: picks the combination that maximises mana spent without
//   exceeding the budget. Descending-CMC greedy pass augmented with up to three
//   "drop the biggest" alternatives.
//
// selectTarget(card, state, profile, xVal) -> string[] | null
//   Per-effect target selection. Returns null if no valid target or if the
//   effect should not be cast in the current board state.
//
// evaluateAndCast(playable, spellTargets, virtualState, profile)
//   -> { actions, newVirtualState } | null
//   Applies the score gate, builds tap actions, and emits the PLAY_CARD spec action.
//   Returns null if the card should be skipped (score too low or unaffordable).
//
// applyVirtualPlay(virtualState, action) -> virtualState
//   Approximate virtual-state update for scoring. Creatures enter sick, removal
//   removes targets. Does NOT replicate full effect resolution.
//
// scoreTurnPlan(plan, baseState) -> number
//   Simulates each PLAY_CARD in a plan against baseState and returns evaluateBoard score.
//
// planMain(state, profile, phase) -> AITurnPlan
//   Coordinator: channel top-up → land play → two candidate plans (greedy and tempo)
//   → score/MCTS selection → activated abilities → PASS_PRIORITY.

// --- CARD SELECTION HELPERS ---------------------------------------------------

// Returns an array of { card, effectiveCost, xVal, effectiveCmc } for cards the AI could legally cast.
// Does not consider strategic value — only legality and affordability ceiling.
// Order is determined by selectBestCurve to maximise mana utilisation.
function selectPlayableCards(state, phase) {
  const totalManaCeiling = Object.values(computeAvailableMana(state))
    .reduce((s, v) => s + v, 0);

  const stackEmpty = !state.stack?.length;
  const candidates = [];

  for (const card of state.o.hand) {
    if (isLand(card)) {
      // Lands handled separately by caller.
      continue;
    }

    const isSorceryOk = (isCre(card) || isSort(card)) && stackEmpty;
    const isInstantOk = isInst(card);
    if (!isSorceryOk && !isInstantOk) continue;

    if (card.castRestriction === 'beforeCombatDamage') {
      if (!BEFORE_COMBAT_DAMAGE_PHASES.has(phase)) continue;
    }

    if (card.cmc > totalManaCeiling) continue;

    let effectiveCost = card.cost;
    let xVal = null;
    let effectiveCmc = card.cmc;
    if (/X/i.test(card.cost)) {
      const baseCost = card.cost.replace(/X/gi, '');
      const baseReq = parseMana(baseCost);
      const baseManaNeeded = Object.values(baseReq).reduce((s, v) => s + v, 0);
      xVal = totalManaCeiling - baseManaNeeded;
      if (xVal < 1) continue;
      effectiveCost = String(xVal) + baseCost.replace(/[{}]/g, '');
      effectiveCmc = baseManaNeeded + xVal;
    }

    candidates.push({ card, effectiveCost, xVal, effectiveCmc });
  }

  return selectBestCurve(candidates, totalManaCeiling);
}

// Greedy mana-fit: picks the combination of candidates that maximises mana spent
// without exceeding the budget. Runs a greedy descending pass then checks up to
// three "drop the largest" alternatives. O(n^2) but n is bounded by hand size.
function selectBestCurve(candidates, manaBudget) {
  const sorted = [...candidates].sort((a, b) => b.effectiveCmc - a.effectiveCmc);
  const greedy = [];
  let remaining = manaBudget;
  for (const c of sorted) {
    if (c.effectiveCmc <= remaining) {
      greedy.push(c);
      remaining -= c.effectiveCmc;
    }
  }
  const greedyCost = greedy.reduce((s, c) => s + c.effectiveCmc, 0);

  if (sorted.length > 1) {
    for (let dropIdx = 0; dropIdx < Math.min(sorted.length, 3); dropIdx++) {
      const without = sorted.filter((_, i) => i !== dropIdx);
      const alt = [];
      let altRem = manaBudget;
      for (const c of without) {
        if (c.effectiveCmc <= altRem) {
          alt.push(c);
          altRem -= c.effectiveCmc;
        }
      }
      const altCost = alt.reduce((s, c) => s + c.effectiveCmc, 0);
      if (altCost > greedyCost) {
        return alt;
      }
    }
  }

  return greedy;
}

// Returns target array for a spell, or null if no valid target / shouldn't cast.
function selectTarget(card, state, profile, xVal = null) {
  const isCounter = card.effect === 'counter' || card.effect === 'counterCreature';
  if (isCounter) {
    const top = state.stack[state.stack.length - 1];
    if (!top || top.controller !== 'p') return null;
    return [];
  }

  const isRemoval = ['destroy','exileCreature','bounce','destroyTapped',
    'destroyArtifact','destroyArtOrEnch'].includes(card.effect);
  if (isRemoval) {
    const threats = state.p.bf.filter(isCre);
    if (!threats.length) return null;
    const target = threats.reduce((a, b) =>
      scoreThreat(a, state) >= scoreThreat(b, state) ? a : b
    );
    const targetScore = scoreThreat(target, state);
    const minThreatForRemoval = card.cmc >= 4 ? 5 : 2;
    if (targetScore < minThreatForRemoval && state.p.life > 8) return null;
    return [target.iid];
  }

  const needsOwnCreature = ['pumpCreature','gainFlying','pumpPower','enchantCreature'].includes(card.effect);
  if (needsOwnCreature) {
    if (profile.greedySpells < 0.5) return null;
    const ownCreatures = state.o.bf.filter(isCre);
    if (!ownCreatures.length) return null;
    const target = ownCreatures.reduce((a, b) =>
      getPow(a, state) >= getPow(b, state) ? a : b
    );
    return [target.iid];
  }

  if (card.effect === 'berserk') {
    const oppAttackers = state.p.bf.filter(c => isCre(c) && c.attacking);
    if (oppAttackers.length) {
      const target = oppAttackers.reduce((a, b) =>
        getPow(b, state) >= getPow(a, state) ? b : a
      );
      return [target.iid];
    }
    const ownAttackers = state.o.bf.filter(c => isCre(c) && c.attacking);
    const pool = ownAttackers.length ? ownAttackers : state.o.bf.filter(isCre);
    if (!pool.length) return null;
    const target = pool.reduce((a, b) =>
      getPow(a, state) >= getPow(b, state) ? a : b
    );
    return [target.iid];
  }

  if (card.effect === 'disintegrate' || card.effect === 'drainLife') {
    const threats = state.p.bf.filter(isCre);
    const killThreshold = xVal ?? 3;
    const killable = threats.filter(t => getTou(t, state) <= killThreshold);
    const target = killable.length
      ? killable.reduce((a, b) => scoreThreat(b, state) > scoreThreat(a, state) ? b : a)
      : 'p';
    return [typeof target === 'string' ? target : target.iid];
  }

  if (card.effect === 'regrowthCreature' || card.effect === 'reanimateOwn') {
    if (!state.o.gy.some(isCre)) return null;
    return [];
  }

  const targetsSelf = ['draw3','draw1','drawX','gainLife3','gainLifeX','gainLife1',
    'gainLife2','gainLife6','tutor','regrowth'].includes(card.effect);
  const targetsOpp = ['damage3','damage5','damageX','psionicBlast','chainLightning',
    'damage1','damage2','ping'].includes(card.effect);
  const tgt = targetsSelf ? 'o' : targetsOpp ? 'p' : null;
  return tgt ? [tgt] : [];
}

// Decide whether to cast a playable card and emit the action.
// Returns { actions, newVirtualState } or null if cast was skipped.
function evaluateAndCast(playable, spellTargets, virtualState, profile) {
  const { card, effectiveCost, xVal } = playable;

  // Score-based skip check (preserves Tier 2 behavior).
  const score = scoreSpellValue(card, virtualState, profile);
  if (score * profile.greedySpells < 0.35) {
    // Removal and counters bypass the score gate — they have their own gating in selectTarget.
    const isRemoval = ['destroy','exileCreature','bounce','destroyTapped',
      'destroyArtifact','destroyArtOrEnch'].includes(card.effect);
    const isCounter = card.effect === 'counter' || card.effect === 'counterCreature';
    if (!isRemoval && !isCounter) return null;
  }

  const { tapActions, affordable } = buildTapActions(virtualState, effectiveCost);
  if (!affordable) return null;

  let nextVirtual = virtualState;
  for (const ta of tapActions) {
    if (ta.type === 'TAP_LAND' || ta.type === 'TAP_ART_MANA') {
      nextVirtual = {
        ...nextVirtual,
        o: {
          ...nextVirtual.o,
          bf: nextVirtual.o.bf.map(c => c.iid === ta.iid ? { ...c, tapped: true } : c),
        },
      };
    }
  }

  return {
    actions: [{
      type: 'PLAY_CARD',
      cardId: card.iid,
      targets: spellTargets,
      _tapActions: tapActions,
      _xVal: xVal,
    }],
    newVirtualState: nextVirtual,
  };
}

// --- TURN PLAN EVALUATION -----------------------------------------------------

// Apply a single PLAY_CARD action to a virtual state for scoring purposes only.
// Returns a new virtual state. Does NOT replicate full effect resolution — only
// approximate board impact (creatures enter, mana spent, life paid, hand reduced).
// This is a scoring heuristic, not a true simulator. See ENGINE_CONTRACT_SPEC known limitations.
function applyVirtualPlay(virtualState, action) {
  if (action.type !== 'PLAY_CARD') return virtualState;
  const card = virtualState.o.hand.find(c => c.iid === action.cardId);
  if (!card) return virtualState;

  let ns = {
    ...virtualState,
    o: {
      ...virtualState.o,
      hand: virtualState.o.hand.filter(c => c.iid !== action.cardId),
    },
  };

  if (isLand(card)) {
    ns = { ...ns, o: { ...ns.o, bf: [...ns.o.bf, { ...card, tapped: false }] } };
    return ns;
  }

  if (isCre(card)) {
    // Creature enters tapped+sick for scoring purposes (approximates next-turn impact).
    ns = { ...ns, o: { ...ns.o, bf: [...ns.o.bf, { ...card, tapped: false, summoningSick: true }] } };
  }

  // For removal, approximate the target's removal from the opponent's board.
  if (action.targets?.length && typeof action.targets[0] === 'string' &&
      action.targets[0] !== 'p' && action.targets[0] !== 'o') {
    const targetIid = action.targets[0];
    ns = {
      ...ns,
      p: { ...ns.p, bf: ns.p.bf.filter(c => c.iid !== targetIid) },
    };
  }

  return ns;
}

// Score a candidate plan by simulating each PLAY_CARD against virtualState
// and calling evaluateBoard on the resulting position.
function scoreTurnPlan(plan, baseState) {
  let virtual = baseState;
  for (const action of plan.actions) {
    if (action.type === 'PLAY_CARD') {
      virtual = applyVirtualPlay(virtual, action);
    }
  }
  return evaluateBoard(virtual);
}

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
  let virtualState = state;

  // 1. Channel: top up colorless mana if it would let us cast a big spell.
  if (state.o.channelActive && state.o.life > 2) {
    const sorted = [...state.o.hand].filter(c => !isLand(c)).sort((a, b) => b.cmc - a.cmc);
    const bestSpell = sorted[0];
    if (bestSpell) {
      const { affordable } = buildTapActions(state, bestSpell.cost);
      if (!affordable) {
        const availMana = computeAvailableMana(state);
        const totalMana = Object.values(availMana).reduce((s, v) => s + v, 0);
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
        }
      }
    }
  }

  // 2. Play a land if we have one and haven't played one this turn.
  // After queuing the land play, mirror it into virtualState so downstream mana
  // calculations see the new land and can cast spells on the same turn.
  const land = state.o.hand.find(isLand);
  if (land && state.landsPlayed < 1) {
    actions.push({ type: 'PLAY_CARD', cardId: land.iid, targets: [], isLand: true });
    virtualState = {
      ...virtualState,
      o: {
        ...virtualState.o,
        hand: virtualState.o.hand.filter(h => h.iid !== land.iid),
        bf: [...virtualState.o.bf, { ...land, tapped: false, summoningSick: false }],
      },
      landsPlayed: 1,
    };
  }

  // 3. Generate primary plan (greedy curve fit via selectBestCurve).
  const primaryPlayable = selectPlayableCards(virtualState, phase);
  const primaryActions = [];
  let primaryVirtual = virtualState;
  for (const entry of primaryPlayable) {
    const targets = selectTarget(entry.card, primaryVirtual, profile, entry.xVal);
    if (targets === null) continue;
    const result = evaluateAndCast(entry, targets, primaryVirtual, profile);
    if (!result) continue;
    primaryActions.push(...result.actions);
    primaryVirtual = result.newVirtualState;
  }

  // 4. Generate alternative plan: cast cheapest-first (tempo curve) using the same
  // candidate set returned by selectBestCurve, but ordered lowest-CMC first.
  const altPlayable = [...primaryPlayable].sort((a, b) => a.effectiveCmc - b.effectiveCmc);
  const altActions = [];
  let altVirtual = virtualState;
  for (const entry of altPlayable) {
    const targets = selectTarget(entry.card, altVirtual, profile, entry.xVal);
    if (targets === null) continue;
    const result = evaluateAndCast(entry, targets, altVirtual, profile);
    if (!result) continue;
    altActions.push(...result.actions);
    altVirtual = result.newVirtualState;
  }

  // 5. Choose between the two plans.
  // High-aggression profiles (>= 0.9, currently KARAG) use MCTS for plan selection.
  // All other profiles fall back to evaluateBoard score comparison.
  let chosenActions;
  let chosenVirtual;

  if (profile.aggression >= 0.9 && primaryActions.length > 0 && altActions.length > 0) {
    const candidates = [
      { action: { type: 'PLAN', actions: primaryActions }, label: 'primary' },
      { action: { type: 'PLAN', actions: altActions },     label: 'alt' },
    ];
    const best = getBestMove(virtualState, candidates, 600);
    if (best == null) {
      // MCTS returned nothing (unknown PLAN type or empty rollout); fall back to scoring.
      const primaryScore = scoreTurnPlan({ actions: primaryActions }, virtualState);
      const altScore    = scoreTurnPlan({ actions: altActions },    virtualState);
      chosenActions = primaryScore >= altScore ? primaryActions : altActions;
      chosenVirtual = primaryScore >= altScore ? primaryVirtual : altVirtual;
    } else if (best.label === 'alt') {
      chosenActions = altActions;
      chosenVirtual = altVirtual;
    } else {
      chosenActions = primaryActions;
      chosenVirtual = primaryVirtual;
    }
  } else {
    const primaryScore = scoreTurnPlan({ actions: primaryActions }, virtualState);
    const altScore    = scoreTurnPlan({ actions: altActions },    virtualState);
    chosenActions = primaryScore >= altScore ? primaryActions : altActions;
    chosenVirtual = primaryScore >= altScore ? primaryVirtual : altVirtual;
  }

  for (const a of chosenActions) actions.push(a);

  // 6. Activated abilities (Tier 2).
  const activated = planActivatedAbilities(chosenVirtual, profile);
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

// --- INSTANT-SPEED RESPONSE PLANNER ------------------------------------------
// Called when AI has priority during the player's turn or in response to a
// player spell. Only considers cards with type === 'Instant'. Counters and
// reactive removal.

function planInstantResponse(state, profile) {
  const instants = state.o.hand.filter(c => isInst(c));
  if (!instants.length) return passPlan(state.phase);

  let virtualState = state;
  const stackTop = state.stack && state.stack.length
    ? state.stack[state.stack.length - 1]
    : null;
  const opponentSpellOnStack = stackTop && stackTop.caster === 'p';

  const actions = [];

  for (const card of instants) {
    if (card.cmc > Object.values(computeAvailableMana(virtualState)).reduce((s, v) => s + v, 0)) {
      continue;
    }

    let spellTargets = null;
    const isCounter = card.effect === 'counter' || card.effect === 'counterCreature' ||
                      card.effect === 'counterBlack' || card.effect === 'counterGreen' ||
                      card.effect === 'counterWhite' || card.effect === 'powerSink' ||
                      card.effect === 'destroyBlueOrCounter' || card.effect === 'destroyRedOrCounter';

    if (isCounter) {
      if (!opponentSpellOnStack) continue;
      if (card.effect === 'counterBlack' && stackTop.card.color !== 'B') continue;
      if (card.effect === 'counterGreen' && stackTop.card.color !== 'G') continue;
      if (card.effect === 'counterWhite' && stackTop.card.color !== 'W') continue;
      if (card.effect === 'counterCreature' && !isCre(stackTop.card)) continue;

      const spellThreat = stackTop.card.cmc + (isCre(stackTop.card) ? 2 : 0) +
                          (stackTop.card.effect?.startsWith('damage') ? 3 : 0) +
                          (stackTop.card.effect === 'wrathAll' ? 10 : 0);
      if (spellThreat < 3 && profile.greedySpells < 0.7) continue;
      spellTargets = [];
    }

    // Instant-speed removal during opponent's attack.
    const isRemoval = ['destroy','exileCreature','bounce','destroyTapped'].includes(card.effect);
    if (spellTargets === null && isRemoval && state.phase === 'COMBAT_BLOCKERS') {
      const attackingThreats = state.p.bf.filter(c => isCre(c) && c.attacking);
      if (!attackingThreats.length) continue;
      const target = attackingThreats.reduce((a, b) =>
        scoreThreat(a, state) >= scoreThreat(b, state) ? a : b
      );
      spellTargets = [target.iid];
    }

    // Instant burn at face for lethal only.
    const isBurn = ['damage3','damage5','damage1','damage2','damageX','psionicBlast','disintegrate'].includes(card.effect);
    if (spellTargets === null && isBurn) {
      const dmg = card.effect === 'damage1' ? 1
                : card.effect === 'damage2' ? 2
                : card.effect === 'damage3' ? 3
                : card.effect === 'damage5' ? 5
                : card.effect === 'psionicBlast' ? 4
                : 3;
      if (dmg >= state.p.life) {
        spellTargets = ['p'];
      } else {
        continue; // hold burn for our own turn unless lethal
      }
    }

    // Fog: cast if AI is about to take significant damage.
    if (spellTargets === null && card.effect === 'fog') {
      const incoming = state.attackers?.reduce((sum, id) => {
        const att = getBF(state, id);
        return att ? sum + getPow(att, state) : sum;
      }, 0) || 0;
      if (incoming < 4 && state.o.life > 8) continue;
      spellTargets = [];
    }

    if (spellTargets === null) continue;

    const { tapActions, affordable } = buildTapActions(virtualState, card.cost);
    if (!affordable) continue;

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

    actions.push({ type: 'PLAY_CARD', cardId: card.iid, targets: spellTargets, _tapActions: tapActions });
    // One instant per priority window — re-evaluate on the next tick.
    break;
  }

  actions.push({ type: 'PASS_PRIORITY', who: 'o' });
  return { phase: state.phase, actions };
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

  // Instant-speed response: priority window open during the player's turn.
  if (gameState.priorityWindow && gameState.active === 'p') {
    return planInstantResponse(gameState, profile);
  }

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

  // Contract: planner output must have phase and actions[].
  if (!plan || !Array.isArray(plan.actions)) {
    console.error('[AI] getAIPlan returned malformed plan:', plan);
    return [];
  }

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
          const tapActions = action._tapActions;
          if (!tapActions) {
            console.error(`[AI] PLAY_CARD missing _tapActions for ${card.name}. Planner bug.`);
            break;
          }
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
        // For instant-speed (priority window open), emit to DuelCore to close the window.
        // For phase-end passes (no window), DuelScreen handles phase advance.
        if (state.priorityWindow) {
          dcActions.push({ type: 'PASS_PRIORITY', who: 'o' });
        }
        break;

      default:
        console.warn(`[AI] Unknown action type: ${action.type}`);
    }
  }

  return dcActions;
}

export default { getAIPlan, aiDecide, AI_PROFILES };
