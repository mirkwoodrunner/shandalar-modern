// src/App.jsx
// Root application component.
// Routes between: title -> overworld (Game) -> duel (DuelScreen) -> score.
// Per MECHANICS_INDEX.md S8.1 and GDD S7

import React, { useState, useEffect } from 'react';

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
            Game Error
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
            {'<-'} Back to Title
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// -- UI ----------------------------------------------------------------------
import { TitleScreen } from './ui/layout/GameWrapper.jsx';
import { ScoreScreen } from './ui/overworld/EncounterModal.jsx';
import OverworldGame from './OverworldGame.jsx';
import DuelScreen from './DuelScreen.tsx';
import DuelScreenMobile from './ui/Mobile/DuelScreenMobile';
import { getCardById } from './data/cards.js';

// OverworldGame owns the full game loop including duel transitions.

// ---------------------------------------------------------------------------
// Sandbox helpers (only evaluated when ?duel=sandbox is in the URL)
// ---------------------------------------------------------------------------

const COLOR_LAND = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };

function resolveManaSupport(cardIds) {
  const colorMax = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let maxGeneric = 0;
  let dominantColor = 'U';

  for (const id of cardIds) {
    const card = getCardById(id);
    if (!card || card.type === 'Land' || !card.cost || card.cost === '0') continue;
    const genericMatch = card.cost.match(/^(\d+)/);
    const generic = genericMatch ? parseInt(genericMatch[1], 10) : 0;
    const coloredPips = card.cost.replace(/\d/g, '').split('').filter(p => p in colorMax);
    const thisCount = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const pip of coloredPips) thisCount[pip]++;
    for (const color of Object.keys(colorMax)) {
      colorMax[color] = Math.max(colorMax[color], thisCount[color]);
    }
    maxGeneric = Math.max(maxGeneric, generic);
    const maxPips = Math.max(...Object.values(thisCount));
    if (maxPips > 0) {
      dominantColor = Object.keys(thisCount).find(c => thisCount[c] === maxPips) ?? dominantColor;
    }
  }

  const lands = [];
  for (const [color, count] of Object.entries(colorMax)) {
    for (let i = 0; i < count; i++) lands.push(COLOR_LAND[color]);
  }
  const genericLand = COLOR_LAND[dominantColor] ?? 'island';
  for (let i = 0; i < maxGeneric; i++) lands.push(genericLand);
  return lands;
}

function parseDecklistText(text) {
  const ids = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(.+?)\s+x(\d+)$/i);
    if (!m) continue;
    const name = m[1].trim();
    const qty  = parseInt(m[2], 10);
    const id   = name.toLowerCase().replace(/[^a-z0-9\s_]/g, '').replace(/\s+/g, '_');
    for (let i = 0; i < qty; i++) ids.push(id);
  }
  return ids;
}

const FALLBACK_DECK = [
  ...Array(20).fill('mountain'),
  ...Array(20).fill('lightning_bolt'),
];

// Evaluated once at module scope -- no re-render cost.
const _duelParam      = new URLSearchParams(window.location.search).get('duel');
const _overworldParam = new URLSearchParams(window.location.search).get('overworld');
const sandboxMode          = _duelParam === 'sandbox';
const sandboxMobileMode    = _duelParam === 'sandbox-mobile';
const overworldSandboxMode = _overworldParam === 'sandbox';

// ---------------------------------------------------------------------------
// Sandbox entry point
// ---------------------------------------------------------------------------

function SandboxApp() {
  const [deckIds, setDeckIds] = useState(null);

  useEffect(() => {
    fetch('/sandbox-decklist.txt')
      .then(r => r.text())
      .then(text => setDeckIds(parseDecklistText(text)))
      .catch(() => setDeckIds(FALLBACK_DECK));
  }, []);

  if (deckIds === null) {
    return <div data-testid="sandbox-loading">Loading sandbox...</div>;
  }

  const injectedIds = new URLSearchParams(window.location.search)
    .get('cards')?.split(',').filter(Boolean) ?? [];

  const landIds = injectedIds.length ? resolveManaSupport(injectedIds) : [];
  const forcedIds = [...landIds, ...injectedIds];

  const sandboxConfig = {
    pDeckIds: [...forcedIds, ...deckIds],
    oppArchKey: 'AGGRO_RED',
    ruleset: {
      name:             'Sandbox',
      startingLife:     20,
      startingHandSize: 7,
      manaBurn:         false,
      stackType:        'full',
      deathtouch:       true,
      exileZone:        false,
    },
    overworldHP:  20,
    castleMod:    null,
    anteEnabled:  false,
    sandbox:      true,
    forcedHandIds: forcedIds,
  };

  return (
    <div data-testid="duel-screen-wrapper">
      <DuelScreen
        config={sandboxConfig}
        onDuelEnd={() => { window.location.href = '/'; }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sandbox-mobile entry point (?duel=sandbox-mobile)
// Renders DuelScreenMobile directly so Playwright tests can exercise it
// without going through the full OverworldGame flow.
// ---------------------------------------------------------------------------

function SandboxMobileApp() {
  const [deckIds, setDeckIds] = useState(null);

  useEffect(() => {
    fetch('/sandbox-decklist.txt')
      .then(r => r.text())
      .then(text => setDeckIds(parseDecklistText(text)))
      .catch(() => setDeckIds(FALLBACK_DECK));
  }, []);

  if (deckIds === null) {
    return <div data-testid="sandbox-loading">Loading sandbox...</div>;
  }

  const injectedIds = new URLSearchParams(window.location.search)
    .get('cards')?.split(',').filter(Boolean) ?? [];

  const landIds = injectedIds.length ? resolveManaSupport(injectedIds) : [];
  const forcedIds = [...landIds, ...injectedIds];

  const sandboxMobileConfig = {
    pDeckIds: [...forcedIds, ...deckIds],
    oppArchKey: 'AGGRO_RED',
    ruleset: {
      name:             'Sandbox',
      startingLife:     20,
      startingHandSize: 7,
      manaBurn:         false,
      stackType:        'full',
      deathtouch:       true,
      exileZone:        false,
    },
    overworldHP:  20,
    castleMod:    null,
    anteEnabled:  false,
    sandbox:      true,
    forcedHandIds: forcedIds,
  };

  return (
    <div data-testid="duel-screen-wrapper">
      <DuelScreenMobile
        config={sandboxMobileConfig}
        onDuelEnd={() => { window.location.href = '/'; }}
      />
    </div>
  );
}


// ---------------------------------------------------------------------------
// Normal app
// ---------------------------------------------------------------------------

function SandboxOverworldApp() {
  return (
    <GameErrorBoundary>
      <OverworldGame
        startConfig={{
          color: 'U',
          name: 'Sandbox Mage',
          seed: 42,
          difficulty: 'APPRENTICE',
          sandbox: true,
        }}
        onQuit={() => { window.location.href = '/'; }}
        onScore={() => { window.location.href = '/'; }}
      />
    </GameErrorBoundary>
  );
}

export default function App() {
  if (sandboxMode)          return <SandboxApp />;
  if (sandboxMobileMode)    return <SandboxMobileApp />;
  if (overworldSandboxMode) return <SandboxOverworldApp />;
  return <NormalApp />;
}

function NormalApp() {
  const [screen, setScreen]     = useState('title');
  const [startConfig, setStart] = useState(null);
  const [scoreData, setScore]   = useState(null);

  const handleStart = (config) => {
    setStart({ ...config, timestamp: Date.now() });
    setScreen('game');
  };

  const handleScore = (data) => {
    setScore(data);
    setScreen('score');
  };

  const handleQuit = () => setScreen('title');
  const handleNewGame = () => { setScore(null); setScreen('title'); };

  if (screen === 'score' && scoreData) {
    return <ScoreScreen stats={scoreData} onNewGame={handleNewGame} />;
  }

  if (screen === 'game' && startConfig) {
    return (
      <GameErrorBoundary key={startConfig.timestamp}>
        <OverworldGame startConfig={startConfig} onQuit={handleQuit} onScore={handleScore} />
      </GameErrorBoundary>
    );
  }

  return <TitleScreen onStart={handleStart} />;
}
