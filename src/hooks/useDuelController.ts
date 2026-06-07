// src/hooks/useDuelController.ts
// Shared orchestration hook for both duel screens.
// Owns: AI loop (with applyAiActionsWithPriority), all priority-window effects,
// sandbox escape hatch, game-over timer, and mulligan state.
// Neither DuelScreen nor DuelScreenMobile may contain these effects directly.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDuel } from './useDuel.js';
import { aiDecide } from '../engine/AI.js';
import { isLand, isArt, canPay } from '../engine/DuelCore.js';
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

// Effects that require the player to pick a target before casting.
// Keep in sync with needsExplicitTarget() in DuelScreenMobile.tsx.
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
  'regenerate',
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
  const [pendingDualLand, setPendingDualLand] = useState<{ card: any; colors: string[] } | null>(null);
  const [pendingBlockerIid, setPendingBlockerIid] = useState<string | null>(null);
  const [pendingCast, setPendingCast] = useState<{ cardIid: string; target: string | null } | null>(null);
  const [pendingActivate, setPendingActivate] = useState<any | null>(null);
  const [pendingMode, setPendingMode] = useState<'counter' | 'destroy' | null>(null);

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

      if (!valid.length) {
        declineTutor();
        return;
      }
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
      if (!arts.length || !libArts.length) {
        declineTransmuteSacrifice();
        return;
      }
      const targetCard = libArts.reduce((a: any, b: any) =>
        scoreLibCard(b, s) > scoreLibCard(a, s) ? b : a
      );
      const victim = arts.reduce((a: any, b: any) =>
        scoreLibCard(a, s) <= scoreLibCard(b, s) ? a : b
      );
      const diff = (targetCard.cmc ?? 0) - (victim.cmc ?? 0);
      const pool = s.o.mana;
      const totalMana = Object.values(pool).reduce((a: number, b: any) => a + (b as number), 0);
      if (diff > 0 && totalMana < diff) {
        declineTransmuteSacrifice();
        return;
      }
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
    // Bail during COMBAT_BLOCKERS so the AI doesn't skip past blocker
    // declaration. When the AI is attacking (active='o'), the player declares
    // blockers via the UI and then clicks "Done Blocking" which calls
    // advancePhase directly. The AI loop must not fire requestPhaseAdvance
    // here — it would race past the player's blocker window.
    // When the player is attacking (active='p'), the outer guard above already
    // bails, so this line is never reached on the player's turn anyway.
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
  }, [s.phase, s.active, s.turn, s.over, s.pendingChoice, s.pendingUpkeepChoice, s.stack?.length, s.pendingTutor, s.pendingTransmuteSacrifice, s.pendingTransmutePay]); // eslint-disable-line react-hooks/exhaustive-deps

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
    cancelLotus();
    setShowLotus(false);
  }, [cancelLotus]);

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

  // ── Activated ability helpers ──────────────────────────────────────────────

  // Effects that target any target (creature or player).
  const PLAYER_TARGETABLE_ABILITY_EFFECTS = new Set(['ping', 'damage1', 'damage2', 'damage3']);

  const activateCanTargetPlayer: boolean =
    pendingActivate != null &&
    PLAYER_TARGETABLE_ABILITY_EFFECTS.has(pendingActivate.activated?.effect);

  const handleActivateWithPlayerTarget = useCallback((playerKey: 'p' | 'o') => {
    if (!pendingActivate) return;
    activateAbility(pendingActivate.iid, playerKey);
    setPendingActivate(null);
    selectCard(null);
  }, [pendingActivate, activateAbility, selectCard]);

  const handleActivate = useCallback((card: any) => {
    if (!card.activated) return;
    const { effect } = card.activated;
    if (effect === 'addManaAny') { activateAbility(card.iid, null); return; }
    if (effect === 'addMana3Any') { activateAbility(card.iid, null); setShowLotus(true); setPendingActivate(card); return; }
    if (['ping', 'destroyTapped', 'pumpCreature', 'gainFlying', 'pumpPower', 'damage1', 'damage2', 'damage3'].includes(effect)) {
      setPendingActivate(card); selectCard(card.iid); return;
    }
    activateAbility(card.iid, null);
    setPendingActivate(null);
  }, [activateAbility, selectCard, setShowLotus]);

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

  const canCastPending = pendingCast !== null && (() => {
    const card = (s.p.hand as any[]).find((c: any) => c.iid === pendingCast.cardIid);
    if (!card) return false;
    const xSpend = card.cost?.toUpperCase().includes('X') ? (s.xVal || 1) : 0;
    return canPay(s.p.mana, card.cost, xSpend);
  })();

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

    // Battlefield click routing
    pendingBlockerIid,
    setPendingBlockerIid,
    handleBfClick,

    // Pending cast state
    pendingCast,
    setPendingCast,
    canCastPending,

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
