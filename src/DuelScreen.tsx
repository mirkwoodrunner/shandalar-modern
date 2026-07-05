// src/DuelScreen.tsx
// Assembler component for the duel UI.
// Wires engine (useDuel / AI) to the new design system components.

import React, { useState, useEffect, useCallback } from 'react';

// -- Engine / hooks -------------------------------------------------------------
import { isLand, isArt, isInst } from './engine/DuelCore.js';
import { PHASE } from './engine/phases.js';

// -- New design system components ----------------------------------------------
import { Topbar } from './ui/Topbar/Topbar';
import { Banner } from './ui/Battlefield/Banner';
import { Battlefield } from './ui/Battlefield/Battlefield';
import { Hand } from './ui/Hand/Hand';
import { ActionBar } from './ui/ActionBar/ActionBar';
import { DuelLog } from './ui/Log/DuelLog';
import { TargetArrow } from './ui/TargetArrow/TargetArrow';
import { TweaksPanel } from './ui/TweaksPanel/TweaksPanel';
import { GameOverModal } from './ui/GameOver/GameOverModal';
import { MulliganModal } from './ui/Mulligan/MulliganModal';
import type { CardData } from './ui/Card/types';
import { StackDisplay } from './ui/Stack/StackDisplay';

// -- New hooks -----------------------------------------------------------------
import { useFlash } from './hooks/useFlash';
import { useTweaks } from './hooks/useTweaks';
import { usePersistence, clearDuel } from './hooks/usePersistence';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useIsMobile } from './hooks/useIsMobile';
import { useDuelController, resolveDefaultTarget, needsExplicitTarget, isPlayerOnlyTarget, isCounterEffect, isBebRebEffect, needsStackTarget, getManaShortfall } from './hooks/useDuelController';
import type { DuelConfig } from './types/duel';

// -- Tutor / Transmute modals --------------------------------------------------
import { TutorModal } from './ui/duel/TutorModal';
import { TransmuteSacrificeModal } from './ui/duel/TransmuteSacrificeModal';
import { TransmutePayModal } from './ui/duel/TransmutePayModal';
import { ConditionalCounterModal } from './ui/duel/ConditionalCounterModal';
import { XSelectModal } from './ui/duel/XSelectModal';
import { SphereTriggerModal } from './ui/duel/SphereTriggerModal';
import { ChoiceModal } from './ui/duel/ChoiceModal';
import { UPKEEP_CHOICE_MODALS } from './ui/duel/upkeepChoiceRegistry';

// -- Legacy popovers (mana / graveyard color choice) ---------------------------
import { LotusColorPicker, BopColorPicker, DualLandColorPicker, BebRebModePicker } from './ui/duel/TargetingOverlay.jsx';
import { Tooltip } from './ui/shared/Tooltip.jsx';

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function getManaSymbol(color: string): string {
  const map: Record<string, string> = { W: '☀', U: '💧', B: '💀', R: '🔥', G: '🌿' };
  return map[color] ?? '?';
}


// -----------------------------------------------------------------------------
// INLINE POPOVERS
// -----------------------------------------------------------------------------

function ManaChoicePopover({ colors, cardName, onSelect, onClose }: {
  colors: string[]; cardName: string;
  onSelect: (c: string) => void; onClose: () => void;
}) {
  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover-content" onClick={e => e.stopPropagation()}>
        <h3>Choose mana for {cardName}</h3>
        <div className="mana-choice-buttons">
          {colors.map(color => (
            <button key={color} className="mana-choice-btn" onClick={() => onSelect(color)}>
              {getManaSymbol(color)} {color}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Small popover that lists a card's activatedAbilities for the player to choose.
function AbilityMenuPopover({ card, onSelect, onClose }: {
  card: any;
  onSelect: (abilityId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover-content" onClick={e => e.stopPropagation()}>
        <h3>{card.name}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Always offer the basic tap-for-mana option */}
          <button className="mana-choice-btn" onClick={() => onSelect('tap_mana')}>
            {'{T}'}: Add {'{C}'}
          </button>
          {(card.activatedAbilities ?? []).map((ab: any) => (
            <button
              key={ab.id}
              className="mana-choice-btn"
              onClick={() => onSelect(ab.id)}
            >
              {ab.description}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GraveyardPopover({ graveyard, playerName, mode, onSelect, onClose }: {
  graveyard: any[]; playerName: string; mode: string;
  onSelect: (card: any, idx: number) => void; onClose: () => void;
}) {
  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover-content" onClick={e => e.stopPropagation()}>
        <h3>{playerName} Graveyard</h3>
        {graveyard.length === 0 ? <p>Empty</p> : (
          <div className="graveyard-list">
            {graveyard.map((card: any, idx: number) => (
              <div
                key={idx}
                className={`graveyard-card${mode === 'targeting' ? ' clickable' : ''}`}
                onClick={() => mode === 'targeting' && onSelect(card, idx)}
              >
                <span className="card-name">{card.name}</span>
                <span className="card-type">{card.type_line}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

interface DuelScreenProps {
  config: DuelConfig;
  onDuelEnd: (outcome: 'win' | 'lose' | 'forfeit', state: unknown) => void;
}

// -----------------------------------------------------------------------------
// MOBILE-ONLY BOTTOM DRAWER
// Only rendered when useIsMobile() returns true. Desktop path is not affected.
// -----------------------------------------------------------------------------

function MobileActionDrawer({ s, config, ruleFlags }: {
  s: any;
  config: any;
  ruleFlags: { l: string; v: any }[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 200,
      background: 'linear-gradient(0deg,#0a0a08,#0e0c08)',
      borderTop: '2px solid rgba(180,140,60,.35)',
    }}>
      {/* Toggle tab */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: 'rgba(196,160,64,.12)',
          border: 'none',
          borderBottom: open ? '1px solid rgba(180,140,60,.2)' : 'none',
          color: '#c0a040',
          fontFamily: "'Cinzel',serif",
          fontSize: 11,
          letterSpacing: 1,
          padding: '6px 0',
          cursor: 'pointer',
          textTransform: 'uppercase',
        }}
      >
        {open ? '▼ Info' : '▲ Info / Log'}
      </button>

      {open && (
        <div style={{
          maxHeight: '35vh',
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {/* Mana pools */}
          <div style={{ fontSize: 10, color: '#c0a040', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
            MANA POOLS
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ fontSize: 9, color: '#806040' }}>You: {JSON.stringify(s.p.mana)}</div>
            <div style={{ fontSize: 9, color: '#806040' }}>Opp: {JSON.stringify(s.o.mana)}</div>
          </div>

          {/* Ruleset flags */}
          <div style={{ fontSize: 10, color: '#c0a040', fontFamily: "'Cinzel',serif", letterSpacing: 1, marginTop: 4 }}>
            RULESET: {config.ruleset?.name ?? ''}
          </div>
          {ruleFlags.map((f: { l: string; v: any }) => (
            <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'monospace' }}>
              <span style={{ color: '#908060' }}>{f.l}</span>
              <span style={{ color: f.v === true ? '#60ee60' : f.v === false ? '#ee4040' : '#e0c040', fontWeight: 700 }}>
                {typeof f.v === 'boolean' ? (f.v ? 'ON' : 'OFF') : String(f.v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// DUEL SCREEN ? hooks and handlers
// -----------------------------------------------------------------------------

export default function DuelScreen({ config, onDuelEnd }: DuelScreenProps) {
  // -- Design hooks ----------------------------------------------------------
  const { flashIids, flash: _flash } = useFlash(200);
  const [tweaks, setTweak] = useTweaks();

  // Wrap onDuelEnd to clear the saved duel on any clean exit (win/lose/forfeit).
  const handleDuelEndWithClear = useCallback((outcome: 'win' | 'lose' | 'forfeit', s: unknown) => {
    clearDuel();
    onDuelEnd(outcome, s);
  }, [onDuelEnd]);

  // -- Shared orchestration hook ---------------------------------------------
  const {
    state, dispatch,
    tapLand, tapArtifactMana, playLand, castSpell, resolveStack,
    advancePhase, selectCard, selectTarget,
    setX, activateAbility, chooseLotusColor, applyAiActions, resolveChoice,
    resolveUpkeepChoice, resolveConditionalCounter, resolveSphereTrigger, openPriorityWindow, passPriority, useChannel,
    undoManaTaps, requestPhaseAdvance, endTurn, endTurnPending,
    chooseTutor, declineTutor, chooseTutorTransmute,
    confirmTransmuteSacrifice, declineTransmuteSacrifice,
    confirmTransmutePay, declineTransmutePay,
    resolveAnteExchange, declineAnteExchange,
    showMulligan, mulliganCount, handleKeep, handleMulligan,
    showLotus, setShowLotus, handleLotusChoose, handleLotusCancel,
    pendingDualLand, setPendingDualLand,
    showBop, handleBopChoose, handleBopCancel,
    adaptedLog, attackersList, ruleFlags, canUndoMana, oppBfIids,
    handleBfClick, pendingBlockerIid,
    castFlow, setCastFlow, beginCastFlow, beginActivateFlow,
    selectCastTarget, confirmCastTargets, cancelCastFlow,
    adjustCastX, confirmCastX,
    pendingActivate, setPendingActivate,
    activateCanTargetPlayer, handleActivate, handleActivateWithPlayerTarget,
    pendingMode, setPendingMode,
    isGeminiThinking,
  } = useDuelController(config, handleDuelEndWithClear, tweaks.aiSpeed);

  const s = state;

  usePersistence(s, true);

  const isMobile = useIsMobile();

  // -- Local UI state --------------------------------------------------------
  const [tooltip, setTooltip] = useState<{ card: any; pos: { x: number; y: number } } | null>(null);
  const [graveyardPopover, setGraveyardPopover] = useState<{
    open: boolean; player: string | null; mode: string;
  }>({ open: false, player: null, mode: 'reference' });
  const [manaChoicePopover, setManaChoicePopover] = useState<{
    open: boolean; colors: string[]; cardName: string; callback: ((c: string) => void) | null;
  }>({ open: false, colors: [], cardName: '', callback: null });
  const [abilityMenu, setAbilityMenu] = useState<{ card: any } | null>(null);

  // -- Keyboard shortcuts ----------------------------------------------------
  const isIdle = s.active === 'p' && !pendingActivate && !castFlow;
  useKeyboardShortcuts({
    onPassPriority: () => {
      if (s.priorityWindow && s.priorityPasser !== 'p') {
        passPriority('p');
      } else if (!s.priorityWindow && (s.stack?.length ?? 0) === 0) {
        requestPhaseAdvance();
      }
      // If priorityWindow is open and player already passed: no-op (waiting for AI)
    },
    onEndTurn: endTurn,
    onCancel: () => { if (castFlow) { cancelCastFlow(); } else { setPendingActivate(null); selectCard(null); selectTarget(null); } },
    onQuickCast: (idx: number) => { const c = s.p.hand[idx]; if (c) selectCard(c.iid); },
    isIdle,
  });

  // -- Ability menu selection handler (Mishra's Factory etc.) -----------------
  const handleAbilityMenuSelect = useCallback((abilityId: string) => {
    const card = abilityMenu?.card;
    setAbilityMenu(null);
    if (!card) return;
    if (abilityId === 'tap_mana') {
      tapLand(card.iid, card.produces?.[0] ?? 'C');
      return;
    }
    const ab = (card.activatedAbilities ?? []).find((a: any) => a.id === abilityId);
    if (!ab) return;
    if (ab.effect === 'animateLand') {
      activateAbility(card.iid, null, null, abilityId);
      return;
    }
    if (ab.effect === 'pumpAssemblyWorker') {
      // Require player to click an Assembly-Worker target.
      setPendingActivate({ ...card, _pendingAbilityId: abilityId });
      selectCard(card.iid);
      return;
    }
    activateAbility(card.iid, null, null, abilityId);
  }, [abilityMenu, activateAbility, tapLand, selectCard]);

  // handleActivate is now provided by useDuelController.

  // -- Card click dispatcher -------------------------------------------------
  const handleCardClick = useCallback((card: any, zone: string) => {
    if (s.over) return;

    // During an active cast/activate targeting step, all bf clicks route to selectCastTarget.
    if (castFlow?.mode === 'targeting' && (zone === 'pBf' || zone === 'oBf')) {
      const castingCard = (s.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid);
      if (isPlayerOnlyTarget(castingCard)) return; // creature click is illegal for player-only effects
      selectCastTarget(card.iid);
      return;
    }

    if (zone === 'hand') {
      selectCard(s.selCard === card.iid ? null : card.iid);
      return;
    }

    if (zone === 'pBf') {
      if (isLand(card) && !card.tapped) {
        // Lands with activatedAbilities (e.g. Mishra's Factory) use the ability menu.
        if ((card as any).activatedAbilities) { setAbilityMenu({ card }); return; }
        if (card.produces && card.produces.length > 1) { setPendingDualLand({ card, colors: card.produces }); return; }
        tapLand(card.iid, card.produces?.[0] ?? 'C');
        return;
      }
      if (card.name === 'Black Lotus') { handleActivate(card); return; }
      if (isArt(card) && !card.tapped && card.activated?.effect?.startsWith('addMana')) {
        tapArtifactMana(card.iid); return;
      }
      if (pendingActivate) {
        const pendingAbilityId = (pendingActivate as any)._pendingAbilityId ?? null;
        activateAbility(pendingActivate.iid, card.iid, null, pendingAbilityId);
        setPendingActivate(null); selectCard(null); selectTarget(null);
        return;
      }
      // If a spell is selected in hand, this click is targeting - not activating.
      const handSpellSelected = s.selCard
        ? (s.p.hand as any[]).some((c: any) => c.iid === s.selCard)
        : false;
      if (!handSpellSelected) {
        if ((card as any).activatedAbilities) { setAbilityMenu({ card }); return; }
        if (card.activated) { handleActivate(card); return; }
      }
      selectTarget(card.iid);
      return;
    }

    if (zone === 'oBf') {
      if (pendingActivate) {
        const pendingAbilityId = (pendingActivate as any)._pendingAbilityId ?? null;
        activateAbility(pendingActivate.iid, card.iid, null, pendingAbilityId);
        setPendingActivate(null); selectCard(null);
        return;
      }
      selectTarget(card.iid);
      return;
    }
  }, [
    s.over, s.selCard, s.selTgt, s.phase, s.p.hand, pendingActivate, castFlow,
    selectCard, selectTarget, selectCastTarget, tapLand, tapArtifactMana,
    activateAbility, handleActivate,
  ]);

  // -- Battlefield click: combat routing owned by useDuelController -----------
  const handleBfCardClick = useCallback((card: CardData) => {
    // Combat routing (COMBAT_BLOCKERS, COMBAT_ATTACKERS) is owned by useDuelController.
    const consumed = handleBfClick(card);
    if (consumed !== false) return;

    // Non-combat interactions remain screen-local.
    handleCardClick(card, oppBfIids.has(card.iid) ? 'oBf' : 'pBf');
  }, [handleBfClick, oppBfIids, handleCardClick]);

  const handleHandCardClick = useCallback((card: CardData) => {
    handleCardClick(card, 'hand');
  }, [handleCardClick]);

  // -- Cast / play selected card ---------------------------------------------
  const handleCast = useCallback(() => {
    if (castFlow) return; // flow already active
    const card = (s.p.hand as any[]).find((c: any) => c.iid === s.selCard);
    if (!card) return;
    beginCastFlow(card);
  }, [s, castFlow, beginCastFlow]);

  // True when the active cast/activate flow is in targeting mode that can reach players.
  const playerTargetingActive = castFlow?.mode === 'targeting' && castFlow.canTargetPlayers;

  // Clear pendingMode if the player deselects the card.
  useEffect(() => {
    if (pendingMode !== null && !s.selCard) {
      setPendingMode(null);
    }
  }, [s.selCard, pendingMode, setPendingMode]);

  // -- Graveyard / mana-choice handlers --------------------------------------

  const openGraveyardPopover = (player: string, mode = 'reference') =>
    setGraveyardPopover({ open: true, player, mode });
  const closeGraveyardPopover = () =>
    setGraveyardPopover({ open: false, player: null, mode: 'reference' });
  const handleGraveyardCardSelect = (card: any, idx: number) => {
    if (s.awaitingInput?.type === 'graveyard_target') {
      dispatch({ type: 'RESOLVE_GRAVEYARD_EFFECT', effect: { ...s.awaitingInput.effect, target: card, targetIndex: idx } });
      closeGraveyardPopover();
    }
  };

  const openManaChoicePopover = (colors: string[], cardName: string, callback: (c: string) => void) =>
    setManaChoicePopover({ open: true, colors, cardName, callback });
  const closeManaChoicePopover = () =>
    setManaChoicePopover({ open: false, colors: [], cardName: '', callback: null });
  const handleManaChoice = (color: string) => {
    manaChoicePopover.callback?.(color); closeManaChoicePopover();
  };

  const handleTipEnter = useCallback((card: any, e: React.MouseEvent) => {
    setTooltip({ card, pos: { x: e.clientX, y: e.clientY } });
  }, []);
  const handleTipLeave = useCallback(() => setTooltip(null), []);

  // -- Derived data for new components --------------------------------------
  const oppBfCards  = s.o.bf as unknown as CardData[];
  const yourBfCards = s.p.bf as unknown as CardData[];
  const yourHand    = s.p.hand as unknown as CardData[];
  const mulliganHand = s.p.hand as unknown as CardData[];

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div data-testid="duel-screen" style={{
      height: '100vh', width: '100vw',
      background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'var(--font-body)',
      color: 'var(--ink-muted)',
      ...(isMobile ? { fontSize: 'clamp(10px, 2.2vw, 14px)' } : {}),
    }}>

      {/* -- GAME OVER OVERLAY ----------------------------------------------- */}
      {s.over && (
        <GameOverModal
          outcome={s.over.winner === 'p' ? 'victory' : 'defeat'}
          stats={{ turns: s.turn, maxDamage: s.peakDamage ?? 0, cardsCast: s.totalCardsCast ?? 0 }}
          onNewDuel={() => handleDuelEndWithClear(s.over.winner === 'p' ? 'win' : 'lose', s)}
        />
      )}

      {/* -- MULLIGAN MODAL -------------------------------------------------- */}
      {showMulligan && !s.over && (
        <MulliganModal
          hand={mulliganHand}
          mulliganCount={mulliganCount}
          onKeep={handleKeep}
          onMulligan={handleMulligan}
        />
      )}

      {/* -- TARGET ARROW ---------------------------------------------------- */}
      <TargetArrow
        sourceIid={s.selCard ?? pendingActivate?.iid ?? null}
        targetIid={s.selTgt ?? null}
        color={tweaks.arrowColor}
        thickness={tweaks.arrowThickness}
        style={tweaks.arrowStyle}
        glow={tweaks.arrowGlow}
        animate={tweaks.arrowAnimate}
      />

      {/* -- TWEAKS PANEL ---------------------------------------------------- */}
      <TweaksPanel values={tweaks} setTweak={setTweak} />

      {/* -- TOPBAR ---------------------------------------------------------- */}
      {isMobile ? (
        <div style={{ flexShrink: 0, maxHeight: '7vh', overflow: 'hidden' }}>
          <Topbar
            rulesetName={config.ruleset.name}
            turn={s.turn}
            active={s.active}
            phase={s.phase}
            onForfeit={() => handleDuelEndWithClear('forfeit', s)}
          />
        </div>
      ) : (
        <Topbar
          rulesetName={config.ruleset.name}
          turn={s.turn}
          active={s.active}
          phase={s.phase}
          onForfeit={() => handleDuelEndWithClear('forfeit', s)}
        />
      )}

      {/* -- CASTLE MODIFIER BANNER ------------------------------------------ */}
      {s.castleMod && (
        <div style={{
          background: 'rgba(100,20,0,.4)', borderBottom: '1px solid rgba(200,60,20,.3)',
          padding: isMobile ? '2px 8px' : '4px 14px',
          display: 'flex', gap: 8, alignItems: 'center',
          flexShrink: 0, fontSize: isMobile ? 8 : 10, fontFamily: 'var(--font-display)',
        }}>
          <span style={{ color: '#e08040', letterSpacing: 1 }}>CASTLE MODIFIER:</span>
          <span style={{ color: '#f0c060' }}>{s.castleMod.name}</span>
          <span style={{ color: '#a07040', fontStyle: 'italic' }}>— {s.castleMod.desc}</span>
        </div>
      )}

      {/* -- ANTE BANNER ----------------------------------------------------- */}
      {s.anteEnabled && (s.anteP || s.anteO || (s.anteExtraP?.length ?? 0) > 0 || (s.anteExtraO?.length ?? 0) > 0) && (() => {
        const stakeP = [...(s.anteP ? [s.anteP] : []), ...(s.anteExtraP ?? [])];
        const stakeO = [...(s.anteO ? [s.anteO] : []), ...(s.anteExtraO ?? [])];
        return (
          <div data-testid="ante-banner" style={{
            background: 'rgba(60,30,0,.4)', borderBottom: '1px solid rgba(180,120,40,.2)',
            padding: isMobile ? '2px 8px' : '3px 14px',
            display: 'flex', gap: 12, alignItems: 'center',
            flexShrink: 0, fontSize: isMobile ? 8 : 9, fontFamily: 'var(--font-display)',
          }}>
            <span style={{ color: '#c0a040' }}>ANTE:</span>
            {stakeP.length > 0 && <span style={{ color: '#a09060' }}>You: <strong style={{ color: '#f0c060' }}>{stakeP.map(c => c.name).join(', ')}</strong></span>}
            {stakeO.length > 0 && <span style={{ color: '#a09060' }}>Opp: <strong style={{ color: '#f0c060' }}>{stakeO.map(c => c.name).join(', ')}</strong></span>}
          </div>
        );
      })()}

      {/* -- MAIN LAYOUT ----------------------------------------------------- */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* -- CENTER COLUMN ----------------------------------------------- */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: isMobile ? 'min(44px, 9vh)' : 0 }}>

          {/* Opponent hand (face-down) */}
          <Hand side="opp" cards={s.o.hand.length} compact={isMobile} />

          {/* Opponent info banner */}
          <Banner
            side="opp"
            compact={isMobile}
            player={{
              life: s.o.life,
              max: config.ruleset.startingLife,
              lifeAnim: s.o.lifeAnim,
              mana: s.o.mana,
              lib: s.o.lib.length,
              gy: s.o.gy.length,
            }}
            onGraveyardClick={() => openGraveyardPopover('o', 'reference')}
            onLifeClick={
              playerTargetingActive
                ? () => selectCastTarget('o')
                : undefined
            }
          />

          {isGeminiThinking && (
            <div className="gemini-thinking">Gemini is thinking{'\u2026'}</div>
          )}

          {/* Battlefield: opp + phase ribbon + you */}
          <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
            <Battlefield
              phase={s.phase}
              oppCards={oppBfCards}
              yourCards={yourBfCards}
              selCard={s.selCard ?? null}
              selTgt={s.selTgt ?? null}
              attackers={attackersList}
              flashIids={flashIids}
              pendingBlockerIid={pendingBlockerIid}
              blockers={(s.blockers as Record<string, string>) ?? {}}
              onCardClick={handleBfCardClick}
            />
            {/* Stack display — renders only when stack is non-empty. Mobile: bottom sheet above drawer. Desktop: overlay over battlefield center column. */}
            {!isMobile && s.stack.length > 0 && (() => {
              const sourceCard = castFlow
                ? (s.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid)
                : null;
              const stackTargeting = castFlow?.mode === 'targeting' && sourceCard && needsStackTarget(sourceCard, pendingMode);
              return (
                <StackDisplay
                  stack={s.stack}
                  isMobile={false}
                  onItemClick={stackTargeting ? (id) => selectCastTarget(id) : undefined}
                  selectedItemId={castFlow?.selectedTargets[0] ?? null}
                />
              );
            })()}
          </div>

          {/* Player info banner */}
          <Banner
            side="you"
            compact={isMobile}
            player={{
              life: s.p.life,
              max: config.ruleset.startingLife,
              lifeAnim: s.p.lifeAnim,
              mana: s.p.mana,
              lib: s.p.lib.length,
              gy: s.p.gy.length,
            }}
            onGraveyardClick={() => openGraveyardPopover('p', 'reference')}
            onLifeClick={
              playerTargetingActive
                ? () => selectCastTarget('p')
                : undefined
            }
            castPrompt={castFlow ? (() => {
              const sourceCard = castFlow.kind === 'spell'
                ? (s.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid)
                : (s.p.bf as any[]).find((c: any) => c.iid === castFlow.sourceIid);
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
                shortfall: cost ? getManaShortfall(s.p.mana, cost, s.xVal || 0) : null,
                onCancel: cancelCastFlow,
              };
            })() : undefined}
          />

          {/* Channel mana button */}
          {s.p.channelActive && s.active === 'p' && (s.phase === 'MAIN_1' || s.phase === 'MAIN_2') && s.p.life > 1 && (
            <div style={{ padding: '2px 8px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={useChannel}
                title="Pay 1 life: add {C}"
                style={{
                  background: 'linear-gradient(135deg,#1a2e10,rgba(0,0,0,.5))',
                  border: '2px solid #66cc33',
                  color: '#88ee44',
                  padding: '4px 10px',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: "'Cinzel',serif",
                  fontWeight: 700,
                }}
              >
                ⬡ Channel (1 life → {'{C}'})
              </button>
            </div>
          )}

          {/* BEB/REB mode picker — shown when a two-mode card is selected and no mode chosen yet */}
          {(() => {
            const selCardDef = (s.p.hand as any[]).find((c: any) => c.iid === s.selCard);
            if (!selCardDef || !isBebRebEffect(selCardDef) || pendingMode !== null) return null;
            const targetColor = selCardDef.effect === 'destroyRedOrCounter' ? 'R' : 'U';
            return (
              <BebRebModePicker
                cardName={selCardDef.name}
                targetColor={targetColor}
                stack={s.stack}
                playerBf={s.p.bf}
                opponentBf={s.o.bf}
                onSetMode={(mode: 'counter' | 'destroy') => setPendingMode(mode)}
                onCancel={() => { selectCard(null); selectTarget(null); setPendingMode(null); }}
              />
            );
          })()}

          {/* Action bar */}
          <ActionBar
            phase={s.phase}
            compact={isMobile}
            hasSelection={!!s.selCard && !castFlow}
            selectedCard={castFlow ? null : ((s.p.hand as any[]).find((c: any) => c.iid === s.selCard) ?? null)}
            isPlayerTurn={s.active === 'p'}
            isWaitingForAI={s.priorityWindow === true && s.priorityPasser === 'p'}
            priorityWindowOpen={s.priorityWindow === true}
            canUndo={canUndoMana}
            onUndo={undoManaTaps}
            onCast={handleCast}
            castDisabled={false}
            onPassPriority={() => {
              if (s.priorityWindow && s.priorityPasser !== 'p') {
                passPriority('p');
              } else if (!s.priorityWindow && (s.stack?.length ?? 0) === 0) {
                requestPhaseAdvance();
              }
              // If priorityWindow is open and player already passed: no-op (waiting for AI)
            }}
            onDoneAttacking={advancePhase}
            onDoneBlocking={advancePhase}
            blockerHint={
              s.phase === 'COMBAT_BLOCKERS' && s.active === 'o'
                ? pendingBlockerIid
                  ? 'Now click an attacker to assign the block'
                  : 'Click one of your creatures, then click the attacker to block'
                : null
            }
            onCancel={() => { if (castFlow) { cancelCastFlow(); } else { setPendingActivate(null); selectCard(null); selectTarget(null); setPendingMode(null); } }}
            onEndTurn={endTurn}
            endTurnPending={endTurnPending}
          />

          {/* Player hand */}
          <Hand
            side="you"
            compact={isMobile}
            cards={yourHand}
            selCard={s.selCard ?? null}
            onCardClick={handleHandCardClick}
          />
        </div>

        {/* -- RIGHT SIDEBAR ----------------------------------------------- */}
        {!isMobile && (
        <div className="duel-sidebar" style={{
          width: 'clamp(160px,22vw,210px)',
          borderLeft: '2px solid rgba(180,140,60,.25)',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg,#0e0c08,#0a0a08)',
          flexShrink: 0,
        }}>
          {/* Exile zone */}
          {config.ruleset.exileZone && (
            <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(180,140,60,.15)' }}>
              <div style={{ fontSize: 10, color: '#7060a0', fontFamily: 'var(--font-display)' }}>
                EXILE: {s.p.exile?.length ?? 0} / {s.o.exile?.length ?? 0}
              </div>
            </div>
          )}

          {/* Ruleset flags */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(180,140,60,.15)' }}>
            <div style={{
              fontSize: 11, color: '#c0a040', fontFamily: 'var(--font-display)',
              letterSpacing: 1, marginBottom: 8, fontWeight: 700,
            }}>RULESET</div>
            {ruleFlags.map(f => (
              <div key={f.l} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 10, fontFamily: 'var(--font-mono)', marginBottom: 3,
              }}>
                <span style={{ color: '#908060' }}>{f.l}</span>
                <span style={{
                  color: f.v === true ? '#60ee60' : f.v === false ? '#ee4040' : '#e0c040',
                  fontWeight: 700,
                }}>
                  {typeof f.v === 'boolean' ? (f.v ? '✓' : '✗') : f.v}
                </span>
              </div>
            ))}
          </div>

          {/* -- SANDBOX DEBUG PANEL (desktop only) */}
          {config.sandbox === true && !isMobile && (
            <div style={{
              borderBottom: '1px solid rgba(180,140,60,.15)',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              maxHeight: 340,
            }}>
              <div style={{
                fontSize: 10,
                color: '#e06040',
                fontFamily: 'var(--font-display)',
                letterSpacing: 1,
                padding: '7px 12px 5px',
                fontWeight: 700,
                borderBottom: '1px solid rgba(224,96,64,.2)',
                flexShrink: 0,
              }}>
                SANDBOX DEBUG
              </div>
              <div style={{ overflowY: 'auto', scrollbarWidth: 'thin' }}>
                {/* Opponent Hand */}
                <div style={{ padding: '6px 12px 4px' }}>
                  <div style={{
                    fontSize: 9,
                    color: '#c07040',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 1,
                    marginBottom: 4,
                    fontWeight: 700,
                  }}>
                    OPP HAND ({(s.o.hand as any[]).length})
                  </div>
                  {(s.o.hand as any[]).length === 0 ? (
                    <div style={{ fontSize: 9, color: '#4a3820', fontStyle: 'italic' }}>Empty</div>
                  ) : (
                    (s.o.hand as any[]).map((c: any, i: number) => (
                      <div key={c.iid ?? i} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        marginBottom: 2,
                        gap: 4,
                      }}>
                        <span style={{
                          color: '#d0a060',
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {c.name}
                        </span>
                        <span style={{ color: '#706040', flexShrink: 0, fontSize: 8 }}>
                          {c.cost || 'land'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ borderTop: '1px solid rgba(180,140,60,.10)', margin: '2px 0' }} />
                {/* Opponent Library */}
                <div style={{ padding: '6px 12px 6px' }}>
                  <div style={{
                    fontSize: 9,
                    color: '#c07040',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 1,
                    marginBottom: 4,
                    fontWeight: 700,
                  }}>
                    OPP LIBRARY ({(s.o.lib as any[]).length}) top first
                  </div>
                  {(s.o.lib as any[]).length === 0 ? (
                    <div style={{ fontSize: 9, color: '#4a3820', fontStyle: 'italic' }}>Empty</div>
                  ) : (
                    (s.o.lib as any[]).map((c: any, i: number) => (
                      <div key={c.iid ?? i} style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 5,
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        marginBottom: 2,
                      }}>
                        <span style={{
                          color: '#4a3820',
                          flexShrink: 0,
                          width: 18,
                          textAlign: 'right',
                          fontSize: 8,
                        }}>
                          {i + 1}.
                        </span>
                        <span style={{
                          color: i === 0 ? '#f0c060' : '#907050',
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: i === 0 ? 700 : 400,
                        }}>
                          {c.name}
                        </span>
                        <span style={{ color: '#504030', flexShrink: 0, fontSize: 8 }}>
                          {c.cost || 'land'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Game log */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '6px 0' }}>
            <div style={{
              fontSize: 11, color: '#c0a040', fontFamily: 'var(--font-display)',
              letterSpacing: 1, padding: '0 12px 6px', fontWeight: 700,
            }}>GAME LOG</div>
            <DuelLog log={adaptedLog} />
          </div>
        </div>
        )}
      </div>

      {/* Stack display — renders only when stack is non-empty. Mobile: bottom sheet above drawer. Desktop: overlay over battlefield center column. */}
      {isMobile && s.stack.length > 0 && (() => {
        const selCardDef = (s.p.hand as any[]).find((c: any) => c.iid === s.selCard);
        const stackTargeting = needsStackTarget(selCardDef, pendingMode);
        return (
          <StackDisplay
            stack={s.stack}
            isMobile={true}
            bottomOffset={48}
            onItemClick={stackTargeting ? (id) => selectTarget(id) : undefined}
            selectedItemId={stackTargeting ? s.selTgt : null}
          />
        );
      })()}

      {/* -- MOBILE ACTION DRAWER -------------------------------------------- */}
      {isMobile && (
        <MobileActionDrawer
          s={s}
          config={config}
          ruleFlags={ruleFlags}
        />
      )}

      {/* -- MODALS ---------------------------------------------------------- */}

      {abilityMenu && (
        <AbilityMenuPopover
          card={abilityMenu.card}
          onSelect={handleAbilityMenuSelect}
          onClose={() => setAbilityMenu(null)}
        />
      )}

      {showLotus && (
        <LotusColorPicker
          onChoose={(color: string) => { handleLotusChoose(color); setPendingActivate(null); }}
          onCancel={() => { handleLotusCancel(); setPendingActivate(null); }}
        />
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
            if (pendingDualLand.card.id === 'city_of_brass') dispatch({ type: 'CITY_OF_BRASS_DAMAGE' });
            setPendingDualLand(null);
          }}
          onCancel={() => setPendingDualLand(null)}
        />
      )}

      {tooltip && <Tooltip card={tooltip.card} state={s} pos={tooltip.pos} />}

      {graveyardPopover.open && (
        <GraveyardPopover
          graveyard={graveyardPopover.player === 'p' ? s.p.gy : s.o.gy}
          playerName={graveyardPopover.player === 'p' ? 'Your' : "Opponent's"}
          mode={graveyardPopover.mode}
          onSelect={handleGraveyardCardSelect}
          onClose={closeGraveyardPopover}
        />
      )}

      {manaChoicePopover.open && (
        <ManaChoicePopover
          colors={manaChoicePopover.colors}
          cardName={manaChoicePopover.cardName}
          onSelect={handleManaChoice}
          onClose={closeManaChoicePopover}
        />
      )}

      {s.pendingUpkeepChoice && s.active === 'p' && (() => {
        const entry = UPKEEP_CHOICE_MODALS[s.pendingUpkeepChoice.handlerKey];
        if (!entry) return null;
        const Comp = entry.component;
        return <Comp {...entry.getProps(s, s.pendingUpkeepChoice, resolveUpkeepChoice)} />;
      })()}

      {s.pendingSphereTrigger && s.pendingSphereTrigger.controller === 'p' && (() => {
        const st = s.pendingSphereTrigger;
        const totalMana = Object.values(s.p.mana as Record<string, number>).reduce((a, v) => a + v, 0);
        return (
          <SphereTriggerModal
            sphereCardName={st.sphereCardName}
            totalMana={totalMana}
            onResolve={resolveSphereTrigger}
          />
        );
      })()}

      {castFlow?.mode === 'xSelect' && (() => {
        const card = (s.p.hand as any[]).find((c: any) => c.iid === castFlow.sourceIid);
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

      {s.pendingConditionalCounter && s.pendingConditionalCounter.targetCaster === 'p' && (() => {
        const cc = s.pendingConditionalCounter;
        const totalMana = Object.values(s.p.mana as Record<string, number>).reduce((a, v) => a + v, 0);
        const targeted = s.stack.find((i: any) => i.id === cc.stackItemId);
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

      {s.pendingChoice && s.pendingChoice.controller === 'p' && (
        <ChoiceModal
          pendingChoice={s.pendingChoice}
          allBf={[...s.p.bf, ...s.o.bf]}
          onResolve={resolveChoice}
        />
      )}

      {s.pendingTutor && s.pendingTutor.caster === 'p' && (
        <TutorModal
          library={s.pendingTutor.shuffledLib}
          filter={s.pendingTutor.filter}
          onChoose={(iid: string) => {
            if (s.pendingTutor?._transmuteMode) {
              chooseTutorTransmute(iid);
            } else {
              chooseTutor(iid);
            }
          }}
          onDecline={declineTutor}
          titleOverride={s.pendingTutor._transmuteMode ? 'Transmute Artifact — Choose an Artifact' : undefined}
        />
      )}

      {s.pendingTransmuteSacrifice && s.pendingTransmuteSacrifice.caster === 'p' && (
        <TransmuteSacrificeModal
          artifacts={(s.p.bf as any[]).filter((c: any) => c.type?.includes('Artifact'))}
          onConfirm={(iid: string) => confirmTransmuteSacrifice(iid)}
          onDecline={declineTransmuteSacrifice}
        />
      )}

      {s.pendingTransmutePay && s.pendingTransmutePay.caster === 'p' && (
        <TransmutePayModal
          required={s.pendingTransmutePay.required}
          tutoredCard={s.pendingTransmutePay.tutored}
          currentMana={s.p.mana}
          snapshotMana={s.manaTapSnapshot?.pMana ?? null}
          onConfirm={confirmTransmutePay}
          onUndo={undoManaTaps}
          onDecline={declineTransmutePay}
        />
      )}

      {s.pendingAnteExchange && s.pendingAnteExchange.caster === 'p' && (
        <TutorModal
          library={s.pendingAnteExchange.cards}
          filter="any"
          onChoose={(iid: string) => resolveAnteExchange(iid)}
          onDecline={declineAnteExchange}
          titleOverride="Darkpact — Choose a Card in the Ante"
        />
      )}
    </div>
  );
}
