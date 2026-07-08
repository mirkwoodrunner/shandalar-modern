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

const GLOBAL_CINEMATIC_STYLES = `
  .shandalar-game-envelope {
    position: relative;
    width: 100vw;
    height: 100dvh;
    overflow: hidden;
    background-color: #050302;
  }
  .cinematic-vignette {
    position: fixed;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 120px rgba(0, 0, 0, 0.9);
    z-index: 9999;
  }
  .scanline-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%);
    background-size: 100% 4px;
    z-index: 9998;
    opacity: 0.35;
  }
  .dungeon-viewport-container {
    height: 100vh;
    width: 100vw;
    background: #050302;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Crimson Text', serif;
  }
`;

export default function OverworldGame({ startConfig, onQuit, onScore }) {
  // Snapshotted at mount -- prevents layout swaps on orientation change that would
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

  // Post-processing wrapper kept uniform across duel/dungeon/overworld screens.
  const wrapCinematic = (component) => (
    <div className="shandalar-game-envelope">
      <style>{GLOBAL_CINEMATIC_STYLES}</style>
      <div className="cinematic-vignette" />
      <div className="scanline-overlay" />
      {component}
    </div>
  );

  // -- Duel bridge ----------------------------------------------------------
  if (duelCfg) {
    return wrapCinematic(
      duelScreenIsCompact ? (
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
      )
    );
  }

  // -- Dungeon map screen ---------------------------------------------------
  if (dungeonScreen && dungeonPlayerPos) {
    return wrapCinematic(
      <div className="dungeon-viewport-container">
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
  return wrapCinematic(
    overworldIsCompact
      ? <OverworldGameMobile ctrl={ctrl} onQuit={onQuit} />
      : <OverworldGameDesktop ctrl={ctrl} onQuit={onQuit} />
  );
}
