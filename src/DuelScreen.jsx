// src/DuelScreen.jsx
// Assembler component for the duel UI.
// Wires engine (useDuel / AI) to all duel UI sub-components.
// Per MECHANICS_INDEX.md §8.1 — this is a presentation coordinator only.
// All game logic lives in DuelCore.js; all decisions live in AI.js.

import React, { useState, useEffect, useRef, useCallback } from ‘react’;

// ── Engine / hooks ───────────────────────────────────────────────────────────
import { useDuel } from ‘./hooks/useDuel.js’;
import { aiDecide } from ‘./engine/AI.js’;
import { isLand, isInst, isArt, isCre, canPay } from ‘./engine/DuelCore.js’;

// ── UI sub-components ────────────────────────────────────────────────────────
import { OpponentBattlefield, PlayerBattlefield } from ‘./ui/duel/Battlefield.jsx’;
import { Hand } from ‘./ui/duel/Hand.jsx’;
import { PhaseBar, ManaPoolDisplay } from ‘./ui/duel/ManaPanel.jsx’;
import { ActionBar, LotusColorPicker, BopColorPicker } from ‘./ui/duel/TargetingOverlay.jsx’;
import { DuelLog } from ‘./ui/layout/TechnicalLog.jsx’;
import { Tooltip } from ‘./ui/shared/Tooltip.jsx’;

// ─────────────────────────────────────────────────────────────────────────────
// GRAVEYARD POPOVER
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// DUEL SCREEN
// ─────────────────────────────────────────────────────────────────────────────

/**

- @param {object}   config
- @param {string[]} config.pDeckIds     - Player deck card IDs
- @param {string}   config.oppArchKey   - Opponent archetype key
- @param {object}   config.ruleset      - Ruleset config object
- @param {number}   [config.overworldHP]- Player HP carried from overworld
- @param {object}   [config.castleMod]  - Castle modifier if applicable
- @param {boolean}  [config.anteEnabled]- Whether ante is active
- @param {string}   [config.context]    - “monster” | “castle” | “dungeon” | “arzakon”
- 
- @param {function} onDuelEnd(outcome, duelState)
- outcome: “win” | “lose” | “forfeit”
  */
  export default function DuelScreen({ config, onDuelEnd }) {
  // ── Engine state via useDuel bridge ────────────────────────────────────────
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

// ── Local UI state (presentation only — NOT game state) ───────────────────
const [tooltip, setTooltip]               = useState(null); // { card, pos }
const [pendingActivate, setPendingActivate] = useState(null); // card with activated ability
const [showLotus, setShowLotus]            = useState(false);
const [showBop, setShowBop]               = useState(false);
const [graveyardPopover, setGraveyardPopover] = useState({
  open: false,
  player: null,
  mode: 'reference',
});
const aiRef = useRef(false);

// ── Sync BopColorPicker with engine pendingBop flag ───────────────────────
useEffect(() => {
if (state.pendingBop) setShowBop(true);
}, [state.pendingBop]);

// ── Game-over handler ──────────────────────────────────────────────────────
useEffect(() => {
if (!state.over) return;
const timer = setTimeout(() => {
onDuelEnd(state.over.winner === ‘p’ ? ‘win’ : ‘lose’, state);
}, 900);
return () => clearTimeout(timer);
}, [state.over]); // eslint-disable-line react-hooks/exhaustive-deps

// ── AI loop ────────────────────────────────────────────────────────────────
// Fires whenever phase, active player, or turn changes.
// AI produces GameAction[] → dispatched via applyAiActions → DuelCore executes.
useEffect(() => {
if (state.over) return;
if (state.active !== ‘o’ || aiRef.current) return;

```
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
```

}, [state.phase, state.active, state.turn, state.over]); // eslint-disable-line react-hooks/exhaustive-deps

// ── Tooltip handlers ───────────────────────────────────────────────────────
const handleTipEnter = useCallback((card, e) => {
setTooltip({ card, pos: { x: e.clientX, y: e.clientY } });
}, []);
const handleTipLeave = useCallback(() => setTooltip(null), []);

// ── Card click dispatcher ──────────────────────────────────────────────────
const handleCardClick = useCallback((card, zone) => {
if (state.over) return;

```
// ── HAND ────────────────────────────────────────────────────────────────
if (zone === 'hand') {
  selectCard(state.selCard === card.iid ? null : card.iid);
  return;
}

// ── PLAYER BATTLEFIELD ───────────────────────────────────────────────────
if (zone === 'pBf') {
  // Tap land for mana
  if (isLand(card) && !card.tapped) {
    tapLand(card.iid, card.produces?.[0] || 'C');
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
  // Pending activated ability — this creature is the target
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

// ── OPPONENT BATTLEFIELD ─────────────────────────────────────────────────
if (zone === 'oBf') {
  // Blocker assignment: click attacker first to select, then your blocker
  if (state.phase === 'COMBAT_BLOCKERS' && state.selTgt) {
    declareBlocker(state.selTgt, card.iid);
    selectTarget(null);
    return;
  }
  // Pending activated ability — opponent creature is target
  if (pendingActivate) {
    activateAbility(pendingActivate.iid, card.iid);
    setPendingActivate(null);
    selectCard(null);
    return;
  }
  selectTarget(card.iid);
  return;
}
```

}, [
state.over, state.selCard, state.selTgt, state.phase,
pendingActivate,
selectCard, selectTarget, tapLand, tapArtifactMana,
tapArtifactMana, declareAttacker, declareBlocker, activateAbility,
]);

// ── Cast / play selected card ──────────────────────────────────────────────
const handleCast = useCallback(() => {
const card = state.p.hand.find(c => c.iid === state.selCard);
if (!card) return;

```
if (isLand(card)) {
  playLand(card.iid);
  selectCard(null);
  return;
}

// Resolve target: damage spells default to opponent; draw/life to self
const tgt = state.selTgt || resolveDefaultTarget(card, state);
if (card.effect === 'enchantCreature' && !tgt) return; // must select a creature first
castSpell(card.iid, tgt, state.xVal);
selectCard(null);
selectTarget(null);
```

}, [state, playLand, castSpell, selectCard, selectTarget]);

// ── Activated ability handler ──────────────────────────────────────────────
const handleActivate = useCallback((card) => {
if (!card.activated) return;
const { effect } = card.activated;

```
// Birds of Paradise needs a color choice modal
if (effect === 'addManaAny') {
  activateAbility(card.iid, null); // DuelCore taps bird + sets pendingBop
  return;
}
// Black Lotus needs a color choice modal
if (effect === 'addMana3Any') {
  setShowLotus(true);
  // Store lotus iid so we can dispatch after color choice
  setPendingActivate(card);
  return;
}
// Abilities that need a target — enter pending mode
if (['ping', 'destroyTapped', 'pumpCreature', 'gainFlying', 'pumpPower'].includes(effect)) {
  setPendingActivate(card);
  selectCard(card.iid);
  return;
}
// No target needed — fire immediately
activateAbility(card.iid, null);
```

}, [activateAbility, selectCard]);

// ── Lotus color choice ─────────────────────────────────────────────────────
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

// ── Cancel pending activate ────────────────────────────────────────────────
const handleCancelActivate = useCallback(() => {
setPendingActivate(null);
selectCard(null);
selectTarget(null);
}, [selectCard, selectTarget]);

// ── Graveyard popover handlers ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────

const s = state;
const pMana = Object.values(s.p.mana).reduce((a, b) => a + b, 0);
const oMana = Object.values(s.o.mana).reduce((a, b) => a + b, 0);

return (
<div style={{
height: ‘100vh’, width: ‘100vw’,
background: ‘#0a0e08’,
display: ‘flex’, flexDirection: ‘column’,
overflow: ‘hidden’,
fontFamily: “‘Crimson Text’,serif”,
}}>

```
  {/* ── GAME OVER OVERLAY ─────────────────────────────────────────────── */}
  {s.over && (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{s.over.winner === 'p' ? '✦' : '💀'}</div>
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

  {/* ── CASTLE MODIFIER BANNER ────────────────────────────────────────── */}
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

  {/* ── ANTE BANNER ───────────────────────────────────────────────────── */}
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

  {/* ── TOP BAR: ruleset / turn / phase tracker / forfeit ────────────── */}
  <div style={{
    padding: '5px 10px',
    borderBottom: '2px solid rgba(200,160,40,.3)',
    background: 'rgba(0,0,0,.7)',
    display: 'flex', flexDirection: 'column', gap: 4,
    flexShrink: 0,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontFamily: "'Cinzel',serif", color: '#d0a040', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {config.ruleset.name}
        </span>
        <span style={{ fontSize: 10, color: '#a09050', whiteSpace: 'nowrap' }}>T{s.turn}</span>
        {config.ruleset.manaBurn && (
          <span style={{ fontSize: 9, color: '#ee6030', fontFamily: "'Cinzel',serif", fontWeight: 700, whiteSpace: 'nowrap' }}>
            ⚠ BURN
          </span>
        )}
        {s.active === 'o' && (
          <span style={{ fontSize: 10, color: '#9090dd', animation: 'pulse 1s infinite', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
            Opp thinking…
          </span>
        )}
      </div>
      <button
        onClick={() => onDuelEnd('forfeit', s)}
        style={{
          background: 'rgba(60,20,10,.7)',
          border: '1px solid rgba(180,80,40,.5)',
          color: '#e07050',
          padding: '3px 10px', borderRadius: 5,
          cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif",
          flexShrink: 0,
        }}
      >
        Forfeit
      </button>
    </div>
    <PhaseBar phase={s.phase} />
  </div>

  {/* ── MAIN LAYOUT ───────────────────────────────────────────────────── */}
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

    {/* ── BATTLEFIELD COLUMN ──────────────────────────────────────────── */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Opponent side */}
      <div style={{
        flex: '0 0 auto', maxHeight: '45vh', overflow: 'hidden',
        borderBottom: '2px solid #6a2010',
        background: 'linear-gradient(180deg,#1a0c08,#120808)',
      }}>
        {/* Opponent info bar */}
        <div style={{
          padding: '7px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(180,80,30,.3)',
          background: 'rgba(0,0,0,.4)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#e05030', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
              OPPONENT
            </span>
            <span style={{
              fontSize: 24, fontWeight: 700, fontFamily: "'Cinzel',serif",
              color: s.o.life <= 5 ? '#ff2020' : s.o.life <= 10 ? '#e06030' : '#ff9060',
              animation: s.o.life <= 5 ? 'pulse 1s infinite' : s.o.lifeAnim === 'damage' ? 'damageFlash .4s ease-out' : s.o.lifeAnim === 'heal' ? 'healFlash .4s ease-out' : 'none',
            }}>
              {s.o.life}
            </span>
            <div style={{ width: 70, height: 8, background: '#1a0800', borderRadius: 4, overflow: 'hidden', border: '1px solid #6a3010' }}>
              <div style={{
                width: `${Math.max(0, (s.o.life / config.ruleset.startingLife) * 100)}%`,
                height: '100%',
                background: s.o.life <= 5 ? '#cc1010' : 'linear-gradient(90deg,#aa3010,#dd5020)',
                transition: 'width .4s', borderRadius: 4,
              }} />
            </div>
          </div>
          <span style={{ fontSize: 11, color: '#907050' }}>
            📚{s.o.lib.length} ✋{s.o.hand.length} 🪦{s.o.gy.length}
          </span>
          {oMana > 0 && <ManaPoolDisplay pool={s.o.mana} size={13} />}
          {/* Face-down hand */}
          <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
            {s.o.hand.map((_, i) => (
              <div key={i} style={{
                width: 26, height: 40,
                background: 'linear-gradient(135deg,#2a1a10,#1a100a)',
                border: '1px solid #5a3820', borderRadius: 4,
                boxShadow: '0 2px 4px rgba(0,0,0,.5)',
              }} />
            ))}
          </div>
        </div>

        {/* Opponent battlefield */}
        <OpponentBattlefield
          state={s}
          onCardClick={handleCardClick}
          onTipEnter={handleTipEnter}
          onTipLeave={handleTipLeave}
        />
      </div>

      {/* Action bar */}
      <ActionBar
        state={s}
        onCast={handleCast}
        onAdvancePhase={advancePhase}
        onResolveStack={resolveStack}
        onSetX={setX}
        pendingActivate={pendingActivate}
        onCancelActivate={handleCancelActivate}
      />

      {/* Player battlefield */}
      <PlayerBattlefield
        state={s}
        onCardClick={handleCardClick}
        onActivate={handleActivate}
        onTipEnter={handleTipEnter}
        onTipLeave={handleTipLeave}
      />

      {/* Player info bar */}
      <div style={{
        flexShrink: 0,
        padding: '6px 14px',
        borderTop: '1px solid rgba(80,160,40,.3)',
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#60ee60', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>YOU</span>
          <span style={{
            fontSize: 24, fontWeight: 700, fontFamily: "'Cinzel',serif",
            color: s.p.life <= 5 ? '#ff2020' : s.p.life <= 10 ? '#e06030' : '#60ee60',
            animation: s.p.life <= 5 ? 'pulse 1s infinite' : s.p.lifeAnim === 'damage' ? 'damageFlash .4s ease-out' : s.p.lifeAnim === 'heal' ? 'healFlash .4s ease-out' : 'none',
          }}>
            {s.p.life}
          </span>
          <div style={{ width: 70, height: 8, background: '#081808', borderRadius: 4, overflow: 'hidden', border: '1px solid #2a6020' }}>
            <div style={{
              width: `${Math.max(0, (s.p.life / config.ruleset.startingLife) * 100)}%`,
              height: '100%',
              background: s.p.life <= 5 ? '#cc1010' : 'linear-gradient(90deg,#208020,#40cc40)',
              transition: 'width .4s', borderRadius: 4,
            }} />
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#706850' }}>📚{s.p.lib.length} 🪦{s.p.gy.length}</span>
        {pMana > 0 && (
          <ManaPoolDisplay
            pool={s.p.mana}
            manaBurn={config.ruleset.manaBurn}
            size={14}
          />
        )}
        <button
          onClick={mulligan}
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,0,0,.4)',
            border: '1px solid rgba(160,120,60,.4)',
            color: '#c0a050',
            padding: '4px 10px', borderRadius: 5,
            cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif",
          }}
        >
          Mulligan
        </button>
      </div>

      {/* Player hand */}
      <Hand
        state={s}
        onCardClick={handleCardClick}
        onTipEnter={handleTipEnter}
        onTipLeave={handleTipLeave}
      />
    </div>

    {/* ── RIGHT SIDEBAR: graveyards / exile / ruleset flags / log ─────── */}
    <div style={{
      width: 'clamp(160px,22vw,210px)',
      borderLeft: '2px solid rgba(180,140,60,.25)',
      display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg,#0e0c08,#0a0a08)',
      flexShrink: 0,
    }}>
      {/* Graveyards */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(180,140,60,.2)' }}>
        <div style={{ fontSize: 11, color: '#c0a040', fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
          GRAVEYARDS
        </div>
        {/* Player graveyard */}
        <div
          className="zone graveyard player-graveyard"
          onClick={() => openGraveyardPopover('p', 'reference')}
        >
          <h4>Graveyard ({s.p.gy.length})</h4>
          {s.p.gy.length > 0 && (
            <div className="card-preview">{s.p.gy[s.p.gy.length - 1].name}</div>
          )}
        </div>

        {/* AI graveyard */}
        <div
          className="zone graveyard ai-graveyard"
          onClick={() => openGraveyardPopover('a', 'reference')}
        >
          <h4>Graveyard ({s.o.gy.length})</h4>
          {s.o.gy.length > 0 && (
            <div className="card-preview">{s.o.gy[s.o.gy.length - 1].name}</div>
          )}
        </div>
      </div>

      {/* Exile zone (Modern+ only) */}
      {config.ruleset.exileZone && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(180,140,60,.15)' }}>
          <div style={{ fontSize: 10, color: '#7060a0', fontFamily: "'Cinzel',serif" }}>
            EXILE: {s.p.exile.length} / {s.o.exile.length}
          </div>
        </div>
      )}

      {/* Ruleset flags */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(180,140,60,.15)' }}>
        <div style={{ fontSize: 11, color: '#c0a040', fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
          RULESET
        </div>
        {[
          { l: 'Mana Burn',   v: config.ruleset.manaBurn },
          { l: 'Stack',       v: config.ruleset.stackType },
          { l: 'Deathtouch', v: config.ruleset.deathtouch },
          { l: 'Exile',       v: config.ruleset.exileZone },
        ].map(f => (
          <div key={f.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: "'Fira Code',monospace", marginBottom: 3 }}>
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

      {/* Game log */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '6px 0' }}>
        <div style={{ fontSize: 11, color: '#c0a040', fontFamily: "'Cinzel',serif", letterSpacing: 1, padding: '0 12px 6px', fontWeight: 700 }}>
          GAME LOG
        </div>
        <DuelLog log={s.log} />
      </div>
    </div>
  </div>

  {/* ── MODALS ────────────────────────────────────────────────────────── */}

  {/* Black Lotus color picker */}
  {showLotus && (
    <LotusColorPicker onChoose={handleLotusChoose} onCancel={handleLotusCancel} />
  )}

  {/* Birds of Paradise color picker */}
  {showBop && (
    <BopColorPicker onChoose={handleBopChoose} onCancel={handleBopCancel} />
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
</div>
```

);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**

- Resolve a sensible default target for a spell when the player hasn’t
- explicitly clicked one. DuelCore will validate — this is just a UX convenience.
  */
  function resolveDefaultTarget(card, state) {
  const { effect } = card;
  if ([‘damage3’, ‘damage5’, ‘damageX’, ‘psionicBlast’, ‘chainLightning’].includes(effect)) {
  return ‘o’;
  }
  if ([‘draw3’, ‘gainLife3’, ‘gainLifeX’, ‘tutor’, ‘drawX’].includes(effect)) {
  return state.selTgt || ‘p’;
  }
  if ([‘destroy’, ‘exileCreature’, ‘bounce’, ‘destroyArtifact’, ‘destroyArtOrEnch’].includes(effect)) {
  return state.selTgt || null;
  }
  return state.selTgt || null;
  }