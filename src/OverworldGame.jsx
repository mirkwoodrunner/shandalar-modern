// src/OverworldGame.jsx
// Routing shell. Calls useOverworldController once, routes duel/dungeon screens,
// delegates overworld layout to OverworldGameDesktop or OverworldGameMobile.

import React, { useState } from 'react';
import { useMedia } from './hooks/useMedia';
import { useOverworldController } from './hooks/useOverworldController';
import OverworldGameDesktop from './ui/overworld/OverworldGameDesktop';
import OverworldGameMobile from './ui/Mobile/OverworldGameMobile';
import DuelScreen from './DuelScreen.tsx';
import DuelScreenMobile from './ui/Mobile/DuelScreenMobile';
import DungeonHUD from './ui/dungeon/DungeonHUD.jsx';
import DungeonMap from './ui/dungeon/DungeonMap.jsx';
import TreasureModal from './ui/dungeon/TreasureModal.jsx';

export default function OverworldGame({ startConfig, onQuit, onScore }) {
  // Snapshotted at mount — prevents layout swaps on orientation change that would
  // re-mount the component and lose all game state.
  const [overworldIsCompact] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 640
  );
  // Live value feeds controller viewport sizing only (updates safely via useMemo).
  const isCompactMobile = useMedia('(max-width: 640px)');

  const ctrl = useOverworldController({ startConfig, onQuit, onScore, isCompactMobile });

  const {
    duelCfg, duelScreenIsCompact,
    dungeonScreen, dungeonPlayerPos, dungeonProg,
    treasureModal, setTreasureModal,
    player, handleDuelEnd, handleDungeonMove, handleDungeonInteract,
    duelKeyRef,
  } = ctrl;

  // -- Duel bridge ----------------------------------------------------------
  if (duelCfg) {
    return duelScreenIsCompact ? (
      <DuelScreenMobile
        key={duelKeyRef.current}
        config={duelCfg}
        onDuelEnd={handleDuelEnd}
      />
    ) : (
      <DuelScreen
        key={duelKeyRef.current}
        config={duelCfg}
        onDuelEnd={handleDuelEnd}
      />
    );
  }

  // -- Dungeon map screen ---------------------------------------------------
  if (dungeonScreen && dungeonPlayerPos) {
    return (
      <div style={{
        height: '100vh', width: '100vw',
        background: '#050302',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Crimson Text', serif",
      }}>
        <DungeonHUD
          dungeonName={dungeonScreen.name}
          mod={dungeonScreen.mod}
          domColor={dungeonScreen.domColor}
          playerHP={player.hp}
          playerMaxHP={player.maxHP}
          playerGold={player.gold}
          roomsCleared={dungeonScreen.entities.filter(e => e.type === 'ENEMY' && e.defeated).length}
          totalRooms={dungeonProg?.totalRooms || dungeonScreen.numRooms}
        />
        <DungeonMap
          dungeon={dungeonScreen}
          playerPos={dungeonPlayerPos}
          onMove={handleDungeonMove}
          onEntityInteract={handleDungeonInteract}
        />
        {treasureModal && (
          <TreasureModal
            treasure={treasureModal}
            onCollect={() => setTreasureModal(null)}
          />
        )}
      </div>
    );
  }

  // -- Overworld layout -----------------------------------------------------
  return overworldIsCompact
    ? <OverworldGameMobile ctrl={ctrl} onQuit={onQuit} />
    : <OverworldGameDesktop ctrl={ctrl} onQuit={onQuit} />;
}
