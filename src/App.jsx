// src/App.jsx
// Root application component.
// Routes between: title ? overworld (Game) ? duel (DuelScreen) ? score.
// Per MECHANICS_INDEX.md S8.1 and GDD S7

import React, { useState, useReducer, useCallback, useRef, useMemo } from 'react';

class GameErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('GameErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#050302', color: '#ff8060',
          fontFamily: 'monospace', padding: 24, whiteSpace: 'pre-wrap',
          overflowY: 'auto'
        }}>
          <div style={{ color: '#f0c040', fontFamily: "'Cinzel',serif", fontSize: 18, marginBottom: 16 }}>
            ⚠ Game Error
          </div>
          <div style={{ marginBottom: 12, color: '#ff6040', fontSize: 14 }}>
            {this.state.error.message}
          </div>
          <div style={{ color: '#806040', fontSize: 11 }}>
            {this.state.error.stack}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 24, background: 'transparent',
              border: '1px solid #c0a040', color: '#c0a040',
              padding: '8px 20px', borderRadius: 4, cursor: 'pointer',
              fontFamily: "'Cinzel',serif", fontSize: 12
            }}
          >
            ← Back to Title
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// -- Engine ------------------------------------------------------------------
import { generateMap, findPath, revealAround, TERRAIN, COLORS, MANA_HEX, MANA_SYM, MAGE_NAMES, MAGE_ARCHS, CASTLE_MODIFIERS, DUNGEON_ARCHETYPES, MONSTER_TABLE } from './engine/MapGenerator.js';
import { duelReducer, buildDuelState, makeId, shuffle, PHASE_SEQ, PHASE_LBL, COMBAT_PHASES, isCre, isLand, isInst, isArt, isEnch, isPerm, isSort, canPay, applyOvergrowthTap, getBF, getPow, getTou, hasKw, checkDeath } from './engine/DuelCore.js';
import { aiDecide } from './engine/AI.js';

// -- Data --------------------------------------------------------------------
import { CARD_DB, ARCHETYPES, getCardById, POWERED_NINE_IDS } from './data/cards.js';
import RULESETS from './data/rulesets.js';

// -- UI ----------------------------------------------------------------------
import { TitleScreen } from './ui/layout/GameWrapper.jsx';
import { ScoreScreen } from './ui/overworld/EncounterModal.jsx';
import DuelScreen from './DuelScreen.tsx'; // assembled below ? see note
import OverworldGame from './OverworldGame.jsx'; // assembled below ? see note

// --- NOTE ---------------------------------------------------------------------
// DuelScreen and OverworldGame are large compound components that wire the engine
// to the UI. They live in separate files for maintainability.
// If those files haven't been created yet, App.jsx still boots to TitleScreen.

export default function App() {
const [screen, setScreen]     = useState("title");   // title | game | score
const [startConfig, setStart] = useState(null);
const [scoreData, setScore]   = useState(null);

const handleStart = (config) => {
setStart({ ...config, timestamp: Date.now() });
setScreen("game");
};

const handleScore = (data) => {
setScore(data);
setScreen("score");
};

const handleQuit = () => setScreen("title");
const handleNewGame = () => { setScore(null); setScreen("title"); };

if (screen === "score" && scoreData) {
return <ScoreScreen stats={scoreData} onNewGame={handleNewGame} />;
}

if (screen === "game" && startConfig) {
  return (
    <GameErrorBoundary key={startConfig.timestamp}>
      <OverworldGame startConfig={startConfig} onQuit={handleQuit} onScore={handleScore} />
    </GameErrorBoundary>
  );
}

return <TitleScreen onStart={handleStart} />;
}
