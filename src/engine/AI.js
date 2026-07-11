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
  isLand, isCre, isInst, isSort, isArt,
  getBF, getPow, getTou, canBlockDuel,
  canPay, parseMana, hasKw,
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

// Creature valuation algorithm adapted from Card-Forge/forge
// (forge-ai/src/main/java/forge/ai/CreatureEvaluator.java), GPL-3.0.
// See THIRD_PARTY_NOTICES.md.
//
// Ported subset only -- Shandalar's Alpha/Beta pool doesn't implement most of
// Forge's later mechanics (energy, detain, goad, stun/fade/time counters,
// paired/soulbond, encode, cumulative upkeep/echo), so those branches are
// omitted rather than stubbed. See docs/SYSTEMS.md for the ported list.
export function evaluateCreatureValue(c, state) {
  if (!c) return 0;
  let value = 80;
  value += 20; // Shandalar has no token concept -- every creature counts as "non-token".

  const power = getPow(c, state);
  const toughness = getTou(c, state);

  value += power * 15;
  value += toughness * 10;
  value += (c.cmc || 0) * 5;

  // Evasion keywords ported: Shandalar's keyword set has FLYING/MENACE/FEAR
  // but not horsemanship/intimidate/skulk.
  if (hasKw(c, KEYWORDS.FLYING.id, state)) value += power * 10;
  if (hasKw(c, KEYWORDS.FEAR.id, state)) value += power * 6;
  if (hasKw(c, KEYWORDS.MENACE.id, state)) value += power * 4;

  if (power > 0) {
    if (hasKw(c, KEYWORDS.DOUBLE_STRIKE.id, state)) {
      value += 10 + (power * 15);
    } else if (hasKw(c, KEYWORDS.FIRST_STRIKE.id, state)) {
      value += 10 + (power * 5);
    }
    if (hasKw(c, KEYWORDS.DEATHTOUCH.id, state)) value += 25;
    if (hasKw(c, KEYWORDS.LIFELINK.id, state)) value += power * 10;
    if (power > 1 && hasKw(c, KEYWORDS.TRAMPLE.id, state)) value += (power - 1) * 5;
    if (hasKw(c, KEYWORDS.VIGILANCE.id, state)) value += (power * 5) + (toughness * 5);
  }

  // Defensive keywords
  if (hasKw(c, KEYWORDS.REACH.id, state) && !hasKw(c, KEYWORDS.FLYING.id, state)) value += 5;

  // Protection
  if (hasKw(c, KEYWORDS.INDESTRUCTIBLE.id, state)) {
    value += 70;
  }
  if (hasKw(c, KEYWORDS.HEXPROOF.id, state)) {
    value += 35;
  } else if (hasKw(c, KEYWORDS.SHROUD.id, state)) {
    value += 30;
  }
  if (hasKw(c, KEYWORDS.PROTECTION.id, state)) value += 20;

  // Bad keywords
  if (hasKw(c, KEYWORDS.DEFENDER.id, state)) value -= (power * 9) + 40;

  if (!c.tapped) value += 1;

  return value;
}

function sumCreaturePower(creatures, state) {
  return creatures.filter(isCre).reduce((sum, c) => sum + evaluateCreatureValue(c, state), 0);
}

// Higher score = better position for the AI opponent.
export function evaluateBoard(state) {
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

// Pick the opposing land most worth destroying. Priority:
//   1. Nonbasic lands (utility/dual lands cost more to replace and often
//      enable specific strategies -- denying them hurts more than a basic).
//   2. Among basics, the color the player has the fewest sources of
//      (denial pushes them toward color screw rather than just card disadvantage).
//   3. Fallback: any tapped land (already used this turn, "free" tempo loss).
//   4. Fallback: any land at all.
// Returns null if the player controls no lands.
function selectLandToDestroy(state) {
  const lands = state.p.bf.filter(isLand);
  if (!lands.length) return null;

  const isBasic = (l) => l.subtype?.startsWith('Basic ');
  const nonbasics = lands.filter(l => !isBasic(l));
  if (nonbasics.length) {
    return nonbasics.reduce((a, b) => (a.tapped && !b.tapped ? a : b));
  }

  const colorCounts = {};
  for (const l of lands) {
    const c = l.produces?.[0] || 'C';
    colorCounts[c] = (colorCounts[c] || 0) + 1;
  }
  const scarcest = lands.reduce((a, b) => {
    const ca = colorCounts[a.produces?.[0] || 'C'];
    const cb = colorCounts[b.produces?.[0] || 'C'];
    return cb < ca ? b : a;
  });
  return scarcest;
}

// --- MANA SIMULATION HELPERS --------------------------------------------------
// Compute how much mana the AI can access (current pool + untapped lands).

export function computeAvailableMana(state) {
  const pool = { ...state.o.mana };
  for (const c of state.o.bf) {
    if (isLand(c) && !c.tapped) {
      const color = c.produces?.[0] || 'C';
      pool[color] = (pool[color] || 0) + 1;
    }
    if (!isLand(c) && !c.tapped && !c.summoningSick && c.activated?.effect?.startsWith('addMana')) {
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
export function buildTapActions(state, cost) {
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
  for (const c of state.o.bf.filter(x => !isLand(x) && !x.tapped && !x.summoningSick && x.activated?.effect?.startsWith('addMana'))) {
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

    // Strip Mine: {T}, Sacrifice this land: Destroy target land.
    // Only fire if there's an opposing land worth blowing up -- don't burn
    // a land drop for nothing.
    if (c.activated?.effect === 'destroyTargetLand' && c.activated.cost?.includes('sac') && isLand(c)) {
      const land = selectLandToDestroy(state);
      if (land) {
        actions.push({ type: 'ACTIVATE_ABILITY', sourceId: c.iid, targets: [land.iid] });
      }
      continue;
    }

    // Demonic Hordes: {BBB}{T}: Destroy target land (upkeep sac-a-land-of-choice
    // drawback is handled separately by its upkeep hook, not here).
    if (c.activated?.effect === 'destroyTargetLand' && !c.activated.cost?.includes('sac') && !isLand(c)) {
      const land = selectLandToDestroy(state);
      if (land) {
        actions.push({ type: 'ACTIVATE_ABILITY', sourceId: c.iid, targets: [land.iid] });
      }
      continue;
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
export function selectPlayableCards(state, phase) {
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

    // Power Sink costs {U} to cast -- its X is the defender's obligation at resolution,
    // not a caster-side mana selection. Bypass the X-maximizing heuristic and cmc filter.
    if (card.id === 'power_sink') {
      if (canPay(computeAvailableMana(state), 'U', 0)) {
        candidates.push({ card, effectiveCost: 'U', xVal: null, effectiveCmc: 1 });
      }
      continue;
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
export function selectBestCurve(candidates, manaBudget) {
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
    if (!top || top.caster !== 'p') return null;
    if (card.effect === 'counterCreature' && !isCre(top.card)) return null;
    if (card.id === 'spell_blast') {
      const xv = xVal ?? 1;
      const hit = state.stack.filter(i => i.caster === 'p' && i.card.cmc === xv);
      if (!hit.length) return null;
      return [hit[hit.length - 1].id];
    }
    return [top.id];
  }
  if (card.effect === 'powerSink') {
    const top = state.stack[state.stack.length - 1];
    if (!top || top.caster !== 'p') return null;
    return [top.id];
  }

  const isRemoval = ['destroy','exileCreature','bounce','destroyTapped',
    'destroyArtifact','destroyArtOrEnch'].includes(card.effect);
  if (isRemoval) {
    let threats = state.p.bf.filter(isCre);

    // Respect card restrictions so the AI never selects an illegal target.
    if (card.restriction === 'nonArtifactNonBlack') {
      threats = threats.filter(t => t.color !== 'B' && !isArt(t));
    } else if (card.restriction === 'nonBlack') {
      threats = threats.filter(t => t.color !== 'B');
    }

    // destroyTapped: only tapped creatures are legal targets.
    if (card.effect === 'destroyTapped') {
      threats = threats.filter(t => t.tapped);
    }

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

  // Regrowth targets a specific card in the caster's own graveyard at cast time.
  // Bail if graveyard is empty (nothing to recover).
  if (card.effect === 'regrowth') {
    if (!state.o.gy.length) return null;
    return [state.o.gy[state.o.gy.length - 1].iid];
  }

  if (card.effect === 'destroyTargetLand') {
    const land = selectLandToDestroy(state);
    if (!land) return null;
    return [land.iid];
  }

  const targetsSelf = ['draw3','draw1','drawX','gainLife3','gainLifeX','gainLife1',
    'gainLife2','gainLife6','tutor'].includes(card.effect);
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
  if (score * profile.greedySpells < 0.10) {
    // Removal and counters bypass the score gate — they have their own gating in selectTarget.
    const isRemoval = ['destroy','exileCreature','bounce','destroyTapped',
      'destroyArtifact','destroyArtOrEnch'].includes(card.effect);
    const isCounter = card.effect === 'counter' || card.effect === 'counterCreature';
    if (!isRemoval && !isCounter) return null;
  }

  const { tapActions, affordable } = buildTapActions(virtualState, effectiveCost);
  if (!affordable) return null;

  let nextVirtual = virtualState;

  // Track mana produced by tapping sources into a running pool.
  const vManaAfterTap = { ...virtualState.o.mana };

  for (const ta of tapActions) {
    if (ta.type === 'TAP_LAND') {
      nextVirtual = {
        ...nextVirtual,
        o: {
          ...nextVirtual.o,
          bf: nextVirtual.o.bf.map(c => c.iid === ta.iid ? { ...c, tapped: true } : c),
        },
      };
      // Credit the mana this land produced.
      const color = ta.mana || 'C';
      vManaAfterTap[color] = (vManaAfterTap[color] || 0) + 1;
    } else if (ta.type === 'TAP_ART_MANA') {
      const src = nextVirtual.o.bf.find(c => c.iid === ta.iid);
      nextVirtual = {
        ...nextVirtual,
        o: {
          ...nextVirtual.o,
          bf: nextVirtual.o.bf.map(c => c.iid === ta.iid ? { ...c, tapped: true } : c),
        },
      };
      // Credit each mana character this artifact produces.
      if (src?.activated?.mana) {
        for (const ch of src.activated.mana) {
          if ('WUBRGC'.includes(ch)) vManaAfterTap[ch] = (vManaAfterTap[ch] || 0) + 1;
        }
      }
    }
  }

  // Deduct the spell's cost from the virtual pool so subsequent spells in
  // this planning loop see the correct remaining mana.
  const req = parseMana(effectiveCost);
  const poolAfterCast = { ...vManaAfterTap };
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
    poolAfterCast[color] = Math.max(0, (poolAfterCast[color] || 0) - (req[color] || 0));
  }
  // Deduct generic cost from whatever colored mana remains (greedy, mirrors buildTapActions).
  let generic = req.generic || 0;
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
    if (generic <= 0) break;
    const spend = Math.min(generic, poolAfterCast[color] || 0);
    poolAfterCast[color] = (poolAfterCast[color] || 0) - spend;
    generic -= spend;
  }

  // Credit mana produced by this spell (e.g. Dark Ritual) into the pool so
  // subsequent spells in the planning loop see the extra mana as available.
  if (card.effect === 'addMana' && Array.isArray(card.mana)) {
    for (const ch of card.mana) {
      if ('WUBRGC'.includes(ch)) poolAfterCast[ch] = (poolAfterCast[ch] || 0) + 1;
    }
  }

  nextVirtual = {
    ...nextVirtual,
    o: { ...nextVirtual.o, mana: poolAfterCast },
  };

  // Gate mana-producing spells: only cast if at least one additional spell
  // becomes affordable in the post-cast virtual state.
  if (card.effect === 'addMana') {
    const postCastPlayable = selectPlayableCards(nextVirtual, 'MAIN');
    const hasFollowUp = postCastPlayable.some(p => {
      if (p.card.effect === 'addMana') return false;
      const { affordable } = buildTapActions(nextVirtual, p.effectiveCost);
      return affordable;
    });
    if (!hasFollowUp) return null;
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

  // Credit mana-producing spells (e.g. Dark Ritual) into the virtual pool
  // so downstream scoring and planning see the mana as available.
  if (card.effect === 'addMana' && Array.isArray(card.mana)) {
    const newPool = { ...ns.o.mana };
    for (const ch of card.mana) {
      if ('WUBRGC'.includes(ch)) newPool[ch] = (newPool[ch] || 0) + 1;
    }
    ns = { ...ns, o: { ...ns.o, mana: newPool } };
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
  'COMBAT_ATTACKERS', 'COMBAT_AFTER_ATTACKERS',
  'COMBAT_BLOCKERS',  'COMBAT_AFTER_BLOCKERS',
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
  // After any addMana spell resolves, re-select playable cards from the updated
  // virtual state so that ramp-unlocked follow-ups enter the iteration.
  const primaryPlayable = selectPlayableCards(virtualState, phase);
  const primaryActions = [];
  let primaryVirtual = virtualState;
  const primaryTried = new Set();
  let pi = 0;
  while (pi < primaryPlayable.length) {
    const entry = primaryPlayable[pi++];
    if (primaryTried.has(entry.card.iid)) continue;
    primaryTried.add(entry.card.iid);
    const targets = selectTarget(entry.card, primaryVirtual, profile, entry.xVal);
    if (targets === null) continue;
    const result = evaluateAndCast(entry, targets, primaryVirtual, profile);
    if (!result) continue;
    primaryActions.push(...result.actions);
    primaryVirtual = result.newVirtualState;
    // Ramp spell resolved: re-query playable cards so newly-affordable spells
    // are added to the candidate list for this planning pass.
    if (entry.card.effect === 'addMana') {
      for (const newEntry of selectPlayableCards(primaryVirtual, phase)) {
        if (!primaryTried.has(newEntry.card.iid)) primaryPlayable.push(newEntry);
      }
    }
  }

  // 4. Generate alternative plan: cast cheapest-first (tempo curve) using the same
  // candidate set returned by selectBestCurve, but ordered lowest-CMC first.
  // Same ramp re-selection logic applied here.
  const altPlayable = [...primaryPlayable.slice(0, primaryPlayable.length)]
    .sort((a, b) => a.effectiveCmc - b.effectiveCmc);
  const altActions = [];
  let altVirtual = virtualState;
  const altTried = new Set();
  let ai = 0;
  while (ai < altPlayable.length) {
    const entry = altPlayable[ai++];
    if (altTried.has(entry.card.iid)) continue;
    altTried.add(entry.card.iid);
    const targets = selectTarget(entry.card, altVirtual, profile, entry.xVal);
    if (targets === null) continue;
    const result = evaluateAndCast(entry, targets, altVirtual, profile);
    if (!result) continue;
    altActions.push(...result.actions);
    altVirtual = result.newVirtualState;
    if (entry.card.effect === 'addMana') {
      for (const newEntry of selectPlayableCards(altVirtual, phase)) {
        if (!altTried.has(newEntry.card.iid)) altPlayable.push(newEntry);
      }
    }
  }

  // 5. Choose between the two plans.
  // High-aggression profiles (>= 0.9, currently KARAG) use MCTS for plan selection.
  // All other profiles fall back to evaluateBoard score comparison.
  let chosenActions;
  let chosenVirtual;

  if (profile.aggression >= 0.9 && primaryActions.length > 0 && altActions.length > 0) {
    // Pass pre-simulated virtual states as nextState so scoreMoves/MCTS starts
    // rollouts from the correct post-plan position (TD-002 fix).
    // action field is kept as a no-op sentinel so the candidate shape is consistent
    // with the planAttack call site; scoreMoves ignores it when nextState is present.
    const candidates = [
      { action: { type: 'ADVANCE_PHASE' }, nextState: primaryVirtual, label: 'primary' },
      { action: { type: 'ADVANCE_PHASE' }, nextState: altVirtual,     label: 'alt' },
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

// --- BANDING (CR 702.22) -------------------------------------------------
// AI.js remains strictly read-only: this only ever returns a FORM_BAND
// action for planAttack to append to its plan, it never mutates state.

// Same aggression tier planAttack already uses for other risky/tactical
// judgment calls (the MCR-evaluated risky-attack branch below).
const BAND_AGGRESSION_THRESHOLD = 0.8;
// Banding is only a clear win for the attacker when there's a lower-value
// creature worth sacrificing (via the 702.22k damage-order choice) to
// protect a higher-value one -- an evenly-matched pair gains nothing and
// eats the 702.22h downside (one block now stops the whole group) for free.
const BAND_VALUE_GAP_RATIO = 0.6;

// getBandFormationAction: decides whether the AI's already-declared attacker
// set contains a CR 702.22c-legal, value-justified band to form, and if so
// returns the FORM_BAND action for it (or null). Pure function -- reads
// `state` and the attackerIds planAttack already committed to, mutates
// nothing.
function getBandFormationAction(state, profile, attackerIds) {
  if (profile.aggression < BAND_AGGRESSION_THRESHOLD) return null;
  if (attackerIds.length < 2) return null;

  const attackers = attackerIds.map(iid => getBF(state, iid)).filter(Boolean);
  const bandingMembers = attackers.filter(c => hasKw(c, KEYWORDS.BANDING.id, state));
  if (!bandingMembers.length) return null;

  const nonBandingMembers = attackers.filter(c => !hasKw(c, KEYWORDS.BANDING.id, state));

  // CR 702.22c: at least one member must have banding, at most one may lack it.
  let eligible;
  if (bandingMembers.length >= 2) {
    eligible = bandingMembers;
  } else if (nonBandingMembers.length >= 1) {
    // Only one banding attacker -- pair it with the highest-value non-banding
    // attacker (the one most worth protecting via the 702.22k choice).
    const bestPartner = nonBandingMembers.reduce((best, c) =>
      evaluateCreatureValue(c, state) > evaluateCreatureValue(best, state) ? c : best
    );
    eligible = [bandingMembers[0], bestPartner];
  } else {
    return null; // lone banding attacker, nobody to band with
  }

  const values = eligible.map(c => evaluateCreatureValue(c, state));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo >= hi * BAND_VALUE_GAP_RATIO) return null; // evenly matched -- skip

  return { type: 'FORM_BAND', iids: eligible.map(c => c.iid) };
}

// chooseBandingDamageOrder: answers either 702.22j (bandAttackerDamageOrder,
// the defending player orders the blockers) or 702.22k (bandBlockerDamageOrder,
// the active player orders the band members) with the same heuristic --
// lowest evaluateCreatureValue absorbs lethal damage first, so higher-value
// creatures are spared. `choice` is the full pendingChoice object (kind,
// options[], each option's `order` array of iids); returns the id of the
// option whose order matches the ascending-value sort, or the first option
// if nothing matches (shouldn't happen -- permutations() always covers every
// ordering of the same recipient set).
export function chooseBandingDamageOrder(choice, state) {
  const options = choice?.options || [];
  if (!options.length) return null;
  const sorted = [...options[0].order].sort(
    (a, b) => evaluateCreatureValue(getBF(state, a), state) - evaluateCreatureValue(getBF(state, b), state)
  );
  const match = options.find(o =>
    o.order.length === sorted.length && o.order.every((id, i) => id === sorted[i])
  );
  return (match || options[0]).id;
}

// chooseDiscardToLibrary: answers Library of Leng's discardToLibraryChoice.
// Same cost-conscious convention as the rest of this file -- keep the card
// over a random draw only when it's a cheap nonland the AI can recast soon
// (cmc at most the AI's own land count); otherwise let it go to the
// graveyard. The card is looked up by choice.cardIid in the AI's own
// graveyard (this choice is only ever offered to the discarding player).
export function chooseDiscardToLibrary(choice, state) {
  const card = state.o.gy.find(c => c.iid === choice.cardIid);
  if (!card) return 'graveyard';
  if (isLand(card)) return 'graveyard';
  const landCount = state.o.bf.filter(isLand).length;
  return card.cmc <= landCount ? 'library' : 'graveyard';
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

  const actions = [{ type: 'ATTACK', attackerIds, defenderId: 'player' }];
  const bandAction = getBandFormationAction(state, profile, attackerIds);
  if (bandAction) actions.push(bandAction);
  actions.push({ type: 'PASS_PRIORITY' });

  return {
    phase: PHASE.COMBAT_ATTACKERS,
    actions,
  };
}

// getBandRiskPower: the damage a blocker actually risks taking by blocking
// `att`. CR 702.22h means blocking one band member counts as blocking every
// member of its band, so the blocker is exposed to the whole band's combined
// power, not just att's own -- this is distinct from att's own getPow(),
// which still governs how much damage att itself deals to the *player* if
// left unblocked (band membership doesn't change that).
function getBandRiskPower(att, state) {
  if (!att?.bandId) return getPow(att, state);
  const members = (state.attackers || [])
    .map(id => getBF(state, id))
    .filter(c => c && c.bandId === att.bandId);
  return members.reduce((sum, c) => sum + getPow(c, state), 0);
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
    // Damage the blocker itself risks taking -- combined band power when att
    // is banded (702.22h), not just att's own ap. ap stays att's own power
    // for the player-facing-damage checks below (preventLethal/preventDamage),
    // which band membership doesn't change.
    const blockRiskPow = getBandRiskPower(att, state);

    const valid = available.filter(b =>
      !alreadyBlocking.has(b.iid) && canBlockDuel(b, att)
    );

    if (!valid.length) continue;

    // Priority: favorable trade > survive > prevent lethal > pass
    const favorableTrade = valid.find(b =>
      getPow(b, state) >= at && getTou(b, state) > blockRiskPow
    );
    const survives = valid.find(b => getTou(b, state) > blockRiskPow);
    const preventLethal = state.o.life <= ap ? valid[0] : null;

    // Chump fallback: block to prevent free damage even when our blocker dies.
    // Passive profiles (aggression < 0.4) accept small hits; balanced/aggressive chump earlier.
    const chumpThreshold = profile.aggression >= 0.6 ? 2 : 3;
    const preventDamage = (!favorableTrade && !survives && ap >= chumpThreshold)
      ? valid[0]
      : null;

    const chosen = favorableTrade || survives || preventLethal || preventDamage;
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
// player spell. Evaluates counterspells against whatever the opponent just cast a spell.
// Only considers instant-speed cards. Counters and reactive removal.

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
      if (card.effect === 'destroyRedOrCounter') {
        const redSpell = state.stack.filter(i => i.caster === 'p' && i.card?.color === 'R');
        if (redSpell.length) {
          spellTargets = [redSpell[redSpell.length - 1].id];
        } else {
          const redPerm = state.p.bf.filter(i => i.color === 'R');
          if (!redPerm.length) continue;
          const target = redPerm.reduce((a, b) => scoreThreat(b, state) > scoreThreat(a, state) ? b : a);
          spellTargets = [target.iid];
        }
      } else if (card.effect === 'destroyBlueOrCounter') {
        const blueSpell = state.stack.filter(i => i.caster === 'p' && i.card?.color === 'U');
        if (blueSpell.length) {
          spellTargets = [blueSpell[blueSpell.length - 1].id];
        } else {
          const bluePerm = state.p.bf.filter(i => i.color === 'U');
          if (!bluePerm.length) continue;
          const target = bluePerm.reduce((a, b) => scoreThreat(b, state) > scoreThreat(a, state) ? b : a);
          spellTargets = [target.iid];
        }
      } else {
        // Generic counter: target top opponent spell.
        spellTargets = [stackTop.id];
      }
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
  if (state.o.mulliganDecided) return false;
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
    case PHASE.UPKEEP:                  return planUpkeep(gameState, profile);
    case PHASE.MAIN_1:                  return planMain(gameState, profile, PHASE.MAIN_1);
    case PHASE.COMBAT_ATTACKERS:        return planAttack(gameState, profile);
    case PHASE.COMBAT_AFTER_ATTACKERS:  return planInstantResponse(gameState, profile);
    case PHASE.COMBAT_BLOCKERS:         return planBlock(gameState, profile);
    case PHASE.COMBAT_AFTER_BLOCKERS:   return planInstantResponse(gameState, profile);
    case PHASE.MAIN_2:                  return planMain(gameState, profile, PHASE.MAIN_2);
    case PHASE.END:                     return planEnd(gameState, profile);
    default:                            return passPlan(phase);
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
          // Emit RESOLVE_STACK for all spells under stack-based ruleset.
          if (state.ruleset?.stackType !== 'batch') {
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

      case 'FORM_BAND': {
        // Already a raw DuelCore action (see getBandFormationAction) -- pass through.
        dcActions.push({ type: 'FORM_BAND', iids: action.iids });
        break;
      }

      case 'ACTIVATE_ABILITY': {
        dcActions.push({ type: 'ACTIVATE_ABILITY', who: 'o', iid: action.sourceId, tgt: action.targets?.[0] || null });
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

// --- GUARDIAN ANGEL TEMP ABILITIES -----------------------------------------------

// AI plan for activating Guardian Angel temporary damage prevention abilities.
// Evaluates which temp abilities to activate based on threat assessment.
export function planGuardianAngelTempAbilities(state, profile) {
  if (!state.p.tempAbilities || state.p.tempAbilities.length === 0) {
    return { actions: [] };
  }

  const actions = [];
  const totalMana = Object.values(state.p.mana).reduce((a, v) => a + v, 0);

  // Conservative profile: activate if facing lethal threat in combat
  if (profile.aggression < 0.5) {
    const incomingDamage = (state.o.attackers ?? []).reduce((sum, atkId) => {
      const atk = state.o.bf.find(c => c.iid === atkId);
      return sum + (getPow(atk, state) || 0);
    }, 0);
    if (incomingDamage >= state.p.life && totalMana >= (state.p.tempAbilities[0]?.cost?.length ?? 1)) {
      for (const temp of state.p.tempAbilities) {
        const costLen = temp.cost?.length ?? 1;
        if (totalMana >= costLen) {
          actions.push({ type: 'ACTIVATE_TEMP_ABILITY', tempId: temp.id });
          break;
        }
      }
    }
  } else if (profile.aggression >= 0.8) {
    // Aggressive profile: proactive shield if any blockers present
    if ((state.o.bf.length ?? 0) > 0 && totalMana > 0) {
      const temp = state.p.tempAbilities[0];
      if (temp && totalMana >= (temp.cost?.length ?? 1)) {
        actions.push({ type: 'ACTIVATE_TEMP_ABILITY', tempId: temp.id });
      }
    }
  }

  return { phase: PHASE.MAIN_1, actions };
}

// --- ALADDIN'S LAMP PICKING --------------------------------------------------

// AI choice for Aladdin's Lamp: picks a card from the shown pool.
export function chooseLampPick(pendingPick, state, profile) {
  if (!pendingPick || !pendingPick.cardIids) {
    return null;
  }

  const cardsShown = pendingPick.cardIids.map(iid => {
    const cardInLib = state.p.lib.find(c => c.iid === iid);
    return cardInLib || { iid, name: 'Unknown', cost: '0' };
  });

  // Greedy profile: pick the lowest-cost spell, or highest-cost if all lands
  const nonLands = cardsShown.filter(c => !isLand(c));
  if (nonLands.length > 0) {
    const byMana = nonLands.sort((a, b) => {
      const aCMC = a.cmc || parseMana(a.cost || '0').generic || 0;
      const bCMC = b.cmc || parseMana(b.cost || '0').generic || 0;
      return aCMC - bCMC;
    });
    return profile.greedySpells >= 0.7 ? byMana[0].iid : byMana[byMana.length - 1].iid;
  }

  // All lands: pick randomly
  return cardsShown[Math.floor(Math.random() * cardsShown.length)].iid;
}

// --- RAGING RIVER PILE DIVISION -----------------------------------------------

// AI choice for Raging River: divides non-flying defenders into left/right piles.
export function chooseRiverDivide(nonFlyerIids, state, profile) {
  if (!nonFlyerIids || nonFlyerIids.length === 0) {
    return { leftIids: [], rightIids: [] };
  }

  const nonFlyers = nonFlyerIids.map(iid => state.o.bf.find(c => c.iid === iid)).filter(Boolean);

  // Conservative profile: try to split strong blockers across both piles
  if (profile.aggression < 0.5) {
    const byStat = nonFlyers.sort((a, b) => {
      const aVal = evaluateCreatureValue(a, state);
      const bVal = evaluateCreatureValue(b, state);
      return bVal - aVal;
    });
    const mid = Math.ceil(byStat.length / 2);
    return {
      leftIids: byStat.slice(0, mid).map(c => c.iid),
      rightIids: byStat.slice(mid).map(c => c.iid),
    };
  }

  // Aggressive profile: stack weakest in one pile
  const byVal = nonFlyers.sort((a, b) => {
    const aVal = evaluateCreatureValue(a, state);
    const bVal = evaluateCreatureValue(b, state);
    return aVal - bVal;
  });
  const weakCount = Math.floor(byVal.length / 2);
  return {
    leftIids: byVal.slice(0, weakCount).map(c => c.iid),
    rightIids: byVal.slice(weakCount).map(c => c.iid),
  };
}

// --- RAGING RIVER SIDE SELECTION ---------------------------------------------

// AI choice for Raging River: selects which piles attackers can be blocked by.
export function chooseRiverSides(attackerIids, state, profile) {
  if (!attackerIids || attackerIids.length === 0) {
    return {};
  }

  const attackers = attackerIids.map(iid => state.o.bf.find(c => c.iid === iid)).filter(Boolean);
  const sides = {};

  // Simple heuristic: spread attackers across both sides evenly
  for (let i = 0; i < attackers.length; i++) {
    const att = attackers[i];
    // Aggressive profile: push flyers to one side
    if (hasKw(att, KEYWORDS.FLYING.id, state) && profile.aggression >= 0.7) {
      sides[att.iid] = 'left';
    } else {
      sides[att.iid] = i % 2 === 0 ? 'left' : 'right';
    }
  }

  return sides;
}

export default { getAIPlan, aiDecide, AI_PROFILES };
