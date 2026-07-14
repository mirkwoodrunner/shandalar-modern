// tests/scenarios/damage-source-meta.test.js
// Deferral Sweep 1: hurt() structured damage-source meta, damageBySourceType
// tracking, and the damageRedirect hook (Martyrs of Korlis, Veteran Bodyguard).

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-combat-3 Scenario: damage-source-meta -- hurt() backward compatibility', () => {
  it('string-only 3-arg call behaves exactly as before (no meta)', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = hurt(state, 'p', 5, 'Test Source');
    expect(s1.p.life).toBe(15);
    expect(s1.log[s1.log.length - 1].text).toBe('p takes 5 damage from Test Source.');
    expect(s1.turnState.damageBySourceType).toBeUndefined();
  });

  it('4-arg call (src, no meta) still works', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = hurt(state, 'p', 3, 'Legacy Source');
    expect(s1.p.life).toBe(17);
  });
});

describe('@engine-combat-3 Scenario: damage-source-meta -- damageBySourceType tracking', () => {
  it('accumulates damage by source type per player and resets at CLEANUP', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    let state = { ...base, p: { ...base.p, life: 20 }, turnState: { ...base.turnState, damageBySourceType: {} } };
    state = hurt(state, 'p', 2, 'Rod of Ruin', { sourceIid: 'ror-1', sourceType: 'artifact' });
    state = hurt(state, 'p', 3, 'Rocket Launcher', { sourceIid: 'rl-1', sourceType: 'artifact' });
    expect(state.turnState.damageBySourceType.p.artifact).toBe(5);

    // A different sourceType accumulates independently.
    state = hurt(state, 'p', 4, 'Grizzly Bears', { sourceIid: 'gb-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(state.turnState.damageBySourceType.p.artifact).toBe(5);
    expect(state.turnState.damageBySourceType.p.creature).toBe(4);

    // CLEANUP resets it.
    const preCleanup = { ...state, phase: PHASE.END };
    const s1 = duelReducer(preCleanup, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.phase).toBe(PHASE.CLEANUP);
    expect(s1.turnState.damageBySourceType).toEqual({});
  });
});

describe('@engine-combat-3 Scenario: damage-source-meta -- damageRedirect hook', () => {
  it('Veteran-Bodyguard-shape: redirects unblocked combat creature damage (non-lethal)', () => {
    const bodyguard = makeCreature('vb-1', { id: 'veteran_bodyguard', name: 'Veteran Bodyguard', controller: 'p', power: 2, toughness: 5, tapped: false, damageRedirect: { from: 'unblockedCreatures' } });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', pBf: [bodyguard] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = hurt(state, 'p', 3, 'Attacking Creature', { sourceIid: 'att-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(20); // player took no damage
    expect(s1.p.bf.find(c => c.iid === 'vb-1').damage).toBe(3);
  });

  it('Veteran-Bodyguard-shape: lethal redirected damage kills the redirect target', () => {
    const bodyguard = makeCreature('vb-1', { id: 'veteran_bodyguard', name: 'Veteran Bodyguard', controller: 'p', power: 2, toughness: 5, tapped: false, damageRedirect: { from: 'unblockedCreatures' } });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', pBf: [bodyguard] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    // hurt() calls checkDeath() internally on the redirect path, so state-based
    // actions apply immediately -- no separate checkDeath() call needed here.
    const s1 = hurt(state, 'p', 5, 'Attacking Creature', { sourceIid: 'att-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(20); // player took no damage
    expect(s1.p.bf.some(c => c.iid === 'vb-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'vb-1')).toBe(true);
  });

  it('Veteran-Bodyguard-shape: does not redirect blocked (trample) creature damage', () => {
    const bodyguard = makeCreature('vb-1', { id: 'veteran_bodyguard', name: 'Veteran Bodyguard', controller: 'p', power: 2, toughness: 5, tapped: false, damageRedirect: { from: 'unblockedCreatures' } });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', pBf: [bodyguard] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = hurt(state, 'p', 3, 'Trampler (trample)', { sourceIid: 'att-1', sourceType: 'creature', combat: true, unblocked: false });
    expect(s1.p.life).toBe(17); // not redirected -- attacker was blocked
  });

  it('Veteran-Bodyguard-shape: does not redirect while tapped', () => {
    const bodyguard = makeCreature('vb-1', { id: 'veteran_bodyguard', name: 'Veteran Bodyguard', controller: 'p', power: 2, toughness: 5, tapped: true, damageRedirect: { from: 'unblockedCreatures' } });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', pBf: [bodyguard] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = hurt(state, 'p', 5, 'Attacking Creature', { sourceIid: 'att-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(15); // tapped -- redirect does not apply
  });

  it('Martyrs-of-Korlis-shape: redirects artifact-source damage while untapped', () => {
    const martyrs = makeCreature('mk-1', { id: 'martyrs_of_korlis', name: 'Martyrs of Korlis', controller: 'p', power: 1, toughness: 6, tapped: false, damageRedirect: { from: 'artifacts' } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [martyrs] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = hurt(state, 'p', 4, 'Dingus Egg', { sourceIid: 'de-1', sourceType: 'artifact' });
    expect(s1.p.life).toBe(20);
    expect(s1.p.bf.find(c => c.iid === 'mk-1').damage).toBe(4);
  });

  it('Martyrs-of-Korlis-shape: does not redirect creature-source damage', () => {
    const martyrs = makeCreature('mk-1', { id: 'martyrs_of_korlis', name: 'Martyrs of Korlis', controller: 'p', power: 1, toughness: 6, tapped: false, damageRedirect: { from: 'artifacts' } });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', pBf: [martyrs] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = hurt(state, 'p', 4, 'Attacking Creature', { sourceIid: 'att-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(16); // not an artifact source -- no redirect
  });

  it('redirected damage is not counted toward damageBySourceType (the player was never dealt the damage)', () => {
    const martyrs = makeCreature('mk-1', { id: 'martyrs_of_korlis', name: 'Martyrs of Korlis', controller: 'p', power: 1, toughness: 6, tapped: false, damageRedirect: { from: 'artifacts' } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [martyrs] });
    const state = { ...base, p: { ...base.p, life: 20 }, turnState: { ...base.turnState, damageBySourceType: {} } };
    const s1 = hurt(state, 'p', 4, 'Dingus Egg', { sourceIid: 'de-1', sourceType: 'artifact' });
    expect(s1.turnState.damageBySourceType?.p?.artifact ?? 0).toBe(0);
  });
});
