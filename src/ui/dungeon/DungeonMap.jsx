// src/ui/dungeon/DungeonMap.jsx
// Dungeon 24×16 CSS-grid renderer with keyboard movement and entity tokens.
// Presentation only — all state lives in OverworldGame. Per SYSTEMS.md §9.

import React, { useEffect } from 'react';

const TILE_SIZE = 28;

// ─── TILE STYLE ───────────────────────────────────────────────────────────────

function tileBackground(cell) {
  if (!cell.revealed) return '#050302';
  if (cell.type === 'WALL') return '#0d0b09';
  return '#2a2218';
}

function tileBorder(cell) {
  if (!cell.revealed) return 'none';
  if (cell.type === 'WALL') return 'none';
  return '1px solid #1a1408';
}

// Returns true if any cardinal neighbor has lit:true (for torch tint)
function isAdjacentToLit(grid, x, y) {
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  return dirs.some(([dx, dy]) => {
    const cell = grid[y + dy]?.[x + dx];
    return cell && cell.lit;
  });
}

// ─── ENTITY TOKEN ─────────────────────────────────────────────────────────────

function EntityToken({ entity }) {
  if (entity.type === 'ENEMY') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
        <span style={{
          fontSize: 14, lineHeight: 1,
          filter: 'drop-shadow(0 0 4px #cc2020)',
        }}>👹</span>
        <span style={{
          fontSize: 6, color: '#e06060',
          fontFamily: "'Cinzel', serif",
          lineHeight: 1.1,
          maxWidth: TILE_SIZE - 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textAlign: 'center',
        }}>{entity.name}</span>
      </div>
    );
  }
  if (entity.type === 'TREASURE') {
    return (
      <span style={{
        fontSize: 14, lineHeight: 1,
        filter: 'drop-shadow(0 0 4px #c0a020)',
        zIndex: 2,
      }}>💰</span>
    );
  }
  if (entity.type === 'EXIT') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
        <span style={{
          fontSize: 14, lineHeight: 1,
          filter: 'drop-shadow(0 0 4px rgba(255,255,255,.9))',
        }}>🚪</span>
        <span style={{
          fontSize: 6, color: '#d0d0c0',
          fontFamily: "'Cinzel', serif",
          lineHeight: 1.1,
        }}>Exit</span>
      </div>
    );
  }
  return null;
}

// ─── DUNGEON MAP ──────────────────────────────────────────────────────────────

export default function DungeonMap({ dungeon, playerPos, onMove, onEntityInteract }) {
  // Keyboard handler — Arrow keys + WASD
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowUp'    || e.key === 'w') { e.preventDefault(); onMove(0, -1); }
      else if (e.key === 'ArrowDown'  || e.key === 's') { e.preventDefault(); onMove(0,  1); }
      else if (e.key === 'ArrowLeft'  || e.key === 'a') { e.preventDefault(); onMove(-1, 0); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); onMove(1,  0); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onMove]);

  // Build entity lookup: "x,y" → entity
  const entityMap = {};
  dungeon.entities.forEach(e => { entityMap[`${e.x},${e.y}`] = e; });

  // Flatten grid to a single cell list for CSS grid
  const cells = dungeon.grid.flatMap((row, y) =>
    row.map((cell, x) => ({ cell, x, y }))
  );

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: 8,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${dungeon.width}, ${TILE_SIZE}px)`,
        gridTemplateRows:    `repeat(${dungeon.height}, ${TILE_SIZE}px)`,
        border: '2px solid rgba(200,160,40,.25)',
        boxShadow: '0 0 40px rgba(0,0,0,.9)',
        flexShrink: 0,
      }}>
        {cells.map(({ cell, x, y }) => {
          const isPlayer = x === playerPos.x && y === playerPos.y;
          const entity   = entityMap[`${x},${y}`];
          const showEntity = cell.revealed && entity && !entity.defeated && !entity.collected;

          // Torch tint: cell adjacent to a lit FLOOR tile
          const litTint = cell.revealed && cell.type !== 'WALL' && isAdjacentToLit(dungeon.grid, x, y)
            ? 'rgba(255,160,40,0.08)'
            : null;

          const bg = litTint
            ? `${tileBackground(cell)}`  // base color; tint applied via overlay
            : tileBackground(cell);

          return (
            <div
              key={`${x},${y}`}
              style={{
                width: TILE_SIZE, height: TILE_SIZE,
                background: bg,
                border: tileBorder(cell),
                boxSizing: 'border-box',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}
            >
              {/* Torch tint overlay */}
              {litTint && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: litTint,
                  pointerEvents: 'none',
                }} />
              )}

              {/* Entity token */}
              {showEntity && <EntityToken entity={entity} />}

              {/* Player wizard token */}
              {isPlayer && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                  animation: 'wizPulse 2s ease-in-out infinite',
                  zIndex: 10,
                  filter: 'drop-shadow(0 0 6px rgba(255,220,80,.9))',
                }}>
                  🧙
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
