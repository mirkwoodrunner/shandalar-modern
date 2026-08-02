/**
 * @module-tag engine
 */
// tests/scenarios/damage-prevention-batch-4.test.js
// A9 Damage Prevention/Redirect bucket, batch 4 (4 cards): Al-abara's Carpet,
// Scarecrow, Whippoorwill, Marble Priest. See docs/MECHANICS_INDEX.md for the
// full batch writeup.
// Declared test count: 22 Vitest cases.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt, hurtCreature, resolveCombat, checkDeath } from '../../src/engine/DuelCore.js';
import { getAIPlan } from '../../src/engine/AI.js';
import { PHASE } from '../../src/engine/phases.js';
import { getCardById } from '../../src/data/cards.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function fund(state, mana) {
  return { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } } };
}

describe('@engine Scenario: Al-abara\'s Carpet', () => {
  it('card data is correct', () => {
    const c = getCardById('al_abaras_carpet');
    expect(c).toBeTruthy();
    expect(c.type).toBe('Artifact');
    expect(c.cost).toBe('5');
    expect(c.rarity).toBe('R');
    expect(c.activated).toEqual({ cost: '5,T', effect: 'preventDamageFromAttackingNonFlying' });
  });

  it('activating for {5},{T} adds an attackingNonFlying filter entry for the controller', () => {
    const carpet = { ...getCardById('al_abaras_carpet'), iid: 'carpet-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [carpet] });
    const state = fund(base, { C: 5 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'carpet-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.turnState.filteredDamagePrevention.p).toEqual([{ filter: 'attackingNonFlying', shieldSourceName: "Al-abara's Carpet" }]);
    expect(s2.p.bf.find(c => c.iid === 'carpet-1').tapped).toBe(true);
  });

  it("prevents combat damage to the controller from an attacking non-flying creature", () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker] });
    const state = { ...base, attackers: ['att-1'], turnState: { ...base.turnState, filteredDamagePrevention: { p: [{ filter: 'attackingNonFlying', shieldSourceName: "Al-abara's Carpet" }], o: [] } } };
    const s1 = resolveCombat(state);
    expect(s1.p.life).toBe(20);
  });

  it('does NOT prevent combat damage from a flying attacker (filter does not match)', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true, keywords: ['FLYING'] });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker] });
    const state = { ...base, attackers: ['att-1'], turnState: { ...base.turnState, filteredDamagePrevention: { p: [{ filter: 'attackingNonFlying', shieldSourceName: "Al-abara's Carpet" }], o: [] } } };
    const s1 = resolveCombat(state);
    expect(s1.p.life).toBe(17);
  });

  it('does NOT prevent non-combat player damage from a non-attacking creature (attacking requirement fails)', () => {
    const source = makeCreature('src-1', { controller: 'o', attacking: false });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', oBf: [source] });
    const state = { ...base, turnState: { ...base.turnState, filteredDamagePrevention: { p: [{ filter: 'attackingNonFlying', shieldSourceName: "Al-abara's Carpet" }], o: [] } } };
    const s1 = hurt(state, 'p', 3, source.name, { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.life).toBe(17);
  });
});

describe('@engine Scenario: Scarecrow', () => {
  it('card data is correct', () => {
    const c = getCardById('scarecrow');
    expect(c).toBeTruthy();
    expect(c.type).toBe('Artifact Creature');
    expect(c.power).toBe(2);
    expect(c.toughness).toBe(2);
    expect(c.cost).toBe('5');
    expect(c.activated).toEqual({ cost: '6,T', effect: 'preventDamageFromFlying' });
  });

  it('activating for {6},{T} adds a flying filter entry for the controller', () => {
    const scarecrow = { ...getCardById('scarecrow'), iid: 'scare-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [scarecrow] });
    const state = fund(base, { C: 6 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'scare-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.turnState.filteredDamagePrevention.p).toEqual([{ filter: 'flying', shieldSourceName: 'Scarecrow' }]);
    expect(s2.p.bf.find(c => c.iid === 'scare-1').tapped).toBe(true);
  });

  it('prevents combat damage to the controller from a flying attacker', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true, keywords: ['FLYING'] });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker] });
    const state = { ...base, attackers: ['att-1'], turnState: { ...base.turnState, filteredDamagePrevention: { p: [{ filter: 'flying', shieldSourceName: 'Scarecrow' }], o: [] } } };
    const s1 = resolveCombat(state);
    expect(s1.p.life).toBe(20);
  });

  it('also prevents non-combat damage to the controller from a flying creature (2004-10-04 Oracle ruling)', () => {
    const source = makeCreature('src-1', { controller: 'o', keywords: ['FLYING'] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', oBf: [source] });
    const state = { ...base, turnState: { ...base.turnState, filteredDamagePrevention: { p: [{ filter: 'flying', shieldSourceName: 'Scarecrow' }], o: [] } } };
    const s1 = hurt(state, 'p', 3, source.name, { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.life).toBe(20);
  });

  it('does NOT prevent damage from a non-flying creature', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker] });
    const state = { ...base, attackers: ['att-1'], turnState: { ...base.turnState, filteredDamagePrevention: { p: [{ filter: 'flying', shieldSourceName: 'Scarecrow' }], o: [] } } };
    const s1 = resolveCombat(state);
    expect(s1.p.life).toBe(17);
  });
});

describe('@engine Scenario: Whippoorwill', () => {
  it('card data is correct', () => {
    const c = getCardById('whippoorwill');
    expect(c).toBeTruthy();
    expect(c.power).toBe(1);
    expect(c.toughness).toBe(1);
    expect(c.cost).toBe('G');
    expect(c.activated).toEqual({ cost: 'GG,T', effect: 'whippoorwillCurse', requiresTarget: true });
  });

  it('activating sets cantRegenerateThisTurn, cantPreventOrRedirectDamage, and exileOnDeathThisTurn on the target', () => {
    const whip = { ...getCardById('whippoorwill'), iid: 'wp-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const target = makeCreature('t-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [whip], oBf: [target] });
    const state = fund(base, { G: 2 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'wp-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const after = s2.o.bf.find(c => c.iid === 't-1');
    expect(after.cantRegenerateThisTurn).toBe(true);
    expect(after.cantPreventOrRedirectDamage).toBe(true);
    expect(after.exileOnDeathThisTurn).toBe(true);
  });

  it('a cursed creature with regenerating:true still dies (regen shield fails)', () => {
    const target = makeCreature('t-1', { controller: 'o', toughness: 2, damage: 2, regenerating: true, cantRegenerateThisTurn: true });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'o', oBf: [target] });
    const s1 = checkDeath(state);
    expect(s1.o.bf.some(c => c.iid === 't-1')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 't-1')).toBe(true);
  });

  it('a cursed creature with a flat damageShield still takes full combat damage (shield bypassed, left unconsumed)', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true });
    const target = makeCreature('t-1', { controller: 'p', power: 0, toughness: 10, blocking: 'att-1', cantPreventOrRedirectDamage: true, damageShield: 5 });
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [target] }), attackers: ['att-1'], blockers: { 't-1': 'att-1' } };
    const s1 = resolveCombat(state);
    const after = s1.p.bf.find(c => c.iid === 't-1');
    expect(after.damage).toBe(3);
    expect(after.damageShield).toBe(5);
  });

  it('a cursed creature with preventAllDamageToThisTurn still takes full combat damage', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true });
    const target = makeCreature('t-1', { controller: 'p', power: 0, toughness: 10, blocking: 'att-1', cantPreventOrRedirectDamage: true, preventAllDamageToThisTurn: true });
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [target] }), attackers: ['att-1'], blockers: { 't-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 't-1').damage).toBe(3);
  });

  it('a cursed creature with a creatureDamageShields redirect entry still takes the damage directly (not redirected)', () => {
    const target = makeCreature('t-1', { controller: 'p', toughness: 10, cantPreventOrRedirectDamage: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [target] });
    const state = {
      ...base,
      turnState: { ...base.turnState, creatureDamageShields: { 't-1': [{ mode: 'redirectPoint', redirectToPlayer: 'o', shieldSourceIid: 'jade-1', shieldSourceName: 'Jade Monolith' }] } },
    };
    const s1 = hurtCreature(state, 't-1', 3, 'Test Ping', { sourceIid: 'src-1' });
    expect(s1.p.bf.find(c => c.iid === 't-1').damage).toBe(3);
    expect(s1.turnState.creatureDamageShields['t-1']).toHaveLength(1);
    expect(s1.o.life).toBe(20);
  });

  it('a cursed creature that dies this turn goes to exile, not the graveyard', () => {
    const target = makeCreature('t-1', { controller: 'o', toughness: 2, damage: 2, exileOnDeathThisTurn: true });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'o', oBf: [target] });
    const s1 = checkDeath(state);
    expect(s1.o.exile.some(c => c.iid === 't-1')).toBe(true);
    expect(s1.o.gy.some(c => c.iid === 't-1')).toBe(false);
  });

  it('an uncursed creature that dies the same turn still goes to the graveyard as normal', () => {
    const target = makeCreature('t-1', { controller: 'o', toughness: 2, damage: 2 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'o', oBf: [target] });
    const s1 = checkDeath(state);
    expect(s1.o.gy.some(c => c.iid === 't-1')).toBe(true);
    expect(s1.o.exile.some(c => c.iid === 't-1')).toBe(false);
  });
});

describe('@engine Scenario: Marble Priest', () => {
  it('card data is correct', () => {
    const c = getCardById('marble_priest');
    expect(c).toBeTruthy();
    expect(c.power).toBe(3);
    expect(c.toughness).toBe(3);
    expect(c.cost).toBe('5');
    expect(c.mustBeBlockedByWalls).toBe(true);
    expect(c.preventDamageFromWalls).toBe(true);
  });

  it('a blocking Wall deals 0 combat damage to Marble Priest, but Marble Priest damages the Wall normally', () => {
    const priest = { ...getCardById('marble_priest'), iid: 'mp-1', controller: 'p', tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [], attacking: true };
    const wall = makeCreature('wall-1', { controller: 'o', subtype: 'Wall', power: 0, toughness: 4, blocking: 'mp-1' });
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [priest], oBf: [wall] }), attackers: ['mp-1'], blockers: { 'wall-1': 'mp-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'mp-1').damage).toBe(0);
    expect(s1.o.bf.find(c => c.iid === 'wall-1').damage).toBe(3);
  });

  it("planBlock: an available untapped Wall is forced to block Marble Priest", () => {
    const priest = { ...getCardById('marble_priest'), iid: 'mp-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], attacking: true };
    const wall = makeCreature('wall-1', { controller: 'o', subtype: 'Wall', power: 0, toughness: 4, tapped: false, attacking: false });
    const state = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'p', pBf: [priest], oBf: [wall] }), attackers: ['mp-1'] };
    const plan = getAIPlan(state, PHASE.COMBAT_BLOCKERS);
    expect(plan.actions.some(a => a.type === 'BLOCK' && a.blockerId === 'wall-1' && a.attackerId === 'mp-1')).toBe(true);
  });

  it('planBlock: a non-Wall available creature is NOT forced to block Marble Priest', () => {
    // Power/toughness reduced to 1/1 here (vs. the card's printed 3/3) purely to
    // stay below the general chump-block threshold (see planBlock's chumpThreshold),
    // isolating this assertion to the mustBeBlockedByWalls heuristic itself rather
    // than the unrelated pre-existing "block to prevent free damage" fallback.
    const priest = { ...getCardById('marble_priest'), iid: 'mp-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], attacking: true, power: 1, toughness: 1 };
    const weakling = makeCreature('weak-1', { controller: 'o', power: 1, toughness: 1, tapped: false, attacking: false });
    const state = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'p', pBf: [priest], oBf: [weakling] }), attackers: ['mp-1'] };
    const plan = getAIPlan(state, PHASE.COMBAT_BLOCKERS);
    expect(plan.actions.some(a => a.type === 'BLOCK' && a.blockerId === 'weak-1' && a.attackerId === 'mp-1')).toBe(false);
  });
});
