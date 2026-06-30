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
// Connected terrain: the map generator now clusters biomes into connected
// regions (coherent value noise), and all LAND biomes share one continuous
// grass base so the ground never breaks at tile edges. Biomes are conveyed by a
// subtle per-biome tint (getTint) plus decoration scatter. Only WATER (and
// SWAMP's dark-grass overlay) autotile.
//
// Known gaps (deferred art pass, see CURRENT_SPRINT.md):
//  - MOUNTAIN has no matching tile -> grass base + dense rock-cluster + grey
//    tint substitute.
//  - Dirt has no soft edge in this pack -> not used as an open patch; SWAMP
//    uses the dark-grass feathered blob instead.
//  - ISLAND has no distinct tile -> grass base + faint coastal tint.

// --- canonical sizes ---------------------------------------------------------
export const TILE_PX = 16;     // source art tile, pixels
export const TILE_SIZE = 34;   // destination tile, pixels (matches WorldMap)
// Extra canvas band above the tile so tall decorations (trees) can overflow
// upward. WorldMap sizes the per-tile canvas to TILE_SIZE + OVERFLOW_TOP and
// translates ground/decoration drawing down by OVERFLOW_TOP.
export const OVERFLOW_TOP = 40;

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
// Only WATER autotiles as a connected ground. ISLAND is now a grass-based land
// biome (faint coastal tint), so it is its own group; SWAMP is its own group;
// everything else is grass with no ground feathering.
export function terrainGroup(terrainId) {
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
  // Grass is the universal base layer for ALL land biomes (PLAINS, FOREST,
  // MOUNTAIN, ISLAND, SWAMP), so the ground is continuous across tile edges.
  const layers = [groundLayer(TILESET.GRASS_FLAT)];

  if (terrainId === 'SWAMP') {
    const { sc, sr } = blobSubOffset(neighborsSameGroupFn, true);
    layers.push(groundLayer([
      TILESET.DARKGRASS_ANCHOR[0] + sc,
      TILESET.DARKGRASS_ANCHOR[1] + sr,
    ]));
  } else if (terrainId === 'WATER') {
    // WATER is the only distinct ground; it autotiles into connected ponds/coast.
    const { sc, sr } = blobSubOffset(neighborsSameGroupFn, false);
    layers.push(groundLayer([
      TILESET.WATER_ANCHOR[0] + sc,
      TILESET.WATER_ANCHOR[1] + sr,
    ]));
  }
  // PLAINS, FOREST, MOUNTAIN, ISLAND: grass base only (differentiated by tint +
  // decorations).
  return layers;
}

// --- subtle per-biome tint ---------------------------------------------------
// Low-alpha flat color drawn over the grass base so land biomes stay legible
// without a hard colored grid. Connected regions mean few borders, so even a
// flat tint reads cleanly. Returns null for no tint, or { r, g, b, a }.
const TINTS = Object.freeze({
  FOREST:   Object.freeze({ r: 34,  g: 78,  b: 34,  a: 0.18 }),
  MOUNTAIN: Object.freeze({ r: 128, g: 110, b: 84,  a: 0.26 }),
  ISLAND:   Object.freeze({ r: 70,  g: 132, b: 150, a: 0.16 }),
  SWAMP:    Object.freeze({ r: 64,  g: 70,  b: 32,  a: 0.12 }),
});

export function getTint(terrainId) {
  return TINTS[terrainId] ?? null;
}

// --- cross-blended tint boundary dithering -----------------------------------
// Per-biome tint used to be a single flat fillRect per tile, which made a hard
// rectangular seam wherever two differently-tinted (or tinted/untinted) biomes
// sit side by side. getTintCells replaces that with a small dithered band along
// each differing edge, cross-blending this tile's tint with the neighbor's (or
// with "no tint" / grass, for an untinted neighbor) so the boundary reads as a
// gradient instead of a line. Both tiles on either side of a seam dither
// symmetrically -- this function is called once per tile, from that tile's own
// point of view.
//
// Tunables -- first things to adjust if the blend reads too soft or too noisy:
export const TINT_CELL_PX = 4;     // dither cell size, tile-local px
export const TINT_BAND_CELLS = 3;  // cell-rows deep the blend band extends inward
// Distinct hash streams per edge direction so each side's dither pattern is
// independent (deliberately not mirrored edge-to-edge -- see getTintCells doc).
export const TINT_SIDE_SEED = Object.freeze({ n: 11, s: 22, e: 33, w: 44 });

function tintsEqual(a, b) {
  if (a === b) return true; // both null, or same reference
  if (!a || !b) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

// Returns an array of { sx, sy, w, h, tint } fill instructions, tile-local
// pixel coordinates, in draw order. No DOM/canvas references -- pure data, per
// this module's header contract.
//
// neighborTerrainIds: { n, s, e, w }, each a terrain id string or null (out of
// bounds / unrevealed neighbor -- treated as "no tint").
//
// Cheap path: a uniform tinted region (or uniform untinted region) returns []
// or a single full-tile rect, identical output to the old flat fillRect.
//
// Blended path: full-tile own-tint fill (if any) as a base, then a dithered
// band painted along each edge whose neighbor tint differs from this tile's.
// Each band cell rolls a deterministic hash seeded by world-aligned edge
// position (so the cell grid lines up with the neighbor tile's own call for
// the same seam) and a side-specific seed (so n/s and e/w bands are
// independent streams, not mirrors of each other). Corner overlaps are
// resolved by draw order n, e, s, w -- a known simplification, not true
// 2-axis corner blending.
export function getTintCells(terrainId, x, y, neighborTerrainIds, tileSize) {
  const ownTint = getTint(terrainId);
  const sides = ['n', 'e', 's', 'w'];
  const neighborTints = {};
  for (const side of sides) {
    const nId = neighborTerrainIds ? neighborTerrainIds[side] : null;
    neighborTints[side] = getTint(nId);
  }

  const allSame = sides.every((side) => tintsEqual(neighborTints[side], ownTint));
  if (allSame) {
    return ownTint ? [{ sx: 0, sy: 0, w: tileSize, h: tileSize, tint: ownTint }] : [];
  }

  const cellsPerSide = Math.max(1, Math.round(tileSize / TINT_CELL_PX));
  const cellPx = tileSize / cellsPerSide;

  const instructions = [];
  if (ownTint) {
    instructions.push({ sx: 0, sy: 0, w: tileSize, h: tileSize, tint: ownTint });
  }

  for (const side of sides) {
    const neighborTint = neighborTints[side];
    if (tintsEqual(neighborTint, ownTint)) continue; // no boundary on this side

    const axisCoord = (side === 'n' || side === 's') ? x : y;

    for (let d = 0; d < TINT_BAND_CELLS; d++) {
      const cutoff = 50 + d * (50 / TINT_BAND_CELLS);
      for (let i = 0; i < cellsPerSide; i++) {
        const worldEdgeIndex = axisCoord * cellsPerSide + i;
        const roll = hashTile(worldEdgeIndex, d, TINT_SIDE_SEED[side]) % 100;
        const cellTint = roll < cutoff ? ownTint : neighborTint;
        if (!cellTint) continue; // grass/decoration layers show through

        let sx;
        let sy;
        if (side === 'n') { sx = i * cellPx; sy = d * cellPx; }
        else if (side === 's') { sx = i * cellPx; sy = tileSize - (d + 1) * cellPx; }
        else if (side === 'e') { sx = tileSize - (d + 1) * cellPx; sy = i * cellPx; }
        else { sx = d * cellPx; sy = i * cellPx; } // w

        instructions.push({ sx, sy, w: cellPx, h: cellPx, tint: cellTint });
      }
    }
  }

  return instructions;
}

// --- deterministic decoration scatter ----------------------------------------
// density is a 0..1 chance the primary decoration appears on a tile.
const DECOR_POOLS = Object.freeze({
  PLAINS:   Object.freeze({ density: 0.50, items: Object.freeze(['grassBladeA', 'grassBladeB', 'bush1', 'pebbles']) }),
  FOREST:   Object.freeze({ density: 0.88, items: Object.freeze(['bigTree1', 'smallTree1']) }),
  SWAMP:    Object.freeze({ density: 0.55, items: Object.freeze(['mushroomCluster', 'bush2']) }),
  MOUNTAIN: Object.freeze({ density: 0.60, items: Object.freeze(['rockCluster', 'pebbles', 'rockCluster']) }),
  ISLAND:   Object.freeze({ density: 0.30, items: Object.freeze(['grassBladeA', 'pebbles', 'bushSmall']) }),
  WATER:    null,
});

// Tall decorations overflow upward beyond the tile; everything else fits inside.
const TALL_DECOR = Object.freeze(new Set(['bigTree1', 'smallTree1']));

// Distinct seeds so each deterministic decision is an independent stream.
const SEED_GATE = 101;
const SEED_PICK = 202;
const SEED_POS = 303;
const SEED_GATE2 = 404;
const SEED_PICK2 = 505;
const SEED_POS2 = 606;

// Build a single decoration draw instruction, anchored bottom-center at a
// deterministic jittered point. Tall decorations (trees) are scaled to roughly
// tile width and allowed to overflow upward into the OVERFLOW_TOP band; all
// others fit fully inside the tile. anchorX/anchorY are tile-local (0..TILE_SIZE);
// WorldMap applies the OVERFLOW_TOP vertical offset when drawing.
function makeDecorInstance(name, x, y, posSeed) {
  const [col, row, wTiles, hTiles] = DECORATIONS[name];
  const srcW = wTiles * TILE_PX;
  const srcH = hTiles * TILE_PX;

  // Deterministic per-tile scale variation breaks up sprite repetition.
  const vary = TALL_DECOR.has(name)
    ? 0.85 + (hashTile(x, y, posSeed + 2) % 21) / 100   // 0.85..1.05
    : 0.68 + (hashTile(x, y, posSeed + 2) % 38) / 100;  // 0.68..1.05

  let scale;
  if (TALL_DECOR.has(name)) {
    // Fill ~tile width; clamp height to the tile + overflow band.
    scale = (TILE_SIZE * 1.05) / srcW;
    const maxH = TILE_SIZE + OVERFLOW_TOP;
    if (srcH * scale > maxH) scale = maxH / srcH;
    scale *= vary;
  } else {
    scale = (TILE_SIZE / Math.max(srcW, srcH)) * vary;
  }

  const jx = (hashTile(x, y, posSeed) % 13) - 6;   // -6..6 px
  const jy = hashTile(x, y, posSeed + 1) % 5;       // 0..4 px up from bottom
  return {
    sheet: SHEET_DECORATIONS,
    sx: col * TILE_PX,
    sy: row * TILE_PX,
    w: srcW,
    h: srcH,
    anchorX: TILE_SIZE / 2 + jx,   // destination bottom-center X (tile-local)
    anchorY: TILE_SIZE - jy,       // destination bottom Y (tile-local)
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
  OVERFLOW_TOP,
  SHEET_TILESET,
  SHEET_DECORATIONS,
  TILESET,
  DECORATIONS,
  hashTile,
  terrainGroup,
  getGroundLayers,
  getTint,
  getTintCells,
  TINT_CELL_PX,
  TINT_BAND_CELLS,
  TINT_SIDE_SEED,
  getDecorations,
};
