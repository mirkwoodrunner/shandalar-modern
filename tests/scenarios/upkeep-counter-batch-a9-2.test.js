// tests/scenarios/upkeep-counter-batch-a9-2.test.js
// A9 upkeep-trigger batch 2: Fasting, Primordial Ooze, Cocoon, Voodoo Doll --
// the self-referential counter-accumulation shape (a card puts a counter on
// itself/its own Aura each upkeep, with a threshold or pay-off consequence).
// See docs/CURRENT_SPRINT.md / docs/MECHANICS_INDEX.md for the full batch.
// Sibling files: upkeep-aura-and-eachplayer-batch-a9-2.test.js (aura-tied-to-
// controller and each-player shapes), upkeep-choice-batch-a9-2.test.js
// (optional/mandatory choice shapes).

import { describe, it, expect } from 'vitest';
import { duelReducer, getBF } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

function makeFasting(iid, overrides = {}) {
  return {
    iid, id: 'fasting', name: 'Fasting', type: 'Enchantment', color: 'W',
    cmc: 1, cost: 'W', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], upkeep: 'fastingUpkeep', controller: 'p',
    ...overrides,
  };
}

function makePrimordialOoze(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'primordial_ooze', name: 'Primordial Ooze', type: 'Creature', subtype: 'Ooze',
    color: 'R', cmc: 1, cost: 'R', power: 1, toughness: 1, keywords: [],
    upkeep: 'primordialOozeUpkeep', controller: 'p',
    ...overrides,
  });
}

function makeCocoonAura(iid, overrides = {}) {
  return { iid, name: 'Cocoon', mod: { enchantOwnOnly: true }, controller: 'p', counters: { PUPA: 3 }, cardData: { iid, id: 'cocoon', name: 'Cocoon', type: 'Enchantment', subtype: 'Aura', color: 'G', cmc: 1, cost: 'G' }, enterTs: 1, ...overrides };
}

function makeVoodooDoll(iid, overrides = {}) {
  return {
    iid, id: 'voodoo_doll', name: 'Voodoo Doll', type: 'Artifact', color: '',
    cmc: 6, cost: '6', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], upkeep: 'voodooDollUpkeep',
    activatedAbilities: [{ id: 'voodoo_doll_ping', effect: 'voodooDollPing' }],
    controller: 'p',
    ...overrides,
  };
}

describe('@engine Scenario: upkeep-counter-batch-a9-2 -- self-referential counter accumulation', () => {

  it('Fasting: puts a hunger counter on itself each upkeep, surviving below the threshold but destroying itself at 5 or more', () => {
    const belowThreshold = makeFasting('fast-1');
    const s1 = duelReducer(makeState({ phase: PHASE.UNTAP, active: 'p', turn: 2, pBf: [belowThreshold] }), { type: 'ADVANCE_PHASE' });
    expect(getBF(s1, 'fast-1')?.counters?.HUNGER).toBe(1);

    const atThreshold = makeFasting('fast-1b', { counters: { HUNGER: 4 } });
    const s2 = duelReducer(makeState({ phase: PHASE.UNTAP, active: 'p', turn: 2, pBf: [atThreshold] }), { type: 'ADVANCE_PHASE' });
    expect(getBF(s2, 'fast-1b')).toBeNull();
    expect(s2.p.gy.some(c => c.iid === 'fast-1b')).toBe(true);
  });

  it('Fasting: skipping the draw step gains 2 life instead of drawing', () => {
    const fasting = makeFasting('fast-3');
    let state = makeState({ phase: PHASE.UPKEEP, active: 'p', turn: 2, pBf: [fasting] });
    state = { ...state, p: { ...state.p, lib: [makeSpell('lib-1')] } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UPKEEP -> DRAW
    expect(s1.p.life).toBe(22);
    expect(s1.p.hand.length).toBe(0);
    expect(getBF(s1, 'fast-3')).toBeTruthy();
  });

  it('Fasting: destroys itself when its controller draws a card (any draw, not just the draw step)', () => {
    const fasting = makeFasting('fast-4');
    const braingeyser = makeSpell('bg-1', { id: 'braingeyser', name: 'Braingeyser', type: 'Sorcery', effect: 'drawX', cost: 'XUU', cmc: 3 });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [fasting], pHand: [braingeyser] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 2, C: 1 }, lib: [makeSpell('l1'), makeSpell('l2')] } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'bg-1', tgt: 'p', xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(getBF(s2, 'fast-4')).toBeNull();
    expect(s2.p.gy.some(c => c.iid === 'fast-4')).toBe(true);
  });

  it("Primordial Ooze: AI can't pay the counter-derived {X} -- taps itself and deals X damage to its controller", () => {
    const ooze = makePrimordialOoze('ooze-1', { controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [ooze] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const c = getBF(s1, 'ooze-1');
    expect(c.counters.P1P1).toBe(1);
    expect(c.tapped).toBe(true);
    expect(s1.o.life).toBe(19);
  });

  it('Primordial Ooze: human pays the counter-derived {X} in response to the upkeep prompt and stays untapped', () => {
    const ooze = makePrimordialOoze('ooze-2');
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [ooze] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('primordialOozeUpkeep');
    expect(s1.pendingUpkeepChoice?.payCost).toBe('1');
    const s2 = { ...s1, p: { ...s1.p, mana: { ...s1.p.mana, C: 1 } } };
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    const c = getBF(s3, 'ooze-2');
    expect(c.tapped).toBe(false);
    expect(s3.p.life).toBe(20);
  });

  it('Cocoon: taps the enchanted creature and puts three pupa counters on the Aura (not the creature) when it enters', () => {
    const bear = makeCreature('bear-1', { name: 'Grizzly Bears', controller: 'p' });
    const cocoon = makeSpell('coc-1', { id: 'cocoon', name: 'Cocoon', type: 'Enchantment', subtype: 'Aura', color: 'G', cmc: 1, cost: 'G', effect: 'enchantCreature', mod: { enchantOwnOnly: true } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [bear], pHand: [cocoon] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, G: 1 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'coc-1', tgt: 'bear-1', xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const bearAfter = getBF(s2, 'bear-1');
    expect(bearAfter.tapped).toBe(true);
    expect(bearAfter.counters.PUPA).toBeUndefined();
    const aura = bearAfter.enchantments.find(e => e.name === 'Cocoon');
    expect(aura.counters.PUPA).toBe(3);
  });

  it("Cocoon: the enchanted creature doesn't untap while the Aura has a pupa counter, and a counter is removed each upkeep", () => {
    const bear = makeCreature('bear-2', { name: 'Grizzly Bears', controller: 'p', tapped: true, enchantments: [makeCocoonAura('coc-2')] });
    // CLEANUP with active:'o' -> ADVANCE_PHASE crosses into 'p's own UNTAP
    // (turnChange flips the active player), same pattern as the existing
    // Island Fish Jasconius doesNotUntapNormally coverage.
    const state = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [bear] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    expect(getBF(s1, 'bear-2').tapped).toBe(true);
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    const aura = getBF(s2, 'bear-2').enchantments.find(e => e.name === 'Cocoon');
    expect(aura.counters.PUPA).toBe(2);
  });

  it("Cocoon: once its pupa counters are exhausted, sacrifices itself and gives the creature a +1/+1 counter and flying permanently", () => {
    const bear = makeCreature('bear-4', { name: 'Grizzly Bears', power: 2, toughness: 2, controller: 'p', enchantments: [makeCocoonAura('coc-4', { counters: { PUPA: 0 } })] });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [bear] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const bearAfter = getBF(s1, 'bear-4');
    expect(bearAfter.enchantments.some(e => e.name === 'Cocoon')).toBe(false);
    expect(bearAfter.counters.P1P1).toBe(1);
    expect(bearAfter.keywords).toContain('FLYING');
  });

  it('Voodoo Doll: accumulates a pin counter each upkeep, then the {X}{X},{T} ability deals damage equal to the pin count', () => {
    const doll = makeVoodooDoll('doll-1', { counters: { PIN: 2 } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [doll] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, C: 4 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'doll-1', tgt: 'o', abilityId: 'voodoo_doll_ping' });
    expect(s1.o.life).toBe(18); // 2 pin counters -> 2 damage
    expect(getBF(s1, 'doll-1').tapped).toBe(true);
    expect(s1.p.mana.C).toBe(0); // paid {X}{X} = {4} for X=2
  });

  it('Voodoo Doll: destroys itself and deals damage equal to its pin counters at its end step if left untapped, but survives if tapped', () => {
    const dollUntapped = makeVoodooDoll('doll-2', { counters: { PIN: 3 } });
    const state1 = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [dollUntapped] });
    const s1 = duelReducer(state1, { type: 'ADVANCE_PHASE' }); // MAIN_2 -> END
    expect(getBF(s1, 'doll-2')).toBeNull();
    expect(s1.p.life).toBe(17);
    expect(s1.p.gy.some(c => c.iid === 'doll-2')).toBe(true);

    const dollTapped = makeVoodooDoll('doll-3', { tapped: true, counters: { PIN: 3 } });
    const state2 = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [dollTapped] });
    const s2 = duelReducer(state2, { type: 'ADVANCE_PHASE' });
    expect(getBF(s2, 'doll-3')).toBeTruthy();
  });

});
