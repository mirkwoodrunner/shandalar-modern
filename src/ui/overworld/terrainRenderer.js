// src/ui/overworld/terrainRenderer.js
// Presentation-only: deterministic pixel-art tile rendering data + helpers for
// the overworld map. Pure module (no React, no DOM). All sprite/variant
// selection is deterministic from tile (x,y) -- never Math.random().
//
// Asset pack: TopDownFantasy-Forest (aamatniekss, free license -- commercial OK,
// no redistribution/resale, no AI training).
//
// Source art is 16px tiles. The map draws at TILE_SIZE (34px), a 2.125x
// non-integer upscale. Detail softens; this is accepted. Callers must set
// imageSmoothingEnabled = false.
//
// Known gaps (deferred art pass, see CURRENT_SPRINT.md):
//  - MOUNTAIN has no matching tile -> dirt fill + rock-cluster decoration.
//  - Dirt has no soft edge in this pack -> not used as an open patch; SWAMP
//    uses the dark-grass feathered blob instead.
//  - ISLAND renders identically to WATER (grass-center island deferred).

// --- canonical sizes ---------------------------------------------------------
export const TILE_PX = 16;     // source art tile, pixels
export const TILE_SIZE = 34;   // destination tile, pixels (matches WorldMap)

// --- sheet identifiers -------------------------------------------------------
export const SHEET_TILESET = 'tileset';
export const SHEET_DECORATIONS = 'decorations';

// --- verified tileset coordinates (tile units; multiply by TILE_PX) ----------
// forest_tileset.png is 128x240 = 8 cols x 15 rows.
export const TILESET = Object.freeze({
  GRASS_FLAT:        Object.freeze([1, 1]),   // grass interior fill
  DIRT_FLAT:         Object.freeze([6, 1]),   // dirt fill (MOUNTAIN substitute)
  DARKGRASS_ANCHOR:  Object.freeze([0, 3]),   // dark-grass 3x3 blob, top-left
  DARKGRASS_CENTER:  Object.freeze([1, 4]),   // dark-grass flat center
  WATER_ANCHOR:      Object.freeze([0, 10]),  // water 3x3 blob, top-left
  WATER_CENTER:      Object.freeze([1, 11]),  // water flat center
});

// --- verified decoration coordinates -----------------------------------------
// forest_decorations.png is 256x256. Format: [col, row, widthTiles, heightTiles].
// Anchored bottom-center when drawn.
export const DECORATIONS = Object.freeze({
  bigTree1:        Object.freeze([1, 9, 3, 6]),
  smallTree1:      Object.freeze([10, 10, 3, 5]),
  bush1:           Object.freeze([1, 1, 2, 2]),
  bush2:           Object.freeze([1, 3, 2, 2]),
  bushSmall:       Object.freeze([9, 1, 1, 1]),
  grassBladeA:     Object.freeze([1, 4, 1, 2]),
  grassBladeB:     Object.freeze([1, 6, 1, 2]),
  pebbles:         Object.freeze([9, 7, 1, 1]),
  rockCluster:     Object.freeze([10, 7, 2, 2]),
  mushroomCluster: Object.freeze([13, 1, 2, 2]),
});

// --- deterministic tile hash -------------------------------------------------
// Copied from WorldMap.jsx getTileVariantClass. `seed` lets callers derive
// multiple independent deterministic streams for the same tile. seed=0 is
// identical to the original WorldMap hash.
export function hashTile(x, y, seed = 0) {
  const h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  return Math.abs((h ^ (h >> 13)) * 1274126177 | 0);
}

// --- terrain group helper ----------------------------------------------------
// ISLAND and WATER feather against each other as one "water" group; SWAMP is
// its own group; everything else is grass/dirt with no feathering.
export function terrainGroup(terrainId) {
  if (terrainId === 'WATER' || terrainId === 'ISLAND') return 'WATER';
  return terrainId;
}

// --- 3x3 feathered blob sub-offset -------------------------------------------
// neighborsSameGroupFn(dx, dy) -> true when the neighbor at (x+dx, y+dy) is in
// the SAME group as this tile. Picks the sub-cell of the 3x3 feathered blob.
//
// `softFeather` selects between two edge behaviors:
//
//  - softFeather = true (dark-grass / SWAMP): the blob edges fade to
//    transparency, so even a lopsided corner piece reads as an organic dark
//    patch over the grass base. Standard 9-slice:
//      sub-column: 0 if W differs, 2 if E differs, else 1
//      sub-row:    0 if N differs, 2 if S differs, else 1
//    An isolated tile resolves to a feathered corner -- the natural look.
//
//  - softFeather = false (water / WATER+ISLAND): the blob edges carry an opaque
//    rocky shoreline that only looks right as a complete ring. A 9-slice cannot
//    show two opposing borders, so when BOTH sides of an axis differ (isolated
//    tile or 1-wide strip) we fall back to the center column/row. A fully
//    isolated water tile thus resolves to the solid center -- a clean pond --
//    instead of a stray rock mound.
function blobSubOffset(neighborsSameGroupFn, softFeather) {
  const w = neighborsSameGroupFn(-1, 0);
  const e = neighborsSameGroupFn(1, 0);
  const n = neighborsSameGroupFn(0, -1);
  const s = neighborsSameGroupFn(0, 1);
  let sc = 1;
  let sr = 1;
  if (softFeather) {
    if (!w) sc = 0;
    else if (!e) sc = 2;
    if (!n) sr = 0;
    else if (!s) sr = 2;
  } else {
    if (!w && e) sc = 0;
    else if (w && !e) sc = 2;
    if (!n && s) sr = 0;
    else if (n && !s) sr = 2;
  }
  return { sc, sr };
}

function groundLayer(coord) {
  return { sheet: SHEET_TILESET, sx: coord[0] * TILE_PX, sy: coord[1] * TILE_PX };
}

// --- ground layer draw instructions ------------------------------------------
// Returns an ordered array of { sheet, sx, sy } drawn full-tile (16px source ->
// TILE_SIZE dest). Base tile first, then the feathered patch tile if any.
export function getGroundLayers(terrainId, x, y, neighborsSameGroupFn) {
  // MOUNTAIN: dirt fill, no grass base, no edge (known gap).
  if (terrainId === 'MOUNTAIN') {
    return [groundLayer(TILESET.DIRT_FLAT)];
  }

  // Grass is the universal base layer.
  const layers = [groundLayer(TILESET.GRASS_FLAT)];

  if (terrainId === 'SWAMP') {
    const { sc, sr } = blobSubOffset(neighborsSameGroupFn, true);
    layers.push(groundLayer([
      TILESET.DARKGRASS_ANCHOR[0] + sc,
      TILESET.DARKGRASS_ANCHOR[1] + sr,
    ]));
  } else if (terrainId === 'WATER' || terrainId === 'ISLAND') {
    const { sc, sr } = blobSubOffset(neighborsSameGroupFn, false);
    layers.push(groundLayer([
      TILESET.WATER_ANCHOR[0] + sc,
      TILESET.WATER_ANCHOR[1] + sr,
    ]));
  }
  // PLAINS and FOREST: grass only.
  return layers;
}

// --- deterministic decoration scatter ----------------------------------------
// density is a 0..1 chance the primary decoration appears on a tile.
const DECOR_POOLS = Object.freeze({
  PLAINS:   Object.freeze({ density: 0.45, items: Object.freeze(['grassBladeA', 'grassBladeB', 'bush1', 'pebbles']) }),
  FOREST:   Object.freeze({ density: 0.85, items: Object.freeze(['bigTree1', 'smallTree1']) }),
  SWAMP:    Object.freeze({ density: 0.50, items: Object.freeze(['mushroomCluster', 'bush2']) }),
  MOUNTAIN: Object.freeze({ density: 0.70, items: Object.freeze(['rockCluster']) }),
  ISLAND:   null,
  WATER:    null,
});

// Distinct seeds so each deterministic decision is an independent stream.
const SEED_GATE = 101;
const SEED_PICK = 202;
const SEED_POS = 303;
const SEED_GATE2 = 404;
const SEED_PICK2 = 505;
const SEED_POS2 = 606;

// Build a single decoration draw instruction. Scaled to fit fully inside the
// tile (v1 stays within bounds to avoid clipping; trees scaled to fit).
// Anchored bottom-center at a deterministic jittered point.
function makeDecorInstance(name, x, y, posSeed) {
  const [col, row, wTiles, hTiles] = DECORATIONS[name];
  const srcW = wTiles * TILE_PX;
  const srcH = hTiles * TILE_PX;
  const scale = TILE_SIZE / Math.max(srcW, srcH);
  const jx = (hashTile(x, y, posSeed) % 9) - 4;   // -4..4 px
  const jy = hashTile(x, y, posSeed + 1) % 4;      // 0..3 px up from bottom
  return {
    sheet: SHEET_DECORATIONS,
    sx: col * TILE_PX,
    sy: row * TILE_PX,
    w: srcW,
    h: srcH,
    anchorX: TILE_SIZE / 2 + jx,   // destination bottom-center X
    anchorY: TILE_SIZE - jy,       // destination bottom Y
    scale,
  };
}

// Returns 0-2 decoration draw instructions, deterministic from (x,y).
export function getDecorations(terrainId, x, y) {
  const pool = DECOR_POOLS[terrainId];
  if (!pool) return [];

  const out = [];

  if (hashTile(x, y, SEED_GATE) % 100 < pool.density * 100) {
    const pick = pool.items[hashTile(x, y, SEED_PICK) % pool.items.length];
    out.push(makeDecorInstance(pick, x, y, SEED_POS));
  }

  // A second, sparse decoration -- skipped for FOREST so trees do not overlap.
  if (terrainId !== 'FOREST' && hashTile(x, y, SEED_GATE2) % 100 < 20) {
    const pick2 = pool.items[hashTile(x, y, SEED_PICK2) % pool.items.length];
    out.push(makeDecorInstance(pick2, x, y, SEED_POS2));
  }

  return out;
}

export default {
  TILE_PX,
  TILE_SIZE,
  SHEET_TILESET,
  SHEET_DECORATIONS,
  TILESET,
  DECORATIONS,
  hashTile,
  terrainGroup,
  getGroundLayers,
  getDecorations,
};
