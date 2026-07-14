// tests/scenarios/moderate-m3-statics.test.js
// Moderate-tier Alpha/Beta stub cards implemented from Card-Forge/forge reference
// scripts (GPL-3.0), sub-batch M3: static/continuous effects.
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, getPow, getTou, canBlockDuel } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

describe('@engine-tier-moderate-1 Scenario: Moderate-tier Forge batch M3 -- static/continuous effects', () => {

  it('Angelic Voices: pumps your creatures +1/+1 only while you control no nonartifact, nonwhite creature', () => {
    const voices = { iid: 'av-1', id: 'angelic_voices', name: 'Angelic Voices', type: 'Enchantment', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const whiteCre = makeCreature('wc-1', { controller: 'p', color: 'W', power: 2, toughness: 2 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [voices, whiteCre] });
    expect(getPow(whiteCre, base)).toBe(3);
    expect(getTou(whiteCre, base)).toBe(3);
    const redCre = makeCreature('rc-1', { controller: 'p', color: 'R', power: 2, toughness: 2 });
    const base2 = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [voices, whiteCre, redCre] });
    expect(getPow(whiteCre, base2)).toBe(2); // condition broken -- no bonus
  });

  it('Beasts of Bogardan: gets +1/+1 while an opponent controls a white permanent', () => {
    const beasts = makeCreature('bb-1', { id: 'beasts_of_bogardan', name: 'Beasts of Bogardan', controller: 'p', power: 3, toughness: 3, keywords: [KEYWORDS.PROTECTION.id], protection: ['red'] });
    const noWhite = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [beasts] });
    expect(getPow(beasts, noWhite)).toBe(3);
    const whitePerm = { iid: 'wp-1', id: 'plains', name: 'Plains', type: 'Land', color: 'W', controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const withWhite = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [beasts], oBf: [whitePerm] });
    expect(getPow(beasts, withWhite)).toBe(4);
    expect(getTou(beasts, withWhite)).toBe(4);
  });

  it("Brainwash: enchanted creature can't attack unless controller pays {3}", () => {
    const brainwash = { iid: 'bw-1', id: 'brainwash', name: 'Brainwash', type: 'Enchantment', cmc: 1, cost: 'W', effect: 'enchantCreature', mod: { cantAttackUnlessPay: 3 } };
    const target = makeCreature('t-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [brainwash], oBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'bw-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const enchanted = s2.o.bf.find(c => c.iid === 't-1');
    expect(enchanted.enchantments).toHaveLength(1);

    // Opponent's turn, no mana to pay {3}: can't attack.
    const attackState = { ...s2, active: 'o', phase: PHASE.COMBAT_ATTACKERS, o: { ...s2.o, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s3 = duelReducer(attackState, { type: 'DECLARE_ATTACKER', iid: 't-1' });
    expect(s3.attackers).toEqual([]);

    // With {3} available: pays and attacks.
    const attackState2 = { ...s2, active: 'o', phase: PHASE.COMBAT_ATTACKERS, o: { ...s2.o, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } };
    const s4 = duelReducer(attackState2, { type: 'DECLARE_ATTACKER', iid: 't-1' });
    expect(s4.attackers).toEqual(['t-1']);
    expect(s4.o.mana.C).toBe(0);
  });

  it('Eternal Warrior: enchanted creature has vigilance', () => {
    const warrior = { iid: 'ew-1', id: 'eternal_warrior', name: 'Eternal Warrior', type: 'Enchantment', cmc: 1, cost: 'R', effect: 'enchantCreature', mod: { keywords: [KEYWORDS.VIGILANCE.id] } };
    const target = makeCreature('t-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [warrior], pBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ew-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const enchanted = s2.p.bf.find(c => c.iid === 't-1');
    // Attack without tapping: vigilance.
    const attackState = { ...s2, phase: PHASE.COMBAT_ATTACKERS };
    const s3 = duelReducer(attackState, { type: 'DECLARE_ATTACKER', iid: 't-1' });
    expect(s3.attackers).toEqual(['t-1']);
    expect(s3.p.bf.find(c => c.iid === 't-1').tapped).toBe(false);
  });

  it("Gaea's Avenger: P/T equal to 1 plus opponent's artifact count", () => {
    const avenger = makeCreature('ga-1', { id: 'gaeass_avenger', name: "Gaea's Avenger", controller: 'p', power: 1, toughness: 1, layerDef: { layer: '7a', powerFn: 'gaeasAvengerPT', toughnessFn: 'gaeasAvengerPT' } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [avenger] });
    expect(getPow(avenger, base)).toBe(1);
    const oArt1 = { iid: 'a1', id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oArt2 = { iid: 'a2', id: 'mox_jet', name: 'Mox Jet', type: 'Artifact', controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const withArts = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [avenger], oBf: [oArt1, oArt2] });
    expect(getPow(avenger, withArts)).toBe(3);
    expect(getTou(avenger, withArts)).toBe(3);
  });

  it('Kobold Drill Sergeant: other Kobolds you control get +0/+1 and trample; not opponent Kobolds', () => {
    const sergeant = makeCreature('kds-1', { id: 'kobold_drill_sergeant', name: 'Kobold Drill Sergeant', controller: 'p', power: 1, toughness: 2, subtype: 'Kobold Soldier', effect: 'lordEffect', targets: 'kobold', mod: { power: 0, toughness: 1 }, lordKeywords: [KEYWORDS.TRAMPLE.id], lordControllerOnly: true });
    const myKobold = makeCreature('mk-1', { controller: 'p', subtype: 'Kobold', power: 1, toughness: 2 });
    const oppKobold = makeCreature('ok-1', { controller: 'o', subtype: 'Kobold', power: 1, toughness: 2 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [sergeant, myKobold], oBf: [oppKobold] });
    expect(getTou(myKobold, base)).toBe(3);
    expect(base.p.bf.some(c => c.iid === 'mk-1')).toBe(true);
    expect(getTou(oppKobold, base)).toBe(2); // opponent's Kobold unaffected
    // Sergeant itself is excluded from its own buff.
    expect(getTou(sergeant, base)).toBe(2);
  });

  it('Kobold Overlord: other Kobolds you control gain first strike', () => {
    const overlord = makeCreature('ko-1', { id: 'kobold_overlord', name: 'Kobold Overlord', controller: 'p', power: 1, toughness: 2, subtype: 'Kobold', keywords: [KEYWORDS.FIRST_STRIKE.id], effect: 'lordEffect', targets: 'kobold', mod: {}, lordKeywords: [KEYWORDS.FIRST_STRIKE.id], lordControllerOnly: true });
    const myKobold = makeCreature('mk-1', { controller: 'p', subtype: 'Kobold' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [overlord, myKobold] });
    expect(base.p.bf.find(c => c.iid === 'mk-1').keywords).not.toContain(KEYWORDS.FIRST_STRIKE.id); // not granted on raw field
  });

  it('Kobold Taskmaster: other Kobolds you control get +1/+0', () => {
    const taskmaster = makeCreature('kt-1', { id: 'kobold_taskmaster', name: 'Kobold Taskmaster', controller: 'p', power: 1, toughness: 2, subtype: 'Kobold', effect: 'lordEffect', targets: 'kobold', mod: { power: 1, toughness: 0 }, lordControllerOnly: true });
    const myKobold = makeCreature('mk-1', { controller: 'p', subtype: 'Kobold', power: 1, toughness: 2 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [taskmaster, myKobold] });
    expect(getPow(myKobold, base)).toBe(2);
  });

  it('Orcish Oriflamme: attacking creatures you control get +1/+0', () => {
    const oriflamme = { iid: 'oo-1', id: 'orcish_oriflamme', name: 'Orcish Oriflamme', type: 'Enchantment', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const attacker = makeCreature('atk-1', { controller: 'p', power: 2, toughness: 2, attacking: true });
    const nonAttacker = makeCreature('na-1', { controller: 'p', power: 2, toughness: 2, attacking: false });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [oriflamme, attacker, nonAttacker] });
    expect(getPow(attacker, base)).toBe(3);
    expect(getPow(nonAttacker, base)).toBe(2);
  });

  it("People of the Woods: toughness equals Forests controlled", () => {
    const potw = makeCreature('pw-1', { id: 'people_of_the_woods', name: 'People of the Woods', controller: 'p', power: 1, toughness: 0, layerDef: { layer: '7a', toughnessFn: 'peopleOfTheWoodsToughness' } });
    const forest1 = makeLand('f1', { subtype: 'Forest', controller: 'p' });
    const forest2 = makeLand('f2', { subtype: 'Forest', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [potw, forest1, forest2] });
    expect(getTou(potw, base)).toBe(2);
    expect(getPow(potw, base)).toBe(1);
  });

  it("Seeker: enchanted creature can't be blocked except by artifact or white creatures", () => {
    const seeker = { iid: 'sk-1', id: 'seeker', name: 'Seeker', type: 'Enchantment', cmc: 4, cost: '2WW', effect: 'enchantCreature', mod: { blockRestrictionArtifactOrWhite: true } };
    const target = makeCreature('t-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [seeker], pBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sk-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const enchanted = s2.p.bf.find(c => c.iid === 't-1');
    const greenBlocker = makeCreature('gb-1', { controller: 'o', color: 'G' });
    const whiteBlocker = makeCreature('wb-1', { controller: 'o', color: 'W' });
    expect(canBlockDuel(greenBlocker, enchanted, s2.o.bf, s2)).toBe(false);
    expect(canBlockDuel(whiteBlocker, enchanted, s2.o.bf, s2)).toBe(true);
  });
});
