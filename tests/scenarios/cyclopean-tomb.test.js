// tests/scenarios/cyclopean-tomb.test.js
// Cyclopean Tomb: "{2}, {T}: Put a mire counter on target non-Swamp land. That
// land is a Swamp for as long as it has a mire counter on it. Activate only
// during your upkeep. When this artifact is put into a graveyard from the
// battlefield, at the beginning of each of your upkeeps for the rest of the
// game, remove all mire counters from a land that a mire counter was put onto
// with this artifact but that a mire counter has not been removed from with
// this artifact." Uses the shared emblem infrastructure (see
// tests/scenarios/emblem-infrastructure.test.js) for the post-graveyard tail,
// and reuses the existing myUpkeepOnly gate (Gate to Phyrexia / Life Chisel)
// for the "activate only during your upkeep" restriction.
// Adapted from Card-Forge/forge (c/cyclopean_tomb.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, zMove, recomputeTypeEffects } from '../../src/engine/DuelCore.js';
import { computeCharacteristics } from '../../src/engine/layers.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand } from '../../src/engine/__tests__/_factory.js';
import { getCardById } from '../../src/data/cards.js';

function makeTomb(iid, overrides = {}) {
  const def = getCardById('cyclopean_tomb');
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

describe('@engine-card-scenarios-4 Scenario: Cyclopean Tomb', () => {

  it('CT-01: activation only allowed during the controller\'s own upkeep; refused in any other phase with no mana spent', () => {
    const tomb = makeTomb('tomb-1', { controller: 'p' });
    const land = makeLand('land-1', { controller: 'o', subtype: 'Island' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tomb], oBf: [land] });
    state = withMana(state, 'p', 2);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'land-1' });

    expect(s1.p.mana.C).toBe(2);
    expect(s1.p.bf.find(c => c.iid === 'tomb-1').tapped).toBe(false);
    expect(s1.stack.length).toBe(0);
  });

  it("CT-02: activation refused during the opponent's upkeep", () => {
    const tomb = makeTomb('tomb-1', { controller: 'p' });
    const land = makeLand('land-1', { controller: 'o', subtype: 'Island' });
    let state = makeState({ phase: PHASE.UPKEEP, active: 'o', pBf: [tomb], oBf: [land] });
    state = withMana(state, 'p', 2);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'land-1' });

    expect(s1.p.mana.C).toBe(2);
    expect(s1.p.bf.find(c => c.iid === 'tomb-1').tapped).toBe(false);
  });

  it('CT-03: successful activation adds a MIRE counter to the target land and pays {2}+tap', () => {
    const tomb = makeTomb('tomb-1', { controller: 'p' });
    const land = makeLand('land-1', { controller: 'o', subtype: 'Island' });
    let state = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [tomb], oBf: [land] });
    state = withMana(state, 'p', 2);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'land-1' });
    expect(s1.p.mana.C).toBe(0);
    expect(s1.p.bf.find(c => c.iid === 'tomb-1').tapped).toBe(true);
    expect(s1.stack.length).toBe(1);

    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const landAfter = s2.o.bf.find(c => c.iid === 'land-1');
    expect(landAfter.counters.MIRE).toBe(1);
  });

  it('CT-04: targeting a land that already has a MIRE counter is illegal (already Swamp-subtyped)', () => {
    const tomb = makeTomb('tomb-1', { controller: 'p' });
    const land = makeLand('land-1', { controller: 'o', subtype: 'Island', counters: { MIRE: 1 } });
    let state = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [tomb], oBf: [land] });
    state = recomputeTypeEffects(withMana(state, 'p', 2)); // bake subtypeEff:'Swamp' from the existing counter

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'land-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const landAfter = s2.o.bf.find(c => c.iid === 'land-1');
    expect(landAfter.counters.MIRE).toBe(1); // unchanged -- fizzled, not incremented
  });

  it('CT-05: targeting an actual printed Swamp is illegal', () => {
    const tomb = makeTomb('tomb-1', { controller: 'p' });
    const swamp = makeLand('land-1', { id: 'swamp', name: 'Swamp', subtype: 'Basic Swamp', produces: ['B'], controller: 'o' });
    let state = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [tomb], oBf: [swamp] });
    state = withMana(state, 'p', 2);

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'land-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const landAfter = s2.o.bf.find(c => c.iid === 'land-1');
    expect(landAfter.counters.MIRE ?? 0).toBe(0);
  });

  it('CT-06: a land with a MIRE counter reads as subtype Swamp via collectEffects/Layer 4', () => {
    const land = makeLand('land-1', { controller: 'o', subtype: 'Island', counters: { MIRE: 1 } });
    const state = makeState({ oBf: [land] });

    const ch = computeCharacteristics(land, state);
    expect(ch.subtypes).toEqual(['Swamp']);
  });

  it("CT-07: a mired land's Swamp status grants the intrinsic Swamp mana ability via landTypeOverride -- matching the existing Evil Presence precedent (CR 305.6), not a mana-ability-free simplification", () => {
    // Strip Mine has no printed subtype at all, so a full Layer-4 subtype
    // replacement down to ['Swamp'] triggers landTypeOverride exactly the way
    // it already does for Evil Presence's "enchanted land is a Swamp" -- see
    // layers.js collectEffects step 14c.
    const land = makeLand('land-1', { id: 'strip_mine', name: 'Strip Mine', subtype: undefined, produces: ['C'], controller: 'p', counters: { MIRE: 1 } });
    let state = makeState({ pBf: [land] });
    state = recomputeTypeEffects(state);

    const baked = state.p.bf.find(c => c.iid === 'land-1');
    expect(baked.landTypeOverride).toBe('Swamp');

    const s1 = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-1' });
    expect(s1.p.mana.B).toBe(1);
  });

  it("CT-08: the activating Tomb's own mireLandIids list grows with each successful activation", () => {
    const tomb = makeTomb('tomb-1', { controller: 'p' });
    const land1 = makeLand('land-1', { controller: 'o', subtype: 'Island' });
    const land2 = makeLand('land-2', { controller: 'o', subtype: 'Mountain' });
    let state = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [tomb], oBf: [land1, land2] });
    state = withMana(state, 'p', 4);

    let s = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'land-1' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });
    // Simulate the Tomb having untapped again (untap step is not exercised here).
    s = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === 'tomb-1' ? { ...c, tapped: false } : c) } };
    s = withMana(s, 'p', 2);
    s = duelReducer(s, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'land-2' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });

    const tombAfter = s.p.bf.find(c => c.iid === 'tomb-1');
    expect(tombAfter.mireLandIids).toEqual(['land-1', 'land-2']);
  });

  it('CT-09: Cyclopean Tomb put into a graveyard creates a permanent emblem snapshotting mireLandIids', () => {
    const tomb = makeTomb('tomb-1', { controller: 'p', mireLandIids: ['land-1', 'land-2'] });
    let state = makeState({ pBf: [tomb] });

    state = zMove(state, 'tomb-1', 'p', 'p', 'gy');

    expect(state.p.emblems.length).toBe(1);
    const emblem = state.p.emblems[0];
    expect(emblem.duration).toBe('permanent');
    expect(emblem.mireLandIids).toEqual(['land-1', 'land-2']);
    expect(emblem.mireRemovedIids).toEqual([]);
  });

  it('CT-10: Cyclopean Tomb removed via exile (not graveyard) does NOT create the emblem', () => {
    const tomb = makeTomb('tomb-1', { controller: 'p', mireLandIids: ['land-1'] });
    let state = makeState({ pBf: [tomb] });

    state = zMove(state, 'tomb-1', 'p', 'p', 'exile');

    expect((state.p.emblems ?? []).length).toBe(0);
  });

  it("CT-11: the emblem's upkeep trigger fires only on the controller's own upkeep, removing all MIRE counters from the next unhandled land in mireLandIids", () => {
    const land1 = makeLand('land-1', { controller: 'o', subtype: 'Island', counters: { MIRE: 1 } });
    const emblem = {
      id: 'em1', source: 'cyclopean_tomb', name: 'Cyclopean Tomb (emblem)', controller: 'p', duration: 'permanent',
      mireLandIids: ['land-1'], mireRemovedIids: [],
      triggeredAbilities: [{ id: 'cyclopean_tomb_emblem_upkeep', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'cyclopeanTombRemoveMire' } }],
    };
    let state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [land1] });
    state = recomputeTypeEffects({ ...state, p: { ...state.p, emblems: [emblem] } });

    const afterOUpkeep = duelReducer(state, { type: 'ADVANCE_PHASE' }); // o's upkeep -- not the emblem's controller
    expect(afterOUpkeep.o.bf.find(c => c.iid === 'land-1').counters.MIRE).toBe(1);

    const afterPUpkeep = duelReducer({ ...afterOUpkeep, phase: PHASE.UNTAP, active: 'p' }, { type: 'ADVANCE_PHASE' }); // p's own upkeep
    const landAfter = afterPUpkeep.o.bf.find(c => c.iid === 'land-1');
    expect(landAfter.counters.MIRE).toBe(0);
    expect(afterPUpkeep.p.emblems[0].mireRemovedIids).toEqual(['land-1']);
  });

  it("CT-12: after all lands in mireLandIids have been cleared, the emblem persists but its upkeep trigger becomes a harmless no-op (no dlog spam, no state change)", () => {
    const land1 = makeLand('land-1', { controller: 'o', subtype: 'Island', counters: { MIRE: 0 } });
    const emblem = {
      id: 'em1', controller: 'p', duration: 'permanent',
      mireLandIids: ['land-1'], mireRemovedIids: ['land-1'],
      triggeredAbilities: [{ id: 'cyclopean_tomb_emblem_upkeep', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'cyclopeanTombRemoveMire' } }],
    };
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', oBf: [land1] });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(s1.p.emblems.length).toBe(1);
    expect(s1.p.emblems[0]).toEqual(emblem);
    const mireLogs = s1.log.filter(e => (e.text ?? '').includes('mire effect removes'));
    expect(mireLogs.length).toBe(0);
  });

  it("CT-13: the emblem's mireRemovedIids grows by exactly one per upkeep, never processing more than one land per trigger", () => {
    const land1 = makeLand('land-1', { controller: 'o', subtype: 'Island', counters: { MIRE: 1 } });
    const land2 = makeLand('land-2', { controller: 'o', subtype: 'Mountain', counters: { MIRE: 1 } });
    const emblem = {
      id: 'em1', controller: 'p', duration: 'permanent',
      mireLandIids: ['land-1', 'land-2'], mireRemovedIids: [],
      triggeredAbilities: [{ id: 'cyclopean_tomb_emblem_upkeep', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'cyclopeanTombRemoveMire' } }],
    };
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', oBf: [land1, land2] });
    state = recomputeTypeEffects({ ...state, p: { ...state.p, emblems: [emblem] } });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.emblems[0].mireRemovedIids).toEqual(['land-1']);
    expect(s1.o.bf.find(c => c.iid === 'land-2').counters.MIRE).toBe(1); // untouched this trigger

    const s2 = duelReducer({ ...s1, phase: PHASE.UNTAP, active: 'p' }, { type: 'ADVANCE_PHASE' }); // simulated next upkeep
    expect(s2.p.emblems[0].mireRemovedIids).toEqual(['land-1', 'land-2']);
    expect(s2.o.bf.find(c => c.iid === 'land-2').counters.MIRE).toBe(0);
  });

  it("CT-14: the emblem survives CLEANUP indefinitely (duration:'permanent' is never swept, tested across multiple simulated turns)", () => {
    const emblem = { id: 'em1', controller: 'p', duration: 'permanent', mireLandIids: [], mireRemovedIids: [] };
    let s = makeState({ phase: PHASE.END, active: 'p' });
    s = { ...s, p: { ...s.p, emblems: [emblem] } };

    for (let i = 0; i < 3; i++) {
      s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
      expect(s.phase).toBe(PHASE.CLEANUP);
      expect(s.p.emblems).toEqual([emblem]);
      s = { ...s, phase: PHASE.END }; // reset for the next simulated turn
    }
  });

});
