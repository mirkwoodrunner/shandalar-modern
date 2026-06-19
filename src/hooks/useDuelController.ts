// src/hooks/useDuelController.ts
// Shared orchestration hook for both duel screens.
// Owns: AI loop (with applyAiActionsWithPriority), all priority-window effects,
// sandbox escape hatch, game-over timer, and mulligan state.
// Neither DuelScreen nor DuelScreenMobile may contain these effects directly.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDuel } from './useDuel.js';
import { aiDecide } from '../engine/AI.js';
import { isLand, isArt, canPay, parseMana } from '../engine/DuelCore.js';
import { usePhaseAdvance } from './usePhaseAdvance';
import type { DuelConfig } from '../types/duel';
import type { CardData } from '../ui/Card/types';
import { fetchGeminiMove } from '../engine/GeminiAdvisor.js';
import { computeLegalActions } from '../engine/LegalActions.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

type LogKind = 'info' | 'turn' | 'phase' | 'play' | 'opp_play' | 'damage' | 'heal' | 'gemini';

function adaptLog(rawLog: unknown[]): { kind: LogKind; text: string }[] {
  return (rawLog ?? []).map(entry => {
    const text = typeof entry === 'string' ? entry : (entry as any)?.text ?? String(entry);
    const rawType = (entry as any)?.type;
    let kind: LogKind = 'info';
    if (rawType === 'gemini')                                             kind = 'gemini';
    else if (/^turn \d+/i.test(text))                                    kind = 'turn';
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
]);

export function needsExplicitTarget(card: any): boolean {
  return EXPLICIT_TARGET_EFFECTS.has(card?.effect);
}

export function isCounterEffect(card: any): boolean {
  return ['counter', 'counterCreature', 'powerSink'].includes(card?.effect);
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
  return false;
}

// ── Cast/Activate flow ─────────────────────────────────────────────────────

export type CastFlowMode = 'targeting' | 'mana' | null;

export interface CastFlowState {
  kind: 'spell' | 'ability';
  sourceIid: string;
  abilityId: string | null;
  mode: CastFlowMode;
  selectedTargets: string[];
  requiresTarget: boolean;
  maxTargets: number;
  canTargetPlayers: boolean;
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

// Effects for activated abilities that require selecting a target.
const ACTIVATE_TARGET_EFFECTS = new Set([
  'ping', 'triskelionPing', 'destroyTapped', 'pumpCreature', 'gainFlying',
  'pumpPower', 'damage1', 'damage2', 'damage3', 'untapLand', 'tapTarget',
]);

// Ability effects that can target players (in addition to permanents).
const PLAYER_TARGETABLE_ABILITY_EFFECTS = new Set([
  'ping', 'triskelionPing', 'damage1', 'damage2', 'damage3',
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
  const [isGeminiThinking, setIsGeminiThinking] = useState(false);

  // ── Phase advance ──────────────────────────────────────────────────────────
  const requestPhaseAdvance = usePhaseAdvance(s, advancePhase, openPriorityWindow);

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
    if (!s.priorityWindow || s.priorityPasser === 'o' || s.over) return;
    if (s.active !== 'p') {
      const timer = setTimeout(() => {
        dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      const acts = aiDecide(s);
      const illegal = acts?.some((a: any) => a.type === 'MULLIGAN' || a.type === 'MULLIGAN_KEEP');
      if (illegal) {
        console.warn('[useDuelController] aiDecide returned a mulligan action during an open priority window; ignoring and passing priority.', acts);
        dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      } else if (acts && acts.length) {
        applyAiActionsWithPriority(acts);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [s.priorityWindow, s.active, s.priorityPasser, s.over]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── AI main loop ───────────────────────────────────────────────────────────
  useEffect(() => {
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

    if (s.active !== 'o' || aiRef.current) return;
    if (s.active === 'p' && (s.phase === 'COMBAT_ATTACKERS' || s.phase === 'COMBAT_BLOCKERS')) return;

    // ── Gemini path (sandbox + useGemini only) ────────────────────────────
    const GEMINI_PHASES = new Set(['MAIN_1', 'MAIN_2', 'COMBAT_ATTACKERS', 'COMBAT_BLOCKERS']);

    if (config.useGemini && config.sandbox && GEMINI_PHASES.has(s.phase)) {
      aiRef.current = true;

      const legalActions = computeLegalActions(s, s.phase);

      const serializedState = {
        phase: s.phase,
        turn: s.turn,
        active: s.active,
        p: {
          life: s.p.life,
          hand: (s.p.hand as any[]).map((c: any) => ({
            name: c.name, cost: c.cost, type: c.type,
            power: c.power, toughness: c.toughness, effect: c.effect,
          })),
          bf: (s.p.bf as any[]).map((c: any) => ({
            name: c.name, type: c.type, power: c.power, toughness: c.toughness,
            tapped: c.tapped, attacking: c.attacking, keywords: c.keywords,
          })),
          mana: s.p.mana,
        },
        o: {
          life: s.o.life,
          hand: (s.o.hand as any[]).length,
          bf: (s.o.bf as any[]).map((c: any) => ({
            name: c.name, type: c.type, power: c.power, toughness: c.toughness,
            tapped: c.tapped, summoningSick: c.summoningSick, keywords: c.keywords,
          })),
          mana: s.o.mana,
        },
        attackers: s.attackers ?? [],
        stack: (s.stack ?? []).map((item: any) => ({ name: item.card?.name, caster: item.caster })),
        legalActions,
      };

      setIsGeminiThinking(true);

      fetchGeminiMove(serializedState).then((result) => {
        setIsGeminiThinking(false);

        if (result === null) {
          console.warn('[Gemini] API returned null -- falling back to heuristic AI.');
          const acts = aiDecide(s);
          const hasCast = acts.some((a: any) => a.type === 'CAST_SPELL');
          applyAiActionsWithPriority(acts);
          if (!hasCast) {
            setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
          }
          return;
        }

        const { index, reasoning, sentPayload } = result;
        const chosenAction = legalActions[index];

        // ── Diagnostic logging ──────────────────────────────────────────
        if (config.sandbox) {
          console.group('[Gemini] Decision');
          console.log('Sent payload:', JSON.parse(JSON.stringify(sentPayload)));
          console.log('Chosen action:', chosenAction);
          console.log('Reasoning:', reasoning);
          console.groupEnd();

          dispatch({
            type: 'GEMINI_LOG',
            entries: [
              {
                text: `[Gemini] ${reasoning}`,
                type: 'gemini',
              },
              {
                text: `[Gemini] Action: ${chosenAction?.description ?? chosenAction?.type ?? '(unknown)'}`,
                type: 'gemini',
              },
            ],
          });
        }

        // ── Execute chosen action ───────────────────────────────────────
        if (!chosenAction || chosenAction.type === 'PASS_PRIORITY') {
          setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
          return;
        }

        if (chosenAction.type === 'ATTACK_ALL') {
          const ids: string[] = chosenAction.attackerIds ?? [];
          for (const iid of ids) {
            dispatch({ type: 'DECLARE_ATTACKER', who: 'o', iid });
          }
          setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
          return;
        }

        const dcActs = (() => {
          switch (chosenAction.type) {
            case 'PLAY_LAND':
              return [{ type: 'PLAY_LAND', who: 'o', iid: chosenAction.iid }];
            case 'CAST_SPELL': {
              // buildTapActions is imported via dynamic require to avoid circular import with AI.js.
              // Follow-up: extract to LegalActions.js and replace with named import.
              const { buildTapActions: bta } = require('../engine/AI.js');
              const { tapActions } = bta(s, chosenAction.cost);
              const acts: any[] = [...(tapActions ?? [])];
              if (chosenAction.xVal != null) acts.push({ type: 'SET_X', val: chosenAction.xVal });
              acts.push({ type: 'CAST_SPELL', who: 'o', iid: chosenAction.iid, tgt: null, xVal: chosenAction.xVal ?? null });
              return acts;
            }
            case 'DECLARE_ATTACKER':
              return [{ type: 'DECLARE_ATTACKER', who: 'o', iid: chosenAction.iid }];
            case 'DECLARE_BLOCKER':
              return [{ type: 'DECLARE_BLOCKER', blId: chosenAction.blId, attId: chosenAction.attId }];
            default:
              console.warn('[Gemini] Unrecognised action type:', chosenAction.type);
              return [];
          }
        })();

        if (!dcActs.length) {
          setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
          return;
        }

        const hasCast = dcActs.some((a: any) => a.type === 'CAST_SPELL');
        applyAiActionsWithPriority(dcActs);
        if (!hasCast) {
          setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
        }
      });

      return; // async path handled in .then()
    }

    // ── Heuristic path (default) ──────────────────────────────────────────
    aiRef.current = true;
    const t = setTimeout(() => {
      const acts = aiDecide(s);
      const hasCast = acts.some((a: any) => a.type === 'CAST_SPELL');
      applyAiActionsWithPriority(acts);
      if (!hasCast) {
        setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
      }
    }, aiSpeed);
    return () => clearTimeout(t);
  }, [s.phase, s.active, s.turn, s.over, s.pendingChoice, s.pendingUpkeepChoice, s.stack?.length, s.pendingTutor, s.pendingTransmuteSacrifice, s.pendingTransmutePay, s.pendingConditionalCounter]); // eslint-disable-line react-hooks/exhaustive-deps

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

      if (isYours && card.type?.includes('Creature')) {
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

    if (s.phase === 'COMBAT_ATTACKERS' && s.active === 'p' && card.type?.includes('Creature')) {
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
    if (s.manaTapSnapshot !== null) {
      dispatch({ type: 'UNDO_MANA_TAPS' });
    }
    setCastFlow(null);
    selectCard(null);
    selectTarget(null);
    setPendingActivate(null);
  }, [s.manaTapSnapshot, dispatch, selectCard, selectTarget]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (flow.kind === 'spell') {
      const card = (s.p.hand as any[]).find((c: any) => c.iid === flow.sourceIid);
      if (!card) { setCastFlow(null); return; }
      const xSpend = card.cost?.toUpperCase().includes('X') ? (s.xVal || 1) : 0;
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
  }, [s, castSpell, activateAbility, selectCard, selectTarget]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const xSpend = card.cost?.toUpperCase().includes('X') ? (s.xVal || 1) : 0;
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

  const beginCastFlow = useCallback((card: any) => {
    if (isLand(card)) { playLand(card.iid); selectCard(null); return; }

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
    const xSpend = card.cost?.toUpperCase().includes('X') ? (s.xVal || 1) : 0;
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

  const pLands     = useMemo(() => (s.p.bf as CardData[]).filter((c: any) => isLand(c)), [s.p.bf]);
  const pCreatures = useMemo(() => (s.p.bf as CardData[]).filter((c: any) => c.type?.includes('Creature')), [s.p.bf]);
  const pPerms     = useMemo(() => (s.p.bf as CardData[]).filter((c: any) => !isLand(c) && !c.type?.includes('Creature')), [s.p.bf]);
  const oLands     = useMemo(() => (s.o.bf as CardData[]).filter((c: any) => isLand(c)), [s.o.bf]);
  const oCreatures = useMemo(() => (s.o.bf as CardData[]).filter((c: any) => c.type?.includes('Creature')), [s.o.bf]);
  const oPerms     = useMemo(() => (s.o.bf as CardData[]).filter((c: any) => !isLand(c) && !c.type?.includes('Creature')), [s.o.bf]);

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
    resolveUpkeepChoice,
    resolveConditionalCounter,
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

    // Phase advance
    requestPhaseAdvance,

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

    // Gemini thinking indicator (sandbox + useGemini only)
    isGeminiThinking,
  };
}
