// src/DuelScreen.tsx
// Assembler component for the duel UI.
// Wires engine (useDuel / AI) to the new design system components.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// -- Engine / hooks -------------------------------------------------------------
import { useDuel } from './hooks/useDuel.js';
import { aiDecide } from './engine/AI.js';
import { isLand, isArt } from './engine/DuelCore.js';

// -- New design system components ----------------------------------------------
import { Topbar } from './ui/Topbar/Topbar';
import { Banner } from './ui/Battlefield/Banner';
import { Battlefield } from './ui/Battlefield/Battlefield';
import { Hand } from './ui/Hand/Hand';
import { ActionBar } from './ui/ActionBar/ActionBar';
import { DuelLog } from './ui/Log/DuelLog';
import type { LogEntry, LogKind } from './ui/Log/DuelLog';
import { TargetArrow } from './ui/TargetArrow/TargetArrow';
import { TweaksPanel } from './ui/TweaksPanel/TweaksPanel';
import { GameOverModal } from './ui/GameOver/GameOverModal';
import { MulliganModal } from './ui/Mulligan/MulliganModal';
import type { CardData } from './ui/Card/types';

// -- New hooks -----------------------------------------------------------------
import { useFlash } from './hooks/useFlash';
import { useTweaks } from './hooks/useTweaks';
import { usePersistence } from './hooks/usePersistence';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// -- Legacy popovers (mana / graveyard color choice) ---------------------------
import { LotusColorPicker, BopColorPicker, DualLandColorPicker } from './ui/duel/TargetingOverlay.jsx';
import { Tooltip } from './ui/shared/Tooltip.jsx';

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function getManaSymbol(color: string): string {
  const map: Record<string, string> = { W: '☀', U: '💧', B: '💀', R: '🔥', G: '🌿' };
  return map[color] ?? '?';
}

function adaptLog(rawLog: unknown[]): LogEntry[] {
  return (rawLog ?? []).map(entry => {
    const text = typeof entry === 'string' ? entry : (entry as any)?.text ?? String(entry);
    let kind: LogKind = 'info';
    if (/^turn \d+/i.test(text))                             kind = 'turn';
    else if (/phase|upkeep|draw step|main|combat|end step/i.test(text)) kind = 'phase';
    else if (/\byou\b.*(cast|played)/i.test(text))           kind = 'play';
    else if (/\bopp(onent)?\b.*(cast|played)/i.test(text))   kind = 'opp_play';
    else if (/\bdamage\b/i.test(text))                       kind = 'damage';
    else if (/\bheal|gain.*life\b/i.test(text))              kind = 'heal';
    return { kind, text };
  });
}

function resolveDefaultTarget(card: any, state: any): string | null {
  const { effect } = card;
  if (['damage3', 'damage5', 'damageX', 'psionicBlast', 'chainLightning'].includes(effect)) return 'o';
  if (['draw3', 'gainLife3', 'gainLifeX', 'tutor', 'drawX'].includes(effect)) return state.selTgt ?? 'p';
  return state.selTgt ?? null;
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

interface DuelRuleset {
  name: string;
  startingLife: number;
  manaBurn?: boolean;
  stackType?: string;
  deathtouch?: boolean;
  exileZone?: boolean;
}

interface DuelConfig {
  pDeckIds: string[];
  oppArchKey: string;
  ruleset: DuelRuleset;
  overworldHP?: number;
  castleMod?: { name: string; desc: string } | null;
  anteEnabled?: boolean;
  context?: string;
}

interface DuelScreenProps {
  config: DuelConfig;
  onDuelEnd: (outcome: 'win' | 'lose' | 'forfeit', state: unknown) => void;
}

// -----------------------------------------------------------------------------
// DUEL SCREEN ? hooks and handlers
// -----------------------------------------------------------------------------

export default function DuelScreen({ config, onDuelEnd }: DuelScreenProps) {
  // -- Engine state via useDuel bridge --------------------------------------
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
  } = useDuel(
    config.pDeckIds,
    config.oppArchKey,
    config.ruleset,
    config.overworldHP,
    config.castleMod,
    config.anteEnabled ?? false
  );

  const s = state;

  // -- Design hooks ----------------------------------------------------------
  const { flashIids, flash: _flash } = useFlash(200);
  const [tweaks, setTweak] = useTweaks();
  usePersistence(s);

  // -- Local UI state --------------------------------------------------------
  const [tooltip, setTooltip] = useState<{ card: any; pos: { x: number; y: number } } | null>(null);
  const [pendingActivate, setPendingActivate] = useState<any | null>(null);
  const [showLotus, setShowLotus] = useState(false);
  const [showBop, setShowBop] = useState(false);
  const [pendingDualLand, setPendingDualLand] = useState<{ card: any; colors: string[] } | null>(null);
  const [graveyardPopover, setGraveyardPopover] = useState<{
    open: boolean; player: string | null; mode: string;
  }>({ open: false, player: null, mode: 'reference' });
  const [manaChoicePopover, setManaChoicePopover] = useState<{
    open: boolean; colors: string[]; cardName: string; callback: ((c: string) => void) | null;
  }>({ open: false, colors: [], cardName: '', callback: null });
  const [showMulligan, setShowMulligan] = useState(true);
  const [mulliganCount, setMulliganCount] = useState(0);
  const aiRef = useRef(false);

  // -- Keyboard shortcuts ----------------------------------------------------
  const isIdle = s.active === 'p' && !pendingActivate;
  useKeyboardShortcuts({
    onPassPriority: () => (s.stack?.length > 0 ? resolveStack() : advancePhase()),
    onEndTurn: advancePhase,
    onCancel: () => { setPendingActivate(null); selectCard(null); selectTarget(null); },
    onQuickCast: (idx: number) => { const c = s.p.hand[idx]; if (c) selectCard(c.iid); },
    isIdle,
  });

  // -- Sync BopColorPicker with engine flag ----------------------------------
  useEffect(() => {
    if (s.pendingBop) setShowBop(true);
  }, [s.pendingBop]);

  // -- Game-over: show modal, then return to overworld -----------------------
  useEffect(() => {
    if (!s.over) return;
    const timer = setTimeout(() => {
      onDuelEnd(s.over.winner === 'p' ? 'win' : 'lose', s);
    }, 3000);
    return () => clearTimeout(timer);
  }, [s.over]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- AI loop ---------------------------------------------------------------
  useEffect(() => {
    if (s.over || s.active !== 'o' || aiRef.current) return;
    aiRef.current = true;
    const t = setTimeout(() => {
      const acts = aiDecide(s);
      if (acts.length) applyAiActions(acts);
      setTimeout(() => { advancePhase(); aiRef.current = false; }, tweaks.aiSpeed);
    }, 500 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [s.phase, s.active, s.turn, s.over]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Activated ability handler (defined before handleCardClick) ------------
  const handleActivate = useCallback((card: any) => {
    if (!card.activated) return;
    const { effect } = card.activated;
    if (effect === 'addManaAny') { activateAbility(card.iid, null); return; }
    if (effect === 'addMana3Any') { activateAbility(card.iid, null); setShowLotus(true); setPendingActivate(card); return; }
    if (['ping', 'destroyTapped', 'pumpCreature', 'gainFlying', 'pumpPower'].includes(effect)) {
      setPendingActivate(card); selectCard(card.iid); return;
    }
    activateAbility(card.iid, null);
  }, [activateAbility, selectCard]);

  // -- Card click dispatcher -------------------------------------------------
  const handleCardClick = useCallback((card: any, zone: string) => {
    if (s.over) return;

    if (zone === 'hand') {
      selectCard(s.selCard === card.iid ? null : card.iid);
      return;
    }

    if (zone === 'pBf') {
      if (isLand(card) && !card.tapped) {
        if (card.produces && card.produces.length > 1) { setPendingDualLand({ card, colors: card.produces }); return; }
        tapLand(card.iid, card.produces?.[0] ?? 'C');
        return;
      }
      if (card.name === 'Black Lotus') { handleActivate(card); return; }
      if (isArt(card) && !card.tapped && card.activated?.effect?.startsWith('addMana')) {
        tapArtifactMana(card.iid); return;
      }
      if (s.phase === 'COMBAT_ATTACKERS') { declareAttacker(card.iid); return; }
      if (pendingActivate) {
        activateAbility(pendingActivate.iid, card.iid);
        setPendingActivate(null); selectCard(null); selectTarget(null);
        return;
      }
      if (card.activated) { handleActivate(card); return; }
      selectTarget(card.iid);
      return;
    }

    if (zone === 'oBf') {
      if (s.phase === 'COMBAT_BLOCKERS' && s.selTgt) {
        declareBlocker(s.selTgt, card.iid); selectTarget(null); return;
      }
      if (pendingActivate) {
        activateAbility(pendingActivate.iid, card.iid);
        setPendingActivate(null); selectCard(null);
        return;
      }
      selectTarget(card.iid);
      return;
    }
  }, [
    s.over, s.selCard, s.selTgt, s.phase, pendingActivate,
    selectCard, selectTarget, tapLand, tapArtifactMana,
    declareAttacker, declareBlocker, activateAbility, handleActivate,
  ]);

  // -- Battlefield click: determine zone from which side card lives on --------
  const oppBfIids = useMemo(
    () => new Set((s.o.bf as any[]).map((c: any) => c.iid)),
    [s.o.bf]
  );
  const handleBfCardClick = useCallback((card: CardData) => {
    handleCardClick(card, oppBfIids.has(card.iid) ? 'oBf' : 'pBf');
  }, [oppBfIids, handleCardClick]);

  const handleHandCardClick = useCallback((card: CardData) => {
    handleCardClick(card, 'hand');
  }, [handleCardClick]);

  // -- Cast / play selected card ---------------------------------------------
  const handleCast = useCallback(() => {
    const card = (s.p.hand as any[]).find((c: any) => c.iid === s.selCard);
    if (!card) return;
    if (isLand(card)) { playLand(card.iid); selectCard(null); return; }
    const tgt = s.selTgt ?? resolveDefaultTarget(card, s);
    if (card.effect === 'enchantCreature' && !tgt) return;
    castSpell(card.iid, tgt, s.xVal);
    selectCard(null); selectTarget(null);
  }, [s, playLand, castSpell, selectCard, selectTarget]);

  // -- Lotus / Bop / graveyard / mana-choice handlers ------------------------
  const handleLotusChoose = useCallback((color: string) => {
    chooseLotusColor(color); setShowLotus(false); setPendingActivate(null);
  }, [chooseLotusColor]);

  const handleLotusCancel = useCallback(() => {
    setShowLotus(false); setPendingActivate(null);
  }, []);

  const handleBopChoose = useCallback((color: string) => {
    dispatch({ type: 'CHOOSE_BOP_COLOR', color }); setShowBop(false);
  }, [dispatch]);

  const handleBopCancel = useCallback(() => {
    dispatch({ type: 'CHOOSE_BOP_COLOR', color: 'G' }); setShowBop(false);
  }, [dispatch]);

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

  const handleKeep = useCallback(() => setShowMulligan(false), []);
  const handleMulligan = useCallback(() => {
    mulligan(); setMulliganCount(c => c + 1);
  }, [mulligan]);

  // -- Derived data for new components --------------------------------------
  const oppBfCards  = s.o.bf as unknown as CardData[];
  const yourBfCards = s.p.bf as unknown as CardData[];
  const yourHand    = s.p.hand as unknown as CardData[];
  const mulliganHand = s.p.hand as unknown as CardData[];
  const adaptedLog  = useMemo(() => adaptLog(s.log ?? []), [s.log]);
  const attackersList = useMemo<string[]>(() => {
    if (!s.attackers) return [];
    return s.attackers instanceof Set ? Array.from(s.attackers) : (Array.isArray(s.attackers) ? s.attackers : []);
  }, [s.attackers]);
  const ruleFlags = useMemo(() => [
    { l: 'Mana Burn',  v: config.ruleset.manaBurn   as boolean | string | undefined },
    { l: 'Stack',      v: config.ruleset.stackType  as boolean | string | undefined },
    { l: 'Deathtouch', v: config.ruleset.deathtouch as boolean | string | undefined },
    { l: 'Exile',      v: config.ruleset.exileZone  as boolean | string | undefined },
  ], [config.ruleset]);

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div style={{
      height: '100vh', width: '100vw',
      background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'var(--font-body)',
      color: 'var(--ink-muted)',
    }}>

      {/* -- GAME OVER OVERLAY ----------------------------------------------- */}
      {s.over && (
        <GameOverModal
          outcome={s.over.winner === 'p' ? 'victory' : 'defeat'}
          stats={{ turns: s.turn, maxDamage: 0, cardsCast: 0 }}
          onNewDuel={() => onDuelEnd(s.over.winner === 'p' ? 'win' : 'lose', s)}
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
      <Topbar
        rulesetName={config.ruleset.name}
        turn={s.turn}
        active={s.active}
        phase={s.phase}
        onForfeit={() => onDuelEnd('forfeit', s)}
      />

      {/* -- CASTLE MODIFIER BANNER ------------------------------------------ */}
      {s.castleMod && (
        <div style={{
          background: 'rgba(100,20,0,.4)', borderBottom: '1px solid rgba(200,60,20,.3)',
          padding: '4px 14px', display: 'flex', gap: 8, alignItems: 'center',
          flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-display)',
        }}>
          <span style={{ color: '#e08040', letterSpacing: 1 }}>CASTLE MODIFIER:</span>
          <span style={{ color: '#f0c060' }}>{s.castleMod.name}</span>
          <span style={{ color: '#a07040', fontStyle: 'italic' }}>? {s.castleMod.desc}</span>
        </div>
      )}

      {/* -- ANTE BANNER ----------------------------------------------------- */}
      {s.anteEnabled && (s.anteP || s.anteO) && (
        <div style={{
          background: 'rgba(60,30,0,.4)', borderBottom: '1px solid rgba(180,120,40,.2)',
          padding: '3px 14px', display: 'flex', gap: 12, alignItems: 'center',
          flexShrink: 0, fontSize: 9, fontFamily: 'var(--font-display)',
        }}>
          <span style={{ color: '#c0a040' }}>ANTE:</span>
          {s.anteP && <span style={{ color: '#a09060' }}>You: <strong style={{ color: '#f0c060' }}>{s.anteP.name}</strong></span>}
          {s.anteO && <span style={{ color: '#a09060' }}>Opp: <strong style={{ color: '#f0c060' }}>{s.anteO.name}</strong></span>}
        </div>
      )}

      {/* -- MAIN LAYOUT ----------------------------------------------------- */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* -- CENTER COLUMN ----------------------------------------------- */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Opponent hand (face-down) */}
          <Hand side="opp" cards={s.o.hand.length} />

          {/* Opponent info banner */}
          <Banner
            side="opp"
            player={{
              life: s.o.life,
              max: config.ruleset.startingLife,
              lifeAnim: s.o.lifeAnim,
              mana: s.o.mana,
              lib: s.o.lib.length,
              gy: s.o.gy.length,
            }}
            onGraveyardClick={() => openGraveyardPopover('o', 'reference')}
          />

          {/* Battlefield: opp + phase ribbon + you */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Battlefield
              phase={s.phase}
              oppCards={oppBfCards}
              yourCards={yourBfCards}
              selCard={s.selCard ?? null}
              selTgt={s.selTgt ?? null}
              attackers={attackersList}
              flashIids={flashIids}
              onCardClick={handleBfCardClick}
            />
          </div>

          {/* Player info banner */}
          <Banner
            side="you"
            player={{
              life: s.p.life,
              max: config.ruleset.startingLife,
              lifeAnim: s.p.lifeAnim,
              mana: s.p.mana,
              lib: s.p.lib.length,
              gy: s.p.gy.length,
            }}
            onGraveyardClick={() => openGraveyardPopover('p', 'reference')}
          />

          {/* Action bar */}
          <ActionBar
            phase={s.phase}
            hasSelection={!!s.selCard}
            onCast={handleCast}
            onPassPriority={() => s.stack?.length > 0 ? resolveStack() : advancePhase()}
            onCancel={() => { setPendingActivate(null); selectCard(null); selectTarget(null); }}
            onEndTurn={advancePhase}
          />

          {/* Player hand */}
          <Hand
            side="you"
            cards={yourHand}
            selCard={s.selCard ?? null}
            onCardClick={handleHandCardClick}
          />
        </div>

        {/* -- RIGHT SIDEBAR ----------------------------------------------- */}
        <div style={{
          width: 'clamp(160px,22vw,210px)',
          borderLeft: '2px solid rgba(180,140,60,.25)',
          display: 'flex', flexDirection: 'column',
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
                  {typeof f.v === 'boolean' ? (f.v ? '?' : '?') : f.v}
                </span>
              </div>
            ))}
          </div>

          {/* Game log */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '6px 0' }}>
            <div style={{
              fontSize: 11, color: '#c0a040', fontFamily: 'var(--font-display)',
              letterSpacing: 1, padding: '0 12px 6px', fontWeight: 700,
            }}>GAME LOG</div>
            <DuelLog log={adaptedLog} />
          </div>
        </div>
      </div>

      {/* -- MODALS ---------------------------------------------------------- */}

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
    </div>
  );
}
