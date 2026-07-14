// tests/scenarios/complex-c4-triggers-c.test.js
// Complex-tier stub cards implemented from Card-Forge/forge reference scripts
// (GPL-3.0), sub-batch C4 (triggered abilities), checkpoint C (final, 7 cards).
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeArt(iid, overrides = {}) {
  return { iid, id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 0, ...overrides };
}

describe('@engine-tier-complex-2 Scenario: Complex-tier Forge batch C4 checkpoint C -- triggered abilities (final)', () => {

  it("Time Vault: skips its controller's turn while tapped, untapping it, and grants an extra turn when activated", () => {
    // Vault is controlled by 'o': the skip check runs against whichever player
    // is about to *become* active after the normal turn flip, so with active
    // starting at 'p', the flip lands on 'o' first (whose tapped vault then
    // causes a second flip back to 'p').
    const vault = makeArt('tv-1', { id: 'time_vault', name: 'Time Vault', controller: 'o', tapped: true, entersTapped: true, doesNotUntapNormally: true, activated: { cost: 'T', effect: 'extraTurn' } });
    const base = makeState({ phase: PHASE.END, active: 'p', oBf: [vault] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> CLEANUP
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // turn-change: o's turn is skipped, Time Vault untaps
    expect(s2.active).toBe('p'); // skip flips back to p again (o's turn was skipped over)
    expect(s2.o.bf.find(c => c.iid === 'tv-1').tapped).toBe(false);
  });

  it('Time Vault: {T} grants an extra turn', () => {
    const vault = makeArt('tv-1', { id: 'time_vault', name: 'Time Vault', tapped: false, activated: { cost: 'T', effect: 'extraTurn' } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [vault] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tv-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.extraTurns).toBe(1);
  });

  it('Goblin Artisans: draws a card on a won coin flip', () => {
    const artisans = makeCreature('ga-1', { id: 'goblin_artisans', name: 'Goblin Artisans', controller: 'p', activated: { cost: 'T', effect: 'coinFlipDrawOrCounterArtifact', requiresTarget: true } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [artisans] });
    const state = { ...base, p: { ...base.p, lib: [makeLand('l1')] } };
    const original = Math.random;
    Math.random = () => 0.1; // < 0.5 => wins
    try {
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ga-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      expect(s2.p.hand.some(c => c.iid === 'l1')).toBe(true);
    } finally {
      Math.random = original;
    }
  });

  it('Goblin Artisans: counters a targeted artifact spell on a lost coin flip', () => {
    const artisans = makeCreature('ga-1', { id: 'goblin_artisans', name: 'Goblin Artisans', controller: 'p', activated: { cost: 'T', effect: 'coinFlipDrawOrCounterArtifact', requiresTarget: true } });
    const artSpell = { iid: 'as-1', id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', cmc: 0, cost: '' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [artisans], pHand: [artSpell] });
    const s0 = duelReducer(base, { type: 'CAST_SPELL', who: 'p', iid: 'as-1' });
    expect(s0.stack).toHaveLength(1);
    const original = Math.random;
    Math.random = () => 0.9; // >= 0.5 => loses
    try {
      const s1 = duelReducer(s0, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ga-1', tgt: s0.stack[0].id });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      expect(s2.stack.some(i => i.id === s0.stack[0].id)).toBe(false);
    } finally {
      Math.random = original;
    }
  });

  it("Leviathan: enters tapped, doesn't untap normally, may sacrifice two Islands to untap, requires sacrificing two Islands to attack", () => {
    const leviathan = makeCreature('lv-1', { id: 'leviathan', name: 'Leviathan', controller: 'p', power: 10, toughness: 10, tapped: true, doesNotUntapNormally: true, upkeep: 'sacIslandsToUntapSelf', attackCostSacLands: { count: 2, subtype: 'Island' } });
    const island1 = makeLand('i1', { controller: 'p', subtype: 'Island' });
    const island2 = makeLand('i2', { controller: 'p', subtype: 'Island' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [leviathan, island1, island2] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn): doesn't untap
    expect(s1.p.bf.find(c => c.iid === 'lv-1').tapped).toBe(true);
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues choice
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('sacIslandsToUntapSelf');
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s3.p.bf.find(c => c.iid === 'lv-1').tapped).toBe(false);
    expect(s3.p.bf.filter(c => c.iid === 'i1' || c.iid === 'i2')).toHaveLength(0);
  });

  it("Leviathan: can't attack without two Islands to sacrifice", () => {
    const leviathan = makeCreature('lv-1', { id: 'leviathan', name: 'Leviathan', controller: 'p', power: 10, toughness: 10, attackCostSacLands: { count: 2, subtype: 'Island' } });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [leviathan] });
    const s1 = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: 'lv-1' });
    expect(s1.attackers).not.toContain('lv-1');
  });

  it('Yawgmoth Demon: sacrifices an artifact to avoid tapping and damage', () => {
    const demon = makeCreature('yd-1', { id: 'yawgmoth_demon', name: 'Yawgmoth Demon', controller: 'p', upkeep: 'yawgmothDemonUpkeep' });
    const art = makeArt('a-1', { controller: 'p' });
    const base = { ...makeState({ phase: PHASE.UPKEEP, active: 'p', turn: 2, pBf: [demon, art] }),
      pendingUpkeepChoice: { cardName: 'Yawgmoth Demon', handlerKey: 'yawgmothDemonUpkeep', iid: 'yd-1' } };
    const s1 = duelReducer(base, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'SACRIFICE' });
    expect(s1.p.bf.some(c => c.iid === 'a-1')).toBe(false);
    expect(s1.p.bf.find(c => c.iid === 'yd-1').tapped).toBeFalsy();
  });

  it("Yawgmoth Demon: taps and deals 2 damage when declining to sacrifice", () => {
    const demon = makeCreature('yd-1', { id: 'yawgmoth_demon', name: 'Yawgmoth Demon', controller: 'p' });
    const base = { ...makeState({ phase: PHASE.UPKEEP, active: 'p', turn: 2, pBf: [demon] }),
      pendingUpkeepChoice: { cardName: 'Yawgmoth Demon', handlerKey: 'yawgmothDemonUpkeep', iid: 'yd-1' } };
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s1.p.bf.find(c => c.iid === 'yd-1').tapped).toBe(true);
    expect(s1.p.life).toBe(18);
  });

  it("Magnetic Mountain: blue creatures don't untap during their controller's untap step", () => {
    const mountain = { iid: 'mm-1', id: 'magnetic_mountain', name: 'Magnetic Mountain', type: 'Enchantment', controller: 'o' };
    const blueCre = makeCreature('bc-1', { controller: 'p', color: 'U', tapped: true });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [blueCre], oBf: [mountain] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    expect(s1.p.bf.find(c => c.iid === 'bc-1').tapped).toBe(true);
  });

  it('Magnetic Mountain: pays {4} per creature to untap N tapped blue creatures', () => {
    const mountain = { iid: 'mm-1', id: 'magnetic_mountain', name: 'Magnetic Mountain', type: 'Enchantment', controller: 'p' };
    const blueCre = makeCreature('bc-1', { controller: 'p', color: 'U', tapped: true });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [mountain, blueCre] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues pendingUpkeepChoice
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('magneticMountainPrompt');
    // Mana burns at every phase transition, so the player can only have
    // floating mana to spend once they've responded to the prompt itself.
    const s2b = { ...s2, p: { ...s2.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 4 } } };
    const s3 = duelReducer(s2b, { type: 'UPKEEP_CHOICE_RESOLVE' });
    expect(s3.pendingChoice?.kind).toBe('numberChoice');
    expect(s3.pendingChoice?.handlerKey).toBe('magneticMountainUntap');
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '1' });
    expect(s4.p.bf.find(c => c.iid === 'bc-1').tapped).toBe(false);
    expect(s4.p.mana.C).toBe(0);
  });

  it('Power Leak: paying reduces the 2 damage dealt at the enchanted enchantment controller\'s upkeep', () => {
    // Only the human player ('p') is queued for a pay-or-take-damage choice
    // (the AI opponent 'o' always auto-declines -- see the next test), so the
    // enchanted permanent here must be controlled by 'p'.
    const powerLeakAura = { iid: 'pl-1', name: 'Power Leak', mod: {}, controller: 'o', cardData: {} };
    const ench = { iid: 'e-1', id: 'some_enchantment', name: 'Some Enchantment', type: 'Enchantment', controller: 'p', enchantments: [powerLeakAura] };
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [ench] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues pendingUpkeepChoice
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('powerLeakPrompt');
    // Mana burns at every phase transition, so floating mana can only exist
    // once the player has responded to the prompt itself.
    const s2b = { ...s2, p: { ...s2.p, life: 20, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } };
    const s3 = duelReducer(s2b, { type: 'UPKEEP_CHOICE_RESOLVE' });
    expect(s3.pendingChoice?.kind).toBe('numberChoice');
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '2' });
    expect(s4.p.life).toBe(20); // paid 2, prevents all 2 damage
    expect(s4.p.mana.U).toBe(0);
  });

  it('Power Leak: opponent always takes the full 2 damage (never pays)', () => {
    const powerLeakAura = { iid: 'pl-1', name: 'Power Leak', mod: {}, controller: 'p', cardData: {} };
    const ench = { iid: 'e-1', id: 'some_enchantment', name: 'Some Enchantment', type: 'Enchantment', controller: 'o', enchantments: [powerLeakAura] };
    const base = makeState({ phase: PHASE.END, active: 'p', oBf: [ench] });
    const state = { ...base, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> CLEANUP
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UNTAP (o's turn)
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> UPKEEP (o auto-decides: takes 2)
    expect(s3.o.life).toBe(18);
  });

  it("Lich: ETB loses life equal to life total, doesn't lose at 0 life", () => {
    const spell = { iid: 'lc-1', id: 'lich', name: 'Lich', type: 'Enchantment', cmc: 4, cost: 'BBBB', effect: 'lichETB' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { W: 0, U: 0, B: 4, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'lc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.life).toBe(0);
    expect(s2.over).toBeNull();
    expect(s2.p.lichActive).toBe(true);
  });

  it('Lich: gaining life draws that many cards instead', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = { ...base, p: { ...base.p, life: 5, lichActive: true, lib: [makeLand('l1'), makeLand('l2')] } };
    const s1 = hurt(state, 'p', -2, 'Test lifegain');
    expect(s1.p.life).toBe(5); // unchanged
    expect(s1.p.hand).toHaveLength(2);
  });

  it('Lich: dealt damage forces sacrifice of that many permanents', () => {
    const lich = { iid: 'lc-1', id: 'lich', name: 'Lich', type: 'Enchantment', controller: 'p' };
    const cre = makeCreature('c-1', { controller: 'p' });
    const spell = { iid: 'dmg-1', id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant', cmc: 1, cost: 'R', effect: 'damage3' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [lich, cre], oHand: [spell] });
    const state = { ...base, p: { ...base.p, life: 20, lichActive: true }, o: { ...base.o, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'o', iid: 'dmg-1', tgt: 'p' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    // 3 damage dealt but p only controls 2 permanents (lich + cre) -- can't pay
    // the full sacrifice cost, so nothing is sacrificed and p simply loses.
    expect(s2.p.bf).toHaveLength(2);
    expect(s2.over?.winner).toBe('o');
  });

  it('Lich: when Lich itself is put into the graveyard, its controller loses', () => {
    const lich = {
      iid: 'lc-1', id: 'lich', name: 'Lich', type: 'Enchantment', controller: 'p',
      triggeredAbilities: [{ id: 'lich_dies', trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' }, condition: { type: 'destinationIsGY' }, effect: { type: 'losesGameController' } }],
    };
    const spell = { iid: 'ds-1', id: 'disenchant', name: 'Disenchant', type: 'Instant', cmc: 2, cost: '1W', effect: 'destroyArtOrEnch' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [lich], oHand: [spell] });
    const state = { ...base, o: { ...base.o, mana: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'o', iid: 'ds-1', tgt: 'lc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.over?.winner).toBe('o');
  });
});
