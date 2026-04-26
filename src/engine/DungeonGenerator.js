// src/engine/DungeonGenerator.js
// Pure dungeon layout generator ? no React, no side effects.
// Belongs to SYSTEMS.md S9 (Dungeon System).
//
// Exports:
//   generateDungeon(dungeonData, rngSeed) ? DungeonState
//   checkLOS(grid, x0, y0, x1, y1) ? boolean
//   bresenham(x0, y0, x1, y1) ? [{x,y}]

import { DUNGEON_ARCHETYPES, MONSTER_TABLE, makeRng } from './MapGenerator.js';

// --- CONSTANTS ----------------------------------------------------------------

const DUNGEON_W = 24;
const DUNGEON_H = 16;

const mkId = () => Math.random().toString(36).slice(2, 9);

// Map color ? archetype keys for weighted selection
const COLOR_ARCH_MAP = {
  W: ['WHITE_WEENIE'],
  U: ['BLUE_CONTROL', 'BLUE_TEMPO'],
  B: ['BLACK_REANIMATOR', 'BLACK_CONTROL'],
  R: ['RED_BURN', 'RED_AGGRO'],
  G: ['GREEN_STOMPY'],
};

// Build archKey ? monster names from MONSTER_TABLE (imported)
const ARCH_NAMES = {};
Object.values(MONSTER_TABLE).forEach(monsters => {
  monsters.forEach(m => {
    if (!ARCH_NAMES[m.archKey]) ARCH_NAMES[m.archKey] = [];
    if (!ARCH_NAMES[m.archKey].includes(m.name)) ARCH_NAMES[m.archKey].push(m.name);
  });
});
ARCH_NAMES['ARTIFACT_CONTROL'] = ['Iron Sentinel', 'Clockwork Guardian'];

// --- HELPERS ------------------------------------------------------------------

function pickArch(rng, domColor) {
  const dominated = COLOR_ARCH_MAP[domColor] || [];
  if (dominated.length && rng() < 0.6) {
    return dominated[Math.floor(rng() * dominated.length)];
  }
  return DUNGEON_ARCHETYPES[Math.floor(rng() * DUNGEON_ARCHETYPES.length)];
}

function pickName(rng, archKey, tier) {
  const names = ARCH_NAMES[archKey] || ['Dungeon Denizen'];
  const idx = Math.min(tier - 1, names.length - 1);
  return names[idx] || names[0];
}

function pickHp(rng, tier) {
  if (tier === 1) return 16 + Math.floor(rng() * 5);
  if (tier === 2) return 20 + Math.floor(rng() * 5);
  return 24 + Math.floor(rng() * 5);
}

// --- LINE OF SIGHT ------------------------------------------------------------

/**
 * Bresenham integer line from (x0,y0) to (x1,y1).
 * Returns array of {x,y} cells including both endpoints.
 */
export function bresenham(x0, y0, x1, y1) {
  const cells = [];
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let cx = x0, cy = y0;
  while (true) {
    cells.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; cx += sx; }
    if (e2 <= dx) { err += dx; cy += sy; }
  }
  return cells;
}

/**
 * Returns true if there is an unobstructed line from (x0,y0) to (x1,y1).
 * A WALL cell anywhere along the intermediate path blocks LOS.
 */
export function checkLOS(grid, x0, y0, x1, y1) {
  const cells = bresenham(x0, y0, x1, y1);
  for (let i = 1; i < cells.length - 1; i++) {
    const { x, y } = cells[i];
    if (grid[y]?.[x]?.type === 'WALL') return false;
  }
  return true;
}

// --- ROOM PLACEMENT -----------------------------------------------------------

function carveRoom(grid, room) {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const x = room.x + dx;
      const y = room.y + dy;
      grid[y][x] = { x, y, type: 'FLOOR', revealed: false, lit: false };
    }
  }
}

function carveCorridor(grid, ax, ay, bx, by, rng) {
  const set = (x, y) => {
    if (grid[y]?.[x]?.type === 'WALL') {
      grid[y][x] = { x, y, type: 'CORRIDOR', revealed: false, lit: false };
    }
  };
  if (rng() > 0.5) {
    // Horizontal then vertical
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) set(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) set(bx, y);
  } else {
    // Vertical then horizontal
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) set(ax, y);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) set(x, by);
  }
}

// --- ENTITY PLACEMENT ---------------------------------------------------------

function freePos(rng, room, takenSet) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = room.x + Math.floor(rng() * room.w);
    const y = room.y + Math.floor(rng() * room.h);
    const key = `${x},${y}`;
    if (!takenSet.has(key)) { takenSet.add(key); return { x, y }; }
  }
  return null;
}

// --- MAIN GENERATOR -----------------------------------------------------------

/**
 * Generate a self-contained dungeon from dungeonData and a numeric seed.
 *
 * @param {object} dungeonData  { name, rooms, mod, domColor }  from MapGenerator
 * @param {number} rngSeed
 * @returns {DungeonState}
 */
export function generateDungeon(dungeonData, rngSeed) {
  const rng = makeRng(rngSeed);

  // -- Grid: all WALL ---------------------------------------------------------
  const grid = Array.from({ length: DUNGEON_H }, (_, y) =>
    Array.from({ length: DUNGEON_W }, (_, x) => ({ x, y, type: 'WALL', revealed: false, lit: false }))
  );

  // -- Room placement ---------------------------------------------------------
  const numRooms = Math.max(3, Math.min(5, dungeonData.rooms || 4));
  const rooms = [];

  for (let i = 0; i < numRooms; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const w = 4 + Math.floor(rng() * 5); // 4?8
      const h = 3 + Math.floor(rng() * 3); // 3?5
      const rx = 1 + Math.floor(rng() * (DUNGEON_W - w - 2));
      const ry = 1 + Math.floor(rng() * (DUNGEON_H - h - 2));

      const overlaps = rooms.some(r =>
        rx < r.x + r.w + 2 && rx + w + 2 > r.x &&
        ry < r.y + r.h + 2 && ry + h + 2 > r.y
      );

      if (!overlaps) {
        rooms.push({ x: rx, y: ry, w, h });
        carveRoom(grid, { x: rx, y: ry, w, h });
        placed = true;
        break;
      }
    }
    if (!placed && rooms.length >= 3) break;
  }

  // -- Corridors (L-shaped, room i ? room i+1) --------------------------------
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    const ax = a.x + Math.floor(a.w / 2);
    const ay = a.y + Math.floor(a.h / 2);
    const bx = b.x + Math.floor(b.w / 2);
    const by = b.y + Math.floor(b.h / 2);
    carveCorridor(grid, ax, ay, bx, by, rng);
  }

  // -- Player start: center of first room ------------------------------------
  const firstRoom = rooms[0];
  const playerStart = {
    x: firstRoom.x + Math.floor(firstRoom.w / 2),
    y: firstRoom.y + Math.floor(firstRoom.h / 2),
  };

  // -- Entities ---------------------------------------------------------------
  const entities = [];
  const { domColor } = dungeonData;

  rooms.forEach((room, roomIdx) => {
    const isFirst = roomIdx === 0;
    const isLast  = roomIdx === rooms.length - 1;
    const tier    = Math.min(3, 1 + Math.floor((roomIdx / Math.max(1, rooms.length - 1)) * 2));
    const centerKey = `${room.x + Math.floor(room.w / 2)},${room.y + Math.floor(room.h / 2)}`;
    const taken = new Set([centerKey]);

    // EXIT in last room center
    if (isLast) {
      const cx = room.x + Math.floor(room.w / 2);
      const cy = room.y + Math.floor(room.h / 2);
      taken.add(`${cx},${cy}`);
      entities.push({
        id: mkId(), type: 'EXIT',
        x: cx, y: cy,
        defeated: false, collected: false,
        roomIndex: roomIdx,
      });
    }

    // 1?2 ENEMY per non-first room
    if (!isFirst) {
      const count = 1 + Math.floor(rng() * 2);
      for (let e = 0; e < count; e++) {
        const pos = freePos(rng, room, taken);
        if (!pos) continue;
        const archKey = pickArch(rng, domColor);
        entities.push({
          id: mkId(), type: 'ENEMY',
          x: pos.x, y: pos.y,
          defeated: false, collected: false,
          archKey,
          name: pickName(rng, archKey, tier),
          hp: pickHp(rng, tier),
          tier,
          roomIndex: roomIdx,
        });
      }
    }

    // 0?1 TREASURE per room
    if (rng() > 0.4) {
      const pos = freePos(rng, room, taken);
      if (pos) {
        const gold = 20 + (tier * 15);
        const r = rng();
        let cardRarity;
        if (roomIdx < 2) {
          cardRarity = r < 0.50 ? 'C' : r < 0.80 ? 'U' : null;
        } else {
          cardRarity = r < 0.20 ? 'C' : r < 0.60 ? 'U' : 'R';
        }
        entities.push({
          id: mkId(), type: 'TREASURE',
          x: pos.x, y: pos.y,
          defeated: false, collected: false,
          gold,
          cardRarity: cardRarity || null,
          roomIndex: roomIdx,
        });
      }
    }
  });

  // -- Initial LOS reveal from playerStart ------------------------------------
  for (let y = 0; y < DUNGEON_H; y++) {
    for (let x = 0; x < DUNGEON_W; x++) {
      const cell = grid[y][x];
      if (cell.type !== 'WALL' && checkLOS(grid, playerStart.x, playerStart.y, x, y)) {
        grid[y][x] = { ...cell, revealed: true };
      }
    }
  }

  return {
    name:        dungeonData.name,
    mod:         dungeonData.mod,
    domColor:    dungeonData.domColor,
    grid,
    entities,
    playerStart,
    width:       DUNGEON_W,
    height:      DUNGEON_H,
    numRooms:    rooms.length,
  };
}
