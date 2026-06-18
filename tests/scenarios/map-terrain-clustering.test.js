// tests/scenarios/map-terrain-clustering.test.js
// Validates the coherent value-noise terrain generation in MapGenerator.js:
// determinism, biome proportions, connectivity, and spatial clustering
// (connected biome regions vs the old per-tile checkerboard).

import { describe, it, expect } from 'vitest';
import { generateMap, TERRAIN, MAP_W, MAP_H } from '../../src/engine/MapGenerator.js';

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function landCounts(tiles) {
  const counts = {};
  let land = 0;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const id = tiles[y][x].terrain.id;
      counts[id] = (counts[id] || 0) + 1;
      if (id !== 'WATER') land += 1;
    }
  }
  return { counts, land };
}

function reachableFrom(tiles, sx, sy) {
  const seen = new Set([`${sx},${sy}`]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      const t = tiles[ny]?.[nx];
      if (!t || t.terrain.id === 'WATER') continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

describe('MapGenerator coherent-noise terrain', () => {
  it('is deterministic for a given seed', () => {
    const a = generateMap(7);
    const b = generateMap(7);
    expect(a.startX).toBe(b.startX);
    expect(a.startY).toBe(b.startY);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        expect(a.tiles[y][x].terrain.id).toBe(b.tiles[y][x].terrain.id);
      }
    }
  });

  it('preserves land biome proportions within tolerance', () => {
    const { tiles } = generateMap(42);
    const { counts, land } = landCounts(tiles);
    const frac = (id) => (counts[id] || 0) / land;
    // Targets from the quantile cut points (cost-monotonic ladder).
    expect(frac('ISLAND')).toBeCloseTo(0.28, 1);
    expect(frac('PLAINS')).toBeCloseTo(0.20, 1);
    expect(frac('FOREST')).toBeCloseTo(0.20, 1);
    expect(frac('SWAMP')).toBeCloseTo(0.14, 1);
    expect(frac('MOUNTAIN')).toBeCloseTo(0.18, 1);
  });

  it('keeps all land reachable from the player start (no traps)', () => {
    for (const seed of [1, 42, 99, 1234]) {
      const { tiles, startX, startY } = generateMap(seed);
      const seen = reachableFrom(tiles, startX, startY);
      let land = 0;
      let reached = 0;
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (tiles[y][x].terrain.id === 'WATER') continue;
          land += 1;
          if (seen.has(`${x},${y}`)) reached += 1;
        }
      }
      expect(reached).toBe(land);
    }
  });

  it('clusters biomes into connected regions (not a checkerboard)', () => {
    const { tiles } = generateMap(42);
    let same = 0;
    let edges = 0;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const id = tiles[y][x].terrain.id;
        if (id === 'WATER') continue;
        for (const [dx, dy] of DIRS) {
          const t = tiles[y + dy]?.[x + dx];
          if (!t) continue;
          edges += 1;
          if (t.terrain.id === id) same += 1;
        }
      }
    }
    // Pure per-tile random is ~0.2; coherent regions are well above 0.5.
    expect(same / edges).toBeGreaterThan(0.5);
  });

  it('still produces a water-dominated outer ring', () => {
    const { tiles } = generateMap(42);
    expect(tiles[0][0].terrain.id).toBe(TERRAIN.WATER.id);
    expect(tiles[MAP_H - 1][MAP_W - 1].terrain.id).toBe(TERRAIN.WATER.id);
  });
});
