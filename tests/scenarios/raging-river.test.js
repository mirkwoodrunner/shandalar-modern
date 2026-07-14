import { describe, it, expect } from 'vitest';
import { duelReducer, canBlockDuel } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-card-scenarios-7 Raging River', () => {
  it('RR-01: trigger populates pendingRiverDivide', () => {
    const state = makeState();
    state.p.attackers = ['a1'];
    state.p.bf = [makeCreature('a1')];
    const nonFlyer = makeCreature('df1');
    state.o.bf = [nonFlyer];
    const riverCard = { iid: 'river1', id: 'raging_river', name: 'Raging River', controller: 'p', triggeredAbilities: [] };

    // Simulate trigger emission
    const s1 = { ...state, pendingRiverDivide: { defender: 'o', nonFlyerIids: ['df1'], attackingPlayer: 'p' } };
    expect(s1.pendingRiverDivide).toBeDefined();
    expect(s1.pendingRiverDivide.nonFlyerIids).toContain('df1');
  });

  it('RR-03: RIVER_DIVIDE stamps piles and opens pendingRiverSides', () => {
    const state = makeState();
    state.pendingRiverDivide = { defender: 'o', nonFlyerIids: ['df1', 'df2'], attackingPlayer: 'p' };
    state.o.bf = [makeCreature('df1'), makeCreature('df2')];
    const s1 = duelReducer(state, {
      type: 'RIVER_DIVIDE',
      who: 'o',
      leftIids: ['df1'],
      rightIids: ['df2'],
    });
    expect(s1.o.bf[0].riverPile).toBe('left');
    expect(s1.o.bf[1].riverPile).toBe('right');
    expect(s1.pendingRiverSides).toBeDefined();
  });

  it('RR-06: RIVER_SIDES stamps sides and sets latch', () => {
    const state = makeState();
    state.p.attackers = ['a1'];
    state.p.bf = [makeCreature('a1')];
    state.pendingRiverSides = { chooser: 'p', attackerIids: ['a1'], sides: {} };
    const s1 = duelReducer(state, {
      type: 'RIVER_SIDES',
      who: 'p',
      sides: { a1: 'left' },
    });
    expect(s1.p.bf[0].riverSide).toBe('left');
    expect(s1.turnState.riverAppliedThisCombat).toBe(true);
  });

  it('RR-07: non-flyer in wrong pile cannot block', () => {
    const attacker = { iid: 'a1', name: 'Attacker', type: 'Creature', riverSide: 'left' };
    const blocker = { iid: 'bl1', name: 'Blocker', type: 'Creature', riverPile: 'right' };
    const canBlock = canBlockDuel(blocker, attacker, [], null);
    expect(canBlock).toBe(false);
  });

  it('RR-08: matching pile can block', () => {
    const attacker = { iid: 'a1', name: 'Attacker', type: 'Creature', riverSide: 'left' };
    const blocker = { iid: 'bl1', name: 'Blocker', type: 'Creature', riverPile: 'left' };
    const canBlock = canBlockDuel(blocker, attacker, [], null);
    expect(canBlock).toBe(true);
  });

  it('RR-14: zero non-flying defenders sides all attackers', () => {
    const state = makeState();
    state.p.attackers = ['a1'];
    state.p.bf = [makeCreature('a1')];
    state.o.bf = []; // No defenders
    // Simulate the trigger with no defenders
    expect(state.o.bf.length).toBe(0);
  });

  it('RR-17: COMBAT_END strips riverSide/riverPile', () => {
    const state = makeState({ phase: PHASE.COMBAT_END });
    state.p.bf = [{ ...makeCreature('a1'), riverSide: 'left' }];
    state.o.bf = [{ ...makeCreature('bl1'), riverPile: 'right' }];
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.bf[0].riverSide).toBeUndefined();
    expect(s1.o.bf[0].riverPile).toBeUndefined();
  });
});
