// src/ui/dungeon/DungeonMap.jsx
// Dungeon 24x16 CSS-grid renderer with keyboard movement and entity tokens.
// Presentation only - all state lives in OverworldGame. Per SYSTEMS.md S9.

import React, { useEffect, useState } from 'react';

const TILE_SIZE = 28;

// --- ENEMY SPRITE MAP ---------------------------------------------------------
// Single edit point for archKey -> sprite assignment.
// Each entry: [tier1_base, tier2_base, tier3_base] (frame suffix _f0.._f3 appended by animator)
export const ENEMY_SPRITE_MAP = {
  WHITE_WEENIE:     ['knight_f_idle_anim',   'knight_m_idle_anim',   'big_zombie_idle_anim'],
  BLUE_CONTROL:     ['wizzard_f_idle_anim',   'wizzard_m_idle_anim',  'necromancer_anim'],
  BLUE_TEMPO:       ['elf_f_idle_anim',       'elf_m_idle_anim',      'lizard_m_idle_anim'],
  BLACK_REANIMATOR: ['skelet_idle_anim',      'tiny_zombie_idle_anim','big_demon_idle_anim'],
  BLACK_CONTROL:    ['imp_idle_anim',         'masked_orc_idle_anim', 'ogre_idle_anim'],
  RED_BURN:         ['goblin_idle_anim',      'orc_warrior_idle_anim','chort_idle_anim'],
  RED_AGGRO:        ['orc_shaman_idle_anim',  'wogol_idle_anim',      'big_demon_idle_anim'],
  GREEN_STOMPY:     ['lizard_f_idle_anim',    'dwarf_m_idle_anim',    'ogre_idle_anim'],
  ARTIFACT_CONTROL: ['pumpkin_dude_idle_anim','swampy_anim',          'muddy_anim'],
};

// --- WALL AUTOTILING ----------------------------------------------------------

// Pure function: given the grid and coords of a WALL cell, returns the sprite name
// to use based on 4-neighbor adjacency. Fully unit-testable in isolation.
export function getWallVariant(grid, x, y) {
  const isWall = (cx, cy) => {
    const cell = grid[cy]?.[cx];
    // Out-of-bounds and WALL both count as wall for autotiling
    return !cell || cell.type === 'WALL';
  };
  const N = isWall(x, y - 1);
  const S = isWall(x, y + 1);
  const E = isWall(x + 1, y);
  const W = isWall(x - 1, y);

  // South neighbor is floor: this wall has a visible front face
  if (!S) {
    if (!W && !E) return 'wall_top_mid';   // isolated pillar
    if (!W) return 'wall_top_left';        // left edge of wall run (open to west)
    if (!E) return 'wall_top_right';       // right edge (open to east)
    return 'wall_top_mid';                 // run of walls (both sides walled)
  }
  // North is floor but south is wall: outer-corner style
  if (!N) {
    if (!W && !E) return 'wall_outer_top_left';
    if (!W) return 'wall_outer_top_left';
    if (!E) return 'wall_outer_top_right';
    return 'wall_mid';
  }
  // Fully enclosed interior: pick by E/W openness
  if (!W && !E) return 'wall_mid';
  if (!W) return 'wall_left';
  if (!E) return 'wall_right';
  return 'wall_mid';
}

// --- FLOOR TILE VARIANT -------------------------------------------------------

// Position-hash floor variant: deterministic, no Math.random(), no flicker.
const FLOOR_VARIANTS = 8;
function floorVariant(x, y) {
  return ((x * 31 + y * 17) % FLOOR_VARIANTS) + 1;
}

// --- SPRITE IMAGE HELPERS -----------------------------------------------------

const SPRITE_BASE = '/assets/dungeon/sprites/';

function spriteUrl(name) {
  return `${SPRITE_BASE}${name}.png`;
}

const spriteStyle = {
  width: TILE_SIZE,
  height: TILE_SIZE,
  imageRendering: 'pixelated',
  display: 'block',
};

// --- ANIMATED SPRITE ----------------------------------------------------------

// Cycles through 4-frame idle animations at ~600ms per frame.
// frameCount: how many frames to cycle (4 for enemy/player, 3 for chest)
// hold: if true, stop on last frame instead of looping
function useAnimFrame(frameCount, intervalMs = 600, hold = false) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => {
        if (hold && f >= frameCount - 1) return f;
        return (f + 1) % frameCount;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [frameCount, intervalMs, hold]);
  return frame;
}

// --- TILE STYLE (unrevealed / revealed) --------------------------------------

function tileBackground(cell) {
  if (!cell.revealed) return '#050302';
  if (cell.type === 'WALL') return '#0d0b09';
  return '#1e1811';
}

function tileBorder() {
  return 'none';
}

// Returns true if any cardinal neighbor has lit:true (for torch tint)
function isAdjacentToLit(grid, x, y) {
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  return dirs.some(([dx, dy]) => {
    const cell = grid[y + dy]?.[x + dx];
    return cell && cell.lit;
  });
}

// --- ENTITY TOKEN -------------------------------------------------------------

function EnemyToken({ entity }) {
  const spriteBase = ENEMY_SPRITE_MAP[entity.archKey];
  // Fallback if archKey not in map
  const base = spriteBase ? spriteBase[(entity.tier || 1) - 1] : 'imp_idle_anim';
  const frame = useAnimFrame(4, 600);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
      <div style={{ position: 'relative', width: TILE_SIZE, height: TILE_SIZE }}>
        <div style={{
          position: 'absolute',
          bottom: 1,
          left: '15%',
          right: '15%',
          height: 4,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.6)',
          filter: 'blur(1px)',
          zIndex: 1,
        }} />
        <img
          src={spriteUrl(`${base}_f${frame}`)}
          alt={entity.name || 'enemy'}
          style={{
            ...spriteStyle,
            position: 'relative',
            zIndex: 2,
            filter: 'drop-shadow(0 0 4px #cc2020)',
          }}
        />
      </div>
      <span style={{
        fontSize: 6, color: '#e06060',
        fontFamily: "'Cinzel', serif",
        lineHeight: 1.1,
        maxWidth: TILE_SIZE - 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textAlign: 'center',
        marginTop: 2,
      }}>{entity.name}</span>
    </div>
  );
}

function TreasureToken({ entity }) {
  const hasCard = entity.cardRarity != null;
  const baseAnim = hasCard ? 'chest_full_open_anim' : 'chest_empty_open_anim';
  const frame = useAnimFrame(3, 400, true); // 3-frame, hold on last
  return (
    <div style={{ position: 'relative', width: TILE_SIZE, height: TILE_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'absolute',
        bottom: 1,
        left: '10%',
        right: '10%',
        height: 4,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.65)',
        filter: 'blur(1px)',
        zIndex: 1,
      }} />
      <img
        src={spriteUrl(`${baseAnim}_f${frame}`)}
        alt="treasure"
        style={{
          ...spriteStyle,
          position: 'relative',
          zIndex: 2,
          filter: 'drop-shadow(0 0 4px #c0a020)',
        }}
      />
    </div>
  );
}

function ExitToken() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
      <div style={{ position: 'relative', width: TILE_SIZE, height: TILE_SIZE }}>
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '15%',
          right: '15%',
          height: 4,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.6)',
          filter: 'blur(1px)',
          zIndex: 1,
        }} />
        <img
          src={spriteUrl('floor_ladder')}
          alt="exit"
          style={{
            ...spriteStyle,
            position: 'relative',
            zIndex: 2,
            filter: 'drop-shadow(0 0 6px rgba(255,255,200,.95))',
            animation: 'exitPulse 1.8s ease-in-out infinite',
          }}
        />
      </div>
      <span style={{
        fontSize: 6, color: '#d0d0c0',
        fontFamily: "'Cinzel', serif",
        lineHeight: 1.1,
        marginTop: 2,
      }}>EXIT</span>
    </div>
  );
}

function EntityToken({ entity }) {
  if (entity.type === 'ENEMY') return <EnemyToken entity={entity} />;
  if (entity.type === 'TREASURE') return <TreasureToken entity={entity} />;
  if (entity.type === 'EXIT') return <ExitToken />;
  return null;
}

// --- PLAYER TOKEN -------------------------------------------------------------

function PlayerToken({ style }) {
  const frame = useAnimFrame(4, 600);
  return (
    <div style={{
      ...style,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10,
    }}>
      <div style={{
        position: 'absolute',
        bottom: 2,
        left: '15%',
        right: '15%',
        height: 5,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.65)',
        filter: 'blur(1.5px)',
        zIndex: 1,
      }} />
      <img
        src={spriteUrl(`wizzard_f_idle_anim_f${frame}`)}
        alt="player"
        style={{ ...spriteStyle, position: 'relative', zIndex: 2, filter: 'drop-shadow(0 0 6px rgba(255,220,80,.9))' }}
      />
    </div>
  );
}

// --- D-PAD BUTTON -------------------------------------------------------------

function DPadButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        background: 'linear-gradient(135deg, rgba(80,50,10,0.7), rgba(40,25,5,0.85))',
        border: '1px solid var(--brass, #c4a040)',
        borderRadius: 4,
        color: 'var(--brass, #c4a040)',
        fontSize: 16,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Cinzel', serif",
        lineHeight: 1,
        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--brass-hi, #ffe080)';
        e.currentTarget.style.borderColor = 'var(--brass-hi, #ffe080)';
        e.currentTarget.style.boxShadow = '0 0 6px var(--brass-glow, rgba(196,160,64,.4))';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--brass, #c4a040)';
        e.currentTarget.style.borderColor = 'var(--brass, #c4a040)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.4)';
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {label}
    </button>
  );
}

// --- WALL FACADE SHADOW --------------------------------------------------------

// Pure function: true when a revealed floor cell sits directly south of a
// revealed wall cell, meaning it should carry a top-down "wall facade" shadow.
function shouldRenderFacadeShadow(grid, x, y) {
  const cell = grid[y]?.[x];
  if (!cell || cell.type === 'WALL' || !cell.revealed) return false;
  const northCell = grid[y - 1]?.[x];
  return !!(northCell && northCell.type === 'WALL' && northCell.revealed);
}

// --- DUNGEON MAP --------------------------------------------------------------

const TORCH_RADIUS = TILE_SIZE * 2.2;

export default function DungeonMap({ dungeon, playerPos, onMove, onEntityInteract }) {
  // Keyboard handler - Arrow keys + WASD
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

  // Build entity lookup: "x,y" -> entity
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
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'auto',
      padding: 8,
      minHeight: 0,
    }}>
      <style>{`
        @keyframes exitPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        @keyframes torchGlowFlicker {
          0%, 100% { opacity: 1; transform: scale(1); }
          25%       { opacity: 0.96; transform: scale(1.015); }
          50%       { opacity: 0.99; transform: scale(0.985); }
          75%       { opacity: 0.94; transform: scale(1.02); }
        }
      `}</style>
      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${dungeon.width}, ${TILE_SIZE}px)`,
        gridTemplateRows:    `repeat(${dungeon.height}, ${TILE_SIZE}px)`,
        border: '2px solid rgba(200,160,40,.25)',
        boxShadow: '0 0 40px rgba(0,0,0,.9)',
        flexShrink: 0,
      }}>
        {cells.map(({ cell, x, y }) => {
          const entity   = entityMap[`${x},${y}`];
          const showEntity = cell.revealed && entity && !entity.defeated && !entity.collected;

          // Torch tint overlay for cells adjacent to lit floor
          const litTint = cell.revealed && cell.type !== 'WALL' && isAdjacentToLit(dungeon.grid, x, y)
            ? 'rgba(255,160,40,0.08)'
            : null;

          // Wall facade shadow for floor cells directly south of a wall
          const hasFacadeShadow = shouldRenderFacadeShadow(dungeon.grid, x, y);

          // Sprite selection
          let tileSprite = null;
          if (cell.revealed) {
            if (cell.type === 'WALL') {
              tileSprite = getWallVariant(dungeon.grid, x, y);
            } else {
              // FLOOR or CORRIDOR
              tileSprite = `floor_${floorVariant(x, y)}`;
            }
          }

          return (
            <div
              key={`${x},${y}`}
              style={{
                width: TILE_SIZE, height: TILE_SIZE,
                background: tileBackground(cell),
                border: tileBorder(cell),
                boxSizing: 'border-box',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Floor/wall sprite */}
              {tileSprite && (
                <img
                  src={spriteUrl(tileSprite)}
                  alt=""
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    imageRendering: 'pixelated',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Torch tint overlay */}
              {litTint && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: litTint,
                  pointerEvents: 'none',
                  zIndex: 1,
                }} />
              )}

              {/* Wall facade shadow */}
              {hasFacadeShadow && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0,
                  height: '55%',
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.35), transparent)',
                  pointerEvents: 'none',
                  zIndex: 1,
                }} />
              )}

              {/* Entity token */}
              {showEntity && <EntityToken entity={entity} />}
            </div>
          );
        })}

        {/* Torchlight fog-of-war mask, follows player with smooth transition */}
        <div style={{
          position: 'absolute',
          left: playerPos.x * TILE_SIZE + TILE_SIZE / 2 - TORCH_RADIUS,
          top: playerPos.y * TILE_SIZE + TILE_SIZE / 2 - TORCH_RADIUS,
          width: TORCH_RADIUS * 2,
          height: TORCH_RADIUS * 2,
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 20,
          transition: 'left 0.15s ease-out, top 0.15s ease-out',
          background: 'radial-gradient(circle, rgba(255,200,120,0.16) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 60%)',
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.88)',
          animation: 'torchGlowFlicker 2.4s ease-in-out infinite',
        }} />

        {/* Player wizard token, absolutely positioned and slides between cells */}
        <PlayerToken style={{
          position: 'absolute',
          left: playerPos.x * TILE_SIZE,
          top: playerPos.y * TILE_SIZE,
          width: TILE_SIZE,
          height: TILE_SIZE,
          transition: 'left 0.15s ease-out, top 0.15s ease-out',
          zIndex: 10,
        }} />
      </div>

      {/* D-pad for mouse/touch users */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        marginTop: 12,
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DPadButton label="▲" onClick={() => onMove(0, -1)} />
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <DPadButton label="◀" onClick={() => onMove(-1, 0)} />
          <div style={{ width: 36, height: 36 }} />
          <DPadButton label="▶" onClick={() => onMove(1, 0)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DPadButton label="▼" onClick={() => onMove(0, 1)} />
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginTop: 8,
        fontSize: 11,
        color: '#8a6030',
        fontFamily: "'Cinzel', serif",
        letterSpacing: 0.5,
      }}>
        <span style={{ color: '#e06060' }}>{'✦'} Enemy</span>
        <span style={{ color: '#c0a020' }}>{'✦'} Treasure</span>
        <span style={{ color: '#d0d0c0' }}>{'✦'} Exit</span>
        <span style={{ color: '#f0e060' }}>{'●'} You</span>
      </div>
      <div style={{
        marginTop: 4,
        fontSize: 10,
        color: '#5a4020',
        fontFamily: "'Crimson Text', serif",
        fontStyle: 'italic',
      }}>
        Arrow keys / WASD to move {'·'} Step on Exit to leave dungeon
      </div>
    </div>
  );
}
