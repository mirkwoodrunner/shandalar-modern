// src/ui/Mobile/DuelScreenMobile.tsx
// Mobile-compact duel layout (variant B). Renders at ≤640px viewport width.
// Reads from useDuel — same engine as desktop DuelScreen, no fork in data layer.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDuel } from '../../hooks/useDuel.js';
import { usePhaseAdvance } from '../../hooks/usePhaseAdvance';
import { aiDecide } from '../../engine/AI.js';
import { isLand, canPay } from '../../engine/DuelCore.js';
import { PHASE } from '../../engine/phases.js';
import type { CardData } from '../Card/types';

import { MulliganModal } from '../Mulligan/MulliganModal';
import { LotusColorPicker, DualLandColorPicker } from '../duel/TargetingOverlay.jsx';

import { Topbar } from './Topbar';
import { Banner } from './Banner';
import { Row } from './Row';
import { PipRow } from './PipRow';
import { FieldCard } from './FieldCard';
import { HandCard } from './HandCard';
import { LandPip } from './LandPip';
import { ActionBar } from './ActionBar';
import type { Selection } from './ActionBar';
import { LogSheet } from './LogSheet';
import type { LogEntry } from './LogSheet';

import s from './styles.module.css';

function resolveDefaultTarget(card: any, state: any): string | null {
  const { effect } = card;
  if (['damage3', 'damage5', 'damageX', 'psionicBlast', 'chainLightning'].includes(effect)) return 'o';
  if (['draw3', 'gainLife3', 'gainLifeX', 'tutor', 'drawX'].includes(effect)) return state.selTgt ?? 'p';
  return state.selTgt ?? null;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DuelRuleset {
  name: string;
  startingLife: number;
  manaBurn?: boolean;
  stackType?: string;
}

interface DuelConfig {
  pDeckIds: string[];
  oppArchKey: string;
  ruleset: DuelRuleset;
  overworldHP?: number;
  castleMod?: { name: string; desc: string } | null;
  anteEnabled?: boolean;
}

interface DuelScreenMobileProps {
  config: DuelConfig;
  onDuelEnd: (outcome: 'win' | 'lose' | 'forfeit', state: unknown) => void;
}

// ── Log adapter ────────────────────────────────────────────────────────────

function adaptLog(rawLog: unknown[]): LogEntry[] {
  return (rawLog ?? []).map(entry => {
    const text = typeof entry === 'string' ? entry : (entry as any)?.text ?? String(entry);
    let kind: LogEntry['kind'] = 'info';
    if (/^turn \d+/i.test(text))                                       kind = 'turn';
    else if (/phase|upkeep|draw step|main|combat|end step/i.test(text)) kind = 'phase';
    else if (/\byou\b.*(cast|played)/i.test(text))                     kind = 'play';
    else if (/\bopp(onent)?\b.*(cast|played)/i.test(text))             kind = 'opp_play';
    else if (/\bdamage\b/i.test(text))                                  kind = 'damage';
    else if (/\bheal|gain.*life\b/i.test(text))                        kind = 'heal';
    return { kind, text };
  });
}

// ── Component ──────────────────────────────────────────────────────────────

const AI_SPEED = 800;

export default function DuelScreenMobile({ config, onDuelEnd }: DuelScreenMobileProps) {
  const {
    state,
    dispatch,
    tapLand,
    tapArtifactMana,
    playLand,
    castSpell,
    resolveStack,
    declareAttacker,
    advancePhase,
    activateAbility,
    chooseLotusColor,
    mulligan,
    applyAiActions,
    openPriorityWindow,
    passPriority,
    resolveChoice,
    resolveUpkeepChoice,
    undoManaTaps,
  } = useDuel(
    config.pDeckIds,
    config.oppArchKey,
    config.ruleset,
    config.overworldHP,
    config.castleMod,
    config.anteEnabled ?? false,
  );

  const s_state = state;

  // ── Local UI state ────────────────────────────────────────────────────────
  const [sel, setSel] = useState<Selection | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const mulliganDismissed = useRef(false);
  const [showMulligan, setShowMulligan] = useState(true);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [showLotus, setShowLotus] = useState(false);
  const [pendingDualLand, setPendingDualLand] = useState<{ card: any; colors: string[] } | null>(null);
  const aiRef = useRef(false);
  const prevPriorityWindow = useRef(false);
  const priorityWindowInitiator = useRef(false);

  // ── Phase advance (shared logic with desktop) ─────────────────────────────
  const requestPhaseAdvance = usePhaseAdvance(s_state, advancePhase, openPriorityWindow);

  // ── Battlefield partitions ─────────────────────────────────────────────────
  const pLands = useMemo(() => (s_state.p.bf as CardData[]).filter((c: any) => isLand(c)), [s_state.p.bf]);
  const pCreatures = useMemo(() => (s_state.p.bf as CardData[]).filter((c: any) => c.type?.includes('Creature')), [s_state.p.bf]);
  const pPerms = useMemo(() => (s_state.p.bf as CardData[]).filter((c: any) => !isLand(c) && !c.type?.includes('Creature')), [s_state.p.bf]);

  const oLands = useMemo(() => (s_state.o.bf as CardData[]).filter((c: any) => isLand(c)), [s_state.o.bf]);
  const oCreatures = useMemo(() => (s_state.o.bf as CardData[]).filter((c: any) => c.type?.includes('Creature')), [s_state.o.bf]);
  const oPerms = useMemo(() => (s_state.o.bf as CardData[]).filter((c: any) => !isLand(c) && !c.type?.includes('Creature')), [s_state.o.bf]);

  const adaptedLog = useMemo(() => adaptLog(s_state.log ?? []), [s_state.log]);

  // ── Priority window management ─────────────────────────────────────────────
  useEffect(() => {
    if (s_state.priorityWindow === true) priorityWindowInitiator.current = true;
    if (
      prevPriorityWindow.current === true &&
      s_state.priorityWindow === false &&
      priorityWindowInitiator.current === true
    ) {
      priorityWindowInitiator.current = false;
      if (s_state.stack && s_state.stack.length > 0) resolveStack();
      else advancePhase();
    }
    prevPriorityWindow.current = s_state.priorityWindow;
  }, [s_state.priorityWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI priority window ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!s_state.priorityWindow) return;
    const t = setTimeout(() => {
      const aiInstant = s_state.o.hand.find(
        (c: any) => (c.type === 'Instant' || c.type === 'Interrupt') && canPay(s_state.o.mana, c.cost)
      );
      if (aiInstant) dispatch({ type: 'CAST_SPELL', who: 'o', iid: (aiInstant as any).iid, tgt: 'p', xVal: 1 });
      dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    }, 0);
    return () => clearTimeout(t);
  }, [s_state.priorityWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (s_state.over) return;
    if (s_state.pendingUpkeepChoice) return;
    if (s_state.pendingChoice && s_state.pendingChoice.controller === 'o') {
      const choice = s_state.pendingChoice;
      const payOption = choice.options.find((o: any) => o.id === 'pay_gggg');
      const damageOption = choice.options.find((o: any) => o.effect?.type === 'dealDamageToController');
      let aiCanPay = false;
      if (payOption?.effect?.type === 'payMana') {
        const cost = payOption.effect.cost;
        aiCanPay = Object.entries(cost).every(([color, amount]) =>
          (s_state.o.mana[color as string] || 0) >= (amount as number)
        );
      }
      resolveChoice(aiCanPay && payOption ? payOption.id : (damageOption?.id || choice.options[0].id));
      return;
    }
    if (s_state.active !== 'o' || aiRef.current) return;
    if (s_state.phase === 'COMBAT_BLOCKERS') return;
    aiRef.current = true;
    const t = setTimeout(() => {
      const acts = aiDecide(s_state);
      if (acts.length) applyAiActions(acts);
      setTimeout(() => { requestPhaseAdvance(); aiRef.current = false; }, AI_SPEED);
    }, 500 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [s_state.phase, s_state.active, s_state.turn, s_state.over, s_state.pendingChoice, s_state.pendingUpkeepChoice]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Game over ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!s_state.over) return;
    const t = setTimeout(() => {
      onDuelEnd(s_state.over.winner === 'p' ? 'win' : 'lose', s_state);
    }, 3000);
    return () => clearTimeout(t);
  }, [s_state.over]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mulligan handlers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mulliganDismissed.current) setShowMulligan(false);
  }, [s_state.p.hand]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeep = useCallback(() => { mulliganDismissed.current = true; setShowMulligan(false); }, []);
  const handleMulligan = useCallback(() => { mulligan(); setMulliganCount(c => c + 1); }, [mulligan]);

  // ── Lotus handlers ─────────────────────────────────────────────────────────
  const handleLotusChoose = useCallback((color: string) => { chooseLotusColor(color); setShowLotus(false); }, [chooseLotusColor]);
  const handleLotusCancel = useCallback(() => { setShowLotus(false); }, []);

  // ── Card tap handler ───────────────────────────────────────────────────────
  const onCardTap = useCallback((card: CardData, zone: 'hand' | 'bf') => {
    setSel(prev => prev?.iid === card.iid ? null : { iid: card.iid, zone, card });
  }, []);

  // ── Action bar handlers ────────────────────────────────────────────────────
  const handleCast = useCallback(() => {
    if (!sel || sel.zone !== 'hand') return;
    const card = (s_state.p.hand as any[]).find((c: any) => c.iid === sel.iid);
    if (!card) return;
    if (isLand(card)) {
      playLand(card.iid);
    } else {
      const tgt = s_state.selTgt ?? resolveDefaultTarget(card, s_state);
      castSpell(card.iid, tgt, s_state.xVal ?? 1);
    }
    setSel(null);
  }, [sel, s_state.p.hand, s_state.selTgt, s_state.xVal, playLand, castSpell]);

  const handleActivate = useCallback(() => {
    if (!sel || sel.zone !== 'bf') return;
    activateAbility(sel.iid, null);
    setSel(null);
  }, [sel, activateAbility]);

  // ── Battlefield card click dispatcher ─────────────────────────────────────
  const handleBfCardClick = useCallback((card: CardData) => {
    const c = card as any;

    // Declare attackers: clicking a creature during the attackers step toggles it.
    // The engine validates eligibility (not tapped, no summoning sickness without haste).
    if (s_state.phase === PHASE.COMBAT_ATTACKERS && c.type?.includes('Creature')) {
      declareAttacker(card.iid);
      return;
    }

    // Mana-producing permanents: act immediately, no Activate button.
    if (!c.tapped) {
      // Black Lotus and any addMana3Any: sacrifice + choose color
      if (c.activated?.effect === 'addMana3Any') {
        activateAbility(card.iid, null);
        setShowLotus(true);
        return;
      }
      // Simple mana producers (Moxen, Sol Ring, Llanowar Elves, etc.): tap directly
      if (c.activated?.effect === 'addMana') {
        tapArtifactMana(card.iid);
        return;
      }
    }

    // Non-mana activated ability (ping, destroyTapped, pumpSelf, etc.) or
    // multi-ability cards: select to reveal Activate button.
    const hasNonManaActivation =
      (c.activated && !c.activated.effect?.startsWith('addMana')) ||
      Boolean(c.activatedAbilities);
    if (hasNonManaActivation) {
      setSel(prev => prev?.iid === card.iid ? null : { iid: card.iid, zone: 'bf', card });
    }
    // Plain creatures / permanents with no activated ability: no action.
    // (addManaAny / Birds of Paradise is a Known Gap — BopColorPicker not yet wired.)
  }, [s_state.phase, activateAbility, tapArtifactMana, declareAttacker]);

  const handleCancel = useCallback(() => setSel(null), []);

  const handlePass = useCallback(() => {
    if (s_state.stack?.length > 0) {
      resolveStack();
    } else if (s_state.priorityWindow && s_state.priorityPasser !== 'p') {
      passPriority('p');
    } else {
      requestPhaseAdvance();
    }
  }, [s_state.stack, s_state.priorityWindow, s_state.priorityPasser, resolveStack, passPriority, requestPhaseAdvance]);

  // ── Land tap helper ────────────────────────────────────────────────────────
  const handleLandTap = useCallback((card: CardData) => {
    const c = card as any;
    if (c.tapped) { onCardTap(card, 'bf'); return; }
    if (c.produces && c.produces.length === 1) {
      tapLand(card.iid, c.produces[0]);
    } else if (c.produces && c.produces.length > 1) {
      setPendingDualLand({ card: c, colors: c.produces });
    } else {
      onCardTap(card, 'bf');
    }
  }, [tapLand, onCardTap]);

  const selIid = sel?.iid ?? null;

  const isPlayerTurn = s_state.active === 'p';
  const isWaitingForAI = s_state.priorityWindow === true && s_state.priorityPasser === 'p';

  const canUndoMana: boolean =
    s_state.active === 'p' &&
    (s_state.phase === 'MAIN_1' || s_state.phase === 'MAIN_2') &&
    (s_state.stack?.length ?? 0) === 0 &&
    (s_state.spellsThisTurn ?? 0) === 0 &&
    s_state.manaTapSnapshot !== null;

  // ── Derived player data ────────────────────────────────────────────────────
  const pData = {
    life: s_state.p.life,
    max: config.ruleset.startingLife,
    mana: s_state.p.mana,
    lib: (s_state.p.lib as any[]).length,
    gy: (s_state.p.gy as any[]).length,
  };
  const oData = {
    life: s_state.o.life,
    max: config.ruleset.startingLife,
    mana: s_state.o.mana,
    lib: (s_state.o.lib as any[]).length,
    gy: (s_state.o.gy as any[]).length,
    handCount: (s_state.o.hand as any[]).length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={s.screen}>

      {showMulligan && !s_state.over && (
        <MulliganModal
          hand={s_state.p.hand as CardData[]}
          mulliganCount={mulliganCount}
          onKeep={handleKeep}
          onMulligan={handleMulligan}
        />
      )}
      {showLotus && (
        <LotusColorPicker onChoose={handleLotusChoose} onCancel={handleLotusCancel} />
      )}
      {pendingDualLand && (
        <DualLandColorPicker
          landName={pendingDualLand.card.name}
          colors={pendingDualLand.colors}
          onChoose={(color: string) => {
            dispatch({ type: 'TAP_LAND', who: 'p', iid: pendingDualLand.card.iid, mana: color });
            setPendingDualLand(null);
          }}
          onCancel={() => setPendingDualLand(null)}
        />
      )}

      <Topbar
        turn={s_state.turn}
        phase={s_state.phase}
        active={s_state.active}
        onOpenLog={() => setLogOpen(true)}
        onOpenMenu={() => {}}
      />

      <Banner side="opp" player={oData} />

      {/* Scrollable battlefield — grows to fill remaining height between the two banners */}
      <div className={s.bfScroll}>

        {/* Opp lands → perms → creatures (closing toward center) */}
        <PipRow label="OPP · LANDS" count={oLands.length} accent="var(--opp)">
          {oLands.map((c: CardData) => (
            <LandPip key={c.iid} card={c} tapped={(c as any).tapped}
              selected={selIid === c.iid}
              onClick={() => onCardTap(c, 'bf')} />
          ))}
        </PipRow>

        <Row label="OPP · PERMANENTS" count={oPerms.length} accent="var(--opp)"
          minHeight={76}
          bgFade="linear-gradient(180deg, rgba(40,16,8,.25), rgba(20,8,6,.3))">
          {oPerms.map((c: CardData) => (
            <FieldCard key={c.iid} card={c} density="perm"
              selected={selIid === c.iid}
              onClick={() => onCardTap(c, 'bf')} />
          ))}
        </Row>

        <Row label="OPP · CREATURES" count={oCreatures.length} accent="var(--opp)"
          minHeight={84}
          bgFade="linear-gradient(180deg, rgba(40,16,8,.35), rgba(20,8,6,.4))">
          {oCreatures.map((c: CardData) => (
            <FieldCard key={c.iid} card={c} density="perm"
              selected={selIid === c.iid}
              onClick={() => onCardTap(c, 'bf')} />
          ))}
        </Row>

        <div className={s.bfDivider}>
          <span className={s.bfDividerText}>⟡  BATTLEFIELD  ⟡</span>
        </div>

        <Row label="YOUR · CREATURES" count={pCreatures.length} accent="var(--you)"
          minHeight={96}
          bgFade="linear-gradient(180deg, rgba(20,40,10,.4), rgba(14,28,6,.45))">
          {pCreatures.map((c: CardData) => (
            <FieldCard key={c.iid} card={c} density="creature"
              selected={selIid === c.iid}
              attacking={(s_state.attackers instanceof Set ? s_state.attackers.has(c.iid) : (s_state.attackers ?? []).includes(c.iid))}
              onClick={() => handleBfCardClick(c)} />
          ))}
        </Row>

        <Row label="YOUR · PERMANENTS" count={pPerms.length} accent="var(--you)"
          minHeight={76}
          bgFade="linear-gradient(180deg, rgba(20,28,12,.3), rgba(14,18,8,.4))">
          {pPerms.map((c: CardData) => (
            <FieldCard key={c.iid} card={c} density="perm"
              selected={selIid === c.iid}
              onClick={() => handleBfCardClick(c)} />
          ))}
        </Row>

        <PipRow label="YOUR LANDS" count={pLands.length} accent="var(--you)">
          {pLands.map((c: CardData) => (
            <LandPip key={c.iid} card={c} tapped={(c as any).tapped} isPlayer
              selected={selIid === c.iid}
              onClick={() => handleLandTap(c)} />
          ))}
        </PipRow>

      </div>{/* end bfScroll */}

      <Banner side="you" player={pData} />

      <ActionBar
        sel={sel}
        onCast={handleCast}
        onActivate={handleActivate}
        onCancel={handleCancel}
        onPass={handlePass}
        onEnd={requestPhaseAdvance}
        isPlayerTurn={isPlayerTurn}
        isWaitingForAI={isWaitingForAI}
        priorityWindowOpen={s_state.priorityWindow === true}
        canUndo={canUndoMana}
        onUndo={undoManaTaps}
      />

      {/* Hand strip */}
      <div className={s.handStrip}>
        <div className={s.handHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={s.handTitle}>YOUR HAND</span>
            <span className={s.handCountBadge}>{(s_state.p.hand as any[]).length}</span>
          </div>
          <span className={s.handHint}>tap a card to play</span>
        </div>
        <div className={s.handCards}>
          {(s_state.p.hand as CardData[]).map((c: CardData) => (
            <HandCard
              key={c.iid}
              card={c}
              selected={selIid === c.iid}
              playable={(c as any).type === 'Land'}
              onClick={() => onCardTap(c, 'hand')}
            />
          ))}
        </div>
      </div>

      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} log={adaptedLog} />
    </div>
  );
}
