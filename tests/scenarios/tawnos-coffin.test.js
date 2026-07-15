// tests/scenarios/tawnos-coffin.test.js
// Tawnos's Coffin: "You may choose not to untap this artifact during your
// untap step. {3}, {T}: Exile target creature and all Auras attached to it.
// Note the number and kind of counters that were on that creature. When this
// artifact leaves the battlefield or becomes untapped, return that exiled
// card to the battlefield under its owner's control tapped with the noted
// number and kind of counters on it. If you do, return the other exiled
// cards to the battlefield under their owner's control attached to that
// permanent." See docs/ENGINE_CONTRACT_SPEC.md S7.12 for the full mechanism
// writeup (snapshot-before-zMove pattern, the two untap-detection insertion
// points, and the optionalUntapAlways artifact-branch fix).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { duelReducer, zMove, isCre } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import { getCardById } from '../../src/data/cards.js';
import { isCreatureOnlyTarget } from '../../src/hooks/useDuelController';

function makeCoffin(iid, overrides = {}) {
  const def = getCardById('tawnos_coffin');
  return {
    iid, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
    ...def,
    ...overrides,
  };
}

function withMana(state, who, amount) {
  return { ...state, [who]: { ...state[who], mana: { ...state[who].mana, C: amount } } };
}

describe("@engine-card-scenarios-2 Scenario: Tawnos's Coffin", () => {

  // -- Exile action ----------------------------------------------------------

  it('TC-01: activation targeting a creature with counters snapshots the counters onto the Coffin; the exiled card\'s own counters no longer matter (zMove already strips them)', () => {
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'o', counters: { P1P1: 2 } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin], oBf: [bear] });
    state = withMana(state, 'p', 3);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.o.bf.some(c => c.iid === 'bear-1')).toBe(false);
    const exiledBear = s2.o.exile.find(c => c.iid === 'bear-1');
    expect(exiledBear).toBeDefined();
    expect(exiledBear.counters).toEqual({});
    const coffinAfter = s2.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledCreatureIid).toBe('bear-1');
    expect(coffinAfter.exiledCreatureOwner).toBe('o');
    expect(coffinAfter.exiledCreatureCounters).toEqual({ P1P1: 2 });
    expect(coffinAfter.tapped).toBe(true);
  });

  it('TC-02: activation targeting a creature with an embedded Aura exiles both the creature AND the Aura (not the Aura falling to the graveyard)', () => {
    const aura = { iid: 'aura-1', name: 'Test Aura', controller: 'p', mod: { power: 1, toughness: 1 }, cardData: { id: 'test_aura', name: 'Test Aura' } };
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'p', enchantments: [aura] });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear] });
    state = withMana(state, 'p', 3);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.gy).toEqual([]);
    const coffinAfter = s2.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledAuraRecords).toHaveLength(1);
    expect(coffinAfter.exiledAuraRecords[0].kind).toBe('embedded');
    expect(coffinAfter.exiledAuraRecords[0].record.iid).toBe('aura-1');
  });

  it('TC-03: activation with no Auras and no counters is a clean exile with empty tracking arrays', () => {
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear] });
    state = withMana(state, 'p', 3);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const coffinAfter = s2.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledCreatureIid).toBe('bear-1');
    expect(coffinAfter.exiledCreatureCounters).toEqual({});
    expect(coffinAfter.exiledAuraRecords).toEqual([]);
  });

  it('TC-04: activation targeting a non-creature permanent fizzles -- no exile, no tracking fields set', () => {
    const coffin = makeCoffin('coffin-1');
    const land = makeLand('land-1', { controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, land] });
    state = withMana(state, 'p', 3);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'land-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.bf.some(c => c.iid === 'land-1')).toBe(true);
    const coffinAfter = s2.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledCreatureIid).toBeUndefined();
  });

  it('TC-05: activation is refused when the {3},{T} cost cannot be paid -- standard cost gating unchanged (tap cost is paid before the mana check, same as every other {T}+mana activated ability in this engine)', () => {
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear] });
    state = withMana(state, 'p', 2);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    expect(s1.p.mana.C).toBe(2);
    expect(s1.stack.length).toBe(0);
    expect(s1.p.bf.some(c => c.iid === 'bear-1')).toBe(true);
  });

  it('TC-06: two separate activations in sequence -- tracking fields reflect only the most recent exile', () => {
    const coffin = makeCoffin('coffin-1');
    const bear1 = makeCreature('bear-1', { controller: 'p' });
    const bear2 = makeCreature('bear-2', { controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear1, bear2] });
    state = withMana(state, 'p', 3);

    let s = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });
    expect(s.p.bf.find(c => c.iid === 'coffin-1').exiledCreatureIid).toBe('bear-1');

    // Manually reset the Coffin untapped and re-fund mana to simulate a later
    // activation, bypassing the intervening return flow (not under test here).
    s = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === 'coffin-1' ? { ...c, tapped: false } : c), mana: { ...s.p.mana, C: 3 } } };

    s = duelReducer(s, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-2' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });

    const coffinAfter = s.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledCreatureIid).toBe('bear-2');
  });

  it('TC-07: multiple embedded Auras on the same target creature are all captured and exiled together', () => {
    const aura1 = { iid: 'aura-1', name: 'Aura One', controller: 'p', mod: { power: 1 }, cardData: {} };
    const aura2 = { iid: 'aura-2', name: 'Aura Two', controller: 'p', mod: { toughness: 1 }, cardData: {} };
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'p', enchantments: [aura1, aura2] });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear] });
    state = withMana(state, 'p', 3);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const coffinAfter = s2.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledAuraRecords).toHaveLength(2);
    const iids = coffinAfter.exiledAuraRecords.map(r => r.record.iid).sort();
    expect(iids).toEqual(['aura-1', 'aura-2']);
  });

  it('TC-08: a hypothetical Kudzu-style creature-host Aura (enchantedCreatureIid) is captured generically when present, and the check is a no-op when absent', () => {
    const coffin1 = makeCoffin('coffin-1');
    const bear1 = makeCreature('bear-1', { controller: 'p' });
    const kudzuAura = {
      iid: 'kudzu-1', id: 'test_kudzu_aura', name: 'Synthetic Kudzu Aura', type: 'Enchantment',
      controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      enchantedCreatureIid: 'bear-1',
    };
    let state1 = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin1, bear1, kudzuAura] });
    state1 = withMana(state1, 'p', 3);
    let s1 = duelReducer(state1, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    s1 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const coffin1After = s1.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffin1After.exiledAuraRecords).toEqual([{ kind: 'kudzu', iid: 'kudzu-1', controller: 'p' }]);
    expect(s1.p.exile.some(c => c.iid === 'kudzu-1')).toBe(true);

    // Absent case: no synthetic host on the battlefield -- the generic scan
    // finds nothing, matching every real card in the pool today.
    const coffin2 = makeCoffin('coffin-2');
    const bear2 = makeCreature('bear-2', { controller: 'p' });
    let state2 = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin2, bear2] });
    state2 = withMana(state2, 'p', 3);
    let s2 = duelReducer(state2, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-2', tgt: 'bear-2' });
    s2 = duelReducer(s2, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'coffin-2').exiledAuraRecords).toEqual([]);
  });

  // -- Return via leaves-the-battlefield --------------------------------------

  it('TC-09: Tawnos\'s Coffin destroyed while holding an exiled creature -- the creature returns to the battlefield tapped with its counters restored', () => {
    const coffin = makeCoffin('coffin-1', {
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'o', exiledCreatureCounters: { P1P1: 2 }, exiledAuraRecords: [],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'o' });
    let state = makeState({ pBf: [coffin], oBf: [] });
    state = { ...state, o: { ...state.o, exile: [exiledBear] } };

    state = zMove(state, 'coffin-1', 'p', 'p', 'gy');

    const returned = state.o.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.counters).toEqual({ P1P1: 2 });
    expect(state.o.exile.some(c => c.iid === 'bear-1')).toBe(false);
  });

  it('TC-10: return via leaves-the-battlefield reattaches an embedded Aura to the returned creature', () => {
    const auraRecord = { kind: 'embedded', record: { iid: 'aura-1', name: 'Test Aura', controller: 'p', mod: { power: 1 }, cardData: {} } };
    const coffin = makeCoffin('coffin-1', {
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: {}, exiledAuraRecords: [auraRecord],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    let state = makeState({ pBf: [coffin] });
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    state = zMove(state, 'coffin-1', 'p', 'p', 'gy');

    const returned = state.p.bf.find(c => c.iid === 'bear-1');
    expect(returned.enchantments).toHaveLength(1);
    expect(returned.enchantments[0].iid).toBe('aura-1');
  });

  it('TC-11: return via leaves-the-battlefield restores a Kudzu-style synthetic Aura and re-points its host field at the creature\'s new iid', () => {
    const auraRecord = { kind: 'kudzu', iid: 'kudzu-1', controller: 'p' };
    const coffin = makeCoffin('coffin-1', {
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: {}, exiledAuraRecords: [auraRecord],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    const exiledKudzu = {
      iid: 'kudzu-1', id: 'test_kudzu_aura', name: 'Synthetic Kudzu Aura', type: 'Enchantment',
      controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    };
    let state = makeState({ pBf: [coffin] });
    state = { ...state, p: { ...state.p, exile: [exiledBear, exiledKudzu] } };

    state = zMove(state, 'coffin-1', 'p', 'p', 'gy');

    const returnedKudzu = state.p.bf.find(c => c.iid === 'kudzu-1');
    expect(returnedKudzu).toBeDefined();
    expect(returnedKudzu.enchantedCreatureIid).toBe('bear-1');
  });

  it('TC-12: Tawnos\'s Coffin leaving the battlefield with nothing exiled is a clean no-op', () => {
    const coffin = makeCoffin('coffin-1');
    const state = makeState({ pBf: [coffin] });

    expect(() => zMove(state, 'coffin-1', 'p', 'p', 'gy')).not.toThrow();
    const s = zMove(state, 'coffin-1', 'p', 'p', 'gy');
    expect(s.p.gy.some(c => c.iid === 'coffin-1')).toBe(true);
  });

  it('TC-13: if the exiled creature was already removed from exile by another effect, the return fizzles gracefully with no Aura return attempted', () => {
    const auraRecord = { kind: 'embedded', record: { iid: 'aura-1', name: 'Test Aura', controller: 'p', mod: {}, cardData: {} } };
    const coffin = makeCoffin('coffin-1', {
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: { P1P1: 1 }, exiledAuraRecords: [auraRecord],
    });
    const state = makeState({ pBf: [coffin] }); // bear-1 is NOT in p.exile

    expect(() => zMove(state, 'coffin-1', 'p', 'p', 'gy')).not.toThrow();
    const s = zMove(state, 'coffin-1', 'p', 'p', 'gy');
    expect(s.p.bf.some(c => c.iid === 'bear-1')).toBe(false);
  });

  it('TC-14: Tawnos\'s Coffin moved to exile (not the graveyard) by an unrelated effect still triggers its own return correctly', () => {
    const coffin = makeCoffin('coffin-1', {
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: {}, exiledAuraRecords: [],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    let state = makeState({ pBf: [coffin] });
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    state = zMove(state, 'coffin-1', 'p', 'p', 'exile');

    expect(state.p.bf.some(c => c.iid === 'bear-1')).toBe(true);
    expect(state.p.exile.some(c => c.iid === 'coffin-1')).toBe(true);
  });

  // -- Return via becomes-untapped ---------------------------------------------

  it('TC-15: the untap-step map itself, having auto-untapped a Coffin with no active decline gating, triggers the return (insertion point 1)', () => {
    const coffin = makeCoffin('coffin-1', {
      optionalUntap: false, optionalUntapAlways: false, tapped: true,
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: { P1P1: 1 }, exiledAuraRecords: [],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    let state = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [coffin] });
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP, active flips to 'p'

    expect(s1.active).toBe('p');
    expect(s1.p.bf.find(c => c.iid === 'coffin-1').tapped).toBe(false);
    const returned = s1.p.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.counters).toEqual({ P1P1: 1 });
  });

  it('TC-16: the controller explicitly chooses "UNTAP" via the optionalUntap choice -- return fires through the choice-handler insertion point', () => {
    const coffin = makeCoffin('coffin-1', {
      tapped: true, exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: { P1P1: 3 }, exiledAuraRecords: [],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [coffin] });
    let state = { ...base, pendingUpkeepChoice: { cardName: coffin.name, handlerKey: 'optionalUntap', iid: 'coffin-1' } };
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });

    expect(s1.pendingUpkeepChoice).toBeNull();
    expect(s1.p.bf.find(c => c.iid === 'coffin-1').tapped).toBe(false);
    const returned = s1.p.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.counters).toEqual({ P1P1: 3 });
  });

  it('TC-17: the controller declines the untap again -- no return, tracking fields remain set, creature stays in exile', () => {
    const coffin = makeCoffin('coffin-1', {
      tapped: true, exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: { P1P1: 1 }, exiledAuraRecords: [],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [coffin] });
    let state = { ...base, pendingUpkeepChoice: { cardName: coffin.name, handlerKey: 'optionalUntap', iid: 'coffin-1' } };
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'KEEP_TAPPED' });

    expect(s1.pendingUpkeepChoice).toBeNull();
    const coffinAfter = s1.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.tapped).toBe(true);
    expect(coffinAfter.exiledCreatureIid).toBe('bear-1');
    expect(s1.p.bf.some(c => c.iid === 'bear-1')).toBe(false);
    expect(s1.p.exile.some(c => c.iid === 'bear-1')).toBe(true);
  });

  it('TC-18: after a successful untap-triggered return, the Coffin\'s own tracking fields are cleared', () => {
    const coffin = makeCoffin('coffin-1', {
      tapped: true, exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: { P1P1: 1 }, exiledAuraRecords: [],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [coffin] });
    let state = { ...base, pendingUpkeepChoice: { cardName: coffin.name, handlerKey: 'optionalUntap', iid: 'coffin-1' } };
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });

    const coffinAfter = s1.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledCreatureIid).toBeFalsy();
    expect(coffinAfter.exiledCreatureOwner).toBeFalsy();
    expect(coffinAfter.exiledCreatureCounters).toBeFalsy();
    expect(coffinAfter.exiledAuraRecords).toBeFalsy();
  });

  it('TC-19: an untap-triggered return with an embedded Aura reattaches it correctly', () => {
    const auraRecord = { kind: 'embedded', record: { iid: 'aura-1', name: 'Test Aura', controller: 'p', mod: { power: 1 }, cardData: {} } };
    const coffin = makeCoffin('coffin-1', {
      tapped: true, exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: {}, exiledAuraRecords: [auraRecord],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [coffin] });
    let state = { ...base, pendingUpkeepChoice: { cardName: coffin.name, handlerKey: 'optionalUntap', iid: 'coffin-1' } };
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });

    const returned = s1.p.bf.find(c => c.iid === 'bear-1');
    expect(returned.enchantments).toHaveLength(1);
    expect(returned.enchantments[0].iid).toBe('aura-1');
  });

  it('TC-20: an untap-triggered return where the exiled creature is no longer in exile fizzles gracefully', () => {
    const coffin = makeCoffin('coffin-1', {
      tapped: true, exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: {}, exiledAuraRecords: [],
    });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [coffin] }); // bear-1 not in exile
    const state = { ...base, pendingUpkeepChoice: { cardName: coffin.name, handlerKey: 'optionalUntap', iid: 'coffin-1' } };

    expect(() => duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' })).not.toThrow();
    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });
    expect(s1.p.bf.find(c => c.iid === 'coffin-1').tapped).toBe(false);
    expect(s1.p.bf.some(c => c.iid === 'bear-1')).toBe(false);
  });

  it('TC-21: the Coffin untapping via some other, unrelated effect does not trigger a return (known, accepted scope gap)', () => {
    const untapper = {
      iid: 'untapper-1', id: 'test_untapper', name: 'Test Untapper', type: 'Artifact', controller: 'p',
      tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 3,
      activated: { cost: '1,T', effect: 'untapTarget' },
    };
    const coffin = makeCoffin('coffin-1', {
      tapped: true, exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: { P1P1: 1 }, exiledAuraRecords: [],
    });
    const exiledBear = makeCreature('bear-1', { controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, untapper] });
    state = withMana(state, 'p', 1);
    state = { ...state, p: { ...state.p, exile: [exiledBear] } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'untapper-1', tgt: 'coffin-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.bf.find(c => c.iid === 'coffin-1').tapped).toBe(false);
    // The creature does NOT return -- untapping via any mechanism other than
    // the two checked insertion points (untap-step map, optionalUntap choice
    // handler) is a deliberate, accepted scope boundary, not a bug.
    expect(s2.p.bf.some(c => c.iid === 'bear-1')).toBe(false);
    expect(s2.p.bf.find(c => c.iid === 'coffin-1').exiledCreatureIid).toBe('bear-1');
  });

  it('TC-22: regression -- optionalUntapAlways\'s existing behavior for Phyrexian Gremlins is unaffected by the new Coffin-specific insertion points', () => {
    const gremlins = makeCreature('pg-1', { id: 'phyrexian_gremlins', name: 'Phyrexian Gremlins', controller: 'p', tapped: true, optionalUntap: true, optionalUntapAlways: true });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [gremlins] });

    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP, active flips to 'p'

    expect(s1.active).toBe('p');
    expect(s1.p.bf.find(c => c.iid === 'pg-1').tapped).toBe(true);
    expect(s1.pendingUpkeepChoice).not.toBeNull();
    expect(s1.pendingUpkeepChoice.handlerKey).toBe('optionalUntap');
    expect(s1.pendingUpkeepChoice.iid).toBe('pg-1');
  });

  // -- Card-level / meta -------------------------------------------------------

  it('TC-23: full round trip -- exile, Tawnos\'s Coffin destroyed, creature returns tapped with counters, in one continuous scenario', () => {
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'o', counters: { P1P1: 2 } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin], oBf: [bear] });
    state = withMana(state, 'p', 3);

    let s = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });
    expect(s.o.bf.some(c => c.iid === 'bear-1')).toBe(false);

    s = zMove(s, 'coffin-1', 'p', 'p', 'gy');

    const returned = s.o.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.counters).toEqual({ P1P1: 2 });
  });

  it('TC-24: full round trip via becomes-untapped instead of leaves-the-battlefield', () => {
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'p', counters: { P1P1: 1 } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear] });
    state = withMana(state, 'p', 3);

    let s = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });
    expect(s.p.bf.some(c => c.iid === 'bear-1')).toBe(false);

    s = { ...s, phase: PHASE.UNTAP, pendingUpkeepChoice: { cardName: "Tawnos's Coffin", handlerKey: 'optionalUntap', iid: 'coffin-1' } };
    s = duelReducer(s, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });

    const returned = s.p.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.counters).toEqual({ P1P1: 1 });
  });

  it('TC-25: clicking a non-creature permanent during targeting is illegal (creature-only click restriction, CREATURE_ONLY_TARGET_EFFECTS)', () => {
    const coffinCard = getCardById('tawnos_coffin');
    expect(isCreatureOnlyTarget(coffinCard, null)).toBe(true);
    const land = makeLand('land-1');
    const bear = makeCreature('bear-1');
    const rejectsLand = isCreatureOnlyTarget(coffinCard, null) && !isCre(land);
    const acceptsBear = !(isCreatureOnlyTarget(coffinCard, null) && !isCre(bear));
    expect(rejectsLand).toBe(true);
    expect(acceptsBear).toBe(true);
  });

  it('TC-26: tawnosCoffinExile is registered in ACTIVATE_TARGET_EFFECTS so the activated ability opens a targeting UI step', () => {
    const hookPath = fileURLToPath(new URL('../../src/hooks/useDuelController.ts', import.meta.url));
    const src = readFileSync(hookPath, 'utf8');
    const match = src.match(/const ACTIVATE_TARGET_EFFECTS = new Set\(\[([\s\S]*?)\]\);/);
    expect(match).not.toBeNull();
    expect(match[1]).toContain("'tawnosCoffinExile'");
  });

  it('TC-27: the untriaged lowercase stub sentinel count in cards.js is exactly 0', () => {
    const cardsPath = fileURLToPath(new URL('../../src/data/cards.js', import.meta.url));
    const src = readFileSync(cardsPath, 'utf8');
    const stubCount = (src.match(/effect:"stub"/g) || []).length;
    expect(stubCount).toBe(0);
  });

  it('TC-28: regression -- an unrelated card\'s own ON_PERMANENT_LEAVES_BF trigger (Titania\'s Song) is unaffected by Tawnos\'s Coffin sharing the same event name', () => {
    const songDef = getCardById('titaniass_song');
    const song = { iid: 'song-1', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', enterTs: 1, ...songDef };
    const coffin = makeCoffin('coffin-1'); // on the battlefield too, nothing exiled
    let state = makeState({ pBf: [song, coffin] });

    state = zMove(state, 'song-1', 'p', 'p', 'gy');

    expect(state.p.emblems.length).toBe(1);
    expect(state.p.emblems[0].source).toBe('titanias_song');
    const coffinAfter = state.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter).toBeDefined();
    expect(coffinAfter.tapped).toBe(false);
  });

});
