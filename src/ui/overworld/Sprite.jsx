// src/ui/overworld/Sprite.jsx
// Image-based pixel-art sprite system for the overworld character layer.
// Each <kind>.png is a 128x128 sheet: 4 rows (down/up/left/right) x 4 columns
// (idle, walk1, walk2, walk3) of 32x32 cells. Sheets are grayscale-toned; the
// per-color tint (gold/white/blue/black/red/green) is applied at draw time via
// a canvas multiply composite, so one sheet per kind serves every color.
//
// Sheet art is original, generated, CC0. See src/assets/sprites/CREDITS.md.

import React from 'react';

import mageUrl from '../../assets/sprites/mage.png';
import pegasusUrl from '../../assets/sprites/pegasus.png';
import spiderUrl from '../../assets/sprites/spider.png';
import zombieUrl from '../../assets/sprites/zombie.png';
import goblinUrl from '../../assets/sprites/goblin.png';
import fishUrl from '../../assets/sprites/fish.png';

const CELL = 32;            // source cell size in the sheet
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };

// CSS-color tints, one per palette token. Applied to the grayscale mass only.
const COLOR_TINT = {
  gold:  '#d9b24a',
  white: '#d8d8e8',
  blue:  '#4a7fd0',
  black: '#7a5aa0',
  red:   '#d04a30',
  green: '#45a045',
};

// Pixels with channel spread below this are treated as the (grayscale) mass and
// get tinted; saturated pixels are intrinsic accents (skin, eyes, mane, ...) and
// are left as-authored. Keeps one sheet per kind serving all palette colors
// while still looking multi-colored.
const TINT_SAT_THRESHOLD = 38;

function _hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const SHEET_URLS = {
  mage:    mageUrl,
  pegasus: pegasusUrl,
  spider:  spiderUrl,
  zombie:  zombieUrl,
  goblin:  goblinUrl,
  fish:    fishUrl,
};

// ---------------------------------------------------------------------------
// SHEET LOADER -- module-level singleton (mirrors WorldMap's tilesheet loader).
// Load every <kind>.png once; notify subscribers when all attempts settle.
// A failed sheet stays null so callers fall back gracefully (mage, then square).
// ---------------------------------------------------------------------------
const _sheets = {};         // kind -> { img, ok }
for (const k of Object.keys(SHEET_URLS)) _sheets[k] = { img: null, ok: false };
let _loadStarted = false;
let _loadSettled = false;
const _subs = new Set();
const _tintCache = new Map(); // `${kind}:${color}` -> tinted offscreen canvas

function _sheetImg(kind) {
  const s = _sheets[kind];
  return s && s.ok ? s.img : null;
}

function _startSheetLoad() {
  if (_loadStarted || typeof Image === 'undefined') return;
  _loadStarted = true;
  const entries = Object.entries(SHEET_URLS);
  let remaining = entries.length;
  const done = () => {
    remaining -= 1;
    if (remaining === 0) {
      _loadSettled = true;
      _subs.forEach((fn) => fn());
    }
  };
  for (const [kind, url] of entries) {
    const img = new Image();
    img.onload = () => { _sheets[kind].img = img; _sheets[kind].ok = true; done(); };
    img.onerror = () => { _sheets[kind].ok = false; done(); };
    img.src = url;
  }
}

// Subscribes a component to sheet-load completion; returns true once settled.
function useSheets() {
  const [, force] = React.useReducer((c) => c + 1, 0);
  React.useEffect(() => {
    if (_loadSettled) return undefined;
    _startSheetLoad();
    _subs.add(force);
    return () => { _subs.delete(force); };
  }, []);
  return _loadSettled;
}

// Returns a tinted offscreen canvas for (kind, color), or null if no usable
// sheet is loaded yet. Falls back to the mage sheet for an unknown/failed kind.
// Only the real-kind result is cached, so a fallback never sticks once the
// genuine sheet finishes loading.
function getTintedSheet(kind, color) {
  const key = `${kind}:${color}`;
  if (_tintCache.has(key)) return _tintCache.get(key);
  if (typeof document === 'undefined') return null;

  const actual = _sheetImg(kind);
  const img = actual || _sheetImg('mage'); // graceful fallback: recolored mage
  if (!img) return null;                   // nothing loaded -> caller draws square

  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(img, 0, 0);
  // Tint only the grayscale mass (multiply by the palette color); leave
  // saturated accent pixels intact so the sprite stays multi-colored.
  const [tr, tg, tb] = _hexToRgb(COLOR_TINT[color] || COLOR_TINT.white);
  const id = octx.getImageData(0, 0, off.width, off.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < TINT_SAT_THRESHOLD) {
      d[i]     = (r * tr) / 255;
      d[i + 1] = (g * tg) / 255;
      d[i + 2] = (b * tb) / 255;
    }
  }
  octx.putImageData(id, 0, 0);

  if (actual) _tintCache.set(key, off); // don't cache the mage-fallback result
  return off;
}

// ---------------------------------------------------------------------------
// CSS -- aura glow, shadow, drop-shadow only. (Old per-kind CSS/SVG removed.)
// ---------------------------------------------------------------------------
const SPRITE_CSS = `
/* Palette token classes drive the aura color only. */
.sprite.gold   { --c1:#f5d97a; }
.sprite.white  { --c1:#e8e8f0; }
.sprite.blue   { --c1:#6090e0; }
.sprite.black  { --c1:#c090e0; }
.sprite.red    { --c1:#e05030; }
.sprite.green  { --c1:#40a040; }

.sprite {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  filter: drop-shadow(2px 4px 3px rgba(0,0,0,0.55));
}

.sprite .aura {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 60%, var(--c1, #f5d97a) 0%, transparent 70%);
  opacity: 0;
  animation: spriteAura 2.4s ease-in-out infinite;
}
.sprite.player .aura { opacity: 0.6; }
.sprite.enemy .aura  { opacity: 0.3; animation-duration: 3.1s; }

.sprite .sprite-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.sprite .shadow {
  position: absolute;
  bottom: 1px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 3px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
}

@keyframes spriteAura {
  0%, 100% { opacity: 0; transform: scale(1); }
  50%      { opacity: 0.6; transform: scale(1.15); }
}
`;

export function SpriteStyles() {
  return <style>{SPRITE_CSS}</style>;
}

// ---------------------------------------------------------------------------
// Sprite component
// ---------------------------------------------------------------------------
export function Sprite({ kind, color, isPlayer = false, name, dir = 'down', frame = 0 }) {
  const sheetsReady = useSheets();
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);

    const sheet = getTintedSheet(kind, color);
    if (sheet) {
      const row = DIR_ROW[dir] ?? 0;
      const col = Math.max(0, Math.min(3, frame | 0));
      ctx.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, 0, 0, cv.width, cv.height);
    } else if (_loadSettled) {
      // Last-resort fallback (all sheets failed to load): a flat colored body
      // square. Never a crash, never a blank tile, no retry loop.
      ctx.fillStyle = COLOR_TINT[color] || '#888888';
      ctx.fillRect(cv.width * 0.28, cv.height * 0.22, cv.width * 0.44, cv.height * 0.6);
    }
  }, [kind, color, dir, frame, sheetsReady]);

  return (
    <div
      className={`sprite kind-${kind} ${color}${isPlayer ? ' player' : ' enemy'}`}
      title={name}
    >
      <div className="aura" />
      <canvas ref={canvasRef} className="sprite-canvas" width={CELL} height={CELL} />
      <div className="shadow" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terrain + archKey -> sprite mapping helpers (unchanged behavior)
// ---------------------------------------------------------------------------

const KIND_BY_TERRAIN = {
  PLAINS:   'pegasus',
  FOREST:   'spider',
  SWAMP:    'zombie',
  MOUNTAIN: 'goblin',
  ISLAND:   'fish',
};

const COLOR_BY_ARCH = {
  WHITE_WEENIE:    'white',
  BLUE_TEMPO:      'blue',
  BLUE_CONTROL:    'blue',
  BLACK_CONTROL:   'black',
  BLACK_REANIMATOR:'black',
  RED_AGGRO:       'red',
  RED_BURN:        'red',
  GREEN_STOMPY:    'green',
};

// Sprite kind by archetype, so a monster's appearance follows the monster
// itself (not the tile it spawned on) now that encounters are decoupled from
// biome. KIND_BY_TERRAIN remains a fallback.
const KIND_BY_ARCH = {
  WHITE_WEENIE:     'pegasus',
  GREEN_STOMPY:     'spider',
  BLACK_CONTROL:    'zombie',
  BLACK_REANIMATOR: 'zombie',
  RED_AGGRO:        'goblin',
  RED_BURN:         'goblin',
  BLUE_TEMPO:       'fish',
  BLUE_CONTROL:     'fish',
};

const COLOR_BY_LETTER = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

export function spriteForMonster(archKey, terrainId) {
  return {
    kind:  KIND_BY_ARCH[archKey] ?? KIND_BY_TERRAIN[terrainId] ?? 'goblin',
    color: COLOR_BY_ARCH[archKey] ?? 'red',
  };
}

export function spriteForHenchman(colorLetter) {
  return { kind: 'mage', color: COLOR_BY_LETTER[colorLetter] ?? 'white' };
}
