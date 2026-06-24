// tests/scenarios/monster-variety.test.js
// Validates that encounter monster selection is decoupled from terrain biome:
// pickMonster(tier, rand) picks a tier-appropriate monster from a RANDOM biome
// list, so the player sees a variety of archetypes/colors everywhere.

import { describe, it, expect } from 'vitest';
import { pickMonster, MONSTER_TABLE } from '../../src/engine/MapGenerator.js';

const LISTS = Object.values(MONSTER_TABLE);
const N = LISTS.length;

// Deterministic stub: returns values that index each biome list in turn.
function rotatingRand(seq) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

describe('@overworld pickMonster (terrain-decoupled monster variety)', () => {
  it('indexes the correct tier within a list', () => {
    // rand -> 0 always selects the first biome list (PLAINS: WHITE_WEENIE).
    const zero = () => 0;
    expect(pickMonster(1, zero)).toBe(LISTS[0][0]);
    expect(pickMonster(2, zero)).toBe(LISTS[0][1]);
    expect(pickMonster(3, zero)).toBe(LISTS[0][2]);
  });

  it('clamps tier to the available range', () => {
    const zero = () => 0;
    const last = LISTS[0].length - 1;
    expect(pickMonster(99, zero)).toBe(LISTS[0][last]); // over-high tier clamps to last
    expect(pickMonster(0, zero)).toBe(LISTS[0][0]);     // tier 0 clamps to first
    expect(pickMonster(-5, zero)).toBe(LISTS[0][0]);
  });

  it('can select every biome archetype regardless of terrain (variety)', () => {
    // Step rand across each list bucket: i/N lands in list i.
    const seq = Array.from({ length: N }, (_, i) => i / N);
    const rand = rotatingRand(seq);
    const archetypes = new Set();
    for (let i = 0; i < N; i++) {
      archetypes.add(pickMonster(1, rand).archKey);
    }
    // All five biome lists are reachable -> at least 5 distinct tier-1 archetypes.
    expect(archetypes.size).toBe(N);
    expect(archetypes.has('WHITE_WEENIE')).toBe(true);
    expect(archetypes.has('GREEN_STOMPY')).toBe(true);
    expect(archetypes.has('BLACK_CONTROL')).toBe(true);
    expect(archetypes.has('RED_AGGRO')).toBe(true);
    expect(archetypes.has('BLUE_TEMPO')).toBe(true);
  });

  it('takes no terrain argument (selection is terrain-independent)', () => {
    // pickMonster's signature is (tier, rand) only -- no terrain input exists.
    expect(pickMonster.length).toBe(2);
  });
});
