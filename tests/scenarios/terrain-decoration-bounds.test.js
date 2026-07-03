// tests/scenarios/terrain-decoration-bounds.test.js
// Regression coverage for the tree horizontal-clipping and vertical-clamp-order
// bugs (Sprite Black Boxes + Tree Clipping fix, 2026-07-02). Pure-data tests
// against getDecorations -- no DOM, no canvas.

import { describe, it, expect } from 'vitest';
import {
  getDecorations,
  TILE_SIZE,
  OVERFLOW_TOP,
  OVERFLOW_X,
} from '../../src/ui/overworld/terrainRenderer.js';

describe('@overworld Scenario: terrain decoration overflow bounds', () => {

  it('every FOREST decoration instruction stays within the horizontal overflow band', () => {
    for (let x = 0; x < 60; x++) {
      for (let y = 0; y < 60; y++) {
        for (const d of getDecorations('FOREST', x, y)) {
          const dw = d.w * d.scale;
          const left = d.anchorX - dw / 2;
          const right = d.anchorX + dw / 2;
          expect(left, `tile (${x},${y}) left edge ${left}`).toBeGreaterThanOrEqual(-OVERFLOW_X);
          expect(right, `tile (${x},${y}) right edge ${right}`).toBeLessThanOrEqual(TILE_SIZE + OVERFLOW_X);
        }
      }
    }
  });

  it('every FOREST decoration instruction stays within the vertical overflow band', () => {
    for (let x = 0; x < 60; x++) {
      for (let y = 0; y < 60; y++) {
        for (const d of getDecorations('FOREST', x, y)) {
          const dh = d.h * d.scale;
          expect(dh, `tile (${x},${y}) height ${dh}`).toBeLessThanOrEqual(TILE_SIZE + OVERFLOW_TOP);
        }
      }
    }
  });

  it('getDecorations is deterministic for a fixed tile', () => {
    const first = getDecorations('FOREST', 7, 11);
    const second = getDecorations('FOREST', 7, 11);
    expect(second).toEqual(first);
  });

});
