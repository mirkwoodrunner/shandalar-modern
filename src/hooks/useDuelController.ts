// src/hooks/useDuelController.ts
// Shared orchestration hook for both duel screens.
// Owns: AI loop (with applyAiActionsWithPriority), all priority-window effects,
// sandbox escape hatch, game-over timer, and mulligan state.
// Neither DuelScreen nor DuelScreenMobile may contain these effects directly.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDuel } from './useDuel.js';
import { aiDecide } from '../engine/AI.js';
import { isLand } from '../engine/DuelCore.js';
import { usePhaseAdvance } from './usePhaseAdvance';
import type { DuelConfig } from '../types/duel';
import type { CardData } from '../ui/Card/types';

// ── Internal helpers ──────────────────────────────────────────────────────────

type LogKind = 'info' | 'turn' | 'phase' | 'play' | 'opp_play' | 'damage' | 'heal';

function adaptLog(rawLog: unknown[]): { kind: LogKind; text: string }[] {
  return (rawLog ?? []).map(entry => {
    const text = typeof entry === 'string' ? entry : (entry as any)?.text ?? String(entry);
    let kind: LogKind = 'info';
    if (/^turn \d+/i.test(text))                                        kind = 'turn';
    else if (/phase|upkeep|draw step|main|combat|end step/i.test(text)) kind = 'phase';
    else if (/\byou\b.*(cast|played)/i.test(text))                      kind = 'play';
    else if (/\bopp(onent)?\b.*(cast|played)/i.test(text))              kind = 'opp_play';
    else if (/\bdamage\b/i.test(text))                                   kind = 'damage';
    else if (/\bheal|gain.*life\b/i.test(text))                         kind = 'heal';
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
    applyAiActions,
    openPriorityWindow,
    passPriority,
    resolveChoice,
    resolveUpkeepChoice,
    useChannel,
    undoManaTaps,
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
  const [pendingDualLand, setPendingDualLand] = useState<{ card: any; colors: string[] } | null>(null);

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
      if (acts && acts.length) applyAiActions(acts);
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

    if (s.active !== 'o' || aiRef.current) return;
    if (s.phase === 'COMBAT_BLOCKERS') return;
    aiRef.current = true;
    const t = setTimeout(() => {
      const acts = aiDecide(s);
      const hasCast = acts.some((a: any) => a.type === 'CAST_SPELL');
      applyAiActionsWithPriority(acts);
      // If a spell was cast, the priority window close effect clears aiRef and
      // advances the phase. Only start the inner timer for non-cast turns.
      if (!hasCast) {
        setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, aiSpeed);
      }
    }, aiSpeed);
    return () => clearTimeout(t);
  }, [s.phase, s.active, s.turn, s.over, s.pendingChoice, s.pendingUpkeepChoice, s.stack?.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setShowLotus(false);
  }, []);

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
    applyAiActions,
    resolveChoice,
    resolveUpkeepChoice,
    openPriorityWindow,
    passPriority,
    useChannel,
    undoManaTaps,

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
