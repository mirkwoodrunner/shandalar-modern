// src/ui/overworld/WorldMap.jsx
// Overworld map tile grid, HUD bar, mage status panel, map legend.
// Presentation only. Per MECHANICS_INDEX.md S7.2

import React from 'react';
import { TERRAIN, MANA_HEX, MANA_SYM, MAGE_NAMES, COLORS } from '../../engine/MapGenerator.js';
import { Sprite, SpriteStyles, spriteForMonster, spriteForHenchman } from './Sprite.jsx';
import {
  getGroundLayers,
  getDecorations,
  getTintCells,
  terrainGroup,
  SHEET_TILESET,
  TILE_PX,
  OVERFLOW_TOP,
  OVERFLOW_X,
} from './terrainRenderer.js';
import tilesetUrl from '../../assets/tiles/forest_tileset.png';
import decorationsUrl from '../../assets/tiles/forest_decorations.png';
import townIconUrl from '../../assets/sprites/structures/town.png';
import dungeonIconUrl from '../../assets/sprites/structures/dungeon.png';
import castleIconUrl from '../../assets/sprites/structures/castle.png';
import castleDefeatedIconUrl from '../../assets/sprites/structures/castle-defeated.png';
import ruinIconUrl from '../../assets/sprites/structures/ruin.png';

const TILE_SIZE = 34;

// --- TILESHEET LOADER --------------------------------------------------------
// Module-level singleton: load the two PNGs once and notify subscribers on
// every state change (load, retry, terminal failure). Until an image is ready
// (and whenever a sheet has permanently failed) tiles fall back to the flat
// TERRAIN_BG color so the map is never blank. No Math.random anywhere.
//
// Transient load failures (network blip, CDN hiccup) must not permanently
// flatten every tile revealed for the rest of the session. Each sheet gets up
// to MAX_RETRIES reload attempts with linear backoff before its failure is
// treated as terminal. Terminal failure is logged loudly, not swallowed --
// fail-fast: a silently-broken asset pipeline should be visible in the console,
// not just visible as a slightly-wrong map.
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 750; // linear backoff: attempt N waits N * this

const _sheets = {
  tileset:     { img: null, ok: false, attempts: 0, failedTerminal: false },
  decorations: { img: null, ok: false, attempts: 0, failedTerminal: false },
};
const _subs = new Set();

function getSheet(key) {
  const s = _sheets[key];
  return s && s.ok ? s.img : null;
}

// Presentation-only visual framework tokens shared by the panels/alerts below.
const MAP_THEME_GLOBAL_STYLES = `
  .ow-panel-fantasy {
    background: linear-gradient(135deg, #14110c 0%, #0a0907 100%);
    border: 1px solid #362e1e !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.75), inset 0 1px 3px rgba(255, 255, 255, 0.02);
  }
  .ow-btn-alert-action {
    transition: all 0.2s ease-in-out;
  }
  .ow-btn-alert-action:hover {
    filter: brightness(1.2);
    box-shadow: 0 0 10px var(--alert-glow-color, rgba(216, 172, 74, 0.2));
  }
  .ow-btn-alert-action:active {
    transform: translateY(1px);
  }
`;

function _notify() {
  _subs.forEach((fn) => fn());
}

function _loadOne(key, url) {
  if (typeof Image === 'undefined') return;
  const s = _sheets[key];
  const img = new Image();
  img.onload = () => {
    s.img = img;
    s.ok = true;
    s.failedTerminal = false;
    _notify();
  };
  img.onerror = () => {
    s.attempts += 1;
    if (s.attempts <= MAX_RETRIES) {
      const delay = s.attempts * RETRY_BASE_DELAY_MS;
      // eslint-disable-next-line no-console
      console.warn(
        `[WorldMap] tilesheet "${key}" failed to load (attempt ${s.attempts}/${MAX_RETRIES}). ` +
        `Retrying in ${delay}ms.`
      );
      setTimeout(() => _loadOne(key, url), delay);
      return;
    }
    s.ok = false;
    s.failedTerminal = true;
    // eslint-disable-next-line no-console
    console.error(
      `[WorldMap] tilesheet "${key}" permanently failed to load after ${MAX_RETRIES} ` +
      `retries. Terrain tiles will render as flat color for the rest of this session. ` +
      `url: ${url}`
    );
    _notify();
  };
  img.src = url;
}

let _loadStarted = false;
function _startSheetLoad() {
  if (_loadStarted) return;
  _loadStarted = true;
  _loadOne('tileset', tilesetUrl);
  _loadOne('decorations', decorationsUrl);
}
// Kick off loading immediately at module evaluation time so tiles never race
// against the load window during early exploration.
_startSheetLoad();

// Subscribes to sheet load/retry/failure events. Returns true once every sheet
// has either loaded successfully or permanently failed.
//
// Race-window note: useEffect fires AFTER the browser paint, so there is a gap
// between the component's first render (which reads module-level _sheets state)
// and the subscription being added. If _notify() fires inside that gap (images
// were cached and loaded before the effect ran) the notification is lost and
// the component stays at sheetsReady=false permanently -- only recovering when
// an unrelated prop change (groundNeighbors etc.) happens to trigger a
// re-render. Closing the window: after subscribing, check whether both sheets
// are already settled; if so, call force() immediately to schedule a re-render.
// That re-render sees the loaded state and the canvas draws correctly.
function useTilesheets() {
  const [, force] = React.useReducer((c) => c + 1, 0);
  React.useEffect(() => {
    _subs.add(force);
    // Close the race window: if both sheets settled between our last render and
    // now, trigger an extra render so the canvas draws without waiting for an
    // unrelated prop change.
    if (
      (_sheets.tileset.ok || _sheets.tileset.failedTerminal) &&
      (_sheets.decorations.ok || _sheets.decorations.failedTerminal)
    ) {
      force();
    }
    return () => { _subs.delete(force); };
  }, []);
  return (_sheets.tileset.ok || _sheets.tileset.failedTerminal)
    ? (_sheets.decorations.ok || _sheets.decorations.failedTerminal)
    : false;
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// --- fog frontier fade overlay ------------------------------------------------
// Revealed tiles bordering unrevealed neighbors used to get an inline
// mask-image on the tile root div. CSS mask painting area is the border box,
// so it fully masked out the overflowing canvas bands (OVERFLOW_TOP/OVERFLOW_X
// in terrainRenderer.js), hard-cutting tree canopies at the tile boundary on
// every frontier tile. This overlay div sits above the canvas instead, sized
// to cover the overflow bands too, and fades to the void color (matching the
// grid wrapper's radial-gradient outer stop) rather than masking to
// transparent -- so overflowing decor fades into darkness instead of clipping.
const FOG_VOID_COLOR = '#050302';
const FOG_FADE_INSET = 12; // px inside the tile edge where the fade completes

function fogFadeOverlayStyle(fogSides, tileSize) {
  if (!fogSides) return null;
  const active = ['n', 's', 'e', 'w'].filter((k) => fogSides[k]);
  if (!active.length) return null;

  const overlayH = tileSize + OVERFLOW_TOP;
  const overlayW = tileSize + 2 * OVERFLOW_X;
  const grads = [];

  if (fogSides.n) {
    // Overlay top sits OVERFLOW_TOP px above the tile; fade completes
    // FOG_FADE_INSET px inside the tile's own top edge.
    const endPct = ((OVERFLOW_TOP + FOG_FADE_INSET) / overlayH) * 100;
    const midPct = endPct * (4 / 7);
    grads.push(
      `linear-gradient(to bottom, ${FOG_VOID_COLOR} 0%, rgba(5,3,2,0.85) ${midPct.toFixed(1)}%, transparent ${endPct.toFixed(1)}%)`
    );
  }
  if (fogSides.s) {
    const endPct = (FOG_FADE_INSET / overlayH) * 100;
    grads.push(`linear-gradient(to top, ${FOG_VOID_COLOR} 0%, transparent ${endPct.toFixed(1)}%)`);
  }
  if (fogSides.w) {
    const endPct = ((OVERFLOW_X + FOG_FADE_INSET) / overlayW) * 100;
    grads.push(`linear-gradient(to right, ${FOG_VOID_COLOR} 0%, transparent ${endPct.toFixed(1)}%)`);
  }
  if (fogSides.e) {
    const endPct = ((OVERFLOW_X + FOG_FADE_INSET) / overlayW) * 100;
    grads.push(`linear-gradient(to left, ${FOG_VOID_COLOR} 0%, transparent ${endPct.toFixed(1)}%)`);
  }

  return {
    position: 'absolute',
    top: -OVERFLOW_TOP,
    left: -OVERFLOW_X,
    right: -OVERFLOW_X,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 4,
    background: grads.join(', '),
  };
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

// Deterministic tile variant -- coord hash, no Math.random()
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

export function MapTile({ tile, isPlayer, enemy = null, fogSides = null, tileSize = 34, rowIndex = 0, onClick, groundNeighbors = null, neighborTerrainIds = null, playerAnim = null, enemyAnim = 0 }) {
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

  // Neighbor terrain ids drive tint-boundary dithering (getTintCells). Kept as
  // primitive deps (not the object itself) so the draw effect doesn't redraw
  // every render -- the parent loop builds a new object each pass.
  const ntN = neighborTerrainIds ? neighborTerrainIds.n : null;
  const ntS = neighborTerrainIds ? neighborTerrainIds.s : null;
  const ntE = neighborTerrainIds ? neighborTerrainIds.e : null;
  const ntW = neighborTerrainIds ? neighborTerrainIds.w : null;

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
    ctx.clearRect(0, 0, tileSize + 2 * OVERFLOW_X, tileSize + OVERFLOW_TOP);

    // Draw in tile-local coords; the overflow band sits above (negative y)
    // and on each side (negative/positive x beyond the tile).
    ctx.save();
    ctx.translate(OVERFLOW_X, OVERFLOW_TOP);

    const nsg = (dx, dy) => {
      if (dx === -1) return gnW;
      if (dx === 1) return gnE;
      if (dy === -1) return gnN;
      if (dy === 1) return gnS;
      return true;
    };

    // Ground layers (grass base + optional water/dark-grass autotile).
    const layers = getGroundLayers(t.id, tile.x, tile.y, nsg);
    for (const l of layers) {
      const img = l.sheet === SHEET_TILESET ? tilesetImg : decorImg;
      if (img) ctx.drawImage(img, l.sx, l.sy, TILE_PX, TILE_PX, 0, 0, tileSize, tileSize);
    }

    // Subtle per-biome tint over the grass base, dithered along edges where
    // the neighbor's tint differs so biomes bleed into each other instead of
    // meeting at a hard rectangular seam (land biomes only).
    const tintCells = getTintCells(
      t.id, tile.x, tile.y,
      { n: ntN, s: ntS, e: ntE, w: ntW },
      tileSize,
    );
    for (const c of tintCells) {
      ctx.fillStyle = `rgba(${c.tint.r},${c.tint.g},${c.tint.b},${c.tint.a})`;
      ctx.fillRect(c.sx, c.sy, c.w, c.h);
    }

    // Decorations (may overflow upward into the OVERFLOW_TOP band).
    if (decorImg) {
      for (const d of getDecorations(t.id, tile.x, tile.y)) {
        const dw = d.w * d.scale;
        const dh = d.h * d.scale;
        ctx.drawImage(decorImg, d.sx, d.sy, d.w, d.h, d.anchorX - dw / 2, d.anchorY - dh, dw, dh);
      }
    }

    ctx.restore();
  }, [t.id, tile.x, tile.y, tileSize, sheetsReady, gnN, gnS, gnE, gnW, ntN, ntS, ntE, ntW]);

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
  const fogFadeStyle = fogFadeOverlayStyle(fogSides, tileSize);
  const ml = tile.manaLink;
  const tileBg = TERRAIN_BG[t.id] ?? t.color;

  const castleColor   = tile.castleData?.color ? MANA_HEX[tile.castleData.color] : '#c4a040';
  const castleDefeated = tile.castleData?.defeated ?? false;

  const fogSideKeys = fogFadeStyle
    ? ['w', 'e', 'n', 's'].filter((k) => fogSides[k]).join(',')
    : null;

  return (
    <div
      className={`ow-tile ${terrainClass}`}
      data-fog-sides={fogSideKeys ?? undefined}
      style={{
        background: tileBg, width: tileSize, height: tileSize, zIndex: rowIndex,
        ...(fogFadeStyle ? { boxShadow: 'inset 0 0 18px 3px rgba(0,0,0,.70)' } : {}),
      }}
      onClick={() => onClick(tile)}
    >
      {/* Terrain sprites -- drawn beneath all overlays. Transparent until the
          tilesheets load (or if they fail), letting the TERRAIN_BG fallback show.
          The canvas extends OVERFLOW_TOP px above the tile so tall decorations
          (trees) can spill upward; row-based zIndex makes front rows occlude. */}
      <canvas
        ref={terrainCanvasRef}
        className="ow-terrain-canvas"
        width={tileSize + 2 * OVERFLOW_X}
        height={tileSize + OVERFLOW_TOP}
        style={{
          position: 'absolute',
          left: -OVERFLOW_X,
          top: -OVERFLOW_TOP,
          width: tileSize + 2 * OVERFLOW_X,
          height: tileSize + OVERFLOW_TOP,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Fog frontier fade -- covers the canvas overflow bands too, so
          overflowing decor (tree canopies) fades into the void instead of
          hard-cutting at the tile boundary. Only rendered on fog-edge tiles. */}
      {fogFadeStyle && <div className="ow-fog-fade" style={fogFadeStyle} />}

      {/* Mana link corruption overlay */}
      {ml && (
        <div
          className="ow-mana"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, ${hexToRgba(MANA_HEX[ml], 0.65)}, transparent 70%)`,
          }}
        />
      )}

      {/* Structure icon -- PNG sprite; dungeons hidden until clued */}
      {(s && (s !== 'DUNGEON' || tile.dungeonData?.clued)) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 2,
        }}>
          <img
            src={
              s === 'TOWN'    ? townIconUrl :
              s === 'DUNGEON' ? dungeonIconUrl :
              s === 'CASTLE'  ? (castleDefeated ? castleDefeatedIconUrl : castleIconUrl) :
              s === 'RUIN'    ? ruinIconUrl :
              undefined
            }
            alt={s}
            style={{
              width: '70%',
              height: '70%',
              objectFit: 'contain',
              imageRendering: 'pixelated',
              pointerEvents: 'none',
              filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.6))',
            }}
          />

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
            }}>{'\u{2694}'}</div>
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
            boxShadow: 'inset 0 0 8px rgba(245,217,122,0.4)',
            pointerEvents: 'none',
            zIndex: 10,
          }} />
          <Sprite
            kind="mage"
            color="gold"
            isPlayer={true}
            name="You"
            dir={playerAnim?.dir ?? 'down'}
            frame={playerAnim?.frame ?? 0}
          />
        </>
      )}

      {/* Enemy sprite -- direction from AI, frame from the shared idle-bob */}
      {enemy && tile.revealed && (
        <Sprite
          kind={enemy.spriteKind}
          color={enemy.spriteColor}
          isPlayer={false}
          name={enemy.name}
          dir={enemy.dir ?? 'down'}
          frame={enemyAnim ?? enemy.animFrame ?? 0}
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

/* Tile icon transform variants -- applied via coord hash, never Math.random() */
.tile-icon-v1 { transform: scaleX(-1); }
.tile-icon-v2 { transform: rotate(90deg); }
.tile-icon-v3 { transform: rotate(180deg); }
.tile-icon-v4 { transform: rotate(270deg); }
.tile-icon-v5 { transform: scaleX(-1) rotate(90deg); }

/* Biome-matched tile borders -- replaces hard grid edges */
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

/* .ow-fog-edge removed: box-shadow is applied inline per MapTile based on
   which neighbors are unrevealed. The directional fade is now a separate
   .ow-fog-fade overlay div (not a mask-image) -- see fogFadeOverlayStyle. */

.ow-mana {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.50;
  mix-blend-mode: screen;
  animation: manaPulse 3.2s ease-in-out infinite;
}

.ow-label {
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  font-family: 'Cinzel', serif;
  font-size: 6px;
  font-weight: bold;
  letter-spacing: .05em;
  text-align: center;
  color: #f7dfa3;
  text-shadow: 0 1px 2px #000, 0 0 4px #000;
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

@media (max-width: 600px) {
  .ow-hud {
    padding: 6px 10px;
    gap: 8px;
    font-size: 10px;
  }
  .ow-hud-hp-bar {
    width: 60px;
    height: 10px;
  }
  .ow-hud-links {
    gap: 4px;
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

export function WorldMap({ tiles, playerPos, viewport, viewW, viewH, tileSize = 34, onTileClick, canvasRef, enemies = [], playerAnim = null, enemyAnim = 0 }) {
  const tileAt = (x, y) => tiles[y]?.[x] ?? null;

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
      <style>{MAP_THEME_GLOBAL_STYLES}</style>
      <SpriteStyles />
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center', flexShrink: 0 }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* Terrain grid -- unchanged */}
        <div
          className="ow-grid-wrapper"
          style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${viewW}, ${tileSize}px)`,
          gridTemplateRows:    `repeat(${viewH}, ${tileSize}px)`,
          gap: 0,
          padding: 8,
          background: 'radial-gradient(ellipse at center, #0c0906 0%, #050302 100%)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,.80), 0 10px 30px rgba(0,0,0,0.8)',
          borderRadius: 4,
          border: '1px solid #1c1811',
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

              // Per-direction unrevealed flags. tileAt() returns null for
              // out-of-bounds coords; !null?.revealed === true so map edges
              // correctly count as unrevealed for fog purposes.
              const fogSides = tile.revealed ? {
                w: !tileAt(x - 1, y)?.revealed,
                e: !tileAt(x + 1, y)?.revealed,
                n: !tileAt(x, y - 1)?.revealed,
                s: !tileAt(x, y + 1)?.revealed,
              } : null;

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

              // Actual neighbor terrain ids (distinct from groundNeighbors'
              // same/different booleans) drive tint-boundary dithering.
              const neighborTerrainIds = {
                n: tileAt(x, y - 1)?.terrain.id ?? null,
                s: tileAt(x, y + 1)?.terrain.id ?? null,
                e: tileAt(x + 1, y)?.terrain.id ?? null,
                w: tileAt(x - 1, y)?.terrain.id ?? null,
              };

              return (
                <MapTile
                  key={`${x}-${y}`}
                  tile={tile}
                  isPlayer={x === playerPos.x && y === playerPos.y}
                  enemy={enemyByTile[`${x},${y}`] ?? null}
                  fogSides={fogSides}
                  tileSize={tileSize}
                  rowIndex={vy}
                  onClick={onTileClick}
                  groundNeighbors={groundNeighbors}
                  neighborTerrainIds={neighborTerrainIds}
                  playerAnim={playerAnim}
                  enemyAnim={enemyAnim}
                />
              );
            })
          )}
        </div>

        {/* Canvas overlay -- characters only, pointer-events:none so clicks pass through */}
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
      display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
      padding: "8px 16px",
      background: "linear-gradient(180deg, #16130f 0%, #0c0a08 100%)",
      borderBottom: "1px solid #282217",
      boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
    }}>
      {/* HP ticker */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:11, color:"#d8ac4a", fontFamily:"'Cinzel',serif", fontWeight: 'bold', letterSpacing: 0.5 }}>VIT</span>
        <div className="ow-hud-hp-bar" style={{ width:84, height:10, background:"#140d09", borderRadius:2, border:"1px solid #3d2311", overflow:"hidden", boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)' }}>
          <div style={{
            width: `${(player.hp / player.maxHP) * 100}%`, height:"100%",
            background: player.hp > player.maxHP * 0.5
              ? "linear-gradient(90deg, #992211 0%, #d63622 100%)"
              : "linear-gradient(90deg, #590a0a 0%, #991111 100%)",
            transition: "width .4s ease-in-out",
          }} />
        </div>
        <span style={{ fontSize:11, color:"#e07c5e", fontFamily:"'Cinzel',serif", minWidth:40, letterSpacing: 0.5 }}>{player.hp}/{player.maxHP}</span>
      </div>

      <div style={{ height: 12, width: 1, background: '#2d2417' }} />

      <span style={{ fontSize:12, color:"#e5b842", fontFamily:"'Cinzel',serif", fontWeight: 'bold' }}>{'\u{1FA99}'} {player.gold}<span style={{fontSize: 10, color: '#8c7335', fontWeight: 'normal'}}>g</span></span>
      <span style={{ fontSize:12, color:"#b396f0", fontFamily:"'Cinzel',serif", fontWeight: 'bold' }}>{'\u{1F48E}'} {player.gems}</span>
      <span style={{ fontSize:11, color:"#7ca0ba", fontFamily:"'Cinzel',serif" }}>Pace: <span style={{color: '#fff', fontWeight: 'bold'}}>{moves}</span></span>

      <div style={{ height: 12, width: 1, background: '#2d2417', marginLeft: 'auto' }} />

      {/* Mana link conduits */}
      <div className="ow-hud-links" style={{ display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ fontSize:10, color:"#8c714c", fontFamily:"'Cinzel',serif", letterSpacing: 1 }}>CONDUITS:</span>
        {COLORS.map(c => {
          const lnk = manaLinks[c] || 0;
          const def = magesDefeated.includes(c);
          return (
            <div key={c} title={`${MAGE_NAMES[c]}: ${lnk}/${threshold}${def?" (severed)":""}`}
              style={{ display:"flex", alignItems:"center", gap:3, background: 'rgba(0,0,0,0.15)', padding: '2px 5px', borderRadius: 3, border: '1px solid #211c14' }}>
              <div style={{ fontSize:11, color:def?"#404d32":lnk>=threshold?"#ff3333":lnk>=threshold-1?"#f58c38":"#bfa37a", textShadow: def ? 'none' : '0 0 4px rgba(255,255,255,0.1)' }}>
                {MANA_SYM[c]}
              </div>
              <div style={{ display:"flex", gap:1.5 }}>
                {Array.from({ length: threshold }).map((_, i) => (
                  <div key={i} className="ow-hud-link-pip" style={{
                    width:5, height:5, borderRadius:1,
                    background: def?"#252b1d":i<lnk?MANA_HEX[c]:"rgba(255,255,255,0.04)",
                    border: i < lnk ? `1px solid ${MANA_HEX[c]}` : "1px solid rgba(255,255,255,0.08)",
                    boxShadow: (i < lnk && !def) ? `0 0 4px ${MANA_HEX[c]}` : 'none',
                  }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Owned artifacts */}
      {artifacts.some(a => a.owned) && (
        <>
          <div style={{ height: 12, width: 1, background: '#2d2417' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {artifacts.filter(a => a.owned).map(a => (
              <div key={a.id} title={`${a.name}: ${a.desc}`}
                style={{ fontSize:14, filter:"drop-shadow(0 0 4px rgba(229,184,66,0.4))", cursor:"help" }}>
                {a.icon}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- MAP LEGEND ---------------------------------------------------------------

export function MapLegend() {
  return (
    <div className="ow-legend ow-panel-fantasy" style={{
      position:"absolute", top:12, left:12, zIndex:10,
      borderRadius:4, padding: "10px 14px",
    }}>
      <div style={{ marginBottom:6, fontSize:10, color:"#8c714c", fontFamily: "'Cinzel', serif", letterSpacing:1.5, borderBottom: '1px solid #241f15', paddingBottom: 2 }}>GRID MAP</div>
      {[
        ['\u{1F9D9}', 'Explorer'],
        ['\u{1F3D8}', 'Settlement'],
        ['\u{2694}', 'Dungeon Stronghold'],
        ['\u{1F3F0}', 'Mage Citadel'],
        ['\u{1F3DB}', 'Ancient Ruins'],
      ].map(([ic, lb]) => (
        <div key={lb} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, fontSize: 11, color: '#bda682' }}>
          <span style={{ fontSize:13, width: 16, textAlign: 'center', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>{ic}</span>
          <span style={{ fontFamily: "'Crimson Text', serif" }}>{lb}</span>
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
    <div className="ow-mage-panel ow-panel-fantasy" style={{
      position:"absolute", top:12, right:12, zIndex:10,
      borderRadius:4, padding:"10px 14px", minWidth: 130,
    }}>
      <div style={{ fontSize:10, color:"#8c714c", letterSpacing:1.5, marginBottom:6, borderBottom: '1px solid #241f15', paddingBottom: 2 }}>PLANAR ARCHMAGES</div>
      {COLORS.map(c => {
        const def = magesDefeated.includes(c);
        const lnk = manaLinks[c] || 0;
        return (
          <div key={c} style={{ display:"flex", alignItems:"center", justifyContent: 'space-between', marginBottom:4, gap:10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize:11, fontWeight: 'bold',
                color: def?"#3d4734":lnk>=threshold?"#f02c2c":lnk>=threshold-1?"#e68238":"#a89274",
              }}>{MANA_SYM[c]}</span>
              <span style={{ color:def?"#464f3d":lnk>=threshold?"#ff5252":"#c7b499", fontSize:11, textDecoration: def ? 'line-through' : 'none' }}>{MAGE_NAMES[c]}</span>
            </div>
            <span style={{ color: def ? "#57634c" : "#8c714c", fontSize:10, fontWeight: 'bold', fontFamily: "'Cinzel', serif" }}>
              {def ? "FALLEN" : `${lnk}/${threshold}`}
            </span>
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
      position:"absolute", top:16, left:"50%", transform:"translateX(-50%)",
      zIndex:100,
      background: `linear-gradient(135deg, #160a0a 0%, ${hexToRgba(hx, 0.15)} 100%)`,
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      border:`2px solid ${hx}`, borderRadius: isMobile ? 4 : 5,
      padding: isMobile ? '10px 14px' : '14px 20px',
      maxWidth: isMobile ? '92vw' : 450,
      boxShadow:`0 10px 30px rgba(0,0,0,0.7), 0 0 25px ${hexToRgba(hx, 0.35)}`,
      animation:"alertDrop .3s ease-out",
      '--alert-glow-color': hexToRgba(hx, 0.4),
    }}>
      <div style={{ fontSize: isMobile ? 13 : 11, fontFamily:"'Cinzel',serif", color:hx, marginBottom:6, letterSpacing:2, fontWeight: 'bold', textShadow: `0 0 6px ${hexToRgba(hx, 0.5)}` }}>
        {MANA_SYM[ev.color]} PLANAR BREAKOUT ENEMY APPROACHING
      </div>
      <div style={{ fontSize: isMobile ? 12 : 13, color:"#dfccb3", marginBottom:12, lineHeight: 1.4, fontFamily: "'Crimson Text', serif" }}>
        The faction of <strong style={{ color: '#fff', textShadow: '0 1px 2px #000' }}>{MAGE_NAMES[ev.color]}</strong> has materialised <strong style={{ color: hx }}>{ev.minionName}</strong> to capture <strong style={{ color: '#fff' }}>{ev.townName}</strong>!
        <div style={{ marginTop: 4, color:"#ff7336", fontFamily:"'Cinzel',serif", fontSize: 11, fontWeight: 'bold' }}>
          {'\u{26A0}\u{FE0F}'} SEIZURE IMMINENT: {ev.movesLeft} EXPLORATION CYCLES REMAINING
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button
          onClick={() => onRespond(ev)}
          className="ow-btn-alert-action"
          style={{
            flex:2, background:`linear-gradient(180deg, ${hexToRgba(hx, 0.25)} 0%, ${hexToRgba(hx, 0.05)} 100%)`,
            border:`1px solid ${hx}`, color:'#fff',
            padding: isMobile ? '6px 12px' : '7px 14px',
            borderRadius:3, cursor:"pointer", fontFamily:"'Cinzel',serif",
            fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5,
          }}
        >
          {'\u{26A1}'} Intercept at {ev.townName}
        </button>
        <button
          onClick={() => onDismiss(ev)}
          className="ow-btn-alert-action"
          style={{
            flex:1, background:"rgba(0,0,0,0.3)", border:"1px solid #4a2d20", color:"#a18272",
            padding: isMobile ? '6px' : '7px',
            borderRadius:3, cursor:"pointer", fontFamily:"'Cinzel',serif",
            fontSize: 11,
          }}
        >
          Disregard
        </button>
      </div>
      {events.length > 1 && (
        <div style={{
          marginTop: 8,
          fontSize: 10,
          color: '#e6732b',
          fontFamily: "'Cinzel',serif",
          textAlign: 'center',
          letterSpacing: 0.5,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 6,
        }}>
          +{events.length - 1} further threat{events.length > 2 ? 's' : ''} incoming
        </div>
      )}
    </div>
  );
}

export default { WorldMap, MapTile, HUDBar, MapLegend, MageStatusPanel, ManaLinkAlert };
