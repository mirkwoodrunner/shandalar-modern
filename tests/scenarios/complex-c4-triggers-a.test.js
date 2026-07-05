// tests/scenarios/complex-c4-triggers-a.test.js
// Complex-tier stub cards implemented from Card-Forge/forge reference scripts
// (GPL-3.0), sub-batch C4 (triggered abilities), checkpoint A (12 cards).
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, getTou } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: Complex-tier Forge batch C4 checkpoint A -- triggered abilities', () => {

  it('El-Hajjâj: gains life equal to unblocked combat damage dealt', () => {
    const hajjaj = makeCreature('eh-1', {
      id: 'el_hajjaj', name: 'El-Hajjâj', controller: 'p', power: 1, toughness: 1, attacking: true,
      triggeredAbilities: [{ id: 'elhajjaj_dmg', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSource' }, effect: { type: 'gainLifeEqualToDamageDealt' } }],
    });
    const base = { ...makeState({ phase: PHASE.COMBAT_AFTER_BLOCKERS, active: 'p', pBf: [hajjaj] }), attackers: ['eh-1'] };
    const state = { ...base, p: { ...base.p, life: 20 }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    expect(s1.o.life).toBe(19);
    expect(s1.p.life).toBe(21);
  });

  it('Feedback/Wanderlust/Warp Artifact: deal 1 damage to enchanted permanent controller at their upkeep', () => {
    const wanderlustAura = { iid: 'wl-1', name: 'Wanderlust', mod: {}, controller: 'o', cardData: {} };
    const cre = makeCreature('c-1', { controller: 'p', enchantments: [wanderlustAura] });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [cre] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    expect(s2.p.life).toBe(19);
  });

  it("Island Sanctuary: skips the draw and protects until the controller's next turn", () => {
    const sanctuary = { iid: 'is-1', id: 'island_sanctuary', name: 'Island Sanctuary', type: 'Enchantment', controller: 'p' };
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', turn: 2, pBf: [sanctuary] });
    const state = { ...base, p: { ...base.p, lib: [makeLand('l1')], hand: [] } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> DRAW
    expect(s1.p.hand).toHaveLength(0);
    expect(s1.p.islandSanctuaryProtected).toBe(true);
  });

  it("Island Sanctuary: a non-flying/non-islandwalk creature can't attack the protected player", () => {
    const oCre = makeCreature('oc-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [oCre] });
    const state = { ...base, p: { ...base.p, islandSanctuaryProtected: true } };
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'oc-1' });
    expect(s1.attackers).not.toContain('oc-1');
  });

  it('Mold Demon: ETB sacrifices two Swamps to survive when available', () => {
    const spell = { iid: 'md-1', id: 'mold_demon', name: 'Mold Demon', type: 'Creature', cmc: 7, cost: '5BB', power: 6, toughness: 6, effect: 'moldDemonETB' };
    const sw1 = makeLand('s1', { controller: 'p', subtype: 'Swamp' });
    const sw2 = makeLand('s2', { controller: 'p', subtype: 'Swamp' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], pBf: [sw1, sw2] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 5 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'md-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.some(c => c.iid === 'md-1')).toBe(true);
    expect(s2.p.bf.filter(c => c.iid === 's1' || c.iid === 's2')).toHaveLength(0);
  });

  it('Mold Demon: ETB sacrifices itself without enough Swamps', () => {
    const spell = { iid: 'md-1', id: 'mold_demon', name: 'Mold Demon', type: 'Creature', cmc: 7, cost: '5BB', power: 6, toughness: 6, effect: 'moldDemonETB' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 5 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'md-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.some(c => c.iid === 'md-1')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'md-1')).toBe(true);
  });

  it('Wall of Tombstones: base toughness set to 1 + creature cards in graveyard at upkeep', () => {
    const wall = makeCreature('wt-1', { id: 'wall_of_tombstones', name: 'Wall of Tombstones', controller: 'p', power: 0, toughness: 1, upkeep: 'wallOfTombstonesUpkeep' });
    const dead1 = makeCreature('d1', { controller: 'p' });
    const dead2 = makeCreature('d2', { controller: 'p' });
    const deadLand = makeLand('d3', { controller: 'p' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [wall] });
    const state = { ...base, p: { ...base.p, gy: [dead1, dead2, deadLand] } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    expect(getTou(s2.p.bf.find(c => c.iid === 'wt-1'), s2)).toBe(3);
  });

  it("Ydwen Efreet: losing the coin flip removes it from combat and unblocks the attacker", () => {
    const efreet = makeCreature('ye-1', { id: 'ydwen_efreet', name: 'Ydwen Efreet', controller: 'p', power: 3, toughness: 6, coinFlipOnBlock: true });
    const attacker = makeCreature('atk-1', { controller: 'o', attacking: true });
    const base = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'o', pBf: [efreet], oBf: [attacker] }), attackers: ['atk-1'] };
    const originalRandom = Math.random;
    Math.random = () => 0.9; // forces "loses the flip" (< 0.5 test is false)
    try {
      const s1 = duelReducer(base, { type: 'DECLARE_BLOCKER', blId: 'ye-1', attId: 'atk-1' });
      expect(s1.p.bf.find(c => c.iid === 'ye-1').blocking).toBeNull();
      expect(s1.p.bf.find(c => c.iid === 'ye-1').cantBlockThisTurn).toBe(true);
      expect(s1.blockers['ye-1']).toBeUndefined();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('Abomination: destroys a white/green creature it blocks, at end of combat', () => {
    const abom = makeCreature('ab-1', { id: 'abomination', name: 'Abomination', controller: 'p', power: 2, toughness: 6, blocksDestroyFilter: 'greenOrWhite', blockedByDestroyFilter: 'greenOrWhite' });
    const whiteAttacker = makeCreature('wa-1', { controller: 'o', color: 'W', attacking: true, toughness: 10 });
    const base = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'o', pBf: [abom], oBf: [whiteAttacker] }), attackers: ['wa-1'] };
    const s1 = duelReducer(base, { type: 'DECLARE_BLOCKER', blId: 'ab-1', attId: 'wa-1' });
    expect(s1.turnState.endOfCombatDestroy).toContain('wa-1');
    const s2 = { ...s1, phase: PHASE.COMBAT_AFTER_BLOCKERS };
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_END
    expect(s4.o.bf.some(c => c.iid === 'wa-1')).toBe(false);
  });

  it('Cockatrice: destroys any non-Wall creature it blocks or is blocked by, at end of combat', () => {
    const cockatrice = makeCreature('ck-1', { id: 'cockatrice', name: 'Cockatrice', controller: 'p', power: 2, toughness: 4, attacking: true, blocksDestroyFilter: 'nonWall', blockedByDestroyFilter: 'nonWall' });
    const blocker = makeCreature('bl-1', { controller: 'o', toughness: 10 });
    const base = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'p', pBf: [cockatrice], oBf: [blocker] }), attackers: ['ck-1'] };
    const s1 = duelReducer(base, { type: 'DECLARE_BLOCKER', blId: 'bl-1', attId: 'ck-1' });
    expect(s1.turnState.endOfCombatDestroy).toContain('bl-1');
  });

  it('Infernal Medusa: destroys any creature it blocks (no filter)', () => {
    const medusa = makeCreature('im-1', { id: 'infernal_medusa', name: 'Infernal Medusa', controller: 'p', power: 2, toughness: 4, blocksDestroyFilter: 'any', blockedByDestroyFilter: 'nonWall' });
    const attacker = makeCreature('atk-1', { controller: 'o', attacking: true, toughness: 10 });
    const base = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'o', pBf: [medusa], oBf: [attacker] }), attackers: ['atk-1'] };
    const s1 = duelReducer(base, { type: 'DECLARE_BLOCKER', blId: 'im-1', attId: 'atk-1' });
    expect(s1.turnState.endOfCombatDestroy).toContain('atk-1');
  });

  it('Time Elemental: sacrificed at end of combat after attacking, deals 5 damage to its controller', () => {
    const elemental = makeCreature('te-1', { id: 'time_elemental', name: 'Time Elemental', controller: 'p', power: 0, toughness: 2, sacrificeAtEndOfCombat: true });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [elemental] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'te-1' });
    expect(s1.turnState.endOfCombatSacrifice).toContain('te-1');
    const s2 = { ...s1, phase: PHASE.COMBAT_AFTER_BLOCKERS };
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_END
    expect(s4.p.bf.some(c => c.iid === 'te-1')).toBe(false);
    expect(s4.p.life).toBe(15);
  });

  it("Time Elemental: bounces an unenchanted target permanent", () => {
    const elemental = makeCreature('te-1', { id: 'time_elemental', name: 'Time Elemental', controller: 'p', activated: { cost: '2UU,T', effect: 'bounceUnenchanted', requiresTarget: true } });
    const oCre = makeCreature('oc-1', { controller: 'o', enchantments: [] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [elemental], oBf: [oCre] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'te-1', tgt: 'oc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.some(c => c.iid === 'oc-1')).toBe(false);
    expect(s2.o.hand.some(c => c.iid === 'oc-1')).toBe(true);
  });
});
