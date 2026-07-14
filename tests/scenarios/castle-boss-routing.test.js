import { describe, it, expect } from 'vitest';
import { MAGE_BOSS_ARCHS } from '../../src/engine/MapGenerator.js';
import { ARCHETYPES } from '../../src/data/cards.js';

describe('@overworld-generation castle boss-deck routing', () => {
  const colors = ['W', 'U', 'B', 'R', 'G'];

  it('maps every castle color to an existing BOSS_* archetype', () => {
    for (const col of colors) {
      const key = MAGE_BOSS_ARCHS[col];
      expect(key, `missing boss key for ${col}`).toMatch(/^BOSS_/);
      expect(ARCHETYPES[key], `ARCHETYPES missing ${key}`).toBeDefined();
    }
  });

  it('each boss archetype has a 40-card deck and a profileId', () => {
    for (const col of colors) {
      const arch = ARCHETYPES[MAGE_BOSS_ARCHS[col]];
      expect(Array.isArray(arch.deck)).toBe(true);
      expect(arch.deck.length).toBe(40);
      expect(typeof arch.profileId).toBe('string');
      expect(arch.profileId.length).toBeGreaterThan(0);
    }
  });

  it('does not route castle colors to the generic MAGE_ARCHS decks', () => {
    expect(MAGE_BOSS_ARCHS.W).not.toBe('WHITE_WEENIE');
  });
});
