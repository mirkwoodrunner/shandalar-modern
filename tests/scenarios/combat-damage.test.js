// tests/scenarios/combat-damage.test.js
// Smoke tests for the core combat damage loop.
// Validates: unblocked damage, mutual lethal blocking, summoning sickness lock.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('Combat damage', () => {

  it('4a: unblocked attacker deals damage to the defending player', () => {
    // Opponent controls a 2/2, active player in COMBAT_ATTACKERS.
    const attacker = makeCreature('att-1', { controller: 'o' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
    });

    // Declare the attacker, then advance through all combat phases to damage resolution.
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves

    expect(s5.p.life).toBe(18);
  });

  it('4b: blocked attacker and blocker deal lethal damage to each other and both die', () => {
    // Opponent 2/2 attacks; player 2/2 blocks. Both take 2 damage (>= toughness 2) and die.
    const attacker = makeCreature('att-1', { controller: 'o' });
    const blocker  = makeCreature('bl-1',  { controller: 'p' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves

    // State-based action: both creatures had damage >= toughness, so both are destroyed.
    expect(s6.o.bf.some(c => c.iid === 'att-1')).toBe(false);
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(false);
    // Both creatures move to their respective graveyards.
    expect(s6.o.gy.some(c => c.iid === 'att-1')).toBe(true);
    expect(s6.p.gy.some(c => c.iid === 'bl-1')).toBe(true);
  });

  it('4c: creature with summoning sickness cannot be declared as an attacker', () => {
    const creature = makeCreature('c1', { summoningSick: true, controller: 'o' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [creature],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'c1' });

    expect(s1.attackers).not.toContain('c1');
  });

});
