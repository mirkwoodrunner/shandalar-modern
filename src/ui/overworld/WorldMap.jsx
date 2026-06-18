// src/ui/overworld/WorldMap.jsx
// Overworld map tile grid, HUD bar, mage status panel, map legend.
// Presentation only. Per MECHANICS_INDEX.md S7.2

import React from 'react';
import { TERRAIN, MANA_HEX, MANA_SYM, MAGE_NAMES, COLORS } from '../../engine/MapGenerator.js';
import { Sprite, SpriteStyles, spriteForMonster, spriteForHenchman } from './Sprite.jsx';
import {
  getGroundLayers,
  getDecorations,
  terrainGroup,
  SHEET_TILESET,
  TILE_PX,
} from './terrainRenderer.js';
import tilesetUrl from '../../assets/tiles/forest_tileset.png';
import decorationsUrl from '../../assets/tiles/forest_decorations.png';

const TILE_SIZE = 34;

// --- TILESHEET LOADER --------------------------------------------------------
// Module-level singleton: load the two PNGs once and notify subscribers when
// both attempts settle. Until then (and if an asset fails) tiles fall back to
// the flat TERRAIN_BG color so the map is never blank. No Math.random anywhere.
const _sheets = {
  tileset:     { img: null, ok: false },
  decorations: { img: null, ok: false },
};
let _loadStarted = false;
let _loadSettled = false;
const _subs = new Set();

function getSheet(key) {
  const s = _sheets[key];
  return s && s.ok ? s.img : null;
}

function _startSheetLoad() {
  if (_loadStarted || typeof Image === 'undefined') return;
  _loadStarted = true;
  const entries = [['tileset', tilesetUrl], ['decorations', decorationsUrl]];
  let remaining = entries.length;
  const done = () => {
    remaining -= 1;
    if (remaining === 0) {
      _loadSettled = true;
      _subs.forEach((fn) => fn());
    }
  };
  for (const [key, url] of entries) {
    const img = new Image();
    img.onload = () => { _sheets[key].img = img; _sheets[key].ok = true; done(); };
    img.onerror = () => { _sheets[key].ok = false; done(); };
    img.src = url;
  }
}

// Subscribes to sheet load completion; returns true once both loads settle.
function useTilesheets() {
  const [, force] = React.useReducer((c) => c + 1, 0);
  React.useEffect(() => {
    if (_loadSettled) return undefined;
    _startSheetLoad();
    _subs.add(force);
    return () => { _subs.delete(force); };
  }, []);
  return _loadSettled;
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const TERRAIN_CLASS = {
  PLAINS:   'ow-plains',
  FOREST:   'ow-forest',
  SWAMP:    'ow-swamp',
  MOUNTAIN: 'ow-mountain',
  ISLAND:   'ow-island',
  WATER:    'ow-water',
};

const TERRAIN_BG = {
  PLAINS:   '#b09858',
  FOREST:   '#2d5a2d',
  SWAMP:    '#3d3825',
  MOUNTAIN: '#706050',
  ISLAND:   '#2d4a62',
  WATER:    '#111e30',
};

// --- SINGLE TILE -------------------------------------------------------------

// Deterministic tile variant — coord hash, no Math.random()
// Returns a CSS class string. Mountain and no-transform always return ''.
const VARIANT_TRANSFORMS = {
  PLAINS:   ['', 'tile-icon-v1', 'tile-icon-v2', 'tile-icon-v3', 'tile-icon-v4', 'tile-icon-v5'],
  FOREST:   ['', 'tile-icon-v1'],
  SWAMP:    ['', 'tile-icon-v1'],
  MOUNTAIN: [''],
  ISLAND:   ['', 'tile-icon-v1', 'tile-icon-v2', 'tile-icon-v3', 'tile-icon-v4', 'tile-icon-v5'],
  WATER:    ['', 'tile-icon-v1', 'tile-icon-v2', 'tile-icon-v3', 'tile-icon-v4', 'tile-icon-v5'],
};

function getTileVariantClass(terrainId, x, y) {
  const variants = VARIANT_TRANSFORMS[terrainId] ?? [''];
  if (variants.length === 1) return '';
  const h = (x * 374761393 + y * 668265263) | 0;
  const idx = Math.abs((h ^ (h >> 13)) * 1274126177 | 0) % variants.length;
  return variants[idx];
}

export function MapTile({ tile, isPlayer, enemy = null, isFogEdge = false, tileSize = 34, rowIndex = 0, onClick, groundNeighbors = null }) {
  const t = tile.terrain;
  const s = tile.structure;

  const sheetsReady = useTilesheets();
  const terrainCanvasRef = React.useRef(null);

  // Same-group neighbor flags drive feathered patch-edge selection. Default to
  // "all same" (flat-center tiles) when neighbor data is unavailable.
  const gnN = groundNeighbors ? groundNeighbors.n : true;
  const gnS = groundNeighbors ? groundNeighbors.s : true;
  const gnE = groundNeighbors ? groundNeighbors.e : true;
  const gnW = groundNeighbors ? groundNeighbors.w : true;

  React.useEffect(() => {
    const cv = terrainCanvasRef.current;
    if (!cv) return;
    const tilesetImg = getSheet('tileset');
    // No tileset image (still loading or failed): leave canvas transparent so
    // the div's TERRAIN_BG fallback shows through. Never a blank tile.
    if (!tilesetImg) return;
    const decorImg = getSheet('decorations');

    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, tileSize, tileSize);

    const nsg = (dx, dy) => {
      if (dx === -1) return gnW;
      if (dx === 1) return gnE;
      if (dy === -1) return gnN;
      if (dy === 1) return gnS;
      return true;
    };

    const layers = getGroundLayers(t.id, tile.x, tile.y, nsg);
    for (const l of layers) {
      const img = l.sheet === SHEET_TILESET ? tilesetImg : decorImg;
      if (img) ctx.drawImage(img, l.sx, l.sy, TILE_PX, TILE_PX, 0, 0, tileSize, tileSize);
    }

    if (decorImg) {
      for (const d of getDecorations(t.id, tile.x, tile.y)) {
        const dw = d.w * d.scale;
        const dh = d.h * d.scale;
        ctx.drawImage(decorImg, d.sx, d.sy, d.w, d.h, d.anchorX - dw / 2, d.anchorY - dh, dw, dh);
      }
    }
  }, [t.id, tile.x, tile.y, tileSize, sheetsReady, gnN, gnS, gnE, gnW]);

  if (!tile.revealed) {
    return (
      <div
        className="ow-tile ow-fog"
        style={{ width: tileSize, height: tileSize, zIndex: rowIndex }}
        onClick={() => onClick(tile)}
      />
    );
  }

  const terrainClass = TERRAIN_CLASS[t.id] ?? '';
  const fogEdgeClass = isFogEdge ? 'ow-fog-edge' : '';
  const ml = tile.manaLink;
  const tileBg = TERRAIN_BG[t.id] ?? t.color;

  const castleColor   = tile.castleData?.color ? MANA_HEX[tile.castleData.color] : '#c4a040';
  const castleDefeated = tile.castleData?.defeated ?? false;
  const plaqueStyle   = s === 'CASTLE' ? {
    '--ring':      castleColor,
    '--ring-glow': hexToRgba(castleColor, 0.55),
  } : undefined;

  return (
    <div
      className={`ow-tile ${terrainClass} ${fogEdgeClass}`}
      style={{ background: tileBg, width: tileSize, height: tileSize, zIndex: rowIndex }}
      onClick={() => onClick(tile)}
    >
      {/* Terrain sprites -- drawn beneath all overlays. Transparent until the
          tilesheets load (or if they fail), letting the TERRAIN_BG fallback show. */}
      <canvas
        ref={terrainCanvasRef}
        className="ow-terrain-canvas"
        width={tileSize}
        height={tileSize}
        style={{
          position: 'absolute',
          inset: 0,
          width: tileSize,
          height: tileSize,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Mana link corruption overlay */}
      {ml && (
        <div
          className="ow-mana"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, ${hexToRgba(MANA_HEX[ml], 0.65)}, transparent 70%)`,
          }}
        />
      )}

      {/* Structure — plaque + label; dungeons hidden until clued */}
      {(s && (s !== 'DUNGEON' || tile.dungeonData?.clued)) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 2,
        }}>
          <div
            className={[
              'ow-plaque',
              s === 'TOWN'    ? 'ow-plaque-town'    : '',
              s === 'DUNGEON' ? 'ow-plaque-dungeon' : '',
              s === 'CASTLE'  ? 'ow-plaque-castle'  : '',
              s === 'CASTLE' && castleDefeated ? 'ow-plaque-castle-defeated' : '',
              s === 'RUIN'    ? 'ow-plaque-ruin'    : '',
            ].join(' ').trim()}
            style={plaqueStyle}
          >
            {s === 'TOWN'    && '\u{1F3D8}'}
            {s === 'DUNGEON' && '⚔'}
            {s === 'CASTLE'  && (castleDefeated ? '\u{1F3DA}' : '\u{1F3F0}')}
            {s === 'RUIN'    && '\u{1F3DB}'}
          </div>

          {s === 'TOWN' && tile.townData?.name && (
            <div className="ow-label">
              {tile.townData.name.slice(0, 7)}
            </div>
          )}
          {s === 'TOWN' && tile.townData?.conquered && (
            <div style={{
              position: 'absolute', top: 1, right: 2,
              fontSize: 8, lineHeight: 1,
              color: '#ff4444',
              textShadow: '0 0 3px #000',
              pointerEvents: 'none',
              zIndex: 3,
            }}>⚔</div>
          )}
          {s === 'CASTLE' && tile.castleData?.mage && (
            <div className="ow-label" style={{ color: castleColor }}>
              {tile.castleData.mage.slice(0, 6)}
            </div>
          )}
        </div>
      )}

      {/* Terrain biome is now conveyed by the sprite canvas + decoration scatter;
          the old faint emoji terrain icon is intentionally not rendered. */}

      {/* Player sprite */}
      {isPlayer && (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            boxShadow: 'inset 0 0 8px rgba(245,217,122,0.3)',
            pointerEvents: 'none',
            zIndex: 10,
          }} />
          <Sprite kind="mage" color="gold" isPlayer={true} name="You" />
        </>
      )}

      {/* Enemy sprite */}
      {enemy && tile.revealed && (
        <Sprite
          kind={enemy.spriteKind}
          color={enemy.spriteColor}
          isPlayer={false}
          name={enemy.name}
        />
      )}
    </div>
  );
}

// --- MAP GRID -----------------------------------------------------------------

const OW_STYLES = `
.ow-tile {
  width: 34px;
  height: 34px;
  position: relative;
  overflow: visible;
  cursor: pointer;
}

.ow-grid-wrapper {
  overflow: hidden;
  position: relative;
  display: inline-block;
}

.ow-tile::before {
  content: "";
  position: absolute;
  inset: -2px;
  pointer-events: none;
  mix-blend-mode: soft-light;
  opacity: 0.5;
}

.ow-tile::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 40% 30%, rgba(255,235,180,.05), transparent 65%);
  pointer-events: none;
}

.ow-plains::before {
  background: repeating-linear-gradient(
    42deg,
    transparent 0 3px,
    rgba(80,55,15,.20) 3px 4px
  );
}

.ow-forest::before {
  background:
    radial-gradient(circle at 25% 35%, rgba(10,25,8,.50) 0 2px, transparent 3px),
    radial-gradient(circle at 72% 62%, rgba(10,25,8,.45) 0 2px, transparent 3px),
    radial-gradient(circle at 50% 85%, rgba(10,25,8,.40) 0 2px, transparent 3px);
  mix-blend-mode: normal;
  opacity: 0.75;
}

.ow-swamp::before {
  background:
    repeating-linear-gradient(0deg, transparent 0 4px, rgba(0,0,0,.18) 4px 5px),
    radial-gradient(circle at 60% 70%, rgba(120,160,70,.15) 0 2px, transparent 3px);
  mix-blend-mode: normal;
  opacity: 0.65;
}

.ow-mountain::before {
  background: repeating-linear-gradient(
    120deg,
    transparent 0 4px,
    rgba(0,0,0,.12) 4px 5px
  );
}

/* Tile icon transform variants — applied via coord hash, never Math.random() */
.tile-icon-v1 { transform: scaleX(-1); }
.tile-icon-v2 { transform: rotate(90deg); }
.tile-icon-v3 { transform: rotate(180deg); }
.tile-icon-v4 { transform: rotate(270deg); }
.tile-icon-v5 { transform: scaleX(-1) rotate(90deg); }

/* Biome-matched tile borders — replaces hard grid edges */
.ow-plains   { box-shadow: inset 0 0 0 0.5px rgba(80,55,15,.25); }
.ow-forest   { box-shadow: inset 0 0 0 0.5px rgba(10,25,8,.35); }
.ow-swamp    { box-shadow: inset 0 0 0 0.5px rgba(47,79,79,.30); }
.ow-mountain { box-shadow: inset 0 0 0 0.5px rgba(105,105,105,.25); }
.ow-island   { box-shadow: inset 0 0 0 0.5px rgba(30,100,180,.25); }
.ow-water    { box-shadow: inset 0 0 0 0.5px rgba(20,60,120,.20); }

.ow-island::before {
  background: repeating-linear-gradient(
    90deg,
    transparent 0 3px,
    rgba(255,255,255,.06) 3px 4px
  );
}

.ow-water::before {
  background: repeating-linear-gradient(
    90deg,
    transparent 0 5px,
    rgba(140,200,235,.10) 5px 6px,
    transparent 6px 11px
  );
  background-size: 22px 100%;
  mix-blend-mode: screen;
  opacity: 0.5;
  animation: waterShimmer 7s linear infinite;
}

.ow-fog::before {
  background:
    radial-gradient(circle at 30% 40%, rgba(40,30,20,.45) 0 4px, transparent 6px),
    radial-gradient(circle at 70% 65%, rgba(40,30,20,.35) 0 3px, transparent 5px);
  mix-blend-mode: normal;
  opacity: 0.55;
  animation: fogDrift 14s ease-in-out infinite;
}
.ow-fog::after { background: none; }

.ow-fog-edge {
  box-shadow: inset 0 0 18px 3px rgba(0,0,0,.70);
  -webkit-mask-image: radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%);
  mask-image: radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%);
}

.ow-mana {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.50;
  mix-blend-mode: screen;
  animation: manaPulse 3.2s ease-in-out infinite;
}

.ow-plaque {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #1a140a, #0a0604 75%);
  box-shadow:
    0 0 0 1.5px rgba(196,160,64,.60),
    0 0 0 3px rgba(0,0,0,.65),
    0 1px 3px rgba(0,0,0,.80);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  filter: drop-shadow(0 0 2px rgba(255,220,140,0.70));
}

.ow-plaque-dungeon {
  background: radial-gradient(circle at 35% 30%, #2a0a0a, #100404 75%);
  box-shadow:
    0 0 0 1.5px rgba(200,80,80,.80),
    0 0 0 3px rgba(0,0,0,.65),
    0 0 6px rgba(180,60,60,.50),
    0 1px 3px rgba(0,0,0,.80);
  filter: drop-shadow(0 0 2px rgba(255,160,140,0.65));
}

.ow-plaque-castle {
  width: 24px;
  height: 24px;
  box-shadow:
    0 0 0 1.5px var(--ring, #c4a040),
    0 0 0 3px rgba(0,0,0,.70),
    0 0 10px var(--ring-glow, rgba(196,160,64,.50));
  animation: castleBreath 4s ease-in-out infinite;
}

.ow-plaque-castle-defeated {
  animation: none;
  filter: grayscale(0.70) brightness(0.70);
  box-shadow:
    0 0 0 1.5px rgba(80,70,55,.60),
    0 0 0 2px rgba(0,0,0,.70);
}

.ow-plaque-ruin {
  background: radial-gradient(circle at 35% 30%, #2a2520, #0f0d0b 75%);
  box-shadow:
    0 0 0 1.5px rgba(180,160,120,.80),
    0 0 0 3px rgba(0,0,0,.65),
    0 0 6px rgba(140,120,90,.45),
    0 1px 3px rgba(0,0,0,.80);
  filter: drop-shadow(0 0 2px rgba(220,200,160,0.60));
}

.ow-plaque-town {
  box-shadow:
    0 0 0 1.5px rgba(220,180,80,.85),
    0 0 0 3px rgba(0,0,0,.65),
    0 0 7px rgba(200,160,60,.45),
    0 1px 3px rgba(0,0,0,.80);
  filter: drop-shadow(0 0 2px rgba(255,220,140,0.75));
}

.ow-label {
  position: absolute;
  bottom: 1px;
  left: 0;
  right: 0;
  font-family: 'Cinzel', serif;
  font-size: 5.5px;
  letter-spacing: .08em;
  text-align: center;
  color: rgba(240,210,140,.90);
  text-shadow: 0 1px 0 #000, 0 0 3px #000;
  text-transform: uppercase;
  line-height: 1;
  pointer-events: none;
}

@keyframes manaPulse {
  0%, 100% { opacity: .30; }
  50%       { opacity: .65; }
}

@keyframes waterShimmer {
  0%   { background-position: 0 0; }
  100% { background-position: -22px 0; }
}

@keyframes fogDrift {
  0%,  100% { transform: translate(0,   0);  opacity: .55; }
  50%        { transform: translate(2px,-1px); opacity: .75; }
}

@keyframes castleBreath {
  0%,  100% { box-shadow: 0 0 0 1.5px var(--ring), 0 0 0 3px rgba(0,0,0,.70), 0 0  6px var(--ring-glow); }
  50%        { box-shadow: 0 0 0 1.5px var(--ring), 0 0 0 3px rgba(0,0,0,.70), 0 0 16px var(--ring-glow); }
}

@media (max-width: 600px) {
  .ow-hud {
    padding: 4px 8px;
    gap: 6px;
    font-size: 10px;
  }
  .ow-hud-hp-bar {
    width: 56px;
    height: 10px;
  }
  .ow-hud-links {
    gap: 3px;
  }
  .ow-hud-link-pip {
    width: 6px;
    height: 6px;
  }
  .ow-legend,
  .ow-mage-panel {
    display: none;
  }
}

`;

export function WorldMap({ tiles, playerPos, viewport, viewW, viewH, tileSize = 34, onTileClick, canvasRef, enemies = [] }) {
  const tileAt = (x, y) => tiles[y]?.[x] ?? null;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  const enemyByTile = {};
  for (const e of enemies) {
    if (!e.defeated) enemyByTile[`${e.x},${e.y}`] = e;
  }

  const gridWidth  = viewW * tileSize + 16;
  const gridHeight = viewH * tileSize + 16;

  const containerRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const gridW = viewW * tileSize + 16;
      const gridH = viewH * tileSize + 16;
      const s = Math.min(width / gridW, height / gridH);
      setScale(Math.max(0.4, s));
    };
    measure();
    const t = setTimeout(measure, 150);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [viewW, viewH, tileSize]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <style>{OW_STYLES}</style>
      <SpriteStyles />
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center', flexShrink: 0 }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* Terrain grid — unchanged */}
        <div
          className="ow-grid-wrapper"
          style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${viewW}, ${tileSize}px)`,
          gridTemplateRows:    `repeat(${viewH}, ${tileSize}px)`,
          gap: 0,
          padding: 8,
          background: 'radial-gradient(ellipse at center, #0c0906 0%, #050302 100%)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,.80)',
          borderRadius: 2,
        }}>
          {Array.from({ length: viewH }, (_, vy) =>
            Array.from({ length: viewW }, (_, vx) => {
              const x = viewport.x + vx;
              const y = viewport.y + vy;
              const tile = tileAt(x, y);

              if (!tile) {
                return (
                  <div
                    key={`${vx}-${vy}`}
                    style={{ width: tileSize, height: tileSize, background: '#030202' }}
                  />
                );
              }

              const isFogEdge = tile.revealed && DIRS.some(([dx, dy]) => {
                const n = tileAt(x + dx, y + dy);
                return n && !n.revealed;
              });

              // Same-group neighbor flags for feathered patch edges (WATER and
              // ISLAND count as one group). Drives the 3x3 blob sub-tile pick.
              const myGroup = terrainGroup(tile.terrain.id);
              const sameG = (dx, dy) => {
                const n = tileAt(x + dx, y + dy);
                return !!n && terrainGroup(n.terrain.id) === myGroup;
              };
              const groundNeighbors = {
                n: sameG(0, -1),
                s: sameG(0, 1),
                e: sameG(1, 0),
                w: sameG(-1, 0),
              };

              return (
                <MapTile
                  key={`${x}-${y}`}
                  tile={tile}
                  isPlayer={x === playerPos.x && y === playerPos.y}
                  enemy={enemyByTile[`${x},${y}`] ?? null}
                  isFogEdge={isFogEdge}
                  tileSize={tileSize}
                  rowIndex={vy}
                  onClick={onTileClick}
                  groundNeighbors={groundNeighbors}
                />
              );
            })
          )}
        </div>

        {/* Canvas overlay — characters only, pointer-events:none so clicks pass through */}
        <canvas
          ref={canvasRef}
          width={gridWidth}
          height={gridHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      </div>
      </div>
    </div>
  );
}

// --- HUD BAR -----------------------------------------------------------------

export function HUDBar({ player, manaLinks, magesDefeated, artifacts, moves }) {
const hasWard = artifacts.some(a => a.id === "ward" && a.owned);
const threshold = hasWard ? 5 : 3;

return (
<div className="ow-hud" style={{
display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
padding: "6px 12px", background: "rgba(0,0,0,.5)",
borderBottom: "1px solid rgba(200,160,60,.3)",
}}>
{/* HP bar */}
<div style={{ display:"flex", alignItems:"center", gap:5 }}>
<span style={{ fontSize:11, color:"#c8a060", fontFamily:"'Cinzel',serif" }}>HP</span>
<div className="ow-hud-hp-bar" style={{ width:78, height:12, background:"#1a0a00", borderRadius:6, border:"1px solid #5a3010", overflow:"hidden" }}>
<div style={{
width: `${(player.hp / player.maxHP) * 100}%`, height:"100%",
background: player.hp > player.maxHP*.5 ? "linear-gradient(90deg,#c04020,#e06040)" : "linear-gradient(90deg,#800010,#c01020)",
transition: "width .4s", borderRadius: 6,
}} />
</div>
<span style={{ fontSize:11, color:"#e08060", fontFamily:"'Cinzel',serif", minWidth:36 }}>{player.hp}/{player.maxHP}</span>
</div>

  <span style={{ fontSize:12, color:"#f0c040", fontFamily:"'Cinzel',serif" }}>🪙 {player.gold}g</span>
  <span style={{ fontSize:12, color:"#a080e0", fontFamily:"'Cinzel',serif" }}>💎 {player.gems}</span>
  <span style={{ fontSize:10, color:"#8090a0", fontFamily:"'Cinzel',serif" }}>Move {moves}</span>

  {/* Mana link pips */}
  <div className="ow-hud-links" style={{ display:"flex", gap:5, alignItems:"center" }}>
    <span style={{ fontSize:10, color:"#a08060", fontFamily:"'Cinzel',serif" }}>LINKS:</span>
    {COLORS.map(c => {
      const lnk = manaLinks[c] || 0;
      const def = magesDefeated.includes(c);
      return (
        <div key={c} title={`${MAGE_NAMES[c]}: ${lnk}/${threshold}${def?" (defeated)":""}`}
          style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
          <div style={{ fontSize:10, color:def?"#405030":lnk>=threshold?"#ff2020":lnk>=threshold-1?"#f08020":"#a09070" }}>
            {MANA_SYM[c]}
          </div>
          <div style={{ display:"flex", gap:1 }}>
            {Array.from({ length: threshold }).map((_, i) => (
              <div key={i} className="ow-hud-link-pip" style={{
                width:5, height:5, borderRadius:1,
                background: def?"#2a3020":i<lnk?MANA_HEX[c]:"rgba(255,255,255,.1)",
                border:"1px solid rgba(255,255,255,.1)",
              }} />
            ))}
          </div>
        </div>
      );
    })}
  </div>

  {/* Artifact icons */}
  {artifacts.filter(a => a.owned).map(a => (
    <div key={a.id} title={`${a.name}: ${a.desc}`}
      style={{ fontSize:14, filter:"drop-shadow(0 0 3px rgba(200,160,80,.6))", cursor:"help" }}>
      {a.icon}
    </div>
  ))}
</div>

);
}

// --- MAP LEGEND ---------------------------------------------------------------

export function MapLegend() {
return (
<div className="ow-legend" style={{
position:"absolute", top:8, left:8, zIndex:10,
background:"rgba(0,0,0,.75)", borderRadius:6, padding:"8px 12px",
border:"1px solid rgba(200,160,60,.2)", fontSize:10, color:"#8a7050",
fontFamily:"'Cinzel',serif",
}}>
<div style={{ marginBottom:4, fontSize:9, color:"#6a5030", letterSpacing:1 }}>LEGEND</div>
{[['\u{1F9D9}','You'],['\u{1F3D8}','Town'],['⚔','Dungeon'],['\u{1F3F0}','Castle'],['\u{1F3DB}','Ruins']].map(([ic, lb]) => (
<div key={lb} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
<span style={{ fontSize:12 }}>{ic}</span>{lb}
</div>
))}
</div>
);
}

// --- MAGE STATUS PANEL -------------------------------------------------------

export function MageStatusPanel({ manaLinks, magesDefeated, artifacts }) {
const hasWard = artifacts.some(a => a.id === "ward" && a.owned);
const threshold = hasWard ? 5 : 3;

return (
<div className="ow-mage-panel" style={{
position:"absolute", top:8, right:8, zIndex:10,
background:"rgba(0,0,0,.75)", borderRadius:6, padding:"8px 12px",
border:"1px solid rgba(200,160,60,.2)", fontSize:10, fontFamily:"'Cinzel',serif",
}}>
<div style={{ fontSize:9, color:"#6a5030", letterSpacing:1, marginBottom:6 }}>FIVE MAGES</div>
{COLORS.map(c => {
const def = magesDefeated.includes(c);
const lnk = manaLinks[c] || 0;
return (
<div key={c} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
<span style={{
fontSize:10,
color: def?"#405030":lnk>=threshold?"#e02020":lnk>=threshold-1?"#e08020":"#a09070",
}}>{MANA_SYM[c]}</span>
<span style={{ color:def?"#405030":lnk>=threshold?"#e02020":"#a09070", fontSize:10 }}>{MAGE_NAMES[c]}</span>
<span style={{ color:"#6a5030", fontSize:9 }}>{def?"✓":lnk+"/"+threshold}</span>
</div>
);
})}
</div>
);
}

// --- MANA LINK ALERT ---------------------------------------------------------

export function ManaLinkAlert({ events, onRespond, onDismiss, isMobile = false }) {
if (!events.length) return null;
const ev = events[0];
const hx = MANA_HEX[ev.color];

return (
<div style={{
position:"absolute", top:10, left:"50%", transform:"translateX(-50%)",
zIndex:100,
background: `linear-gradient(135deg,#1a0808,${hx}20)`,
border:`2px solid ${hx}`, borderRadius: isMobile ? 6 : 7,
padding: isMobile ? '8px 12px' : '10px 16px',
maxWidth: isMobile ? '90vw' : 430,
fontSize: isMobile ? 11 : undefined,
boxShadow:`0 0 20px ${hx}60`,
animation:"alertDrop .3s ease-out",
}}>
<div style={{ fontSize: isMobile ? 13 : 11, fontFamily:"'Cinzel',serif", color:hx, marginBottom:4, letterSpacing:1 }}>
{MANA_SYM[ev.color]} MANA LINK ALERT
</div>
<div style={{ fontSize: isMobile ? 11 : 12, color:"#e0c090", marginBottom:8 }}>
<strong>{MAGE_NAMES[ev.color]}</strong> sends <strong>{ev.minionName}</strong> to seize <strong>{ev.townName}</strong>!{" "}
<strong style={{ color:"#ff8040" }}>{ev.movesLeft} moves</strong> remaining.
</div>
<div style={{ display:"flex", gap:6 }}>
<button onClick={() => onRespond(ev)} style={{
flex:2, background:`${hx}20`, border:`1px solid ${hx}`, color:hx,
padding: isMobile ? '4px 10px' : '5px 12px',
borderRadius:4, cursor:"pointer", fontFamily:"'Cinzel',serif",
fontSize: isMobile ? 11 : 11,
}}>⚡ Rush to {ev.townName}</button>
<button onClick={() => onDismiss(ev)} style={{
flex:1, background:"transparent", border:"1px solid #5a3020", color:"#806040",
padding: isMobile ? '4px' : '5px',
borderRadius:4, cursor:"pointer", fontFamily:"'Cinzel',serif",
fontSize: isMobile ? 11 : 10,
}}>Ignore</button>
</div>
{events.length > 1 && (
  <div style={{
    marginTop: 4,
    fontSize: 10,
    color: '#e08040',
    fontFamily: "'Cinzel',serif",
    textAlign: 'center',
  }}>
    +{events.length - 1} more threat{events.length > 2 ? 's' : ''} incoming
  </div>
)}
</div>
);
}

export default { WorldMap, MapTile, HUDBar, MapLegend, MageStatusPanel, ManaLinkAlert };
