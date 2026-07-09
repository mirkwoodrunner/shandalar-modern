// src/ui/Mobile/DuelScreenMobile.tsx
// Mobile-compact duel layout (variant B). Renders at ≤640px viewport width.
// Reads from useDuel — same engine as desktop DuelScreen, no fork in data layer.

import { useState, useCallback } from 'react';
import { isLand, hasKw } from '../../engine/DuelCore.js';
import { PHASE } from '../../engine/phases.js';
import KEYWORDS from '../../data/keywords.js';
import type { CardData } from '../Card/types';
import { useDuelController, isBebRebEffect, isCounterEffect, needsStackTarget, isPlayerOnlyTarget, getManaShortfall } from '../../hooks/useDuelController';
import type { DuelConfig } from '../../types/duel';

import { MulliganModal } from '../Mulligan/MulliganModal';
import { LotusColorPicker, DualLandColorPicker, BebRebModePicker, BopColorPicker } from '../duel/TargetingOverlay.jsx';
import { EngineErrorOverlay } from '../duel/EngineErrorOverlay';
import { TutorModal } from '../duel/TutorModal';
import { TransmuteSacrificeModal } from '../duel/TransmuteSacrificeModal';
import { TransmutePayModal } from '../duel/TransmutePayModal';
import { XSelectModal } from '../duel/XSelectModal';
import { ConditionalCounterModal } from '../duel/ConditionalCounterModal';
import { SphereTriggerModal } from '../duel/SphereTriggerModal';
import { ChoiceModal } from '../duel/ChoiceModal';
import { UPKEEP_CHOICE_MODALS } from '../duel/upkeepChoiceRegistry';
import { usePersistence, clearDuel } from '../../hooks/usePersistence';

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
import { BandFormationPanel } from './BandFormationPanel';

import s from './styles.module.css';


interface DuelScreenMobileProps {
  config: DuelConfig;
  onDuelEnd: (outcome: 'win' | 'lose' | 'forfeit', state: unknown) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DuelScreenMobile({ config, onDuelEnd }: DuelScreenMobileProps) {
  const handleDuelEndWithClear = useCallback((outcome: 'win' | 'lose' | 'forfeit', st: unknown) => {
    clearDuel();
    onDuelEnd(outcome, st);
  }, [onDuelEnd]);

  const {
    state, dispatch,
    tapLand, tapArtifactMana, playLand, castSpell,
    activateAbility,
    passPriority, undoManaTaps,
    advancePhase,
    requestPhaseAdvance,
    endTurn, endTurnPending, fatalError,
    chooseTutor, declineTutor, chooseTutorTransmute,
    confirmTransmuteSacrifice, declineTransmuteSacrifice,
    confirmTransmutePay, declineTransmutePay,
    resolveAnteExchange, declineAnteExchange,
    resolveConditionalCounter,
    resolveUpkeepChoice,
    resolveChoice,
    resolveSphereTrigger,
    showMulligan, mulliganCount, handleKeep, handleMulligan,
    showLotus, setShowLotus, handleLotusChoose, handleLotusCancel,
    showBop, handleBopChoose, handleBopCancel,
    pendingDualLand, setPendingDualLand,
    adaptedLog, canUndoMana,
    pLands, pCreatures, pPerms, oLands, oCreatures, oPerms,
    handleBfClick, pendingBlockerIid, setPendingBlockerIid,
    pendingMode, setPendingMode,
    castFlow, beginCastFlow, beginActivateFlow,
    selectCastTarget, confirmCastTargets, cancelCastFlow,
    adjustCastX, confirmCastX,
  } = useDuelController(config, handleDuelEndWithClear);

  const s_state = state;

  usePersistence(s_state, true);

  // ── Local UI state ────────────────────────────────────────────────────────
  const [sel, setSel] = useState<Selection | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  // ── Card tap handler ───────────────────────────────────────────────────────
  const onCardTap = useCallback((card: CardData, zone: 'hand' | 'bf') => {
    if (zone === 'hand') {
      setSel(prev => prev?.iid === card.iid ? null : { iid: card.iid, zone: 'hand', card });
      return;
    }
    setSel(prev => prev?.iid === card.iid ? null : { iid: card.iid, zone, card });
  }, []);

  // ── Action bar handlers ────────────────────────────────────────────────────
  const handleCast = useCallback(() => {
    if (castFlow) return; // flow already active
    if (!sel || sel.zone !== 'hand') return;
    const card = (s_state.p.hand as any[]).find((c: any) => c.iid === sel.iid);
    if (!card) return;
    if (isLand(card)) {
      playLand(card.iid);
      setSel(null);
      return;
    }
    beginCastFlow(card);
    setSel(null);
  }, [castFlow, sel, s_state.p.hand, playLand, beginCastFlow]);

  const handleActivateBf = useCallback(() => {
    if (!sel || sel.zone !== 'bf') return;
    beginActivateFlow(sel.card, null);
    setSel(null);
  }, [sel, beginActivateFlow]);

  // ── Battlefield card click dispatcher ─────────────────────────────────────
  const handleBfCardClick = useCallback((card: CardData) => {
    const c = card as any;

    // Combat routing (blockers, attackers) is owned by useDuelController.
    const consumed = handleBfClick(card);
    if (consumed !== false) return;

    // ── Cast/activate targeting mode — highest priority ──────────────────────
    if (castFlow?.mode === 'targeting') {
      const castingCard = (s_state.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid);
      if (isPlayerOnlyTarget(castingCard)) return; // creature click is illegal for player-only effects
      selectCastTarget(card.iid);
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
      // Birds of Paradise and any addManaAny: tap + choose color
      if (c.activated?.effect === 'addManaAny') {
        activateAbility(card.iid, null);
        // showBop is set by the useEffect in useDuelController watching state.pendingBop
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
  }, [handleBfClick, castFlow, selectCastTarget, activateAbility, tapArtifactMana]);

  const handleCancel = useCallback(() => {
    if (castFlow) {
      cancelCastFlow();
    }
    setSel(null);
    setPendingBlockerIid(null);
    setPendingMode(null);
  }, [castFlow, cancelCastFlow, setPendingBlockerIid, setPendingMode]);

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
    poisonCounters: s_state.p.poisonCounters,
  };
  const oData = {
    life: s_state.o.life,
    max: config.ruleset.startingLife,
    mana: s_state.o.mana,
    lib: (s_state.o.lib as any[]).length,
    gy: (s_state.o.gy as any[]).length,
    handCount: (s_state.o.hand as any[]).length,
    poisonCounters: s_state.o.poisonCounters,
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
      {showBop && (
        <BopColorPicker onChoose={handleBopChoose} onCancel={handleBopCancel} />
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

      {fatalError && (
        <EngineErrorOverlay
          message={fatalError.message}
          stack={fatalError.stack}
          context={fatalError.context}
          onExit={() => handleDuelEndWithClear('forfeit', s_state)}
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

      {s_state.pendingAnteExchange && s_state.pendingAnteExchange.caster === 'p' && (
        <TutorModal
          library={s_state.pendingAnteExchange.cards}
          filter="any"
          onChoose={(iid: string) => resolveAnteExchange(iid)}
          onDecline={declineAnteExchange}
          titleOverride="Darkpact — Choose a Card in the Ante"
        />
      )}

      {s_state.pendingDamageShieldChoice && s_state.pendingDamageShieldChoice.caster === 'p' && (
        <TutorModal
          library={s_state.pendingDamageShieldChoice.pool}
          filter="any"
          onChoose={(iid: string) => dispatch({ type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid })}
          onDecline={() => dispatch({ type: 'DECLINE_DAMAGE_SHIELD_CHOICE' })}
          titleOverride={`${s_state.pendingDamageShieldChoice.shieldSourceName} — Choose a Source`}
        />
      )}

      {s_state.pendingChoice && s_state.pendingChoice.controller === 'p' && (
        <ChoiceModal
          pendingChoice={s_state.pendingChoice}
          allBf={[...s_state.p.bf, ...s_state.o.bf]}
          onResolve={resolveChoice}
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

      {castFlow?.mode === 'xSelect' && (() => {
        const card = (s_state.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid);
        if (!card) return null;
        return (
          <XSelectModal
            cardName={card.name}
            xVal={castFlow.xVal ?? 0}
            xMax={castFlow.xMax ?? 0}
            legalValues={castFlow.xLegalValues}
            onAdjust={adjustCastX}
            onConfirm={confirmCastX}
            onCancel={cancelCastFlow}
          />
        );
      })()}

      {s_state.pendingConditionalCounter && s_state.pendingConditionalCounter.targetCaster === 'p' && (() => {
        const cc = s_state.pendingConditionalCounter;
        const totalMana = Object.values(s_state.p.mana as Record<string, number>).reduce((a, v) => a + v, 0);
        const targeted = (s_state.stack as any[]).find((i: any) => i.id === cc.stackItemId);
        return (
          <ConditionalCounterModal
            cardName={cc.cardName}
            targetedSpellName={targeted?.card?.name ?? 'your spell'}
            cost={cc.cost}
            canPay={cc.canPay}
            totalMana={totalMana}
            isPowerSink={cc.cardId === 'power_sink'}
            onResolve={resolveConditionalCounter}
          />
        );
      })()}

      {s_state.pendingUpkeepChoice && s_state.active === 'p' && (() => {
        const entry = UPKEEP_CHOICE_MODALS[s_state.pendingUpkeepChoice.handlerKey];
        if (!entry) return null;
        const Comp = entry.component;
        return <Comp {...entry.getProps(s_state, s_state.pendingUpkeepChoice, resolveUpkeepChoice)} />;
      })()}

      {s_state.pendingSphereTrigger && s_state.pendingSphereTrigger.controller === 'p' && (() => {
        const st = s_state.pendingSphereTrigger;
        const totalMana = Object.values(s_state.p.mana as Record<string, number>).reduce((a, v) => a + v, 0);
        return (
          <SphereTriggerModal
            sphereCardName={st.sphereCardName}
            totalMana={totalMana}
            onResolve={resolveSphereTrigger}
          />
        );
      })()}

      <Topbar
        turn={s_state.turn}
        phase={s_state.phase}
        active={s_state.active}
        onOpenLog={() => setLogOpen(true)}
        onOpenMenu={() => {}}
      />

      <Banner side="opp" player={oData} onLifeClick={
        castFlow?.mode === 'targeting' && castFlow.canTargetPlayers
          ? () => selectCastTarget('o')
          : undefined
      } />

      {s_state.anteEnabled && (() => {
        const anteExtraP = (s_state as any).anteExtraP ?? [];
        const anteExtraO = (s_state as any).anteExtraO ?? [];
        const stakeP = [...((s_state as any).anteP ? [(s_state as any).anteP] : []), ...anteExtraP];
        const stakeO = [...((s_state as any).anteO ? [(s_state as any).anteO] : []), ...anteExtraO];
        if (!stakeP.length && !stakeO.length) return null;
        return (
          <div className={s.centerInfoBanner} data-testid="ante-banner-mobile">
            ANTE {'—'} {stakeP.length > 0 && `You: ${stakeP.map((c: any) => c.name).join(', ')}`}
            {stakeP.length > 0 && stakeO.length > 0 && ' · '}
            {stakeO.length > 0 && `Opp: ${stakeO.map((c: any) => c.name).join(', ')}`}
          </div>
        );
      })()}

      {/* BEB/REB mode picker — shown when a two-mode card is selected and no mode chosen yet */}
      {sel?.card && isBebRebEffect(sel.card) && pendingMode === null && !castFlow && (
        <BebRebModePicker
          cardName={(sel.card as any).name}
          targetColor={(sel.card as any).effect === 'destroyRedOrCounter' ? 'R' : 'U'}
          stack={s_state.stack}
          playerBf={s_state.p.bf}
          opponentBf={s_state.o.bf}
          onSetMode={(mode: 'counter' | 'destroy') => {
            setPendingMode(mode);
            const card = (s_state.p.hand as any[]).find((c: any) => c.iid === sel.iid);
            if (card) { beginCastFlow(card); setSel(null); }
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
                onClick={() => onCardTap(c, 'bf')}
                state={s_state} />
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
                isTarget={castFlow?.selectedTargets.includes(c.iid) ?? false}
                isPendingAttackerTarget={
                  s_state.phase === PHASE.COMBAT_BLOCKERS &&
                  pendingBlockerIid !== null &&
                  (s_state.attackers ?? []).includes(c.iid)
                }
                onClick={() => handleBfCardClick(c)}
                state={s_state} />
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
                onClick={() => handleBfCardClick(c)}
                state={s_state} />
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
                onClick={() => handleBfCardClick(c)}
                state={s_state} />
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

      <Banner side="you" player={pData}
        onLifeClick={
          castFlow?.mode === 'targeting' && castFlow.canTargetPlayers
            ? () => selectCastTarget('p')
            : undefined
        }
        castPrompt={castFlow ? (() => {
          const sourceCard = castFlow.kind === 'spell'
            ? (s_state.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid)
            : (s_state.p.bf as any[]).find((c: any) => c.iid === castFlow.sourceIid);
          const cost = castFlow.kind === 'spell'
            ? sourceCard?.cost
            : (castFlow.abilityId
                ? (sourceCard?.activatedAbilities ?? []).find((a: any) => a.id === castFlow.abilityId)?.cost
                : sourceCard?.activated?.cost);
          return {
            mode: castFlow.mode ?? 'targeting',
            targetLabel: castFlow.mode === 'targeting'
              ? (castFlow.requiresTarget ? 'Select target' : 'Select target (optional)')
              : undefined,
            canSkip: castFlow.mode === 'targeting' && !castFlow.requiresTarget && castFlow.selectedTargets.length === 0,
            onSkip: confirmCastTargets,
            onConfirmTargets: castFlow.mode === 'targeting' && castFlow.selectedTargets.length >= 1 ? confirmCastTargets : undefined,
            targetsSelected: castFlow.selectedTargets.length,
            costNeeded: cost,
            shortfall: cost ? getManaShortfall(s_state.p.mana, cost, s_state.xVal || 0) : null,
            onCancel: cancelCastFlow,
          };
        })() : undefined}
      />

      {/* Stack display — renders only when stack is non-empty. Mobile: bottom sheet above drawer. Desktop: overlay over battlefield center column. */}
      {s_state.stack?.length > 0 && (() => {
        const sourceCard = castFlow
          ? (s_state.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid)
          : null;
        const stackTargeting = castFlow?.mode === 'targeting' && sourceCard && needsStackTarget(sourceCard, pendingMode);
        return (
          <StackDisplay
            stack={s_state.stack}
            isMobile={true}
            bottomOffset={56}
            onItemClick={stackTargeting ? (id) => selectCastTarget(id) : undefined}
            selectedItemId={castFlow?.selectedTargets[0] ?? null}
          />
        );
      })()}

      {/* Band formation (CR 702.22c): only ever appears when a declared
          attacker actually has banding -- otherwise this list is empty and
          nothing renders, leaving the mobile attack-declaration screen unchanged. */}
      {s_state.phase === 'COMBAT_ATTACKERS' && s_state.active === 'p' && (() => {
        const unbandedAttackers = (s_state.p.bf as any[])
          .filter(c => s_state.attackers.includes(c.iid) && !c.bandId)
          .map(c => ({ iid: c.iid, name: c.name, hasBanding: hasKw(c, KEYWORDS.BANDING.id, s_state) }));
        if (!unbandedAttackers.some(c => c.hasBanding)) return null;
        return (
          <BandFormationPanel
            attackers={unbandedAttackers}
            onFormBand={(iids: string[]) => dispatch({ type: 'FORM_BAND', iids })}
          />
        );
      })()}

      <ActionBar
        sel={castFlow ? null : sel}
        onCast={handleCast}
        onActivate={handleActivateBf}
        onCancel={handleCancel}
        onPass={handlePass}
        onEnd={
          (s_state.phase === 'COMBAT_ATTACKERS' && s_state.active === 'p') ||
          (s_state.phase === 'COMBAT_BLOCKERS' && s_state.active !== 'p')
            ? advancePhase
            : endTurn
        }
        endTurnPending={endTurnPending}
        isPlayerTurn={isPlayerTurn}
        isWaitingForAI={isWaitingForAI}
        priorityWindowOpen={s_state.priorityWindow === true}
        canUndo={canUndoMana}
        onUndo={undoManaTaps}
        phase={s_state.phase}
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
