// src/hooks/useDuelController.ts
// Shared orchestration hook for both duel screens.
// Owns: AI loop (with applyAiActionsWithPriority), all priority-window effects,
// sandbox escape hatch, game-over timer, and mulligan state.
// Neither DuelScreen nor DuelScreenMobile may contain these effects directly.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDuel } from './useDuel.js';
import AIModule, { chooseBandingDamageOrder, chooseDiscardToLibrary, planGuardianAngelTempAbilities, chooseLampPick, chooseRiverDivide, chooseRiverSides } from '../engine/AI.js';
const { aiDecide, AI_PROFILES } = AIModule;
import { isLand, isCre, isArt, canPay, parseMana } from '../engine/DuelCore.js';
import { usePhaseAdvance } from './usePhaseAdvance';
import type { DuelConfig } from '../types/duel';
import type { CardData } from '../ui/Card/types';

// ── Internal helpers ──────────────────────────────────────────────────────────

type LogKind = 'info' | 'turn' | 'phase' | 'play' | 'opp_play' | 'damage' | 'heal';

function adaptLog(rawLog: unknown[]): { kind: LogKind; text: string }[] {
  return (rawLog ?? []).map(entry => {
    const text = typeof entry === 'string' ? entry : (entry as any)?.text ?? String(entry);
    let kind: LogKind = 'info';
    if (/^turn \d+/i.test(text))                                    kind = 'turn';
    else if (/phase|upkeep|draw step|main|combat|end step/i.test(text))  kind = 'phase';
    else if (/\byou\b.*(cast|played)/i.test(text))                       kind = 'play';
    else if (/\bopp(onent)?\b.*(cast|played)/i.test(text))               kind = 'opp_play';
    else if (/\bdamage\b/i.test(text))                                   kind = 'damage';
    else if (/\bheal|gain.*life\b/i.test(text))                          kind = 'heal';
    return { kind, text };
  });
}

// ── Exported helpers ──────────────────────────────────────────────────────────

export function resolveDefaultTarget(card: any, state: any): string | null {
  const { effect } = card;
  if (['damage3', 'damage5', 'damageX', 'psionicBlast', 'chainLightning'].includes(effect)) return 'o';
  if (['draw3', 'gainLife3', 'gainLifeX', 'tutor', 'drawX'].includes(effect)) return state.selTgt ?? 'p';
  return state.selTgt ?? null;
}

// Single authoritative source for cast-time explicit-target effects.
// Both DuelScreen.tsx and DuelScreenMobile.tsx import needsExplicitTarget from here.
// Do NOT duplicate this logic in screen components.
export const EXPLICIT_TARGET_EFFECTS = new Set([
  'bounce',
  'destroy',
  'destroyArtifact',
  'destroyArtOrEnch',
  'destroyTargetLand',
  'destroyBlack',
  'destroyBlueOrCounter',
  'destroyRedOrCounter',
  'pumpCreature',
  'enchantCreature',
  'reanimate',
  'howlFromBeyond',
  'pumpPower',
  'pumpToughness',
  'steal',
  'pacifism',
  'fear',
  'gloom',
  'weakness',
  'unholy_strength',
  'ping',
  'damage3',
  'damage5',
  'psionicBlast',
  'chainLightning',
  'draw3',   // Ancestral Recall — "target player draws three cards"
  // Simple-tier Forge batch (see THIRD_PARTY_NOTICES.md):
  'discardAllNonland', // Amnesia -- "target player reveals hand and discards all nonland cards"
  'colorLace',          // Chaoslace/Deathlace/Lifelace/Purelace/Thoughtlace -- "target spell or permanent"
  'scryTop3Reveal',     // Natural Selection -- "look at top three of target player's library"
  'returnArtifactFromGYToHand', // Reconstruction -- "target artifact card in your graveyard"
  // Moderate-tier Forge batch M1 (see THIRD_PARTY_NOTICES.md):
  'destroyArtifactGainCMC',        // Divine Offering -- "target artifact"
  'restoreArtifactsFromGYToLibrary', // Drafna's Restoration -- "target player"
  'pumpToughnessByTargetCMC',      // Great Defender -- "target creature"
  'damageByWhiteCardsInHand',      // Inquisition -- "target player"
  'scryTop5Reveal',                // Visions -- "target player"
  'tapXCreatures',                 // Word of Binding -- "X target creatures"
  'gainAndDealDamageThisTurn',     // Simulacrum -- "target creature you control"
  // Complex-tier Forge batch C1 (see THIRD_PARTY_NOTICES.md):
  'alabasterPotionChoice', // Alabaster Potion -- "target player" / "any target" (modal)
  'sewersOfEstark',        // Sewers of Estark -- "target creature"
  'winterBlastTapX',       // Winter Blast -- "X target creatures"
  'volcanicEruption',      // Volcanic Eruption -- "X target Mountains"
  // Complex-tier Forge batch C3 (see THIRD_PARTY_NOTICES.md):
  'enchantLand',              // Farmstead (and Wild Growth/Kudzu/Evil Presence) -- "enchant land"
  'phantasmalTerrainEnchant', // Phantasmal Terrain -- "enchant land"
]);

export function needsExplicitTarget(card: any): boolean {
  return EXPLICIT_TARGET_EFFECTS.has(card?.effect);
}

// Effects whose oracle text restricts the target to player/planeswalker only.
// Distinct from EXPLICIT_TARGET_EFFECTS, which only controls whether players
// are an *additional* legal target alongside creatures. Effects in this set
// must never allow a creature click to register as the target.
export const PLAYER_ONLY_TARGET_EFFECTS = new Set([
  'damage5', // Lava Axe -- "deals 5 damage to target player or planeswalker"
  'draw3',   // Ancestral Recall -- "target player draws three cards"
  'discardAllNonland', // Amnesia -- "target player reveals hand..."
  'scryTop3Reveal',    // Natural Selection -- "top three cards of target player's library"
  // Moderate-tier Forge batch M1 (see THIRD_PARTY_NOTICES.md):
  'restoreArtifactsFromGYToLibrary', // Drafna's Restoration -- "target player"
  'damageByWhiteCardsInHand',        // Inquisition -- "target player"
  'scryTop5Reveal',                  // Visions -- "target player"
]);

export function isPlayerOnlyTarget(card: any): boolean {
  return PLAYER_ONLY_TARGET_EFFECTS.has(card?.effect);
}

export function isCounterEffect(card: any): boolean {
  // 'counterArtifact' (Artifact Blast, simple-tier Forge batch) targets a spell
  // on the stack exactly like the other counter effects -- same stack-click flow.
  return ['counter', 'counterCreature', 'powerSink', 'counterArtifact'].includes(card?.effect);
}

export function isBebRebEffect(card: any): boolean {
  return card?.effect === 'destroyRedOrCounter' || card?.effect === 'destroyBlueOrCounter';
}

// Returns true when the selected card needs the player to click a stack item.
// BEB/REB only need stack target if mode === 'counter'.
export function needsStackTarget(card: any, pendingMode: 'counter' | 'destroy' | null): boolean {
  if (!card) return false;
  if (isCounterEffect(card)) return true;
  if (isBebRebEffect(card) && pendingMode === 'counter') return true;
  // colorLace (Chaoslace/Deathlace/Lifelace/Purelace/Thoughtlace, simple-tier Forge
  // batch): "target spell or permanent" -- same action either way, so a stack item
  // is always a legal click target alongside the permanent click path already
  // enabled via EXPLICIT_TARGET_EFFECTS (no mode toggle needed, unlike BEB/REB).
  if (card?.effect === 'colorLace') return true;
  return false;
}

// ── Cast/Activate flow ─────────────────────────────────────────────────────

export type CastFlowMode = 'xSelect' | 'targeting' | 'mana' | null;

export interface CastFlowState {
  // 'trigger': a suspended triggered ability that needs a fresh battlefield
  // target (Vesuvan Doppelganger's upkeep re-copy -- see s.pendingTriggerTarget).
  // Reuses the same targeting UI as 'spell'/'ability' (selectedTargets,
  // handleCardClick's castFlow?.mode === 'targeting' routing, the cast prompt's
  // skip/confirm buttons) but advanceCastFlow dispatches RESOLVE_TRIGGER_TARGET
  // instead of CAST_SPELL/ACTIVATE_ABILITY, and there is no mana step.
  kind: 'spell' | 'ability' | 'trigger';
  sourceIid: string;
  abilityId: string | null;
  mode: CastFlowMode;
  selectedTargets: string[];
  requiresTarget: boolean;
  maxTargets: number;
  canTargetPlayers: boolean;
  xVal?: number;          // locked X for this cast, set before mana/targeting
  xMax?: number;           // max affordable X at the moment selection began
  xLegalValues?: number[]; // for spell_blast -- explicit legal X values, omitted otherwise
}

export function needsAnyTarget(card: any): boolean {
  return needsExplicitTarget(card) || isCounterEffect(card) || isBebRebEffect(card);
}

export function isOptionalTarget(card: any): boolean {
  return Boolean(card?.optionalTarget);
}

export function getManaShortfall(
  pool: Record<string, number>,
  cost: string,
  xVal = 0
): { needed: Record<string, number>; have: Record<string, number> } | null {
  if (canPay(pool, cost, xVal)) return null;
  const required = parseMana(cost) as Record<string, number>;
  if (xVal > 0) required.generic = (required.generic || 0) + xVal;
  return { needed: required, have: { ...pool } };
}

// Returns the maximum X the player can afford for a card with a free-choice
// {X} in its cost. Returns -1 if the player cannot even pay the fixed portion.
// Does not apply to power_sink or spell_blast.
export function getMaxAffordableX(pool: Record<string, number>, cost: string): number {
  const baseCost = cost.replace(/X/gi, '');
  const baseReq = parseMana(baseCost) as Record<string, number>;
  const remaining: Record<string, number> = { ...pool };
  for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) {
    if ((pool[c] || 0) < (baseReq[c] || 0)) return -1;
    remaining[c] = Math.max(0, (remaining[c] || 0) - (baseReq[c] || 0));
  }
  const leftover = Object.values(remaining).reduce((s, v) => s + v, 0);
  const genericNeeded = baseReq.generic || 0;
  return Math.max(0, leftover - genericNeeded);
}

// Spell Blast: legal X values are the distinct CMCs of spells on the opponent's
// side of the stack (player casts Spell Blast to counter the opponent's spell).
export function getSpellBlastLegalX(stack: any[]): number[] {
  const values = new Set<number>();
  for (const item of stack) {
    if (item.caster === 'p') continue; // only opponent's spells are valid targets
    if (typeof item.card?.cmc === 'number') values.add(item.card.cmc);
  }
  return Array.from(values).sort((a, b) => a - b);
}

// Effects for activated abilities that require selecting a target.
const ACTIVATE_TARGET_EFFECTS = new Set([
  'ping', 'triskelionPing', 'destroyTapped', 'pumpCreature', 'gainFlying',
  'pumpPower', 'damage1', 'damage2', 'damage3', 'untapLand', 'tapTarget',
  'destroyWall', 'destroyArtifactSac', 'pingCombatant', 'cuombajjWitches',
  // Simple-tier Forge batch (see THIRD_PARTY_NOTICES.md):
  'tapTargetWall', 'preventDamage2ArtifactCreature', 'destroyBlackCreature',
  'damage1Flying', 'tapOrUntapArtifact', 'returnArtifactFromGYToHand',
  'destroyAuraOnOwnCreature', 'setAttackerPower0EOT', 'debuffTargetPower2EOT',
  'damage2Any', 'bouncePermanentControlled', 'revealHand',
  // Moderate-tier Forge batch M1 (see THIRD_PARTY_NOTICES.md):
  'counterAndArtifactType', 'skipNextUntap', 'damage1AnySelf1', 'untapXLands',
  'tapNonFlyingTarget', 'destroyArtifact', 'cantRegenTarget',
  'unblockableTargetPowerLE2', 'preventDamage1AnyReturnEnd', 'animateArtifactUntilEnd',
  // Moderate-tier Forge batch M2 (see THIRD_PARTY_NOTICES.md):
  'damage1AttackerOrBlocker', // Crimson Manticore -- "target attacking or blocking creature"
  // Ante cards (see THIRD_PARTY_NOTICES.md):
  'bronzeTabletExchange', // Bronze Tablet -- "target nontoken permanent an opponent owns"
  // Generalized-choice-mechanisms batch (see THIRD_PARTY_NOTICES.md):
  'colorChoiceTarget', // Alchor's Tomb -- "target permanent you control"
  'pumpWhileTapped',   // Ashnod's Battle Gear / Tawnos's Weaponry -- "target creature [you control]"
  // Complex-tier Forge batch C1 (see THIRD_PARTY_NOTICES.md):
  'trackerDamageExchange', // Tracker -- "target creature"
  'bansheeDrain',          // Banshee -- "any target"
  'forcefieldShield',      // Forcefield -- "an unblocked creature of your choice"
  // Complex-tier Forge batch C2 (see THIRD_PARTY_NOTICES.md):
  'lockArtifactWhileTapped', // Phyrexian Gremlins -- "target artifact"
  // Complex-tier Forge batch C4 (see THIRD_PARTY_NOTICES.md):
  'bounceUnenchanted', // Time Elemental -- "target permanent that isn't enchanted"
  // Erosion reuses 'enchantCreature' (already registered above) for its "enchant land" attach.
  // Emblem infrastructure batch (see THIRD_PARTY_NOTICES.md):
  'cyclopeanTombMireCounter', // Cyclopean Tomb -- "target non-Swamp land"
]);

// Ability effects that can target players (in addition to permanents).
const PLAYER_TARGETABLE_ABILITY_EFFECTS = new Set([
  'ping', 'triskelionPing', 'damage1', 'damage2', 'damage3',
  'cuombajjWitches',
  // Simple-tier Forge batch (see THIRD_PARTY_NOTICES.md):
  'damage2Any', // Orcish Mechanics -- "deals 2 damage to any target"
  'revealHand', // Glasses of Urza -- "target player's hand" (player only)
  // Moderate-tier Forge batch M1 (see THIRD_PARTY_NOTICES.md):
  'damage1AnySelf1',          // Brothers of Fire -- "deals 1 damage to any target"
  'preventDamage1AnyReturnEnd', // Rakalite -- "prevent... damage to any target"
  // Complex-tier Forge batch C1 (see THIRD_PARTY_NOTICES.md):
  'bansheeDrain', // Banshee -- "any target"
]);

function scoreLibCard(card: any, _state: any): number {
  if (card.type?.includes('Creature')) {
    const pow = typeof card.power === 'number' ? card.power : 0;
    const tou = typeof card.toughness === 'number' ? card.toughness : 0;
    return (pow + tou) * 0.15 + (card.cmc ? 1 / card.cmc : 0) * 0.1;
  }
  if (card.effect === 'counter')  return 0.85;
  if (card.effect === 'destroy' || card.effect === 'destroyArtifact') return 0.80;
  if (card.effect === 'tutor')    return 0.75;
  if (card.effect === 'draw3' || card.effect === 'draw1') return 0.65;
  if (card.effect === 'damage5')  return 0.70;
  if (card.effect === 'damage3')  return 0.55;
  if (card.type?.includes('Artifact')) return Math.min(1.0, (card.cmc ?? 0) * 0.12);
  return 0.40;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDuelController(
  config: DuelConfig,
  onDuelEnd: (outcome: 'win' | 'lose' | 'forfeit', state: unknown) => void,
  aiSpeed = 800,
) {
  const {
    state,
    dispatch,
    tapLand,
    tapArtifactMana,
    playLand,
    castSpell,
    resolveStack,
    declareAttacker,
    declareBlocker,
    advancePhase,
    selectCard,
    selectTarget,
    setX,
    mulligan,
    activateAbility,
    chooseLotusColor,
    cancelLotus,
    applyAiActions,
    openPriorityWindow,
    passPriority,
    resolveChoice,
    resolveTriggerTarget,
    resolveUpkeepChoice,
    resolveConditionalCounter,
    useChannel,
    undoManaTaps,
    chooseTutor,
    declineTutor,
    chooseTutorTransmute,
    confirmTransmuteSacrifice,
    declineTransmuteSacrifice,
    confirmTransmutePay,
    declineTransmutePay,
    resolveAnteExchange,
    declineAnteExchange,
  } = useDuel(
    config.pDeckIds,
    config.oppArchKey,
    config.ruleset,
    config.overworldHP,
    config.castleMod,
    config.anteEnabled ?? false,
    config.oppLife ?? null,
  );

  const s = state;

  // ── Refs ───────────────────────────────────────────────────────────────────
  const aiRef = useRef(false);
  const prevPriorityWindow = useRef(false);
  const priorityWindowInitiator = useRef(false);
  const prevStackLen = useRef(0);
  const mulliganDismissed = useRef(false);
  const sandboxHandFired = useRef(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showMulligan, setShowMulligan] = useState(true);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [showLotus, setShowLotus] = useState(false);
  const [showBop, setShowBop] = useState(false);
  const [pendingDualLand, setPendingDualLand] = useState<{ card: any; colors: string[] } | null>(null);
  const [pendingBlockerIid, setPendingBlockerIid] = useState<string | null>(null);
  const [castFlow, setCastFlow] = useState<CastFlowState | null>(null);
  const [pendingActivate, setPendingActivate] = useState<any | null>(null);
  const [pendingMode, setPendingMode] = useState<'counter' | 'destroy' | null>(null);
  const [endTurnPending, setEndTurnPending] = useState(false);
  const endTurnStartTurn = useRef<number | null>(null);
  const [fatalError, setFatalError] = useState<{ message: string; stack: string; context: string } | null>(null);

  // Builds a bounded, JSON-serializable snapshot of state relevant to
  // debugging an AI-decision crash, and surfaces it as blocking UI instead of
  // letting the effect that threw die silently (which is what left
  // "Ending Turn..." stuck forever pre-fix -- see docs/MECHANICS_INDEX.md,
  // Bug Fix: Fatal AI Error Silent Hang). Does not attempt to recover or
  // continue: per this project's fail-fast rule, a thrown error here means
  // something is malformed, and the duel should stop rather than guess.
  function reportFatalAiError(err: unknown, where: string) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : '(no stack available)';
    const context = JSON.stringify({
      where,
      turn: s.turn,
      phase: s.phase,
      active: s.active,
      priorityWindow: s.priorityWindow,
      priorityPasser: s.priorityPasser,
      stackLen: s.stack?.length ?? 0,
      endTurnPending,
      pHandLen: s.p.hand.length,
      oHandLen: s.o.hand.length,
      pBf: s.p.bf.map((c: any) => c.name),
      oBf: s.o.bf.map((c: any) => c.name),
      pending: {
        pendingUpkeepChoice: !!s.pendingUpkeepChoice,
        pendingConditionalCounter: !!s.pendingConditionalCounter,
        pendingSphereTrigger: !!s.pendingSphereTrigger,
        pendingChoice: !!s.pendingChoice,
        pendingTriggerTarget: !!s.pendingTriggerTarget,
        pendingTutor: !!s.pendingTutor,
        pendingTransmuteSacrifice: !!s.pendingTransmuteSacrifice,
        pendingTransmutePay: !!s.pendingTransmutePay,
        pendingLotus: !!(s as any).pendingLotus,
        pendingBop: !!(s as any).pendingBop,
        pendingAnteExchange: !!s.pendingAnteExchange,
        pendingDamageShieldChoice: !!s.pendingDamageShieldChoice,
        pendingAnteChoice: !!(s as any).pendingAnteChoice,
        pendingDrainAtNextDraw: !!(s as any).pendingDrainAtNextDraw,
        pendingEndStepTokens: !!(s as any).pendingEndStepTokens,
        pendingLotusIid: !!(s as any).pendingLotusIid,
        pendingSirenSweep: !!(s as any).pendingSirenSweep,
        pendingUpkeepChoiceQueue: !!(s as any).pendingUpkeepChoiceQueue,
      },
    }, null, 2);
    console.error(`[useDuelController] Fatal AI error in ${where}:`, err);
    console.error(context);
    setFatalError({ message, stack, context });
  }

  // ── Phase advance ──────────────────────────────────────────────────────────
  const requestPhaseAdvance = usePhaseAdvance(s, advancePhase, openPriorityWindow);

  // ── End Turn (skip-ahead) ───────────────────────────────────────────────────
  // Repeatedly drives the duel forward on the player's behalf: auto-passes the
  // player's own priority and steps the phase using the existing single-step
  // dispatchers. Stops the moment a new turn begins, the game ends, or the
  // engine needs a choice only the player can make. Does not touch DuelCore.js
  // or phases.js -- it only calls dispatchers that already exist.
  const endTurn = useCallback(() => {
    if (endTurnPending) return;
    endTurnStartTurn.current = s.turn;
    setEndTurnPending(true);
  }, [endTurnPending, s.turn]);

  useEffect(() => {
    if (fatalError) return;
    if (!endTurnPending) return;

    if (s.over) {
      setEndTurnPending(false);
      return;
    }

    if (endTurnStartTurn.current !== null && s.turn !== endTurnStartTurn.current) {
      setEndTurnPending(false);
      endTurnStartTurn.current = null;
      return;
    }

    // Any player-required choice pauses the loop. The existing modal UI resolves
    // these; once cleared, this effect re-fires (state changed) and resumes.
    if (
      s.pendingUpkeepChoice || s.pendingConditionalCounter || s.pendingSphereTrigger ||
      s.pendingChoice || s.pendingTriggerTarget || s.pendingTutor || s.pendingTransmuteSacrifice ||
      s.pendingTransmutePay || s.pendingLotus || s.pendingBop || s.pendingAnteExchange ||
      s.pendingDamageShieldChoice || s.pendingLampPicks || s.pendingRiverDivide || s.pendingRiverSides
    ) {
      return;
    }

    // Non-empty stack: the existing stack-resolution effects own this, not us.
    if (s.stack && s.stack.length > 0) return;

    if (s.priorityWindow) {
      if (s.priorityPasser !== 'p') passPriority('p');
      // Else: player already passed, waiting on the AI side -- do nothing, the
      // existing priority-window-close effect will advance once both pass.
      return;
    }

    // The render where priorityWindow just flipped true -> false is owned by the
    // existing priority-window-close effect (it calls resolveStack()/advancePhase()
    // for that exact transition). Calling requestPhaseAdvance() here too would race
    // it -- if hand still holds an instant, requestPhaseAdvance() reopens a window
    // before the close effect's advancePhase() dispatch is processed, so it gets
    // rejected by DuelCore and the loop never progresses. Wait for the next render.
    if (prevPriorityWindow.current === true) return;

    requestPhaseAdvance();
  }, [
    fatalError, endTurnPending, s.turn, s.over, s.priorityWindow, s.priorityPasser, s.stack?.length,
    s.pendingUpkeepChoice, s.pendingConditionalCounter, s.pendingSphereTrigger,
    s.pendingChoice, s.pendingTriggerTarget, s.pendingTutor, s.pendingTransmuteSacrifice, s.pendingTransmutePay,
    s.pendingLotus, s.pendingBop, s.pendingAnteExchange, s.pendingDamageShieldChoice, s.pendingLampPicks, s.pendingRiverDivide, s.pendingRiverSides, passPriority, requestPhaseAdvance,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sandbox escape hatch ───────────────────────────────────────────────────
  useEffect(() => {
    if (!config.sandbox) return;
    (window as any).__duelDispatch = dispatch;
    (window as any).__duelState   = () => state;
    return () => {
      delete (window as any).__duelDispatch;
      delete (window as any).__duelState;
    };
  }, [config.sandbox, dispatch, state]);

  // forcedHandIds one-shot (sandbox only; brings mobile to parity with desktop)
  useEffect(() => {
    if (!config.sandbox) return;
    if (!config.forcedHandIds?.length) return;
    if (sandboxHandFired.current) return;
    sandboxHandFired.current = true;

    const forcedIds = config.forcedHandIds;
    const remaining = [...state.p.lib];
    const iids: string[] = [];

    for (const cardId of forcedIds) {
      const idx = remaining.findIndex((c: any) => c.id === cardId);
      if (idx !== -1) {
        iids.push(remaining[idx].iid);
        remaining.splice(idx, 1);
      }
    }

    if (iids.length) {
      dispatch({ type: 'SANDBOX_FORCE_HAND', iids });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Priority window close effect ───────────────────────────────────────────
  useEffect(() => {
    if (s.priorityWindow === true) {
      priorityWindowInitiator.current = true;
    }
    if (
      prevPriorityWindow.current === true &&
      s.priorityWindow === false &&
      priorityWindowInitiator.current === true
    ) {
      priorityWindowInitiator.current = false;
      // Clear aiRef whenever a priority window closes so the AI loop can re-run.
      aiRef.current = false;
      if (s.stack && s.stack.length > 0) {
        resolveStack();
      } else {
        advancePhase();
      }
    }
    prevPriorityWindow.current = s.priorityWindow;
  }, [s.priorityWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI priority window effect ──────────────────────────────────────────────
  // On the player's turn: AI responds after 200 ms (instant/counterspell evaluation).
  // On the AI's own turn: pass immediately (AI already acted in the main loop).
  // Guard on priorityPasser prevents re-firing after the AI has already passed.
  useEffect(() => {
    if (fatalError) return;
    if (!s.priorityWindow || s.priorityPasser === 'o' || s.over) return;
    if (s.active !== 'p') {
      const timer = setTimeout(() => {
        dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      try {
        // Test-only fault injection (inert in production -- this global is
        // never set outside Playwright specs): lets tests force this exact
        // catch path deterministically instead of depending on a real
        // AI.js edge case. See tests/e2e/engine-fatal-error-overlay.spec.ts.
        if ((window as any).__forceAiError) {
          throw new Error('[sandbox] forced AI error for testing');
        }
        const acts = aiDecide(s);
        const illegal = acts?.some((a: any) => a.type === 'MULLIGAN' || a.type === 'MULLIGAN_KEEP');
        if (illegal) {
          console.warn('[useDuelController] aiDecide returned a mulligan action during an open priority window; ignoring and passing priority.', acts);
          dispatch({ type: 'PASS_PRIORITY', who: 'o' });
        } else if (acts && acts.length) {
          applyAiActionsWithPriority(acts);
        } else {
          dispatch({ type: 'PASS_PRIORITY', who: 'o' });
        }
      } catch (err) {
        reportFatalAiError(err, 'AI priority window effect');
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [fatalError, s.priorityWindow, s.active, s.priorityPasser, s.over]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stack-length watcher ───────────────────────────────────────────────────
  // Reopens priority window when a stack item resolves with more items remaining,
  // or when the AI casts the first spell onto an empty stack.
  useEffect(() => {
    const cur = s.stack?.length ?? 0;
    const prev = prevStackLen.current;
    prevStackLen.current = cur;
    if (s.priorityWindow || s.over) return;
    if (cur < prev && cur > 0) {
      openPriorityWindow();
    } else if (cur > prev && prev === 0 && s.active === 'o') {
      openPriorityWindow();
    }
  }, [s.stack?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI spell priority helper ───────────────────────────────────────────────
  // Dispatches AI actions, pausing at each CAST_SPELL to open a priority window.
  // RESOLVE_STACK appended by AI.js after CAST_SPELL is intentionally dropped;
  // the priority window close effect handles resolution once both players pass.
  function applyAiActionsWithPriority(acts: any[]) {
    const castIdx = acts.findIndex((a: any) => a.type === 'CAST_SPELL');
    if (castIdx === -1) {
      if (acts.length) applyAiActions(acts);
      return;
    }
    const precast = acts.slice(0, castIdx + 1);
    applyAiActions(precast);
    openPriorityWindow();
  }

  const resolveSphereTrigger = useCallback((paid: boolean) => {
    dispatch({ type: 'SPHERE_TRIGGER_RESOLVE', paid });
  }, [dispatch]);

  // ── AI main loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (fatalError) return;
    if (s.over) return;
    if (s.pendingUpkeepChoice) return;

    // AI resolves conditional counter payment (Force Spike, Power Sink)
    if (s.pendingConditionalCounter && s.pendingConditionalCounter.targetCaster === 'o') {
      const { cost } = s.pendingConditionalCounter;
      const totalMana = Object.values(s.o.mana as Record<string, number>).reduce((a, v) => a + v, 0);
      resolveConditionalCounter(totalMana >= cost);
      return;
    }

    if (s.pendingChoice && s.pendingChoice.controller === 'o') {
      const choice = s.pendingChoice;

      // CR 702.22j/k: banding damage-division order choices. Decision logic
      // lives in AI.js (chooseBandingDamageOrder); this just dispatches it.
      // Sits ahead of the pay_gggg-specific logic below so it doesn't fall
      // through to that unrelated branch or its blind options[0] fallback.
      if (choice.kind === 'bandAttackerDamageOrder' || choice.kind === 'bandBlockerDamageOrder') {
        resolveChoice(chooseBandingDamageOrder(choice, s));
        return;
      }

      // Library of Leng's discardToLibraryChoice. Decision logic lives in
      // AI.js (chooseDiscardToLibrary); this just dispatches it. Sits ahead
      // of the pay_gggg-specific logic below so it doesn't fall through to
      // that unrelated branch or its blind options[0] fallback.
      if (choice.kind === 'discardToLibraryChoice') {
        resolveChoice(chooseDiscardToLibrary(choice, s));
        return;
      }

      const payOption = choice.options.find((o: any) => o.id === 'pay_gggg');
      const damageOption = choice.options.find((o: any) => o.effect?.type === 'dealDamageToController');
      let aiCanPay = false;
      if (payOption?.effect?.type === 'payMana') {
        const cost = payOption.effect.cost;
        aiCanPay = Object.entries(cost).every(([color, amount]) =>
          (s.o.mana[color as string] || 0) >= (amount as number)
        );
      }
      resolveChoice(aiCanPay && payOption ? payOption.id : (damageOption?.id || choice.options[0].id));
      return;
    }

    // AI resolves tutor search
    if (s.pendingTutor && s.pendingTutor.caster === 'o') {
      const pt = s.pendingTutor;
      const FILTER_FN: Record<string, (c: any) => boolean> = {
        any:         () => true,
        artifact:    (c: any) => isArt(c),
        creature:    (c: any) => !!c.type?.includes('Creature'),
        instant:     (c: any) => c.type === 'Instant',
        sorcery:     (c: any) => c.type === 'Sorcery',
        enchantment: (c: any) => !!c.type?.startsWith('Enchantment'),
        land:        (c: any) => c.type === 'Land',
      };
      const fn = FILTER_FN[pt.filter] ?? (() => true);
      const valid = pt.shuffledLib.filter(fn);
      if (!valid.length) { declineTutor(); return; }
      const best = valid.reduce((a: any, b: any) =>
        scoreLibCard(b, s) > scoreLibCard(a, s) ? b : a
      );
      if (pt._transmuteMode) {
        chooseTutorTransmute(best.iid);
      } else {
        chooseTutor(best.iid);
      }
      return;
    }

    // AI resolves Darkpact's ante-exchange picker. Which own ante card gets
    // swapped is blind (the outcome depends on the caster's own top library
    // card, which is not worth scoring against), so the AI just takes the
    // first one -- there's no meaningful heuristic to apply here.
    if (s.pendingAnteExchange && s.pendingAnteExchange.caster === 'o') {
      const first = s.pendingAnteExchange.cards[0];
      if (first) resolveAnteExchange(first.iid);
      else declineAnteExchange();
      return;
    }

    // AI resolves Transmute sacrifice choice
    if (s.pendingTransmuteSacrifice && s.pendingTransmuteSacrifice.caster === 'o') {
      const arts = s.o.bf.filter((c: any) => isArt(c));
      const libArts = s.o.lib.filter((c: any) => isArt(c));
      if (!arts.length || !libArts.length) { declineTransmuteSacrifice(); return; }
      const targetCard = libArts.reduce((a: any, b: any) =>
        scoreLibCard(b, s) > scoreLibCard(a, s) ? b : a
      );
      const victim = arts.reduce((a: any, b: any) =>
        scoreLibCard(a, s) <= scoreLibCard(b, s) ? a : b
      );
      const diff = (targetCard.cmc ?? 0) - (victim.cmc ?? 0);
      const pool = s.o.mana;
      const totalMana = Object.values(pool).reduce((a: number, b: any) => a + (b as number), 0);
      if (diff > 0 && totalMana < diff) { declineTransmuteSacrifice(); return; }
      confirmTransmuteSacrifice(victim.iid);
      return;
    }

    // AI resolves Transmute payment
    if (s.pendingTransmutePay && s.pendingTransmutePay.caster === 'o') {
      const pool = s.o.mana;
      const totalMana = Object.values(pool).reduce((a: number, b: any) => a + (b as number), 0);
      if (totalMana >= s.pendingTransmutePay.required) {
        confirmTransmutePay();
      } else {
        declineTransmutePay();
      }
      return;
    }

    // AI resolves sphere trigger: always pay if able (no downside to paying).
    if (s.pendingSphereTrigger && s.pendingSphereTrigger.controller === 'o') {
      const totalMana = Object.values(s.o.mana as Record<string, number>).reduce((a, v) => a + v, 0);
      resolveSphereTrigger(totalMana >= 1);
      return;
    }

    // AI selects Aladdin's Lamp pick from shown cards
    if (s.pendingLampPicks?.[0]?.who === 'o') {
      const pick = s.pendingLampPicks[0];
      const chosen = chooseLampPick(pick, s, AI_PROFILES.GENERIC);
      if (chosen) dispatch({ type: 'LAMP_PICK', iid: chosen });
      return;
    }

    // AI divides Raging River non-flying defenders into piles
    if (s.pendingRiverDivide?.defender === 'o') {
      const division = chooseRiverDivide(s.pendingRiverDivide.nonFlyerIids, s, AI_PROFILES.GENERIC);
      dispatch({ type: 'RIVER_DIVIDE', who: 'o', leftIids: division.leftIids, rightIids: division.rightIids });
      return;
    }

    // AI chooses which piles Raging River attackers can be blocked by
    if (s.pendingRiverSides?.chooser === 'o') {
      const sides = chooseRiverSides(s.pendingRiverSides.attackerIids, s, AI_PROFILES.GENERIC);
      dispatch({ type: 'RIVER_SIDES', who: 'o', sides });
      return;
    }

    // AI resolves a suspended requiresTarget trigger (Vesuvan Doppelganger's
    // upkeep re-copy): pick the best creature on either battlefield by
    // power+toughness, excluding the copying permanent itself (copying itself
    // is a legal but pointless target). Decline if no other creature exists.
    if (s.pendingTriggerTarget && s.pendingTriggerTarget.controller === 'o') {
      const candidates = ([...s.p.bf, ...s.o.bf] as any[]).filter(
        (c: any) => isCre(c) && c.iid !== s.pendingTriggerTarget.sourceCardId
      );
      if (!candidates.length) { resolveTriggerTarget(null); return; }
      const best = candidates.reduce((a: any, b: any) =>
        ((b.power || 0) + (b.toughness || 0)) > ((a.power || 0) + (a.toughness || 0)) ? b : a
      );
      resolveTriggerTarget(best.iid);
      return;
    }

    if (s.active !== 'o' || aiRef.current) return;
    if (s.active === 'p' && (s.phase === 'COMBAT_ATTACKERS' || s.phase === 'COMBAT_BLOCKERS')) return;
    // COMBAT_BLOCKERS always belongs to the defending player's action, even
    // when the AI ('o') is the active/attacking player. Without this guard,
    // the AI driver runs planBlock against the wrong side and auto-advances
    // the phase before the human gets a chance to declare blockers.
    if (s.phase === 'COMBAT_BLOCKERS') return;

    // ── Heuristic path (default) ──────────────────────────────────────────
    aiRef.current = true;
    const t = setTimeout(() => {
      try {
        // Test-only fault injection -- see comment in the AI priority window
        // effect above.
        if ((window as any).__forceAiError) {
          throw new Error('[sandbox] forced AI error for testing');
        }
        const acts = aiDecide(s);
        const hasCast = acts.some((a: any) => a.type === 'CAST_SPELL');
        applyAiActionsWithPriority(acts);
        if (!hasCast) {
          setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
        }
      } catch (err) {
        aiRef.current = false;
        reportFatalAiError(err, 'AI main loop (heuristic path)');
      }
    }, aiSpeed);
    return () => clearTimeout(t);
  }, [fatalError, s.phase, s.active, s.turn, s.over, s.pendingChoice, s.pendingTriggerTarget, s.pendingUpkeepChoice, s.stack?.length, s.pendingTutor, s.pendingTransmuteSacrifice, s.pendingTransmutePay, s.pendingConditionalCounter, s.pendingAnteExchange, s.pendingLampPicks, s.pendingRiverDivide, s.pendingRiverSides]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Game-over effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!s.over) return;
    const timer = setTimeout(() => {
      onDuelEnd(s.over.winner === 'p' ? 'win' : 'lose', s);
    }, 3000);
    return () => clearTimeout(timer);
  }, [s.over]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mulligan suppression ───────────────────────────────────────────────────
  useEffect(() => {
    if (mulliganDismissed.current) setShowMulligan(false);
  }, [s.p.hand]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── BOP color picker sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (state.pendingBop) setShowBop(true);
  }, [state.pendingBop]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared handlers ────────────────────────────────────────────────────────
  const handleKeep = useCallback(() => {
    mulliganDismissed.current = true;
    setShowMulligan(false);
  }, []);

  const handleMulligan = useCallback(() => {
    mulligan();
    setMulliganCount(c => c + 1);
  }, [mulligan]);

  const handleLotusChoose = useCallback((color: string) => {
    chooseLotusColor(color);
    setShowLotus(false);
  }, [chooseLotusColor]);

  const handleLotusCancel = useCallback(() => {
    cancelLotus();
    setShowLotus(false);
  }, [cancelLotus]);

  const handleBopChoose = useCallback((color: string) => {
    dispatch({ type: 'CHOOSE_BOP_COLOR', color });
    setShowBop(false);
  }, [dispatch]);

  const handleBopCancel = useCallback(() => {
    // BOP tap already fired in engine; default to Green so the tap isn't wasted.
    dispatch({ type: 'CHOOSE_BOP_COLOR', color: 'G' });
    setShowBop(false);
  }, [dispatch]);

  // ── Battlefield click routing ──────────────────────────────────────────────
  // Single entry point for all battlefield card clicks. Both DuelScreen and
  // DuelScreenMobile must call this instead of implementing their own routing.
  //
  // Routing priority (evaluated top-to-bottom):
  //   1. COMBAT_BLOCKERS — two-click flow: first click sets pendingBlockerIid,
  //      second click on an attacker declares the block and clears it.
  //   2. COMBAT_ATTACKERS — player creature click toggles attacker declaration.
  //   3. All other interactions (mana, activation, targeting) are screen-local
  //      concerns and remain in the screen components.
  //
  // NOTE: pendingBlockerIid is isolated from s.selTgt. Do not use selTgt as a
  // blocker vessel — it is reserved for spell targeting.
  const handleBfClick = useCallback((card: any) => {
    if (s.over) return;

    if (s.phase === 'COMBAT_BLOCKERS' && s.active !== 'p') {
      const isYours = (s.p.bf as any[]).some((c: any) => c.iid === card.iid);
      const isAttacker = (s.attackers ?? []).includes(card.iid);

      if (isYours && isCre(card)) {
        // First click: select your blocker (toggle)
        setPendingBlockerIid(prev => prev === card.iid ? null : card.iid);
        return;
      }

      if (!isYours && isAttacker && pendingBlockerIid) {
        // Second click: declare the block
        declareBlocker(pendingBlockerIid, card.iid);
        setPendingBlockerIid(null);
        return;
      }

      // Click on non-attacker or own non-creature during blockers: no-op
      return;
    }

    if (s.phase === 'COMBAT_ATTACKERS' && s.active === 'p' && isCre(card)) {
      const isYours = (s.p.bf as any[]).some((c: any) => c.iid === card.iid);
      if (isYours) {
        declareAttacker(card.iid);
        return;
      }
    }

    // All other interactions (mana taps, ability activation, spell targeting)
    // are delegated back to the screen component via the return value `false`,
    // indicating the hook did not consume the click.
    return false;
  }, [
    s.over, s.phase, s.active, s.p.bf, s.attackers,
    pendingBlockerIid, declareBlocker, declareAttacker,
  ]);

  // ── Cast/Activate flow handlers ────────────────────────────────────────────

  const cancelCastFlow = useCallback(() => {
    // A 'trigger' flow isn't a cast/activation the player initiated -- it's
    // Vesuvan Doppelganger's upkeep trigger already suspended in the engine
    // (s.pendingTriggerTarget). There's nothing to "cancel" back to; the X
    // button here can only mean "decline the target," same as the skip button.
    if (castFlow?.kind === 'trigger') {
      resolveTriggerTarget(null);
      setCastFlow(null);
      selectCard(null);
      selectTarget(null);
      return;
    }
    if (s.manaTapSnapshot !== null) {
      dispatch({ type: 'UNDO_MANA_TAPS' });
    }
    setCastFlow(null);
    selectCard(null);
    selectTarget(null);
    setPendingActivate(null);
  }, [castFlow, s.manaTapSnapshot, dispatch, selectCard, selectTarget, resolveTriggerTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectCastTarget = useCallback((iid: string) => {
    setCastFlow(prev => {
      if (!prev || prev.mode !== 'targeting') return prev;
      const already = prev.selectedTargets.includes(iid);
      return { ...prev, selectedTargets: already ? prev.selectedTargets.filter(t => t !== iid) : [iid] };
    });
  }, []);

  const deselectCastTarget = useCallback((iid: string) => {
    setCastFlow(prev => {
      if (!prev) return prev;
      return { ...prev, selectedTargets: prev.selectedTargets.filter(t => t !== iid) };
    });
  }, []);

  // Advance from targeting → mana or immediate cast.
  // Called by confirmCastTargets and beginCastFlow (no-target path).
  const advanceCastFlow = useCallback((flow: CastFlowState) => {
    if (flow.kind === 'trigger') {
      // No mana step -- the triggered ability itself has no cost. Dispatch
      // straight from targeting, whether a target was picked or declined.
      const tgt = flow.selectedTargets[0] ?? null;
      resolveTriggerTarget(tgt);
      setCastFlow(null);
      selectCard(null);
      selectTarget(null);
      return;
    }
    if (flow.kind === 'spell') {
      const card = (s.p.hand as any[]).find((c: any) => c.iid === flow.sourceIid);
      if (!card) { setCastFlow(null); return; }
      const xSpend = (card.cost?.toUpperCase().includes('X') && card.id !== 'power_sink')
        ? (s.xVal || 1)
        : 0;
      const tgt = flow.selectedTargets[0] ?? null;
      if (canPay(s.p.mana, card.cost, xSpend)) {
        castSpell(flow.sourceIid, tgt, s.xVal);
        setCastFlow(null);
        selectCard(null);
        selectTarget(null);
      } else {
        setCastFlow({ ...flow, mode: 'mana' });
      }
    } else {
      const card = (s.p.bf as any[]).find((c: any) => c.iid === flow.sourceIid);
      const ab = flow.abilityId
        ? (card?.activatedAbilities ?? []).find((a: any) => a.id === flow.abilityId)
        : card?.activated;
      if (!card || !ab) { setCastFlow(null); return; }
      const cost = ab.cost ?? '';
      const xSpend = cost?.toUpperCase().includes('X') ? (s.xVal || 1) : 0;
      const tgt = flow.selectedTargets[0] ?? null;
      if (!cost || canPay(s.p.mana, cost, xSpend)) {
        activateAbility(flow.sourceIid, tgt, null, flow.abilityId ?? undefined);
        setCastFlow(null);
        selectCard(null);
        selectTarget(null);
        setPendingActivate(null);
      } else {
        setCastFlow({ ...flow, mode: 'mana' });
      }
    }
  }, [s, castSpell, activateAbility, resolveTriggerTarget, selectCard, selectTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmCastTargets = useCallback(() => {
    setCastFlow(prev => {
      if (!prev || prev.mode !== 'targeting') return prev;
      if (prev.requiresTarget && prev.selectedTargets.length < 1) return prev;
      // Advance synchronously via the flow object we have in hand.
      // We schedule advanceCastFlow via a separate effect trigger by returning
      // a transitioned state; instead, call advanceCastFlow directly here.
      return prev; // will be handled by the useEffect below after state settles
    });
    // Direct advance — read from castFlow ref-equivalent via functional update.
    setCastFlow(prev => {
      if (!prev || prev.mode !== 'targeting') return prev;
      if (prev.requiresTarget && prev.selectedTargets.length < 1) return prev;
      return { ...prev, mode: 'mana' as CastFlowMode, _advance: true } as any;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance when castFlow mode transitions from targeting to mana or when
  // the player's mana pool changes while in mana-wait mode.
  useEffect(() => {
    if (!castFlow) return;
    const flow = castFlow as any;

    // Pending advance from confirmCastTargets
    if (flow._advance) {
      const clean: CastFlowState = { ...flow };
      delete (clean as any)._advance;
      advanceCastFlow(clean);
      return;
    }

    if (castFlow.mode !== 'mana') return;

    if (castFlow.kind === 'spell') {
      const card = (s.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid);
      if (!card) return;
      const xSpend = (card.cost?.toUpperCase().includes('X') && card.id !== 'power_sink')
        ? (s.xVal || 1)
        : 0;
      if (canPay(s.p.mana, card.cost, xSpend)) {
        const tgt = castFlow.selectedTargets[0] ?? null;
        castSpell(castFlow.sourceIid, tgt, s.xVal);
        setCastFlow(null);
        selectCard(null);
        selectTarget(null);
      }
    } else {
      const card = (s.p.bf as any[]).find((c: any) => c.iid === castFlow.sourceIid);
      const ab = castFlow.abilityId
        ? (card?.activatedAbilities ?? []).find((a: any) => a.id === castFlow.abilityId)
        : card?.activated;
      if (!card || !ab) return;
      const cost = ab.cost ?? '';
      const xSpend = cost?.toUpperCase().includes('X') ? (s.xVal || 1) : 0;
      if (!cost || canPay(s.p.mana, cost, xSpend)) {
        const tgt = castFlow.selectedTargets[0] ?? null;
        activateAbility(castFlow.sourceIid, tgt, null, castFlow.abilityId ?? undefined);
        setCastFlow(null);
        selectCard(null);
        selectTarget(null);
        setPendingActivate(null);
      }
    }
  }, [s.p.mana, castFlow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vesuvan Doppelganger's upkeep re-copy: the engine suspends the trigger
  // queue in s.pendingTriggerTarget (see resolveTrigger's requiresTarget
  // branch in DuelCore.js) instead of presenting a fixed pendingChoice option
  // list, because it needs a fresh battlefield target. When that's the human
  // player's own trigger, open the same targeting UI used for casts/activations
  // (castFlow kind:'trigger') so battlefield clicks route through the existing
  // selectCastTarget/handleCardClick machinery. The AI's own triggers are
  // resolved directly in the AI loop effect below, never through castFlow.
  useEffect(() => {
    if (!s.pendingTriggerTarget || s.pendingTriggerTarget.controller !== 'p') return;
    if (castFlow?.kind === 'trigger') return; // already open
    setCastFlow({
      kind: 'trigger',
      sourceIid: s.pendingTriggerTarget.sourceCardId,
      abilityId: s.pendingTriggerTarget.triggerId,
      mode: 'targeting',
      selectedTargets: [],
      requiresTarget: false,
      maxTargets: 1,
      canTargetPlayers: false,
    });
  }, [s.pendingTriggerTarget, castFlow]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginCastFlow = useCallback((card: any) => {
    if (isLand(card)) { playLand(card.iid); selectCard(null); return; }

    const hasX = /X/i.test(card.cost || '') && card.id !== 'power_sink';

    if (hasX) {
      if (card.id === 'spell_blast') {
        const legal = getSpellBlastLegalX(s.stack);
        if (!legal.length) { selectCard(null); return; }
        setCastFlow({
          kind: 'spell',
          sourceIid: card.iid,
          abilityId: null,
          mode: 'xSelect',
          selectedTargets: [],
          requiresTarget: false,
          maxTargets: 1,
          canTargetPlayers: false,
          xVal: legal[0],
          xLegalValues: legal,
        });
        return;
      }
      const xMax = getMaxAffordableX(s.p.mana, card.cost);
      if (xMax < 0) { selectCard(null); return; }
      setCastFlow({
        kind: 'spell',
        sourceIid: card.iid,
        abilityId: null,
        mode: 'xSelect',
        selectedTargets: [],
        requiresTarget: false,
        maxTargets: 1,
        canTargetPlayers: false,
        xVal: Math.min(1, xMax),
        xMax,
      });
      return;
    }

    const hasTarget = needsAnyTarget(card) || isOptionalTarget(card);
    const req = needsAnyTarget(card) && !isOptionalTarget(card);

    if (hasTarget) {
      setCastFlow({
        kind: 'spell',
        sourceIid: card.iid,
        abilityId: null,
        mode: 'targeting',
        selectedTargets: [],
        requiresTarget: req,
        maxTargets: 1,
        canTargetPlayers: needsExplicitTarget(card) && !isCounterEffect(card),
      });
      return;
    }

    // No targeting — go directly to mana check.
    const xSpend = (card.cost?.toUpperCase().includes('X') && card.id !== 'power_sink')
      ? (s.xVal || 1)
      : 0;
    if (canPay(s.p.mana, card.cost, xSpend)) {
      const tgt = resolveDefaultTarget(card, s);
      castSpell(card.iid, tgt, s.xVal);
      selectCard(null);
      selectTarget(null);
      return;
    }
    setCastFlow({
      kind: 'spell',
      sourceIid: card.iid,
      abilityId: null,
      mode: 'mana',
      selectedTargets: [],
      requiresTarget: false,
      maxTargets: 0,
      canTargetPlayers: false,
    });
  }, [s, castSpell, playLand, selectCard, selectTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const adjustCastX = useCallback((delta: number) => {
    setCastFlow(prev => {
      if (!prev || prev.mode !== 'xSelect') return prev;
      if (prev.xLegalValues) {
        const idx = prev.xLegalValues.indexOf(prev.xVal ?? prev.xLegalValues[0]);
        const nextIdx = Math.min(prev.xLegalValues.length - 1, Math.max(0, idx + delta));
        return { ...prev, xVal: prev.xLegalValues[nextIdx] };
      }
      const next = Math.min(prev.xMax ?? 0, Math.max(0, (prev.xVal ?? 0) + delta));
      return { ...prev, xVal: next };
    });
  }, []);

  const confirmCastX = useCallback(() => {
    setCastFlow(prev => {
      if (!prev || prev.mode !== 'xSelect') return prev;
      const card = (s.p.hand as any[]).find((c: any) => c.iid === prev.sourceIid);
      if (!card) return null;
      dispatch({ type: 'SET_X', val: prev.xVal ?? 0 });
      const hasTarget = needsAnyTarget(card) || isOptionalTarget(card);
      if (hasTarget) {
        const req = needsAnyTarget(card) && !isOptionalTarget(card);
        return {
          ...prev,
          mode: 'targeting' as CastFlowMode,
          requiresTarget: req,
          canTargetPlayers: needsExplicitTarget(card) && !isCounterEffect(card),
        };
      }
      return { ...prev, mode: 'mana' as CastFlowMode };
    });
  }, [s, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginActivateFlow = useCallback((card: any, abilityId: string | null) => {
    if (!card) return;
    const ab = abilityId
      ? (card.activatedAbilities ?? []).find((a: any) => a.id === abilityId)
      : card.activated;
    if (!ab) return;

    const { effect } = ab;

    // Mana abilities resolve immediately — never route through castFlow.
    if (effect === 'addManaAny') { activateAbility(card.iid, null); return; }
    if (effect === 'addMana3Any') {
      activateAbility(card.iid, null);
      setShowLotus(true);
      setPendingActivate(card);
      return;
    }
    if (effect === 'addMana') { activateAbility(card.iid, null); return; }

    if (ACTIVATE_TARGET_EFFECTS.has(effect)) {
      setCastFlow({
        kind: 'ability',
        sourceIid: card.iid,
        abilityId,
        mode: 'targeting',
        selectedTargets: [],
        requiresTarget: true,
        maxTargets: 1,
        canTargetPlayers: PLAYER_TARGETABLE_ABILITY_EFFECTS.has(effect),
      });
      selectCard(card.iid);
      return;
    }

    // Non-targeting, non-mana ability: activate immediately.
    activateAbility(card.iid, null, null, abilityId ?? undefined);
  }, [activateAbility, selectCard, setShowLotus]); // eslint-disable-line react-hooks/exhaustive-deps

  // handleActivate keeps backward-compat API; delegates to beginActivateFlow.
  const handleActivate = useCallback((card: any) => {
    beginActivateFlow(card, null);
  }, [beginActivateFlow]);

  // activateCanTargetPlayer is kept for any remaining callsites during migration;
  // under the new model castFlow.canTargetPlayers drives this.
  const activateCanTargetPlayer: boolean =
    castFlow?.mode === 'targeting' ? castFlow.canTargetPlayers :
    (pendingActivate != null && PLAYER_TARGETABLE_ABILITY_EFFECTS.has(pendingActivate.activated?.effect));

  // handleActivateWithPlayerTarget is preserved for any remaining callsites.
  const handleActivateWithPlayerTarget = useCallback((playerKey: 'p' | 'o') => {
    if (castFlow?.mode === 'targeting') { selectCastTarget(playerKey); return; }
    if (!pendingActivate) return;
    activateAbility(pendingActivate.iid, playerKey);
    setPendingActivate(null);
    selectCard(null);
  }, [castFlow, pendingActivate, selectCastTarget, activateAbility, selectCard]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const adaptedLog = useMemo(() => adaptLog(s.log ?? []), [s.log]);

  const attackersList = useMemo<string[]>(() => {
    if (!s.attackers) return [];
    return s.attackers instanceof Set
      ? Array.from(s.attackers)
      : Array.isArray(s.attackers) ? s.attackers : [];
  }, [s.attackers]);

  const ruleFlags = useMemo(() => [
    { l: 'Mana Burn',  v: config.ruleset.manaBurn   as boolean | string | undefined },
    { l: 'Stack',      v: config.ruleset.stackType  as boolean | string | undefined },
    { l: 'Deathtouch', v: config.ruleset.deathtouch as boolean | string | undefined },
    { l: 'Exile',      v: config.ruleset.exileZone  as boolean | string | undefined },
  ], [config.ruleset]);

  const canUndoMana: boolean =
    s.active === 'p' &&
    (s.stack?.length ?? 0) === 0 &&
    s.manaTapSnapshot !== null;

  const oppBfIids = useMemo(
    () => new Set((s.o.bf as any[]).map((c: any) => c.iid)),
    [s.o.bf]
  );

  // A land animated into a creature (Living Lands, Kormus Bell) renders in the
  // CREATURES row, not LANDS -- avoids showing the same permanent in both rows.
  // It reverts to the LANDS row automatically once isCre(c) goes false again.
  const pLands     = useMemo(() => (s.p.bf as CardData[]).filter((c: any) => isLand(c) && !isCre(c)), [s.p.bf]);
  const pCreatures = useMemo(() => (s.p.bf as CardData[]).filter((c: any) => isCre(c)), [s.p.bf]);
  const pPerms     = useMemo(() => (s.p.bf as CardData[]).filter((c: any) => !isLand(c) && !isCre(c)), [s.p.bf]);
  const oLands     = useMemo(() => (s.o.bf as CardData[]).filter((c: any) => isLand(c) && !isCre(c)), [s.o.bf]);
  const oCreatures = useMemo(() => (s.o.bf as CardData[]).filter((c: any) => isCre(c)), [s.o.bf]);
  const oPerms     = useMemo(() => (s.o.bf as CardData[]).filter((c: any) => !isLand(c) && !isCre(c)), [s.o.bf]);

  return {
    // Raw engine state and dispatch
    state,
    dispatch,

    // All useDuel action functions
    tapLand,
    tapArtifactMana,
    playLand,
    castSpell,
    resolveStack,
    declareAttacker,
    declareBlocker,
    advancePhase,
    selectCard,
    selectTarget,
    setX,
    mulligan,
    activateAbility,
    chooseLotusColor,
    cancelLotus,
    applyAiActions,
    resolveChoice,
    resolveTriggerTarget,
    resolveUpkeepChoice,
    resolveConditionalCounter,
    resolveSphereTrigger,
    openPriorityWindow,
    passPriority,
    useChannel,
    undoManaTaps,
    chooseTutor,
    declineTutor,
    chooseTutorTransmute,
    confirmTransmuteSacrifice,
    declineTransmuteSacrifice,
    confirmTransmutePay,
    declineTransmutePay,
    resolveAnteExchange,
    declineAnteExchange,

    // Phase advance
    requestPhaseAdvance,
    endTurn,
    endTurnPending,
    fatalError,

    // Mulligan UI state
    showMulligan,
    mulliganCount,
    handleKeep,
    handleMulligan,

    // Lotus / dual-land UI state
    showLotus,
    setShowLotus,
    handleLotusChoose,
    handleLotusCancel,
    pendingDualLand,
    setPendingDualLand,

    // BOP UI state (mirrors Lotus pattern)
    showBop,
    setShowBop,
    handleBopChoose,
    handleBopCancel,

    // Battlefield click routing
    pendingBlockerIid,
    setPendingBlockerIid,
    handleBfClick,

    // Cast/Activate flow state
    castFlow,
    setCastFlow,
    beginCastFlow,
    beginActivateFlow,
    selectCastTarget,
    deselectCastTarget,
    confirmCastTargets,
    cancelCastFlow,
    adjustCastX,
    confirmCastX,
    getManaShortfall,

    // Counter mode state (BEB/REB two-mode selection)
    pendingMode,
    setPendingMode,

    // Activated ability state and handlers
    pendingActivate,
    setPendingActivate,
    activateCanTargetPlayer,
    handleActivate,
    handleActivateWithPlayerTarget,

    // Derived data
    adaptedLog: adaptedLog as any[],
    attackersList,
    ruleFlags,
    canUndoMana,
    oppBfIids,
    pLands,
    pCreatures,
    pPerms,
    oLands,
    oCreatures,
    oPerms,
  };
}
