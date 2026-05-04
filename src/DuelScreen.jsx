// src/DuelScreen.jsx
// Assembler component for the duel UI.
// Wires engine (useDuel / AI) to all duel UI sub-components.
// Per MECHANICS_INDEX.md S8.1 ? this is a presentation coordinator only.
// All game logic lives in DuelCore.js; all decisions live in AI.js.

import React, { useState, useEffect, useRef, useCallback } from 'react';

// -- Engine / hooks -----------------------------------------------------------
import { useDuel } from './hooks/useDuel.js';
import { aiDecide } from './engine/AI.js';
import { isLand, isInst, isArt, isCre, canPay, PHASE_SEQ, PHASE_LBL, COMBAT_PHASES } from './engine/DuelCore.js';
import { CARD_DB } from './data/cards.js';

// -- UI sub-components --------------------------------------------------------
import { OpponentBattlefield, PlayerBattlefield } from './ui/duel/Battlefield.jsx';
import { Hand } from './ui/duel/Hand.jsx';
import { PhaseBar, ManaPoolDisplay } from './ui/duel/ManaPanel.jsx';
import { ActionBar, LotusColorPicker, BopColorPicker, DualLandColorPicker } from './ui/duel/TargetingOverlay.jsx';
import { TargetArrow } from './ui/duel/TargetArrow.jsx';
import { DuelLog } from './ui/layout/TechnicalLog.jsx';
import { Tooltip } from './ui/shared/Tooltip.jsx';
import { LandPip, FieldCard } from './ui/shared/Card.jsx';

// -----------------------------------------------------------------------------
// MANA CHOICE POPOVER
// -----------------------------------------------------------------------------

function getManaSymbol(color) {
  const symbols = {
    W: '☀',
    U: '💧',
    B: '💀',
    R: '🔥',
    G: '🌿',
  };
  return symbols[color] || '?';
}

function ManaChoicePopover({ colors, cardName, onSelect, onClose }) {
  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover-content" onClick={(e) => e.stopPropagation()}>
        <h3>Choose mana for {cardName}</h3>
        <div className="mana-choice-buttons">
          {colors.map((color) => (
            <button
              key={color}
              className="mana-choice-btn"
              onClick={() => onSelect(color)}
            >
              {getManaSymbol(color)} {color}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// GRAVEYARD POPOVER
// -----------------------------------------------------------------------------

function GraveyardPopover({ graveyard, playerName, mode, onSelect, onClose }) {
  if (!graveyard || graveyard.length === 0) {
    return (
      <div className="popover-overlay" onClick={onClose}>
        <div className="popover-content" onClick={(e) => e.stopPropagation()}>
          <h3>{playerName} Graveyard</h3>
          <p>Empty</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover-content" onClick={(e) => e.stopPropagation()}>
        <h3>{playerName} Graveyard</h3>
        <div className="graveyard-list">
          {graveyard.map((card, idx) => (
            <div
              key={idx}
              className={`graveyard-card ${mode === 'targeting' ? 'clickable' : ''}`}
              onClick={() => mode === 'targeting' && onSelect(card, idx)}
            >
              <span className="card-name">{card.name}</span>
              <span className="card-type">{card.type_line}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ABILITY LOOKUP
// -----------------------------------------------------------------------------

function getActivatedAbilities(card) {
  const hardcodedAbilities = {
    'Prodigal Sorcerer': {
      name: 'Prodigal Sorcerer',
      cost: '{T}',
      text: 'deals 1 damage to target creature or player',
      type: 'damage_target',
    },
    'Birds of Paradise': {
      name: 'Birds of Paradise',
      cost: '{T}',
      text: 'Add one mana of any color',
      type: 'mana_any_color',
    },
    'Llanowar Elves': {
      name: 'Llanowar Elves',
      cost: '{T}',
      text: 'Add {G}',
      type: 'mana_green',
    },
  };
  return hardcodedAbilities[card.name] || null;
}

// -----------------------------------------------------------------------------
// MANA PIP COLOR MAP
// -----------------------------------------------------------------------------

const MANA_COLORS = { W: '#e8d089', U: '#3d6fa8', B: '#8c5cb0', R: '#c4634a', G: '#6a9a5a', C: '#7a6650' };

// -----------------------------------------------------------------------------
// DUEL SCREEN
// -----------------------------------------------------------------------------

/**

- @param {object}   config
- @param {string[]} config.pDeckIds     - Player deck card IDs
- @param {string}   config.oppArchKey   - Opponent archetype key
- @param {object}   config.ruleset      - Ruleset config object
- @param {number}   [config.overworldHP]- Player HP carried from overworld
- @param {object}   [config.castleMod]  - Castle modifier if applicable
- @param {boolean}  [config.anteEnabled]- Whether ante is active
- @param {string}   [config.context]    - "monster" | "castle" | "dungeon" | "arzakon"
-
- @param {function} onDuelEnd(outcome, duelState)
- outcome: "win" | "lose" | "forfeit"
  */
  export default function DuelScreen({ config, onDuelEnd }) {
  // -- Engine state via useDuel bridge ----------------------------------------
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

// -- Local UI state (presentation only ? NOT game state) -------------------
const [tooltip, setTooltip]               = useState(null); // { card, pos }
const [pendingActivate, setPendingActivate] = useState(null); // card with activated ability
const [showLotus, setShowLotus]            = useState(false);
const [showBop, setShowBop]               = useState(false);
const [pendingDualLand, setPendingDualLand] = useState(null); // { card, colors } | null
const [graveyardPopover, setGraveyardPopover] = useState({
  open: false,
  player: null,
  mode: 'reference',
});
const [manaChoicePopover, setManaChoicePopover] = useState({
  open: false,
  colors: [],
  cardName: '',
  callback: null,
});
const aiRef = useRef(false);
const duelRootRef = useRef(null);

// -- Sync BopColorPicker with engine pendingBop flag -----------------------
useEffect(() => {
if (state.pendingBop) setShowBop(true);
}, [state.pendingBop]);

// -- Game-over handler ------------------------------------------------------
useEffect(() => {
if (!state.over) return;
const timer = setTimeout(() => {
onDuelEnd(state.over.winner === 'p' ? 'win' : 'lose', state);
}, 900);
return () => clearTimeout(timer);
}, [state.over]); // eslint-disable-line react-hooks/exhaustive-deps

// -- AI loop ----------------------------------------------------------------
// Fires whenever phase, active player, or turn changes.
// AI produces GameAction[] ? dispatched via applyAiActions ? DuelCore executes.
useEffect(() => {
if (state.over) return;
if (state.active !== 'o' || aiRef.current) return;

aiRef.current = true;

const thinkTimer = setTimeout(() => {
  const acts = aiDecide(state);
  if (acts.length) applyAiActions(acts);

  // Advance phase after acting
  setTimeout(() => {
    advancePhase();
    aiRef.current = false;
  }, 320);
}, 500 + Math.random() * 350);

return () => clearTimeout(thinkTimer);

}, [state.phase, state.active, state.turn, state.over]); // eslint-disable-line react-hooks/exhaustive-deps

// -- Tooltip handlers -------------------------------------------------------
const handleTipEnter = useCallback((card, e) => {
setTooltip({ card, pos: { x: e.clientX, y: e.clientY } });
}, []);
const handleTipLeave = useCallback(() => setTooltip(null), []);

// -- Activated ability handler ----------------------------------------------
// Must be declared before handleCardClick because handleCardClick references it.
const handleActivate = useCallback((card) => {
if (!card.activated) return;
const { effect } = card.activated;

// Birds of Paradise needs a color choice modal
if (effect === 'addManaAny') {
  activateAbility(card.iid, null); // DuelCore taps bird + sets pendingBop
  return;
}
// Black Lotus needs a color choice modal
if (effect === 'addMana3Any') {
  activateAbility(card.iid, null); // taps + sets pendingLotusIid in engine
  setShowLotus(true);
  setPendingActivate(card);
  return;
}
// Abilities that need a target ? enter pending mode
if (['ping', 'destroyTapped', 'pumpCreature', 'gainFlying', 'pumpPower'].includes(effect)) {
  setPendingActivate(card);
  selectCard(card.iid);
  return;
}
// No target needed ? fire immediately
activateAbility(card.iid, null);

}, [activateAbility, selectCard]);

// -- Card click dispatcher --------------------------------------------------
const handleCardClick = useCallback((card, zone) => {
if (state.over) return;

// -- HAND ----------------------------------------------------------------
if (zone === 'hand') {
  selectCard(state.selCard === card.iid ? null : card.iid);
  return;
}

// -- PLAYER BATTLEFIELD ---------------------------------------------------
if (zone === 'pBf') {
  // Tap land for mana
  if (isLand(card) && !card.tapped) {
    if (card.produces && card.produces.length > 1) {
      setPendingDualLand({ card, colors: card.produces });
      return;
    }
    tapLand(card.iid, card.produces?.[0] || 'C');
    return;
  }
  // Black Lotus always routes through handleActivate (never raw-tapped)
  if (card.name === 'Black Lotus') {
    handleActivate(card);
    return;
  }
  // Tap artifact mana source
  if (isArt(card) && !card.tapped && card.activated?.effect?.startsWith('addMana')) {
    tapArtifactMana(card.iid);
    return;
  }
  // Declare attacker
  if (state.phase === 'COMBAT_ATTACKERS') {
    declareAttacker(card.iid);
    return;
  }
  // Pending activated ability ? this creature is the target
  if (pendingActivate) {
    activateAbility(pendingActivate.iid, card.iid);
    setPendingActivate(null);
    selectCard(null);
    selectTarget(null);
    return;
  }
  // Otherwise select as target
  selectTarget(card.iid);
  return;
}

// -- OPPONENT BATTLEFIELD -------------------------------------------------
if (zone === 'oBf') {
  // Blocker assignment: click attacker first to select, then your blocker
  if (state.phase === 'COMBAT_BLOCKERS' && state.selTgt) {
    declareBlocker(state.selTgt, card.iid);
    selectTarget(null);
    return;
  }
  // Pending activated ability ? opponent creature is target
  if (pendingActivate) {
    activateAbility(pendingActivate.iid, card.iid);
    setPendingActivate(null);
    selectCard(null);
    return;
  }
  selectTarget(card.iid);
  return;
}

}, [
state.over, state.selCard, state.selTgt, state.phase,
pendingActivate,
selectCard, selectTarget, tapLand, tapArtifactMana,
tapArtifactMana, declareAttacker, declareBlocker, activateAbility,
handleActivate,
]);

// Phases in which "cast only before combat damage" instants are legal.
const BEFORE_COMBAT_DAMAGE_PHASES = new Set([
  'MAIN_1', 'MAIN1',
  'COMBAT_BEGIN',
  'COMBAT_ATTACKERS', 'DECLARE_ATTACKERS',
  'COMBAT_BLOCKERS',  'DECLARE_BLOCKERS',
]);

// -- Cast / play selected card ----------------------------------------------
const handleCast = useCallback(() => {
const card = state.p.hand.find(c => c.iid === state.selCard);
if (!card) return;

if (isLand(card)) {
  playLand(card.iid);
  selectCard(null);
  return;
}

if (card.castRestriction === 'beforeCombatDamage') {
  if (!BEFORE_COMBAT_DAMAGE_PHASES.has(state.phase)) return;
}

// Resolve target: damage spells default to opponent; draw/life to self
const rawTgt = state.selTgt || resolveDefaultTarget(card, state);
if (card.effect === 'enchantCreature' && !rawTgt) return; // must select a creature first
// Normalize life-total click sentinels to the engine keys 'p' and 'o'
const tgt = rawTgt === 'player-p' ? 'p' : rawTgt === 'player-o' ? 'o' : rawTgt;
castSpell(card.iid, tgt, state.xVal);
selectCard(null);
selectTarget(null);

}, [state, playLand, castSpell, selectCard, selectTarget]);

// -- New ability handler (uses getActivatedAbilities type system) -----------
const handleActivateAbility = useCallback((card) => {
  const ability = getActivatedAbilities(card);
  if (!ability) return;

  switch (ability.type) {
    case 'damage_target':
      setPendingActivate(card);
      selectCard(card.iid);
      break;
    case 'mana_any_color':
      openManaChoicePopover(['W', 'U', 'B', 'R', 'G'], card.name, (color) => {
        activateAbility(card.iid, null, color);
        closeManaChoicePopover();
      });
      break;
    case 'mana_green':
      activateAbility(card.iid, null);
      break;
  }
}, [activateAbility, selectCard]); // eslint-disable-line react-hooks/exhaustive-deps

// -- Lotus color choice -----------------------------------------------------
const handleLotusChoose = useCallback((color) => {
chooseLotusColor(color);
setShowLotus(false);
setPendingActivate(null);
}, [chooseLotusColor]);

const handleLotusCancel = useCallback(() => {
setShowLotus(false);
setPendingActivate(null);
}, []);

const handleBopChoose = useCallback((color) => {
dispatch({ type: 'CHOOSE_BOP_COLOR', color });
setShowBop(false);
}, [dispatch]);

const handleBopCancel = useCallback(() => {
dispatch({ type: 'CHOOSE_BOP_COLOR', color: 'G' }); // default Green on cancel
setShowBop(false);
}, [dispatch]);

// -- Cancel pending activate ------------------------------------------------
const handleCancelActivate = useCallback(() => {
setPendingActivate(null);
selectCard(null);
selectTarget(null);
}, [selectCard, selectTarget]);

// -- Graveyard popover handlers ---------------------------------------------
const openGraveyardPopover = (player, mode = 'reference') => {
  setGraveyardPopover({ open: true, player, mode });
};

const closeGraveyardPopover = () => {
  setGraveyardPopover({ open: false, player: null, mode: 'reference' });
};

const handleGraveyardCardSelect = (card, idx) => {
  if (state.awaitingInput?.type === 'graveyard_target') {
    const effect = { ...state.awaitingInput.effect, target: card, targetIndex: idx };
    dispatch({ type: 'RESOLVE_GRAVEYARD_EFFECT', effect });
    closeGraveyardPopover();
  }
};

// -- Mana choice popover handlers -------------------------------------------
const openManaChoicePopover = (colors, cardName, callback) => {
  setManaChoicePopover({ open: true, colors, cardName, callback });
};

const closeManaChoicePopover = () => {
  setManaChoicePopover({ open: false, colors: [], cardName: '', callback: null });
};

const handleManaChoice = (color) => {
  if (manaChoicePopover.callback) {
    manaChoicePopover.callback(color);
  }
  closeManaChoicePopover();
};

// -------------------------------------------------------------------------
// RENDER
// -------------------------------------------------------------------------

const s = state;

// Derive last cast spell for sidebar display
const lastSpellInfo = React.useMemo(() => {
  if (!s?.log) return null;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const entry = s.log[i];
    if (entry.type !== 'play') continue;
    const match = entry.text.match(/^(p|o) casts (.+?)\./);
    if (!match) continue;
    const casterKey = match[1];
    const cardName  = match[2];
    const zones = [s.p.gy, s.o.gy, s.p.bf, s.o.bf, s.p.hand, s.o.hand];
    let card = null;
    for (const zone of zones) {
      card = zone?.find(c => c.name === cardName) ?? null;
      if (card) break;
    }
    if (!card) {
      const dbEntry = CARD_DB.find(c => c.name === cardName);
      if (dbEntry) card = dbEntry;
    }
    return { card, casterKey, cardName };
  }
  return null;
}, [s?.log]); // eslint-disable-line react-hooks/exhaustive-deps

const selDef   = s.p.hand.find(c => c.iid === s.selCard);
const inMain   = s.phase === 'MAIN_1' || s.phase === 'MAIN_2';
const isMyTurn = s.active === 'p';

return (
<div ref={duelRootRef} style={{
  height: '100vh', width: '100vw',
  background: '#0a0e08',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
  fontFamily: "'Crimson Text',serif",
}}>

  {/* -- GAME OVER OVERLAY ----------------------------------------------- */}
  {s.over && (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{s.over.winner === 'p' ? '🏆' : '💀'}</div>
        <div style={{
          fontSize: 24, fontFamily: "'Cinzel',serif",
          color: s.over.winner === 'p' ? '#80e080' : '#e04040',
          marginBottom: 8,
        }}>
          {s.over.winner === 'p' ? 'Victory!' : 'Defeat'}
        </div>
        <div style={{ fontSize: 12, color: '#a08060', marginBottom: 16 }}>{s.over.reason}</div>
        <div style={{ fontSize: 11, color: '#6a5030', fontStyle: 'italic' }}>Returning to overworld…</div>
      </div>
    </div>
  )}

  {/* -- CASTLE MODIFIER BANNER ------------------------------------------ */}
  {s.castleMod && (
    <div style={{
      background: 'rgba(100,20,0,.4)',
      borderBottom: '1px solid rgba(200,60,20,.3)',
      padding: '4px 14px',
      display: 'flex', gap: 8, alignItems: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, color: '#e08040', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
        CASTLE MODIFIER:
      </span>
      <span style={{ fontSize: 10, color: '#f0c060', fontFamily: "'Cinzel',serif" }}>
        {s.castleMod.name}
      </span>
      <span style={{ fontSize: 10, color: '#a07040', fontStyle: 'italic' }}>
        — {s.castleMod.desc}
      </span>
    </div>
  )}

  {/* -- ANTE BANNER ----------------------------------------------------- */}
  {s.anteEnabled && (s.anteP || s.anteO) && (
    <div style={{
      background: 'rgba(60,30,0,.4)',
      borderBottom: '1px solid rgba(180,120,40,.2)',
      padding: '3px 14px',
      display: 'flex', gap: 12, alignItems: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 9, color: '#c0a040', fontFamily: "'Cinzel',serif" }}>ANTE:</span>
      {s.anteP && (
        <span style={{ fontSize: 9, color: '#a09060' }}>
          You: <strong style={{ color: '#f0c060' }}>{s.anteP.name}</strong>
        </span>
      )}
      {s.anteO && (
        <span style={{ fontSize: 9, color: '#a09060' }}>
          Opp: <strong style={{ color: '#f0c060' }}>{s.anteO.name}</strong>
        </span>
      )}
    </div>
  )}

  {/* -- TOPBAR ---------------------------------------------------------- */}
  <div style={{
    height: 32, background: '#080402',
    borderBottom: '1px solid rgba(100,60,20,.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 14px', flexShrink: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, fontFamily: "'Cinzel',serif", color: '#c4a040', letterSpacing: 3, fontWeight: 600 }}>
        SHANDALAR
      </span>
      <span style={{ fontSize: 10, color: '#5a4a30' }}>·</span>
      <span style={{ fontSize: 10, color: '#5a4a30' }}>MODERN</span>
      <div style={{ width: 1, height: 14, background: 'rgba(100,70,20,.4)', margin: '0 2px' }} />
      <span style={{ fontSize: 10, color: '#a08060' }}>TURN {s.turn}</span>
      <span style={{
        fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 600,
        color: isMyTurn ? '#50c030' : '#e04040',
      }}>
        {isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
      </span>
    </div>
    <button
      onClick={() => onDuelEnd('forfeit', s)}
      style={{
        background: 'transparent',
        border: '1px solid rgba(180,80,40,.5)',
        color: '#e07050',
        padding: '3px 10px', borderRadius: 4,
        cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif",
      }}
    >
      FORFEIT
    </button>
  </div>

  {/* -- PHASE BAR ------------------------------------------------------- */}
  <div style={{
    height: 28, background: '#0a0604',
    borderBottom: '1px solid rgba(80,50,10,.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 3, padding: '0 8px', flexShrink: 0, overflowX: 'auto',
  }}>
    {PHASE_SEQ.map(p => {
      const active = p === s.phase;
      return (
        <div key={p} style={{
          padding: '2px 6px', borderRadius: 10, whiteSpace: 'nowrap',
          fontSize: 8, fontFamily: "'Cinzel',serif", letterSpacing: 1,
          background: active ? '#c4a040' : 'transparent',
          color: active ? '#1a1000' : '#5a4a30',
          fontWeight: active ? 700 : 400,
          boxShadow: active ? '0 0 8px rgba(196,160,64,.4)' : 'none',
        }}>
          {PHASE_LBL[p]}
        </div>
      );
    })}
  </div>

  {/* -- MAIN AREA ------------------------------------------------------- */}
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

    {/* -- LEFT COLUMN --------------------------------------------------- */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Opponent info bar */}
      <div style={{
        flexShrink: 0, height: 40,
        background: 'rgba(0,0,0,.5)',
        borderBottom: '1px solid rgba(180,80,30,.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontFamily: "'Cinzel',serif", color: '#e05030', letterSpacing: 1 }}>OPPONENT</span>
          <div
            data-iid="player-o"
            onClick={() => { if (s.selCard) selectTarget(s.selTgt === 'player-o' ? null : 'player-o'); }}
            style={{
              cursor: s.selCard ? 'crosshair' : 'default',
              borderRadius: 4,
              padding: '0 4px',
              outline: s.selTgt === 'player-o' ? '2px solid #ff6040' : 'none',
              outlineOffset: 2,
              transition: 'outline 0.1s',
            }}
          >
            <span style={{
              fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif",
              color: s.o.life <= 5 ? '#ff2020' : s.o.life <= 10 ? '#e06030' : '#ff9060',
              animation: s.o.life <= 5 ? 'pulse 1s infinite' : s.o.lifeAnim === 'damage' ? 'damageFlash .4s ease-out' : s.o.lifeAnim === 'heal' ? 'healFlash .4s ease-out' : 'none',
            }}>
              {s.o.life}
            </span>
          </div>
          <div style={{ width: 80, height: 6, background: '#1a0800', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max(0, (s.o.life / config.ruleset.startingLife) * 100)}%`,
              height: '100%',
              background: s.o.life <= 5 ? '#cc1010' : 'linear-gradient(90deg,#aa3010,#dd5020)',
              transition: 'width .4s', borderRadius: 3,
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#806040' }}>
          <span>🂠 {s.o.lib.length}</span>
          <span>🗑 {s.o.gy.length}</span>
        </div>
      </div>

      {/* Opponent lands row */}
      <div style={{ flexShrink: 0, minHeight: 44, background: 'rgba(0,0,0,.2)', padding: '4px 10px' }}>
        <div style={{ fontSize: 7, fontFamily: "'Cinzel',serif", color: '#706028', letterSpacing: 1, marginBottom: 3 }}>
          LANDS
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {s.o.bf.filter(isLand).map(c => (
            <LandPip
              key={c.iid} card={c} tapped={c.tapped}
              selected={s.selTgt === c.iid}
              onClick={() => handleCardClick(c, 'oBf')}
              onMouseMove={e => handleTipEnter(c, e)}
              onMouseLeave={handleTipLeave}
            />
          ))}
        </div>
      </div>

      {/* Opponent creatures zone */}
      <div style={{
        flex: 1, minHeight: 80,
        background: 'linear-gradient(180deg,#1a0c08,#120808)',
        padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 5,
        alignContent: 'flex-start', overflow: 'auto',
      }}>
        {s.o.bf.filter(c => !isLand(c)).map(c => (
          <div key={c.iid} onMouseMove={e => handleTipEnter(c, e)} onMouseLeave={handleTipLeave}>
            <FieldCard
              card={c} state={s}
              selected={s.selTgt === c.iid}
              attacking={s.attackers.includes(c.iid)}
              onClick={() => handleCardClick(c, 'oBf')}
              sm
            />
          </div>
        ))}
      </div>

      {/* Phase banner */}
      <div style={{ flexShrink: 0, height: 28, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(120,100,40,.2)' }} />
        <div style={{
          padding: '3px 16px', margin: '0 12px',
          background: 'rgba(20,16,10,.9)',
          border: '1px solid rgba(120,100,40,.4)',
          borderRadius: 20,
        }}>
          <span style={{ fontSize: 9, fontFamily: "'Cinzel',serif", color: '#a89060', letterSpacing: 2 }}>
            {PHASE_LBL[s.phase]}
          </span>
        </div>
        <div style={{ flex: 1, height: 1, background: 'rgba(120,100,40,.2)' }} />
      </div>

      {/* Player creatures zone */}
      <div style={{
        flex: 1, minHeight: 80,
        background: 'linear-gradient(180deg,#0c1408,#0a100a)',
        padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 5,
        alignContent: 'flex-start', overflow: 'auto',
      }}>
        {s.p.bf.filter(c => !isLand(c)).map(c => (
          <div key={c.iid} onMouseMove={e => handleTipEnter(c, e)} onMouseLeave={handleTipLeave}>
            <FieldCard
              card={c} state={s}
              selected={s.selCard === c.iid || s.selTgt === c.iid}
              attacking={s.attackers.includes(c.iid)}
              onClick={() => handleCardClick(c, 'pBf')}
              onActivate={handleActivateAbility}
            />
          </div>
        ))}
      </div>

      {/* Player lands row */}
      <div style={{ flexShrink: 0, minHeight: 44, background: 'rgba(0,0,0,.2)', padding: '4px 10px' }}>
        <div style={{ fontSize: 7, fontFamily: "'Cinzel',serif", color: '#407028', letterSpacing: 1, marginBottom: 3 }}>
          YOUR LANDS
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {s.p.bf.filter(isLand).map(c => (
            <LandPip
              key={c.iid} card={c} tapped={c.tapped}
              selected={s.selCard === c.iid || s.selTgt === c.iid}
              isPlayer
              onClick={() => handleCardClick(c, 'pBf')}
              onMouseMove={e => handleTipEnter(c, e)}
              onMouseLeave={handleTipLeave}
            />
          ))}
        </div>
      </div>

      {/* Player info bar */}
      <div style={{
        flexShrink: 0, height: 40,
        background: 'rgba(0,0,0,.5)',
        borderTop: '1px solid rgba(60,120,30,.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontFamily: "'Cinzel',serif", color: '#50a030', letterSpacing: 1 }}>YOU</span>
          <div
            data-iid="player-p"
            onClick={() => { if (s.selCard) selectTarget(s.selTgt === 'player-p' ? null : 'player-p'); }}
            style={{
              cursor: s.selCard ? 'crosshair' : 'default',
              borderRadius: 4,
              padding: '0 4px',
              outline: s.selTgt === 'player-p' ? '2px solid #60c040' : 'none',
              outlineOffset: 2,
              transition: 'outline 0.1s',
            }}
          >
            <span style={{
              fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif",
              color: s.p.life <= 5 ? '#ff2020' : s.p.life <= 10 ? '#e06030' : '#90d050',
              animation: s.p.life <= 5 ? 'pulse 1s infinite' : s.p.lifeAnim === 'damage' ? 'damageFlash .4s ease-out' : s.p.lifeAnim === 'heal' ? 'healFlash .4s ease-out' : 'none',
            }}>
              {s.p.life}
            </span>
          </div>
          <div style={{ width: 80, height: 6, background: '#081808', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max(0, (s.p.life / config.ruleset.startingLife) * 100)}%`,
              height: '100%',
              background: s.p.life <= 5 ? '#cc1010' : 'linear-gradient(90deg,#208020,#40cc40)',
              transition: 'width .4s', borderRadius: 3,
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#806040' }}>🂠 {s.p.lib.length}</span>
          <span style={{ fontSize: 11, color: '#806040' }}>🗑 {s.p.gy.length}</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {Object.entries(s.p.mana)
              .flatMap(([color, count]) => Array(Math.max(0, count)).fill(color))
              .slice(0, 10)
              .map((color, i) => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: MANA_COLORS[color] || '#7a6650',
                }} />
              ))}
          </div>
          <button
            onClick={mulligan}
            style={{
              background: 'rgba(0,0,0,.4)',
              border: '1px solid rgba(160,120,60,.4)',
              color: '#c0a050',
              padding: '3px 8px', borderRadius: 4,
              cursor: 'pointer', fontSize: 9, fontFamily: "'Cinzel',serif",
            }}
          >
            Mulligan
          </button>
        </div>
      </div>

    </div>

    {/* -- RIGHT COLUMN: Chronicle ---------------------------------------- */}
    <div style={{
      width: 220, flexShrink: 0,
      background: '#0a0806',
      borderLeft: '1px solid rgba(100,70,20,.3)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '8px 12px 6px', flexShrink: 0,
        borderBottom: '1px solid rgba(100,70,20,.2)',
      }}>
        <span style={{ fontSize: 10, fontFamily: "'Cinzel',serif", color: '#c4a040', letterSpacing: 2 }}>
          CHRONICLE
        </span>
      </div>

      {/* Last Spell Cast */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid rgba(180,140,60,.15)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 9, color: '#7060a0',
          fontFamily: 'var(--font-display, "Cinzel",serif)',
          letterSpacing: 1, marginBottom: 6,
          textTransform: 'uppercase',
        }}>
          Last Spell Cast
        </div>

        {lastSpellInfo ? (
          <div style={{
            background: 'rgba(80,60,140,.2)',
            border: '1px solid rgba(120,90,200,.35)',
            borderRadius: 5,
            padding: '6px 8px',
          }}>
            {/* Caster badge */}
            <div style={{ marginBottom: 4 }}>
              <span style={{
                fontSize: 8, fontFamily: "'Cinzel',serif",
                color: lastSpellInfo.casterKey === 'p' ? '#60c060' : '#e07060',
                background: lastSpellInfo.casterKey === 'p'
                  ? 'rgba(40,100,40,.3)' : 'rgba(140,40,40,.3)',
                padding: '1px 6px', borderRadius: 3,
                border: `1px solid ${lastSpellInfo.casterKey === 'p' ? 'rgba(60,140,60,.4)' : 'rgba(180,60,60,.4)'}`,
              }}>
                {lastSpellInfo.casterKey === 'p' ? 'YOU' : 'OPPONENT'}
              </span>
            </div>

            {/* Card name */}
            <div style={{
              fontSize: 11, fontFamily: "'Cinzel',serif",
              color: '#e8d090', fontWeight: 700,
              marginBottom: 2, lineHeight: 1.2,
            }}>
              {lastSpellInfo.cardName}
            </div>

            {/* Type line + cost */}
            {lastSpellInfo.card && (
              <>
                <div style={{
                  fontSize: 9, color: '#907840',
                  fontFamily: "'Fira Code',monospace",
                  marginBottom: 4,
                }}>
                  {lastSpellInfo.card.type ?? ''}
                  {lastSpellInfo.card.cost
                    ? <span style={{ color: '#c0a060', marginLeft: 6 }}>{lastSpellInfo.card.cost}</span>
                    : null}
                </div>

                {/* Oracle text */}
                {lastSpellInfo.card.text && (
                  <div style={{
                    fontSize: 9, color: '#b09870',
                    fontFamily: "'Crimson Text',serif",
                    lineHeight: 1.4,
                    maxHeight: 80,
                    overflowY: 'auto',
                    borderTop: '1px solid rgba(120,90,40,.2)',
                    paddingTop: 4,
                  }}>
                    {lastSpellInfo.card.text}
                  </div>
                )}

                {/* P/T for creatures */}
                {lastSpellInfo.card.power !== undefined && lastSpellInfo.card.toughness !== undefined && (
                  <div style={{
                    fontSize: 10, color: '#d0c080',
                    fontFamily: "'Fira Code',monospace",
                    textAlign: 'right', marginTop: 4,
                    fontWeight: 700,
                  }}>
                    {lastSpellInfo.card.power}/{lastSpellInfo.card.toughness}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 9, color: '#3a2c18', fontStyle: 'italic' }}>—</div>
        )}
      </div>

      <DuelLog log={s.log} />
    </div>
  </div>

  {/* -- ACTION BAR ------------------------------------------------------ */}
  <div style={{
    flexShrink: 0, background: '#080604',
    borderTop: '1px solid rgba(80,60,20,.3)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '0 14px',
  }}>

    {/* Contextual row — cast, stack, prompts (above nav buttons) */}
    {(isMyTurn && inMain && selDef) || selDef?.cost?.includes('X') || s.stack.length > 0 || pendingActivate || (isMyTurn && !pendingActivate && (s.phase === 'COMBAT_ATTACKERS' || s.phase === 'COMBAT_BLOCKERS' || s.attackers.length > 0)) ? (
      <div style={{ paddingTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>

        {/* Cast / Play button */}
        {isMyTurn && inMain && selDef && (
          <button onClick={handleCast} style={{
            background: 'rgba(20,16,8,.8)',
            border: '1px solid rgba(200,160,40,.5)',
            color: '#f0d060',
            padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
            fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {isLand(selDef) ? '⬡ Play' : '✦ Cast'} {selDef.name}
          </button>
        )}

        {/* X input */}
        {selDef?.cost?.includes('X') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#c0a050', fontFamily: "'Cinzel',serif" }}>X=</span>
            <input
              type="number" min={0} max={20} value={s.xVal}
              onChange={e => setX(parseInt(e.target.value) || 0)}
              style={{ width: 40, background: 'rgba(20,15,0,.8)', border: '1px solid #7a6020', color: '#f0d050', padding: '3px 5px', borderRadius: 4, fontSize: 13, fontFamily: "'Fira Code',monospace" }}
            />
          </div>
        )}

        {/* Stack display */}
        {s.stack.length > 0 && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#b090e0', fontFamily: "'Cinzel',serif", fontWeight: 700 }}>STACK:</span>
            {s.stack.map(item => (
              <div key={item.id} style={{
                padding: '3px 8px', borderRadius: 5, fontSize: 10,
                background: 'rgba(100,60,180,.35)', border: '1px solid rgba(140,100,220,.6)',
                color: '#d0b0ff', fontFamily: "'Cinzel',serif",
              }}>
                {item.card.name}
              </div>
            ))}
            <button onClick={resolveStack} style={{
              background: 'rgba(60,40,0,.7)', border: '1px solid rgba(200,140,40,.6)', color: '#f0c040',
              padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif",
            }}>Resolve →</button>
          </div>
        )}

        {/* Pending activate prompt */}
        {pendingActivate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(200,160,40,.15)', border: '1px solid #a08030', borderRadius: 5, padding: '4px 10px' }}>
            <span style={{ fontSize: 10, color: '#f0c040', fontFamily: "'Cinzel',serif" }}>◎ {pendingActivate.name}: select a target</span>
            <button onClick={handleCancelActivate} style={{ background: 'transparent', border: '1px solid #5a3020', color: '#c08060', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>Cancel</button>
          </div>
        )}

        {/* Combat prompts */}
        {isMyTurn && !pendingActivate && (
          <>
            {s.phase === 'COMBAT_ATTACKERS' && (
              <span style={{ fontSize: 10, color: '#ffaa40', fontFamily: "'Cinzel',serif", fontWeight: 700 }}>
                ⚔ Click your creatures to declare attackers
              </span>
            )}
            {s.phase === 'COMBAT_BLOCKERS' && (
              <span style={{ fontSize: 10, color: '#ffaa40', fontFamily: "'Cinzel',serif", fontWeight: 700 }}>
                ⚔ Click an attacker, then your blocker
              </span>
            )}
            {s.attackers.length > 0 && (
              <span style={{ fontSize: 10, color: '#ff9040', fontFamily: "'Cinzel',serif", fontWeight: 700 }}>
                ⚔ {s.attackers.length} attacker{s.attackers.length !== 1 ? 's' : ''}
                {Object.keys(s.blockers).length > 0 ? ` · ⚔ ${Object.keys(s.blockers).length} blocked` : ''}
              </span>
            )}
          </>
        )}
      </div>
    ) : null}

    {/* Navigation button row — Pass Priority / End Turn always on bottom */}
    <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      {isMyTurn && (
        <>
          {s.phase === 'COMBAT_ATTACKERS' && (
            <button onClick={advancePhase} style={{
              border: '1px solid rgba(196,160,40,.6)',
              background: 'rgba(60,50,10,.3)',
              color: '#c4a040',
              padding: '6px 20px', borderRadius: 20, cursor: 'pointer',
              fontSize: 9, fontFamily: "'Cinzel',serif", letterSpacing: 1,
            }}>
              ATTACK
            </button>
          )}
          {s.phase === 'COMBAT_BLOCKERS' && (
            <button onClick={advancePhase} style={{
              border: '1px solid rgba(196,160,40,.6)',
              background: 'rgba(60,50,10,.3)',
              color: '#c4a040',
              padding: '6px 20px', borderRadius: 20, cursor: 'pointer',
              fontSize: 9, fontFamily: "'Cinzel',serif", letterSpacing: 1,
            }}>
              BLOCK
            </button>
          )}
          {s.phase !== 'COMBAT_ATTACKERS' && s.phase !== 'COMBAT_BLOCKERS' && (
            <button onClick={advancePhase} style={{
              border: '1px solid rgba(120,100,40,.4)',
              background: 'transparent',
              color: '#a89060',
              padding: '6px 20px', borderRadius: 20, cursor: 'pointer',
              fontSize: 9, fontFamily: "'Cinzel',serif", letterSpacing: 1,
            }}>
              PASS PRIORITY
            </button>
          )}
          <button onClick={advancePhase} style={{
            border: '1px solid rgba(100,160,60,.4)',
            background: 'rgba(40,80,20,.3)',
            color: '#80c040',
            padding: '6px 20px', borderRadius: 20, cursor: 'pointer',
            fontSize: 9, fontFamily: "'Cinzel',serif", letterSpacing: 1,
          }}>
            END TURN ▾
          </button>
        </>
      )}
      {!isMyTurn && (
        <span style={{ fontSize: 10, color: '#6a5a30', fontFamily: "'Cinzel',serif", fontStyle: 'italic' }}>
          Opponent's turn—
        </span>
      )}
    </div>
  </div>

  {/* -- HAND ------------------------------------------------------------ */}
  <div style={{ background: '#060402', padding: '4px 0 0', flexShrink: 0 }}>
    <Hand
      state={s}
      onCardClick={handleCardClick}
      onTipEnter={handleTipEnter}
      onTipLeave={handleTipLeave}
    />
  </div>

  {/* -- MODALS ---------------------------------------------------------- */}

  {/* Black Lotus color picker */}
  {showLotus && (
    <LotusColorPicker onChoose={handleLotusChoose} onCancel={handleLotusCancel} />
  )}

  {/* Birds of Paradise color picker */}
  {showBop && (
    <BopColorPicker onChoose={handleBopChoose} onCancel={handleBopCancel} />
  )}

  {/* Dual land / City of Brass color picker */}
  {pendingDualLand && (
    <DualLandColorPicker
      landName={pendingDualLand.card.name}
      colors={pendingDualLand.colors}
      onChoose={(color) => {
        dispatch({ type: 'TAP_LAND', who: 'p', iid: pendingDualLand.card.iid, mana: color });
        if (pendingDualLand.card.id === 'city_of_brass') {
          dispatch({ type: 'CITY_OF_BRASS_DAMAGE' });
        }
        setPendingDualLand(null);
      }}
      onCancel={() => setPendingDualLand(null)}
    />
  )}

  {/* Hover tooltip */}
  {tooltip && (
    <Tooltip card={tooltip.card} state={s} pos={tooltip.pos} />
  )}

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

  <TargetArrow
    sourceIid={state.selCard}
    targetIid={state.selTgt}
    sourceCard={state.p.hand.find(c => c.iid === state.selCard) ?? null}
    state={state}
    containerRef={duelRootRef}
  />
</div>

);
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function getDualLandColors(card) {
  if (!card.oracle_text) return null;
  const text = card.oracle_text;
  const dualPatterns = [
    /\{T\}:\s*Add\s+\{(.)\}\s+or\s+\{(.)\}\./i,
    /\{T\}:\s*Add\s+(\w+)\s+or\s+(\w+)\./i,
  ];
  for (const pattern of dualPatterns) {
    const match = text.match(pattern);
    if (match) return [match[1], match[2]];
  }
  return null;
}

/**

- Resolve a sensible default target for a spell when the player hasn't
- explicitly clicked one. DuelCore will validate ? this is just a UX convenience.
  */
  function resolveDefaultTarget(card, state) {
  const { effect } = card;
  if (['damage3', 'damage5', 'damageX', 'psionicBlast', 'chainLightning'].includes(effect)) {
  return 'o';
  }
  if (['draw3', 'gainLife3', 'gainLifeX', 'tutor', 'drawX'].includes(effect)) {
  return state.selTgt || 'p';
  }
  if (['destroy', 'exileCreature', 'bounce', 'destroyArtifact', 'destroyArtOrEnch'].includes(effect)) {
  return state.selTgt || null;
  }
  return state.selTgt || null;
  }
