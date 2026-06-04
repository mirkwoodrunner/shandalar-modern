// src/engine/__tests__/blocking.test.js
// Regression: MTG rule 509.1a -- tapped creatures cannot be declared as blockers.
// This test fails before the canBlockDuel tapped guard and passes after.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { PHASE } from '../phases.js';
import { makeState, makeCreature } from './_factory.js';

// Helper: dispatch DECLARE_BLOCKER and return the resulting state.
function tryBlock(state, blId, attId) {
  return duelReducer(state, { type: 'DECLARE_BLOCKER', blId, attId });
}

describe('blocking legality -- tapped creatures (rule 509.1a)', () => {
  it('rejects a tapped creature as a blocker', () => {
    const attacker = makeCreature('att1', { controller: 'o', attacking: true });
    const blocker  = makeCreature('bl1',  { controller: 'p', tapped: true });

    const state = {
      ...makeState({
        phase:  PHASE.COMBAT_BLOCKERS,
        active: 'o',
        oBf:    [attacker],
        pBf:    [blocker],
      }),
      attackers: ['att1'],
    };

    const next = tryBlock(state, 'bl1', 'att1');

    // State must be unchanged -- blocker map must remain empty.
    expect(next.blockers).not.toHaveProperty('bl1');
  });

  it('accepts an untapped creature as a blocker', () => {
    const attacker = makeCreature('att1', { controller: 'o', attacking: true });
    const blocker  = makeCreature('bl1',  { controller: 'p', tapped: false });

    const state = {
      ...makeState({
        phase:  PHASE.COMBAT_BLOCKERS,
        active: 'o',
        oBf:    [attacker],
        pBf:    [blocker],
      }),
      attackers: ['att1'],
    };

    const next = tryBlock(state, 'bl1', 'att1');

    expect(next.blockers['bl1']).toBe('att1');
  });

  it('Flying Man tapped by mana ability cannot block Tundra Wolves', () => {
    // Regression for the exact scenario reported: tapped Flying Man blocking.
    const wolves    = makeCreature('wolves', { controller: 'o', attacking: true, id: 'tundra_wolves', name: 'Tundra Wolves', power: 1, toughness: 1 });
    const flyingMan = makeCreature('flyman', { controller: 'p', tapped: true,    id: 'flying_man',   name: 'Flying Man',   power: 1, toughness: 1, keywords: ['FLYING'] });

    const state = {
      ...makeState({
        phase:  PHASE.COMBAT_BLOCKERS,
        active: 'o',
        oBf:    [wolves],
        pBf:    [flyingMan],
      }),
      attackers: ['wolves'],
    };

    const next = tryBlock(state, 'flyman', 'wolves');
    expect(next.blockers).not.toHaveProperty('flyman');
  });
});
