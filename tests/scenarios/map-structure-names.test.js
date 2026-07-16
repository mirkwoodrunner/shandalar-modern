// tests/scenarios/map-structure-names.test.js
// Regression test for the "Dungeon14" bug: structure name pools must stay
// sized above their max spawn counts, and the fallback (if ever hit) must
// not fall back to a raw `${Type}${i}` placeholder that breaks immersion.

import { describe, it, expect } from 'vitest';
import { generateMap, MAP_W, MAP_H } from '../../src/engine/MapGenerator.js';

const GENERIC_NAME = /^(Town|Dungeon|Ruin)\d+$/;

describe('@overworld-generation MapGenerator structure names', () => {
  it('never assigns a generic placeholder name to towns, dungeons, or ruins', () => {
    for (const seed of [1, 7, 42, 99, 1234, 5555, 99999]) {
      const { tiles } = generateMap(seed);
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          const t = tiles[y][x];
          if (t.townData) expect(t.townData.name).not.toMatch(GENERIC_NAME);
          if (t.dungeonData) expect(t.dungeonData.name).not.toMatch(GENERIC_NAME);
          if (t.ruinData) expect(t.ruinData.name).not.toMatch(GENERIC_NAME);
        }
      }
    }
  });

  it('gives every spawned town, dungeon, and ruin a non-empty name', () => {
    const { tiles } = generateMap(42);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = tiles[y][x];
        if (t.townData) expect(t.townData.name).toBeTruthy();
        if (t.dungeonData) expect(t.dungeonData.name).toBeTruthy();
        if (t.ruinData) expect(t.ruinData.name).toBeTruthy();
      }
    }
  });
});
