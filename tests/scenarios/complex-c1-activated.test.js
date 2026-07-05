// tests/scenarios/complex-c1-activated.test.js
// Complex-tier stub cards implemented from Card-Forge/forge reference scripts
// (GPL-3.0), sub-batch C1: activated abilities and spells.
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeArt(iid, overrides = {}) {
  return { iid, id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 0, ...overrides };
}

describe('@engine Scenario: Complex-tier Forge batch C1 -- activated abilities and spells', () => {

  it('Alabaster Potion: mode "gain" -- target player gains X life', () => {
    const spell = { iid: 'ap-1', id: 'alabaster_potion', name: 'Alabaster Potion', type: 'Instant', cmc: 2, cost: 'XWW', effect: 'alabasterPotionChoice' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, xVal: 3, p: { ...base.p, life: 20, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 3 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ap-1', tgt: 'p' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('modalChoice');
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'gain' });
    expect(s3.p.life).toBe(23);
    expect(s3.pendingChoice).toBeNull();
  });

  it('Alabaster Potion: mode "prevent" -- shields a target from the next X damage this turn', () => {
    const spell = { iid: 'ap-1', id: 'alabaster_potion', name: 'Alabaster Potion', type: 'Instant', cmc: 2, cost: 'XWW', effect: 'alabasterPotionChoice' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, xVal: 3, p: { ...base.p, life: 20, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 3 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ap-1', tgt: 'p' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'prevent' });
    expect(s3.p.damageShield).toBe(3);
    const s4 = hurt(s3, 'p', 5, 'Test burn');
    expect(s4.p.life).toBe(18); // 20 - (5 - 3 prevented)
    expect(s4.p.damageShield).toBe(0);
  });

  it('Sewers of Estark: unblockable when cast on an attacking creature', () => {
    const spell = { iid: 'se-1', id: 'sewers_of_estark', name: 'Sewers of Estark', type: 'Instant', cmc: 4, cost: '2BB', effect: 'sewersOfEstark' };
    const attacker = makeCreature('atk-1', { controller: 'p', attacking: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], pBf: [attacker] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'se-1', tgt: 'atk-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'atk-1').eotBuffs).toEqual([{ unblockable: true }]);
  });

  it('Sewers of Estark: blocking creature and what it blocks deal no combat damage', () => {
    const spell = { iid: 'se-1', id: 'sewers_of_estark', name: 'Sewers of Estark', type: 'Instant', cmc: 4, cost: '2BB', effect: 'sewersOfEstark' };
    const blocker = makeCreature('bl-1', { controller: 'p', blocking: 'atk-1', power: 3, toughness: 3 });
    const attacker = makeCreature('atk-1', { controller: 'o', attacking: true, power: 4, toughness: 4 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pHand: [spell], pBf: [blocker], oBf: [attacker], attackers: ['atk-1'] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'se-1', tgt: 'bl-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'bl-1').preventCombatDamageDealt).toBe(true);
    expect(s2.o.bf.find(c => c.iid === 'atk-1').preventCombatDamageDealt).toBe(true);
  });

  it("Tracker: deals power to target creature; that creature deals its power back", () => {
    const tracker = makeCreature('tk-1', { id: 'tracker', name: 'Tracker', controller: 'p', power: 2, toughness: 4, activated: { cost: 'GG,T', effect: 'trackerDamageExchange', requiresTarget: true } });
    const oCre = makeCreature('oc-1', { controller: 'o', power: 3, toughness: 5 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tracker], oBf: [oCre] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tk-1', tgt: 'oc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'oc-1').damage).toBe(2);
    expect(s2.p.bf.find(c => c.iid === 'tk-1').damage).toBe(3);
  });

  it('Winter Blast: taps X target creatures, damages the ones with flying', () => {
    const spell = { iid: 'wb-1', id: 'winter_blast', name: 'Winter Blast', type: 'Sorcery', cmc: 1, cost: 'XG', effect: 'winterBlastTapX' };
    const flier = makeCreature('fl-1', { controller: 'o', tapped: false, toughness: 4, keywords: ['FLYING'] });
    const grounded = makeCreature('gr-1', { controller: 'o', tapped: false });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [flier, grounded] });
    const state = { ...base, xVal: 2, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 2 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'wb-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.filter(c => c.tapped)).toHaveLength(2);
    expect(s2.o.bf.find(c => c.iid === 'fl-1').damage).toBe(2);
    expect(s2.o.bf.find(c => c.iid === 'gr-1').damage).toBe(0);
  });

  it('Banshee: X,T -- half X (down) to target, half X (up) to self', () => {
    const banshee = makeCreature('bn-1', { id: 'banshee', name: 'Banshee', controller: 'p', power: 0, toughness: 1, activated: { cost: 'X,T', effect: 'bansheeDrain', requiresTarget: true } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [banshee] });
    const state = { ...base, xVal: 5, p: { ...base.p, life: 20, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'bn-1', tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.life).toBe(18); // 20 - floor(5/2)=2
    expect(s2.p.life).toBe(17); // 20 - ceil(5/2)=3
  });

  it('Eternal Flame: deals damage equal to Mountains controlled, half (rounded up) to self', () => {
    const spell = { iid: 'ef-1', id: 'eternal_flame', name: 'Eternal Flame', type: 'Sorcery', cmc: 4, cost: '2RR', effect: 'eternalFlameDrain' };
    const mtn1 = makeLand('m1', { subtype: 'Mountain' });
    const mtn2 = makeLand('m2', { subtype: 'Mountain' });
    const mtn3 = makeLand('m3', { subtype: 'Mountain' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], pBf: [mtn1, mtn2, mtn3] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 2 } }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ef-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.life).toBe(17); // 20 - 3
    expect(s2.p.life).toBe(18); // 20 - ceil(3/2)=2
  });

  it('Martyr\'s Cry: exiles all white creatures, controllers draw a card each', () => {
    const spell = { iid: 'mc-1', id: 'martyrss_cry', name: "Martyr's Cry", type: 'Sorcery', cmc: 2, cost: 'WW', effect: 'martyrsCry' };
    const whiteP = makeCreature('wp-1', { controller: 'p', color: 'W' });
    const whiteO = makeCreature('wo-1', { controller: 'o', color: 'W' });
    const blackP = makeCreature('bp-1', { controller: 'p', color: 'B' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], pBf: [whiteP, blackP], oBf: [whiteO] });
    const state = { ...base, p: { ...base.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 }, lib: [makeLand('pl1')] }, o: { ...base.o, lib: [makeLand('ol1')] } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'mc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.exile.some(c => c.iid === 'wp-1')).toBe(true);
    expect(s2.o.exile.some(c => c.iid === 'wo-1')).toBe(true);
    expect(s2.p.bf.some(c => c.iid === 'bp-1')).toBe(true);
    expect(s2.p.hand.some(c => c.iid === 'pl1')).toBe(true);
    expect(s2.o.hand.some(c => c.iid === 'ol1')).toBe(true);
  });

  it('Volcanic Eruption: destroys X target Mountains, damages every creature and player', () => {
    const spell = { iid: 've-1', id: 'volcanic_eruption', name: 'Volcanic Eruption', type: 'Sorcery', cmc: 3, cost: 'XUUU', effect: 'volcanicEruption' };
    const mtn1 = makeLand('m1', { controller: 'o', subtype: 'Mountain' });
    const mtn2 = makeLand('m2', { controller: 'o', subtype: 'Mountain' });
    const cre = makeCreature('c-1', { controller: 'p', toughness: 6 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], pBf: [cre], oBf: [mtn1, mtn2] });
    const state = { ...base, xVal: 2, p: { ...base.p, life: 20, mana: { W: 0, U: 3, B: 0, R: 0, G: 0, C: 2 } }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 've-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.filter(c => c.iid === 'm1' || c.iid === 'm2')).toHaveLength(0);
    expect(s2.p.life).toBe(18);
    expect(s2.o.life).toBe(18);
    expect(s2.p.bf.find(c => c.iid === 'c-1').damage).toBe(2);
  });

  it('Winds of Change: each player shuffles hand into library and draws that many', () => {
    const spell = { iid: 'wc-1', id: 'winds_of_change', name: 'Winds of Change', type: 'Sorcery', cmc: 1, cost: 'R', effect: 'windsOfChange' };
    const pHand = [makeLand('ph1'), makeLand('ph2')];
    const oHand = [makeLand('oh1')];
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell, ...pHand], oHand });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 }, lib: [makeLand('pl1'), makeLand('pl2'), makeLand('pl3')] }, o: { ...base.o, lib: [makeLand('ol1'), makeLand('ol2')] } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'wc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand).toHaveLength(2);
    expect(s2.o.hand).toHaveLength(1);
    expect(s2.p.lib.map(c => c.iid).sort()).not.toEqual(['ph1', 'ph2'].sort());
  });

  it('Mind Bomb: chains a discard choice per player, deals 3-minus-discarded damage', () => {
    const spell = { iid: 'mb-1', id: 'mind_bomb', name: 'Mind Bomb', type: 'Sorcery', cmc: 1, cost: 'U', effect: 'mindBomb' };
    const pHand = [makeLand('ph1'), makeLand('ph2')];
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell, ...pHand] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'mb-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('numberChoice');
    expect(s2.pendingChoice?.forPlayer).toBe('p');
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: '2' });
    expect(s3.p.hand).toHaveLength(0);
    expect(s3.p.life).toBe(19); // 20 - (3-2)
    expect(s3.pendingChoice?.kind).toBe('numberChoice');
    expect(s3.pendingChoice?.forPlayer).toBe('o');
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '0' });
    expect(s4.o.life).toBe(17); // 20 - (3-0)
    expect(s4.pendingChoice).toBeNull();
  });

  it('Mana Clash: coin-flip loop deals 1 damage per tails until both flip heads', () => {
    const spell = { iid: 'mc2-1', id: 'mana_clash', name: 'Mana Clash', type: 'Sorcery', cmc: 1, cost: 'R', effect: 'manaClash' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'mc2-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    // Deterministic bound: life totals can only have dropped, and the log records at least one round.
    expect(s2.p.life).toBeLessThanOrEqual(20);
    expect(s2.o.life).toBeLessThanOrEqual(20);
    expect(s2.log.some(l => l.text.includes('round(s) of coin flips'))).toBe(true);
  });

  it('Forcefield: shields against a chosen unblocked attacker, all but 1 damage prevented', () => {
    const forcefield = makeArt('ff-1', { id: 'forcefield', name: 'Forcefield', activated: { cost: '1', effect: 'forcefieldShield', requiresTarget: true } });
    const attacker = makeCreature('atk-1', { controller: 'o', attacking: true, power: 5, toughness: 5 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [forcefield], oBf: [attacker], attackers: ['atk-1'] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ff-1', tgt: 'atk-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.combatDamageShield).toEqual({ sourceIid: 'atk-1', allowThrough: 1, cardName: 'Forcefield' });
  });
});
