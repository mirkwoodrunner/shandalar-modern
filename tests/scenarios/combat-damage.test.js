// tests/scenarios/combat-damage.test.js
// Smoke tests for the core combat damage loop.
// Validates: unblocked damage, mutual lethal blocking, summoning sickness lock.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-combat-1 Combat damage', () => {

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

  it('4d: first-strike attacker kills blocker before blocker can deal damage back', () => {
    // Opponent 2/2 first-strike attacks; player 2/2 (no first strike) blocks.
    // FS attacker deals 2 in the first-strike pass, killing the blocker.
    // Blocker is dead before the regular pass, so it never deals damage back.
    const attacker = makeCreature('att-1', { controller: 'o', keywords: ['FIRST_STRIKE'] });
    const blocker  = makeCreature('bl-1',  { controller: 'p' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3,    { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s6 = duelReducer(s5,    { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves

    // Blocker is destroyed by first-strike damage.
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(false);
    expect(s6.p.gy.some(c => c.iid === 'bl-1')).toBe(true);
    // Attacker survives with 0 damage marked (blocker never got to deal its damage).
    expect(s6.o.bf.some(c => c.iid === 'att-1')).toBe(true);
    expect(s6.o.bf.find(c => c.iid === 'att-1').damage).toBe(0);
  });

  it('4e: first-strike blocker kills non-first-strike attacker before regular pass', () => {
    // Player 2/2 first-strike blocks opponent 2/2 (no first strike) attacker.
    // Blocker deals 2 in first-strike pass, killing the attacker.
    // Attacker never deals its 2 damage back in the regular pass.
    const attacker = makeCreature('att-1', { controller: 'o' });
    const blocker  = makeCreature('bl-1',  { controller: 'p', keywords: ['FIRST_STRIKE'] });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3,    { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5,    { type: 'ADVANCE_PHASE' });

    // Attacker is destroyed by first-strike damage.
    expect(s6.o.bf.some(c => c.iid === 'att-1')).toBe(false);
    expect(s6.o.gy.some(c => c.iid === 'att-1')).toBe(true);
    // Blocker survives with 0 damage (attacker never dealt damage).
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(true);
    expect(s6.p.bf.find(c => c.iid === 'bl-1').damage).toBe(0);
  });

  it('4f: both attacker and blocker have first strike -- damage is mutual in the first-strike pass', () => {
    // Opponent 2/2 first-strike attacks; player 2/2 first-strike blocks.
    // Both deal damage simultaneously within the first-strike pass: mutual death.
    const attacker = makeCreature('att-1', { controller: 'o', keywords: ['FIRST_STRIKE'] });
    const blocker  = makeCreature('bl-1',  { controller: 'p', keywords: ['FIRST_STRIKE'] });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3,    { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5,    { type: 'ADVANCE_PHASE' });

    // Both die simultaneously in the first-strike pass.
    expect(s6.o.bf.some(c => c.iid === 'att-1')).toBe(false);
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(false);
    expect(s6.o.gy.some(c => c.iid === 'att-1')).toBe(true);
    expect(s6.p.gy.some(c => c.iid === 'bl-1')).toBe(true);
    // No damage to players (blocked).
    expect(s6.p.life).toBe(20);
    expect(s6.o.life).toBe(20);
  });

  it('4g: first-strike unblocked attacker deals player damage once, not duplicated in regular pass', () => {
    // Opponent 2/2 first-strike attacks; no blockers.
    // Damage to player must happen exactly once (in the first-strike pass, not again in the regular pass).
    const attacker = makeCreature('att-1', { controller: 'o', keywords: ['FIRST_STRIKE'] });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3,    { type: 'ADVANCE_PHASE' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' });

    // Player takes exactly 2 damage once (not 4 from double-dealing).
    expect(s5.p.life).toBe(18);
  });

  it('4h: non-first-strike combat is unchanged -- both a 2/2 attacker and 2/2 blocker die as before', () => {
    // Regression: same scenario as 4b but verified explicitly as passing through the new two-pass logic.
    const attacker = makeCreature('att-1', { controller: 'o' });
    const blocker  = makeCreature('bl-1',  { controller: 'p' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3,    { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5,    { type: 'ADVANCE_PHASE' });

    expect(s6.o.bf.some(c => c.iid === 'att-1')).toBe(false);
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(false);
    expect(s6.o.gy.some(c => c.iid === 'att-1')).toBe(true);
    expect(s6.p.gy.some(c => c.iid === 'bl-1')).toBe(true);
  });

  it('4i: first-strike + lifelink gains life in the first-strike pass, not double-counted', () => {
    // Opponent 2/2 first-strike + lifelink attacks; player 2/2 (no first strike) blocks.
    // Attacker deals 2 in first-strike pass, gains 2 life, kills blocker.
    // Regular pass: blocker is dead, attacker doesn't deal damage again, no extra life gain.
    const attacker = makeCreature('att-1', { controller: 'o', keywords: ['FIRST_STRIKE', 'LIFELINK'] });
    const blocker  = makeCreature('bl-1',  { controller: 'p' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3,    { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5,    { type: 'ADVANCE_PHASE' });

    // Blocker is dead.
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(false);
    // Attacker survives with 0 damage.
    expect(s6.o.bf.some(c => c.iid === 'att-1')).toBe(true);
    expect(s6.o.bf.find(c => c.iid === 'att-1').damage).toBe(0);
    // Opponent gained exactly 2 life from lifelink (once, not twice).
    expect(s6.o.life).toBe(22);
  });

  it('4j: "First strike damage." is not logged when no combatant has first strike', () => {
    const attacker = makeCreature('att-1', { controller: 'o' });
    const blocker  = makeCreature('bl-1',  { controller: 'p' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3,    { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5,    { type: 'ADVANCE_PHASE' });

    expect(s6.log.some(e => e.text === 'First strike damage.')).toBe(false);
    // Sanity: combat still resolved normally (mutual lethal, both die).
    expect(s6.o.bf.some(c => c.iid === 'att-1')).toBe(false);
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(false);
  });

  it('4k: "First strike damage." is still logged when a combatant has first strike', () => {
    const attacker = makeCreature('att-1', { controller: 'o', keywords: ['FIRST_STRIKE'] });
    const blocker  = makeCreature('bl-1',  { controller: 'p' });
    const state = makeState({
      phase: PHASE.COMBAT_ATTACKERS,
      active: 'o',
      oBf: [attacker],
      pBf: [blocker],
    });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1,    { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2,    { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3,    { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4,    { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5,    { type: 'ADVANCE_PHASE' });

    expect(s6.log.some(e => e.text === 'First strike damage.')).toBe(true);
  });

});
