// tests/scenarios/complex-c4-triggers-b.test.js
// Complex-tier stub cards implemented from Card-Forge/forge reference scripts
// (GPL-3.0), sub-batch C4 (triggered abilities), checkpoint B (11 cards).
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, getPow, getTou } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

describe('@engine-tier-complex-2 Scenario: Complex-tier Forge batch C4 checkpoint B -- triggered abilities', () => {

  it('Goblins of the Flarg: sacrificed once its controller controls a Dwarf', () => {
    const goblin = makeCreature('gf-1', { id: 'goblins_of_the_flarg', name: 'Goblins of the Flarg', controller: 'p' });
    const dwarf = makeCreature('dw-1', { controller: 'p', subtype: 'Dwarf' });
    const base = makeState({ phase: PHASE.END, active: 'p', pBf: [goblin, dwarf] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> CLEANUP
    expect(s1.p.bf.some(c => c.iid === 'gf-1')).toBe(false);
  });

  it('Cosmic Horror: pays {3}{B}{B}{B} to survive when affordable', () => {
    const horror = makeCreature('ch-1', { id: 'cosmic_horror', name: 'Cosmic Horror', controller: 'p', power: 7, toughness: 7, upkeep: 'cosmicHorrorUpkeep' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [horror] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues the choice for p
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('cosmicHorrorUpkeep');
    // Mana burns at phase boundaries; tap for cost in response to the prompt itself.
    const s2b = { ...s2, p: { ...s2.p, mana: { W: 0, U: 0, B: 3, R: 0, G: 0, C: 3 } } };
    const s3 = duelReducer(s2b, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s3.p.bf.some(c => c.iid === 'ch-1')).toBe(true);
    expect(s3.p.mana.B).toBe(0);
  });

  it('Cosmic Horror: destroyed and deals 7 damage to controller when unaffordable', () => {
    const horror = makeCreature('ch-1', { id: 'cosmic_horror', name: 'Cosmic Horror', controller: 'p', power: 7, toughness: 7, upkeep: 'cosmicHorrorUpkeep' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [horror] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const state = { ...s2, p: { ...s2.p, life: 20 } };
    const s3 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s3.p.bf.some(c => c.iid === 'ch-1')).toBe(false);
    expect(s3.p.life).toBe(13);
  });

  it('Nafs Asp: damaged player loses 1 at their next draw step unless they pay {1}', () => {
    const asp = makeCreature('na-1', {
      id: 'nafs_asp', name: 'Nafs Asp', controller: 'p', power: 1, toughness: 1, attacking: true,
      triggeredAbilities: [{ id: 'nafs_asp_dmg', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSource' }, effect: { type: 'queueDrainAtNextDraw' } }],
    });
    const base = { ...makeState({ phase: PHASE.COMBAT_AFTER_BLOCKERS, active: 'p', pBf: [asp], turn: 2 }), attackers: ['na-1'] };
    const state = { ...base, o: { ...base.o, life: 20, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    expect(s1.o.pendingDrainAtNextDraw).toBe(1);
    let s = { ...s1, phase: PHASE.COMBAT_END };
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> MAIN_2
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> END
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> CLEANUP
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> UNTAP (o's turn)
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> DRAW
    expect(s.o.life).toBe(18); // 20 - 1 (combat damage) - 1 (delayed drain, unpaid)
    expect(s.o.pendingDrainAtNextDraw).toBe(0);
  });

  it('Sunken City: pays {U}{U} to survive, blue creatures get +1/+1', () => {
    const city = { iid: 'sc-1', id: 'sunken_city', name: 'Sunken City', type: 'Enchantment', controller: 'p', effect: 'lordEffect', targets: 'blue', mod: { power: 1, toughness: 1 }, upkeep: 'sunkenCityUpkeep' };
    const blueCre = makeCreature('bc-1', { controller: 'p', color: 'U', power: 2, toughness: 2 });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [city, blueCre] });
    expect(getPow(blueCre, base)).toBe(3);
    expect(getTou(blueCre, base)).toBe(3);
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues the choice for p
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('sunkenCityUpkeep');
    const s2b = { ...s2, p: { ...s2.p, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } };
    const s3 = duelReducer(s2b, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s3.p.bf.some(c => c.iid === 'sc-1')).toBe(true);
  });

  it('Drop of Honey: destroys the lowest-power creature at upkeep', () => {
    const honey = { iid: 'dh-1', id: 'drop_of_honey', name: 'Drop of Honey', type: 'Enchantment', controller: 'p', upkeep: 'dropOfHoneyUpkeep' };
    const weak = makeCreature('w-1', { controller: 'o', power: 1, toughness: 5 });
    const strong = makeCreature('s-1', { controller: 'p', power: 5, toughness: 5 });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [honey, strong], oBf: [weak] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    expect(s2.o.bf.some(c => c.iid === 'w-1')).toBe(false);
    expect(s2.p.bf.some(c => c.iid === 's-1')).toBe(true);
  });

  it('Drop of Honey: sacrifices itself once no creatures remain', () => {
    const honey = { iid: 'dh-1', id: 'drop_of_honey', name: 'Drop of Honey', type: 'Enchantment', controller: 'p' };
    const base = makeState({ phase: PHASE.END, active: 'p', pBf: [honey] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> CLEANUP
    expect(s1.p.bf.some(c => c.iid === 'dh-1')).toBe(false);
  });

  it('Erosion: enchants a land, controller may pay {1} or 1 life to save it', () => {
    const spell = { iid: 'er-1', id: 'erosion', name: 'Erosion', type: 'Enchantment', subtype: 'Aura', cmc: 3, cost: 'UUU', effect: 'enchantCreature', mod: {} };
    const land = makeLand('l-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [land] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'er-1', tgt: 'l-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'l-1').enchantments.some(e => e.name === 'Erosion')).toBe(true);
  });

  it('Erosion: destroys the enchanted land when the controller declines to pay', () => {
    const erosionAura = { iid: 'er-1', name: 'Erosion', mod: {}, controller: 'p', cardData: {} };
    const land = makeLand('l-1', { controller: 'o', enchantments: [erosionAura] });
    const base = { ...makeState({ phase: PHASE.UPKEEP, active: 'o', turn: 2, oBf: [land] }),
      pendingUpkeepChoice: { cardName: 'Erosion', handlerKey: 'erosionUpkeep', iid: 'l-1' } };
    const s1 = duelReducer(base, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s1.o.bf.some(c => c.iid === 'l-1')).toBe(false);
  });

  it("Merchant Ship: can't attack without a defending Island, gains 2 life unblocked, sacrificed with no Islands", () => {
    const ship = makeCreature('ms-1', { id: 'merchant_ship', name: 'Merchant Ship', controller: 'p', power: 0, toughness: 2, attackRequiresDefenderLand: 'Island', unblockedAttackGainLife: 2, sacrificeIfNoIslands: true });
    const noIslandState = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [ship] });
    const s1 = duelReducer(noIslandState, { type: 'DECLARE_ATTACKER', iid: 'ms-1' });
    expect(s1.attackers).not.toContain('ms-1');

    const island = makeLand('i-1', { controller: 'o', subtype: 'Island' });
    const withIslandBase = { ...makeState({ phase: PHASE.COMBAT_AFTER_BLOCKERS, active: 'p', pBf: [ship], oBf: [island] }), attackers: ['ms-1'] };
    const withIslandState = { ...withIslandBase, p: { ...withIslandBase.p, life: 20 } };
    const s2 = duelReducer(withIslandState, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    expect(s2.p.life).toBe(22);

    const noIslandCleanup = makeState({ phase: PHASE.END, active: 'p', pBf: [ship] });
    const s3 = duelReducer(noIslandCleanup, { type: 'ADVANCE_PHASE' }); // -> CLEANUP
    expect(s3.p.bf.some(c => c.iid === 'ms-1')).toBe(false);
  });

  it('Nether Shadow: returns from the graveyard at upkeep with 3+ creatures above it', () => {
    const shadow = { iid: 'ns-1', id: 'nether_shadow', name: 'Nether Shadow', keywords: ['HASTE'], type: 'Creature', power: 1, toughness: 1, controller: 'p' };
    const dead1 = makeCreature('d1', { controller: 'p' });
    const dead2 = makeCreature('d2', { controller: 'p' });
    const dead3 = makeCreature('d3', { controller: 'p' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o' });
    const state = { ...base, p: { ...base.p, gy: [shadow, dead1, dead2, dead3] } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    expect(s2.p.bf.some(c => c.iid === 'ns-1')).toBe(true);
    expect(s2.p.gy.some(c => c.iid === 'ns-1')).toBe(false);
  });

  it('Nether Shadow: stays in the graveyard with fewer than 3 creatures above it', () => {
    const shadow = { iid: 'ns-1', id: 'nether_shadow', name: 'Nether Shadow', keywords: ['HASTE'], type: 'Creature', power: 1, toughness: 1, controller: 'p' };
    const dead1 = makeCreature('d1', { controller: 'p' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o' });
    const state = { ...base, p: { ...base.p, gy: [shadow, dead1] } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(s2.p.bf.some(c => c.iid === 'ns-1')).toBe(false);
  });

  it('Shapeshifter: ETB presents a numberChoice, power/toughness follow the chosen number', () => {
    const spell = { iid: 'ss-1', id: 'shapeshifter', name: 'Shapeshifter', type: 'Artifact Creature', cmc: 6, cost: '6', power: 0, toughness: 7, effect: 'shapeshifterETB', layerDef: { layer: '7a', powerFn: 'shapeshifterPower', toughnessFn: 'shapeshifterToughness' } };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 6 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ss-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('numberChoice');
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: '5' });
    const shifter = s3.p.bf.find(c => c.iid === 'ss-1');
    expect(getPow(shifter, s3)).toBe(5);
    expect(getTou(shifter, s3)).toBe(2);
  });

  it("Island Fish Jasconius: doesn't untap normally, may pay {U}{U}{U} to untap, sacrificed with no Islands", () => {
    const fish = makeCreature('if-1', { id: 'island_fish_jasconius', name: 'Island Fish Jasconius', controller: 'p', power: 6, toughness: 8, tapped: true, doesNotUntapNormally: true, upkeep: 'payToUntapSelf', untapCost: 'UUU' });
    const island = makeLand('i-1', { controller: 'p', subtype: 'Island' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [fish, island] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (doesn't untap the fish)
    expect(s1.p.bf.find(c => c.iid === 'if-1').tapped).toBe(true);
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues the choice
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('payToUntapSelf');
    const s2b = { ...s2, p: { ...s2.p, mana: { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 } } };
    const s3 = duelReducer(s2b, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s3.p.bf.find(c => c.iid === 'if-1').tapped).toBe(false);
  });

  it('Jihad: ETB choice sets chosenColor/chosenPlayer, buffs matching white creatures', () => {
    const spell = { iid: 'jh-1', id: 'jihad', name: 'Jihad', type: 'Enchantment', cmc: 3, cost: 'WWW', effect: 'jihadETB' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, p: { ...base.p, mana: { W: 3, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'jh-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('jihadColorChoice');
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'R' });
    const oppRedCre = makeCreature('or-1', { controller: 'o', color: 'R' });
    const whiteCre = makeCreature('wc-1', { controller: 'p', color: 'W', power: 1, toughness: 1 });
    const s4 = { ...s3, o: { ...s3.o, bf: [...s3.o.bf, oppRedCre] }, p: { ...s3.p, bf: [...s3.p.bf, whiteCre] } };
    expect(getPow(whiteCre, s4)).toBe(3);
    expect(getTou(whiteCre, s4)).toBe(2);
  });
});
