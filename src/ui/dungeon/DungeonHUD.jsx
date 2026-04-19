// src/ui/dungeon/DungeonHUD.jsx
// Slim status bar rendered above the dungeon grid.
// Presentation only — no engine state. Per SYSTEMS.md §9 (Dungeon System).

import React from 'react';

export default function DungeonHUD({
  dungeonName, mod, domColor,
  playerHP, playerMaxHP, playerGold,
  roomsCleared, totalRooms,
}) {
  const hpPct = playerMaxHP > 0 ? (playerHP / playerMaxHP) * 100 : 0;
  const hpColor = hpPct > 50
    ? 'linear-gradient(90deg,#c04020,#e06040)'
    : 'linear-gradient(90deg,#800010,#c01020)';

  return (
    <div style={{
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
      padding: '6px 14px',
      background: 'rgba(0,0,0,.75)',
      borderBottom: '2px solid rgba(200,160,40,.3)',
      fontFamily: "'Crimson Text', serif",
    }}>

      {/* Dungeon name */}
      <span style={{
        fontSize: 13, fontFamily: "'Cinzel', serif",
        color: '#f0c040', letterSpacing: 1,
      }}>
        ⚑ {dungeonName}
      </span>

      {/* Modifier */}
      {mod && (
        <span style={{
          fontSize: 11, fontFamily: "'Cinzel', serif",
          color: '#b09050', background: 'rgba(80,60,0,.3)',
          border: '1px solid rgba(180,140,40,.3)',
          borderRadius: 4, padding: '1px 7px',
        }}
        title={mod.desc}>
          {mod.icon ? `${mod.icon} ` : ''}{mod.name}
        </span>
      )}

      {/* HP bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, color: '#c8a060', fontFamily: "'Cinzel', serif" }}>HP</span>
        <div style={{
          width: 80, height: 12,
          background: '#1a0a00', borderRadius: 6,
          border: '1px solid #5a3010', overflow: 'hidden',
        }}>
          <div style={{
            width: `${hpPct}%`, height: '100%',
            background: hpColor, transition: 'width .4s', borderRadius: 6,
          }} />
        </div>
        <span style={{ fontSize: 11, color: '#e08060', fontFamily: "'Cinzel', serif", minWidth: 38 }}>
          {playerHP}/{playerMaxHP}
        </span>
      </div>

      {/* Gold */}
      <span style={{ fontSize: 12, color: '#f0c040', fontFamily: "'Cinzel', serif" }}>
        ⚙ {playerGold}g
      </span>

      {/* Rooms cleared */}
      <span style={{ fontSize: 11, color: '#a09060', fontFamily: "'Cinzel', serif" }}>
        Rooms {roomsCleared}/{totalRooms}
      </span>

      {/* Controls hint */}
      <span style={{
        marginLeft: 'auto', fontSize: 10,
        color: '#504030', fontFamily: "'Cinzel', serif", letterSpacing: 1,
      }}>
        WASD / ↑↓←→ to move
      </span>
    </div>
  );
}
