// src/ui/Mobile/DuelScreenMobile.tsx
// Mobile-compact duel layout (variant B). Renders at ≤640px viewport width.
// Reads from useDuel — same engine as desktop DuelScreen, no fork in data layer.

import { useState, useCallback } from 'react';
import { isLand } from '../../engine/DuelCore.js';
import { PHASE } from '../../engine/phases.js';
import type { CardData } from '../Card/types';
import { useDuelController, resolveDefaultTarget, isBebRebEffect, needsStackTarget } from '../../hooks/useDuelController';
import type { DuelConfig } from '../../types/duel';

import { MulliganModal } from '../Mulligan/MulliganModal';
import { LotusColorPicker, DualLandColorPicker, BebRebModePicker } from '../duel/TargetingOverlay.jsx';
import { TutorModal } from '../duel/TutorModal';
import { TransmuteSacrificeModal } from '../duel/TransmuteSacrificeModal';
import { TransmutePayModal } from '../duel/TransmutePayModal';

import { Topbar } from './Topbar';
import { Banner } from './Banner';
import { Row } from './Row';
import { PipRow } from './PipRow';
import { FieldCard } from './FieldCard';
import { EnchantedCardSlot } from '../Card/EnchantedCardSlot';
import { HandCard } from './HandCard';
import { LandPip } from './LandPip';
import { ActionBar } from './ActionBar';
import type { Selection } from './ActionBar';
import { LogSheet } from './LogSheet';
import { StackDisplay } from '../Stack/StackDisplay';

import s from './styles.module.css';

function needsExplicitTarget(card: any): boolean {
  const CREATURE_TARGET_EFFECTS = new Set([
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
    'destroyBlueCreature',
    'removeFlying',
    'untapTarget',
    'debuffTargetPower1EOT',
    'ebonyHorse',
    'warBarge',
    'jadeStatue',
  ]);
  const DAMAGE_EFFECTS = new Set(['damage3', 'damage5', 'psionicBlast', 'chainLightning']);
  // Player-target effects: spells that say "target player" rather than "target creature".
  const PLAYER_TARGET_EFFECTS = new Set([
    'draw3',   // Ancestral Recall -- "target player draws three cards"
    'stormSeeker',
    'jovialEvil',
    'damage4Any',
  ]);
  const TWO_CREATURE_TARGET_EFFECTS = new Set(['fightTargets']);
  return CREATURE_TARGET_EFFECTS.has(card.effect)
    || DAMAGE_EFFECTS.has(card.effect)
    || PLAYER_TARGET_EFFECTS.has(card.effect)
    || TWO_CREATURE_TARGET_EFFECTS.has(card.effect)
    || (card.activated && CREATURE_TARGET_EFFECTS.has(card.activated?.effect))
    || (card.activated && PLAYER_TARGET_EFFECTS.has(card.activated?.effect));
}

interface DuelScreenMobileProps {
  config: DuelConfig;
  onDuelEnd: (outcome: 'win' | 'lose' | 'forfeit', state: unknown) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DuelScreenMobile({ config, onDuelEnd }: DuelScreenMobileProps) {
  const {
    state, dispatch,
    tapLand, tapArtifactMana, playLand, castSpell,
    activateAbility,
    passPriority, undoManaTaps,
    requestPhaseAdvance,
    chooseTutor, declineTutor, chooseTutorTransmute,
    confirmTransmuteSacrifice, declineTransmuteSacrifice,
    confirmTransmutePay, declineTransmutePay,
    showMulligan, mulliganCount, handleKeep, handleMulligan,
    showLotus, setShowLotus, handleLotusChoose, handleLotusCancel,
    pendingDualLand, setPendingDualLand,
    adaptedLog, canUndoMana,
    pLands, pCreatures, pPerms, oLands, oCreatures, oPerms,
    handleBfClick, pendingBlockerIid, setPendingBlockerIid,
    pendingActivate, setPendingActivate,
    activateCanTargetPlayer, handleActivate, handleActivateWithPlayerTarget,
    pendingMode, setPendingMode,
  } = useDuelController(config, onDuelEnd);

  const s_state = state;

  // ── Local UI state ────────────────────────────────────────────────────────
  const [sel, setSel] = useState<Selection | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [targetingFor, setTargetingFor] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  // ── Card tap handler ───────────────────────────────────────────────────────
  const onCardTap = useCallback((card: CardData, zone: 'hand' | 'bf') => {
    const c = card as any;

    if (zone === 'hand') {
      if (targetingFor === card.iid) {
        setTargetingFor(null);
        setPendingTarget(null);
        setSel(null);
        return;
      }
      if (isBebRebEffect(c) && !isLand(c)) {
        // BEB/REB: enter mode-picker state first; clear any prior mode.
        setTargetingFor(null);
        setPendingTarget(null);
        setPendingMode(null);
        setSel(prev => prev?.iid === card.iid ? null : { iid: card.iid, zone: 'hand', card });
      } else if (needsExplicitTarget(c) && !isLand(c)) {
        setTargetingFor(card.iid);
        setPendingTarget(null);
        setSel({ iid: card.iid, zone: 'hand', card });
      } else {
        setTargetingFor(null);
        setPendingTarget(null);
        setSel(prev => prev?.iid === card.iid ? null : { iid: card.iid, zone: 'hand', card });
      }
      return;
    }

    setSel(prev => prev?.iid === card.iid ? null : { iid: card.iid, zone, card });
  }, [targetingFor, isLand]);

  // ── Action bar handlers ────────────────────────────────────────────────────
  const handleCast = useCallback(() => {
    if (targetingFor !== null) {
      if (!pendingTarget) return;
      castSpell(targetingFor, pendingTarget, s_state.xVal ?? 1);
      setTargetingFor(null);
      setPendingTarget(null);
      setSel(null);
      setPendingMode(null);
      return;
    }

    if (!sel || sel.zone !== 'hand') return;
    const card = (s_state.p.hand as any[]).find((c: any) => c.iid === sel.iid);
    if (!card) return;
    if (isLand(card)) {
      playLand(card.iid);
    } else if (needsStackTarget(card, pendingMode)) {
      // Counter or BEB/REB in counter mode: cast with the selected stack item as target.
      castSpell(card.iid, pendingTarget, s_state.xVal ?? 1);
      setPendingMode(null);
    } else {
      const tgt = s_state.selTgt ?? resolveDefaultTarget(card, s_state);
      castSpell(card.iid, tgt, s_state.xVal ?? 1);
    }
    setSel(null);
    setPendingTarget(null);
  }, [targetingFor, pendingTarget, pendingMode, sel, s_state.p.hand, s_state.selTgt, s_state.xVal, playLand, castSpell, setPendingMode]);

  const handleActivateBf = useCallback(() => {
    if (!sel || sel.zone !== 'bf') return;
    handleActivate(sel.card);
    setSel(null);
  }, [sel, handleActivate]);

  // ── Battlefield card click dispatcher ─────────────────────────────────────
  const handleBfCardClick = useCallback((card: CardData) => {
    const c = card as any;

    // Combat routing (blockers, attackers) is owned by useDuelController.
    const consumed = handleBfClick(card);
    if (consumed !== false) return;

    // ── Targeting mode ───────────────────────────────────────────────────────
    if (targetingFor !== null) {
      setPendingTarget(card.iid);
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
  }, [handleBfClick, targetingFor, activateAbility, tapArtifactMana]);

  const handleCancel = useCallback(() => {
    setSel(null);
    setTargetingFor(null);
    setPendingTarget(null);
    setPendingBlockerIid(null);
    setPendingMode(null);
  }, [setPendingBlockerIid, setPendingMode]);

  const handlePass = useCallback(() => {
    if (s_state.priorityWindow && s_state.priorityPasser !== 'p') {
      passPriority('p');
    } else if (!s_state.priorityWindow && (s_state.stack?.length ?? 0) === 0) {
      requestPhaseAdvance();
    }
    // If priorityWindow is open and player already passed: no-op (waiting for AI)
  }, [s_state.stack, s_state.priorityWindow, s_state.priorityPasser, passPriority, requestPhaseAdvance]);

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

      {s_state.pendingTutor && s_state.pendingTutor.caster === 'p' && (
        <TutorModal
          library={s_state.pendingTutor.shuffledLib}
          filter={s_state.pendingTutor.filter}
          onChoose={(iid: string) => {
            if (s_state.pendingTutor?._transmuteMode) {
              chooseTutorTransmute(iid);
            } else {
              chooseTutor(iid);
            }
          }}
          onDecline={declineTutor}
          titleOverride={s_state.pendingTutor._transmuteMode ? 'Transmute Artifact — Choose an Artifact' : undefined}
        />
      )}

      {s_state.pendingTransmuteSacrifice && s_state.pendingTransmuteSacrifice.caster === 'p' && (
        <TransmuteSacrificeModal
          artifacts={(s_state.p.bf as any[]).filter((c: any) => c.type?.includes('Artifact'))}
          onConfirm={(iid: string) => confirmTransmuteSacrifice(iid)}
          onDecline={declineTransmuteSacrifice}
        />
      )}

      {s_state.pendingTransmutePay && s_state.pendingTransmutePay.caster === 'p' && (
        <TransmutePayModal
          required={s_state.pendingTransmutePay.required}
          tutoredCard={s_state.pendingTransmutePay.tutored}
          currentMana={s_state.p.mana}
          snapshotMana={s_state.manaTapSnapshot?.pMana ?? null}
          onConfirm={confirmTransmutePay}
          onUndo={undoManaTaps}
          onDecline={declineTransmutePay}
        />
      )}

      <Topbar
        turn={s_state.turn}
        phase={s_state.phase}
        active={s_state.active}
        onOpenLog={() => setLogOpen(true)}
        onOpenMenu={() => {}}
      />

      <Banner side="opp" player={oData} onLifeClick={
        targetingFor !== null
          ? () => setPendingTarget('o')
          : activateCanTargetPlayer
            ? () => handleActivateWithPlayerTarget('o')
            : undefined
      } />

      {/* BEB/REB mode picker — shown when a two-mode card is selected and no mode chosen yet */}
      {sel?.card && isBebRebEffect(sel.card) && pendingMode === null && (
        <BebRebModePicker
          cardName={(sel.card as any).name}
          targetColor={(sel.card as any).effect === 'destroyRedOrCounter' ? 'R' : 'U'}
          stack={s_state.stack}
          playerBf={s_state.p.bf}
          opponentBf={s_state.o.bf}
          onSetMode={(mode: 'counter' | 'destroy') => {
            if (mode === 'counter') {
              setPendingTarget(null);
              setTargetingFor(null);
            } else {
              setTargetingFor(sel.iid);
              setPendingTarget(null);
            }
            setPendingMode(mode);
          }}
          onCancel={handleCancel}
        />
      )}

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
            <EnchantedCardSlot
              key={c.iid}
              cardWidth={50}
              cardHeight={70}
              enchantments={(c as any).enchantments ?? []}
              isMobile={true}
            >
              <FieldCard card={c} density="perm"
                selected={selIid === c.iid}
                onClick={() => onCardTap(c, 'bf')} />
            </EnchantedCardSlot>
          ))}
        </Row>

        <Row label="OPP · CREATURES" count={oCreatures.length} accent="var(--opp)"
          minHeight={84}
          bgFade="linear-gradient(180deg, rgba(40,16,8,.35), rgba(20,8,6,.4))">
          {oCreatures.map((c: CardData) => (
            <EnchantedCardSlot
              key={c.iid}
              cardWidth={50}
              cardHeight={70}
              enchantments={(c as any).enchantments ?? []}
              isMobile={true}
            >
              <FieldCard card={c} density="perm"
                selected={selIid === c.iid}
                isTarget={pendingTarget === c.iid}
                isPendingAttackerTarget={
                  s_state.phase === PHASE.COMBAT_BLOCKERS &&
                  pendingBlockerIid !== null &&
                  (s_state.attackers ?? []).includes(c.iid)
                }
                onClick={() => handleBfCardClick(c)} />
            </EnchantedCardSlot>
          ))}
        </Row>

        <div className={s.bfDivider}>
          <span className={s.bfDividerText}>⟡  BATTLEFIELD  ⟡</span>
        </div>

        <Row label="YOUR · CREATURES" count={pCreatures.length} accent="var(--you)"
          minHeight={96}
          bgFade="linear-gradient(180deg, rgba(20,40,10,.4), rgba(14,28,6,.45))">
          {pCreatures.map((c: CardData) => (
            <EnchantedCardSlot
              key={c.iid}
              cardWidth={64}
              cardHeight={90}
              enchantments={(c as any).enchantments ?? []}
              isMobile={true}
            >
              <FieldCard card={c} density="creature"
                selected={selIid === c.iid}
                attacking={(s_state.attackers instanceof Set ? s_state.attackers.has(c.iid) : (s_state.attackers ?? []).includes(c.iid))}
                isBlockerSelected={pendingBlockerIid === c.iid}
                isAssignedBlocker={(s_state.p.bf as any[]).find((x: any) => x.iid === c.iid)?.blocking != null}
                onClick={() => handleBfCardClick(c)} />
            </EnchantedCardSlot>
          ))}
        </Row>

        <Row label="YOUR · PERMANENTS" count={pPerms.length} accent="var(--you)"
          minHeight={76}
          bgFade="linear-gradient(180deg, rgba(20,28,12,.3), rgba(14,18,8,.4))">
          {pPerms.map((c: CardData) => (
            <EnchantedCardSlot
              key={c.iid}
              cardWidth={50}
              cardHeight={70}
              enchantments={(c as any).enchantments ?? []}
              isMobile={true}
            >
              <FieldCard card={c} density="perm"
                selected={selIid === c.iid}
                onClick={() => handleBfCardClick(c)} />
            </EnchantedCardSlot>
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

      <Banner side="you" player={pData} onLifeClick={
        targetingFor !== null
          ? () => setPendingTarget('p')
          : activateCanTargetPlayer
            ? () => handleActivateWithPlayerTarget('p')
            : undefined
      } />

      {/* Stack display — renders only when stack is non-empty. Mobile: bottom sheet above drawer. Desktop: overlay over battlefield center column. */}
      {s_state.stack?.length > 0 && (() => {
        const stackTargeting = needsStackTarget(sel?.card, pendingMode);
        return (
          <StackDisplay
            stack={s_state.stack}
            isMobile={true}
            bottomOffset={56}
            onItemClick={stackTargeting ? (id) => setPendingTarget(id) : undefined}
            selectedItemId={stackTargeting ? pendingTarget : null}
          />
        );
      })()}

      <ActionBar
        sel={sel}
        onCast={handleCast}
        onActivate={handleActivateBf}
        onCancel={handleCancel}
        onPass={handlePass}
        onEnd={requestPhaseAdvance}
        isPlayerTurn={isPlayerTurn}
        isWaitingForAI={isWaitingForAI}
        priorityWindowOpen={s_state.priorityWindow === true}
        canUndo={canUndoMana}
        onUndo={undoManaTaps}
        phase={s_state.phase}
        targetingFor={targetingFor}
        pendingTarget={pendingTarget}
        pendingBlocker={pendingBlockerIid}
        blockers={s_state.blockers ?? {}}
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
