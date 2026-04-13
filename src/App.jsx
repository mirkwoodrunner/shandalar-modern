// src/App.jsx
// Root application component.
// Routes between: title → overworld (Game) ↔ duel (DuelScreen) → score.
// Per MECHANICS_INDEX.md §8.1 and GDD §7

import React, { useState, useReducer, useCallback, useRef, useMemo } from ‘react’;

// ── Engine ──────────────────────────────────────────────────────────────────
import { generateMap, findPath, revealAround, TERRAIN, COLORS, MANA_HEX, MANA_SYM, MAGE_NAMES, MAGE_ARCHS, CASTLE_MODIFIERS, DUNGEON_ARCHETYPES, MONSTER_TABLE } from ‘./engine/MapGenerator.js’;
import { duelReducer, buildDuelState, makeId, shuffle, PHASE_SEQ, PHASE_LBL, COMBAT_PHASES, isCre, isLand, isInst, isArt, isEnch, isPerm, isSort, canPay, applyOvergrowthTap, getBF, getPow, getTou, hasKw, checkDeath } from ‘./engine/DuelCore.js’;
import { aiDecide } from ‘./engine/AI.js’;

// ── Data ────────────────────────────────────────────────────────────────────
import { CARD_DB, ARCHETYPES, getCardById, POWERED_NINE_IDS } from ‘./data/cards.js’;
import RULESETS from ‘./data/rulesets.js’;

// ── UI ──────────────────────────────────────────────────────────────────────
import { TitleScreen } from ‘./ui/layout/GameWrapper.jsx’;
import { ScoreScreen } from ‘./ui/overworld/EncounterModal.jsx’;
import DuelScreen from ‘./DuelScreen.jsx’; // assembled below — see note
import OverworldGame from ‘./OverworldGame.jsx’; // assembled below — see note

// ─── NOTE ─────────────────────────────────────────────────────────────────────
// DuelScreen and OverworldGame are large compound components that wire the engine
// to the UI. They live in separate files for maintainability.
// If those files haven’t been created yet, App.jsx still boots to TitleScreen.

export default function App() {
const [screen, setScreen]     = useState(“title”);   // title | game | score
const [startConfig, setStart] = useState(null);
const [scoreData, setScore]   = useState(null);

const handleStart = (config) => {
setStart(config);
setScreen(“game”);
};

const handleScore = (data) => {
setScore(data);
setScreen(“score”);
};

const handleQuit = () => setScreen(“title”);
const handleNewGame = () => { setScore(null); setScreen(“title”); };

if (screen === “score” && scoreData) {
return <ScoreScreen stats={scoreData} onNewGame={handleNewGame} />;
}

if (screen === “game” && startConfig) {
// Lazy-load OverworldGame — if it exists
try {
return <OverworldGame startConfig={startConfig} onQuit={handleQuit} onScore={handleScore} />;
} catch {
return <div style={{ color:”#fff”, padding:40, fontFamily:“monospace” }}>OverworldGame.jsx not yet created. Check console.</div>;
}
}

return <TitleScreen onStart={handleStart} />;
}
