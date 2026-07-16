// tests/scenarios/oubliette.test.js
// Oubliette: "When this enchantment enters, target creature phases out until
// this enchantment leaves the battlefield. Tap that creature as it phases in
// this way. (Auras and Equipment phase out with it. While permanents are
// phased out, they're treated as though they don't exist.)"
//
// One-shot phasing built on the Tawnos's Coffin snapshot/exile/return
// machinery (snapshotAndExileCreature / tawnosCoffinReturn), with three
// faithful-phasing guarantees:
//   1. Phase-out fires NO leave-the-battlefield triggers (zMove's
//      suppressLeaveEvent option).
//   2. Phase-in fires NO enter-the-battlefield effects (this engine has no
//      ETB event at all -- asserted here, not merely assumed).
//   3. The phased-in creature is NOT summoning sick (tawnosCoffinReturn's
//      phasing option), though it does return tapped per the card text.
// Tawnos's Coffin's own shipped behavior stays byte-identical throughout
// (OUB-21/OUB-22 regression-guard it).
// See docs/ENGINE_CONTRACT_SPEC.md -- One-Shot Phasing (Oubliette).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { duelReducer, zMove, recomputeTypeEffects, isCre } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import { getCardById } from '../../src/data/cards.js';
import {
  needsExplicitTarget,
  needsAnyTarget,
  isCreatureOnlyTarget,
  EXPLICIT_TARGET_EFFECTS,
  CREATURE_ONLY_TARGET_EFFECTS,
} from '../../src/hooks/useDuelController';

// Oubliette as a hand card ready to cast.
function oublietteInHand(iid) {
  const def = getCardById('oubliette');
  return {
    iid, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
    ...def,
  };
}

// Oubliette already on the battlefield, optionally carrying tracking fields.
function oublietteOnBf(iid, overrides = {}) {
  const def = getCardById('oubliette');
  return {
    iid, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p', enterTs: 1,
    ...def,
    ...overrides,
  };
}

function makeCoffin(iid, overrides = {}) {
  const def = getCardById('tawnos_coffin');
  return {
    iid, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
    ...def,
    ...overrides,
  };
}

// Synthetic unconditional ON_PERMANENT_LEAVES_BF listener (non-self scope, no
// condition, no destination gate): fires on ANY permanent leaving the
// battlefield, observable via the +1/+1 counter its effect puts on itself.
// This is deliberately BROADER than any real listener in the pool (all of
// which are gy-gated or scope:'self' -- see docs/ENGINE_CONTRACT_SPEC.md), so
// it is the strongest possible detector for requirement 1.
function makeLeaveListener(iid, controller = 'p') {
  return {
    iid, id: 'test_leave_listener', name: 'Test Leave Listener', type: 'Artifact',
    color: '', cmc: 1, cost: '1', keywords: [], tapped: false, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller,
    triggeredAbilities: [{
      id: 'test_leave_listener_trigger',
      trigger: { event: 'ON_PERMANENT_LEAVES_BF' },
      effect: { type: 'addCounter', counter: '+1/+1', amount: 1 },
    }],
  };
}

function withMana(state, who, mana) {
  return { ...state, [who]: { ...state[who], mana: { ...state[who].mana, ...mana } } };
}

// Full cast of Oubliette by 'p' targeting tgtIid, through the real reducer
// (CAST_SPELL -> RESOLVE_STACK). Oubliette costs 1BB.
function castOubliette(state, oubIid, tgtIid) {
  let s = withMana(state, 'p', { B: 2, C: 1 });
  s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: oubIid, tgt: tgtIid });
  s = duelReducer(s, { type: 'RESOLVE_STACK' });
  return s;
}

describe("@engine-card-scenarios-1 Scenario: Oubliette (one-shot phasing)", () => {

  // -- Infrastructure (OUB-01..06) --------------------------------------------

  it('OUB-01: zMove with suppressLeaveEvent does NOT fire an ON_PERMANENT_LEAVES_BF listener; the same move without the flag DOES (default-path regression)', () => {
    const listener = makeLeaveListener('listener-1');
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ pBf: [listener, bear] });

    const suppressed = zMove(base, 'bear-1', 'p', 'p', 'exile', { suppressLeaveEvent: true });
    expect(suppressed.p.bf.find(c => c.iid === 'listener-1').counters.P1P1).toBeUndefined();
    expect(suppressed.p.exile.some(c => c.iid === 'bear-1')).toBe(true);

    const unsuppressed = zMove(base, 'bear-1', 'p', 'p', 'exile');
    expect(unsuppressed.p.bf.find(c => c.iid === 'listener-1').counters.P1P1).toBe(1);
  });

  it("OUB-02: Tawnos's Coffin still routes through snapshotAndExileCreature with byte-identical results (counters snapshot, embedded + Kudzu aura records, tracking shape)", () => {
    const aura = { iid: 'aura-1', name: 'Test Aura', controller: 'p', mod: { power: 1 }, cardData: {} };
    const kudzuAura = {
      iid: 'kudzu-1', id: 'test_kudzu_aura', name: 'Synthetic Kudzu Aura', type: 'Enchantment',
      controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      enchantedCreatureIid: 'bear-1',
    };
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'p', counters: { P1P1: 2 }, enchantments: [aura] });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear, kudzuAura] });
    state = withMana(state, 'p', { C: 3 });

    let s = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });

    expect(s.p.gy).toEqual([]); // embedded aura did NOT fall to the graveyard
    expect(s.p.exile.some(c => c.iid === 'bear-1')).toBe(true);
    expect(s.p.exile.find(c => c.iid === 'bear-1').counters).toEqual({});
    expect(s.p.exile.some(c => c.iid === 'kudzu-1')).toBe(true);
    const coffinAfter = s.p.bf.find(c => c.iid === 'coffin-1');
    expect(coffinAfter.exiledCreatureIid).toBe('bear-1');
    expect(coffinAfter.exiledCreatureOwner).toBe('p');
    expect(coffinAfter.exiledCreatureCounters).toEqual({ P1P1: 2 });
    expect(coffinAfter.exiledAuraRecords).toEqual([
      { kind: 'embedded', record: { ...aura } },
      { kind: 'kudzu', iid: 'kudzu-1', controller: 'p' },
    ]);
  });

  it('OUB-03: the phasing return path yields summoningSick=false and a "phases in" log; the default return path keeps the exact pre-existing wording and summoning sickness (regression)', () => {
    // Phasing path: Oubliette leaves the battlefield holding a tracked creature.
    const oub = oublietteOnBf('oub-1', {
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'p', exiledCreatureCounters: {}, exiledAuraRecords: [],
    });
    const exiledBear1 = makeCreature('bear-1', { controller: 'p' });
    let s1 = makeState({ pBf: [oub] });
    s1 = { ...s1, p: { ...s1.p, exile: [exiledBear1] } };
    s1 = zMove(s1, 'oub-1', 'p', 'p', 'gy');
    const phasedIn = s1.p.bf.find(c => c.iid === 'bear-1');
    expect(phasedIn).toBeDefined();
    expect(phasedIn.tapped).toBe(true);
    expect(phasedIn.summoningSick).toBe(false);
    expect(s1.log.some(e => e.text === 'Grizzly Bears phases in tapped.')).toBe(true);

    // Default path: Tawnos's Coffin leaves the battlefield -- verbatim shipped
    // wording, and summoningSick stays as zMove's bf-entry reset set it (true).
    const coffin = makeCoffin('coffin-1', {
      exiledCreatureIid: 'bear-2', exiledCreatureOwner: 'p', exiledCreatureCounters: {}, exiledAuraRecords: [],
    });
    const exiledBear2 = makeCreature('bear-2', { controller: 'p' });
    let s2 = makeState({ pBf: [coffin] });
    s2 = { ...s2, p: { ...s2.p, exile: [exiledBear2] } };
    s2 = zMove(s2, 'coffin-1', 'p', 'p', 'gy');
    const returned = s2.p.bf.find(c => c.iid === 'bear-2');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.summoningSick).toBe(true);
    expect(s2.log.some(e => e.text === 'Grizzly Bears returns to the battlefield tapped.')).toBe(true);
    expect(s2.log.some(e => e.text.includes('phases in'))).toBe(false);
  });

  it('OUB-04: recomputeTypeEffects still runs on a suppressed-event zMove (a type-effect source phasing out reverts the animation)', () => {
    const livingLands = {
      iid: 'll-1', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      controller: 'p', enterTs: 1,
      ...getCardById('living_lands'),
    };
    const forest = makeLand('forest-1', { controller: 'p' });
    let state = makeState({ pBf: [livingLands, forest] });
    state = recomputeTypeEffects(state);
    expect(state.p.bf.find(c => c.iid === 'forest-1').typeEff).toContain('Creature');

    const after = zMove(state, 'll-1', 'p', 'p', 'exile', { suppressLeaveEvent: true });
    expect(after.p.bf.find(c => c.iid === 'forest-1').typeEff).toBeUndefined();
  });

  it("OUB-05: a Kudzu-style aura attached to the phased creature is also exiled with its leave event suppressed (the OUB-01 listener stays silent)", () => {
    const listener = makeLeaveListener('listener-1');
    const kudzuAura = {
      iid: 'kudzu-1', id: 'test_kudzu_aura', name: 'Synthetic Kudzu Aura', type: 'Enchantment',
      controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      enchantedCreatureIid: 'bear-1',
    };
    const bear = makeCreature('bear-1', { controller: 'o' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [listener], oBf: [bear, kudzuAura], pHand: [oublietteInHand('oub-1')] });

    const s = castOubliette(state, 'oub-1', 'bear-1');

    expect(s.o.exile.some(c => c.iid === 'bear-1')).toBe(true);
    expect(s.o.exile.some(c => c.iid === 'kudzu-1')).toBe(true);
    expect(s.p.bf.find(c => c.iid === 'listener-1').counters.P1P1).toBeUndefined();
  });

  it('OUB-06: zMove with opts on a non-bf-leaving move (hand -> bf) is a harmless no-op for the flag -- identical behavior', () => {
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ pHand: [bear] });

    const withFlag = zMove(base, 'bear-1', 'p', 'p', 'bf', { suppressLeaveEvent: true });
    const withoutFlag = zMove(base, 'bear-1', 'p', 'p', 'bf');

    expect(withFlag.p.bf.find(c => c.iid === 'bear-1')).toEqual(withoutFlag.p.bf.find(c => c.iid === 'bear-1'));
    expect(withFlag.p.bf.find(c => c.iid === 'bear-1').summoningSick).toBe(true);
  });

  // -- Card behavior (OUB-07..16) ----------------------------------------------

  it('OUB-07: casting Oubliette targeting a creature phases it out; Oubliette is on the battlefield exactly once carrying all four tracking fields', () => {
    const bear = makeCreature('bear-1', { controller: 'o' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [oublietteInHand('oub-1')] });

    const s = castOubliette(state, 'oub-1', 'bear-1');

    expect(s.o.bf.some(c => c.iid === 'bear-1')).toBe(false);
    expect(s.o.exile.some(c => c.iid === 'bear-1')).toBe(true);
    const oubs = s.p.bf.filter(c => c.iid === 'oub-1');
    expect(oubs).toHaveLength(1); // alreadyOnBf guard prevented a double-add
    expect(oubs[0].exiledCreatureIid).toBe('bear-1');
    expect(oubs[0].exiledCreatureOwner).toBe('o');
    expect(oubs[0].exiledCreatureCounters).toEqual({});
    expect(oubs[0].exiledAuraRecords).toEqual([]);
  });

  it('OUB-08: counters on the phased creature are preserved through the full phase-out/phase-in round trip', () => {
    const bear = makeCreature('bear-1', { controller: 'o', counters: { P1P1: 2 } });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [oublietteInHand('oub-1')] });

    let s = castOubliette(state, 'oub-1', 'bear-1');
    expect(s.p.bf.find(c => c.iid === 'oub-1').exiledCreatureCounters).toEqual({ P1P1: 2 });

    s = zMove(s, 'oub-1', 'p', 'p', 'gy');
    const returned = s.o.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.counters).toEqual({ P1P1: 2 });
  });

  it('OUB-09: an embedded Aura phases out with the creature (not to the graveyard) and returns attached', () => {
    const aura = { iid: 'aura-1', name: 'Test Aura', controller: 'o', mod: { power: 1 }, cardData: {} };
    const bear = makeCreature('bear-1', { controller: 'o', enchantments: [aura] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [oublietteInHand('oub-1')] });

    let s = castOubliette(state, 'oub-1', 'bear-1');
    expect(s.o.gy).toEqual([]); // the aura did not fall off into the graveyard
    expect(s.p.bf.find(c => c.iid === 'oub-1').exiledAuraRecords).toHaveLength(1);

    s = zMove(s, 'oub-1', 'p', 'p', 'gy');
    const returned = s.o.bf.find(c => c.iid === 'bear-1');
    expect(returned.enchantments).toHaveLength(1);
    expect(returned.enchantments[0].iid).toBe('aura-1');
  });

  it("OUB-10: Oubliette destroyed -- the creature phases in TAPPED under its owner's control", () => {
    const bear = makeCreature('bear-1', { controller: 'o' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [oublietteInHand('oub-1')] });

    let s = castOubliette(state, 'oub-1', 'bear-1');
    s = zMove(s, 'oub-1', 'p', 'p', 'gy');

    const returned = s.o.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.controller).toBe('o');
    expect(returned.tapped).toBe(true);
    expect(s.o.exile.some(c => c.iid === 'bear-1')).toBe(false);
  });

  it('OUB-11: the phased-in creature is NOT summoning sick -- it can be declared an attacker without a sickness rejection', () => {
    const bear = makeCreature('bear-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [bear], pHand: [oublietteInHand('oub-1')] });

    let s = castOubliette(state, 'oub-1', 'bear-1');
    s = zMove(s, 'oub-1', 'p', 'p', 'gy');

    const returned = s.p.bf.find(c => c.iid === 'bear-1');
    expect(returned.summoningSick).toBe(false);

    // It phased in tapped; its controller's next untap step untaps it. Simulate
    // that and declare it an attacker -- DECLARE_ATTACKER silently rejects
    // summoning-sick creatures, so inclusion in s.attackers proves no sickness.
    s = { ...s, phase: PHASE.COMBAT_ATTACKERS, active: 'p', p: { ...s.p, bf: s.p.bf.map(c => c.iid === 'bear-1' ? { ...c, tapped: false } : c) } };
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'bear-1' });
    expect(s.attackers).toContain('bear-1');
  });

  it('OUB-12: NO leave-the-battlefield triggers fire on phase-out -- the synthetic unconditional listener and a real gy-gated listener (Tablet of Epityr) both stay silent', () => {
    const listener = makeLeaveListener('listener-1', 'o');
    const tablet = {
      iid: 'tablet-1', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      controller: 'o', ...getCardById('tablet_of_epityr'),
    };
    // An artifact creature controlled by the Tablet's controller -- the case
    // closest to Tablet's own trigger text ("an artifact you control...").
    const artCreature = makeCreature('bear-1', { controller: 'o', type: 'Artifact Creature' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [listener, tablet, artCreature], pHand: [oublietteInHand('oub-1')] });

    const s = castOubliette(state, 'oub-1', 'bear-1');

    expect(s.o.exile.some(c => c.iid === 'bear-1')).toBe(true);
    expect(s.o.bf.find(c => c.iid === 'listener-1').counters.P1P1).toBeUndefined();
    expect(s.pendingChoice).toBeFalsy(); // Tablet's requiresChoice trigger never queued
    expect(s.triggerQueue).toEqual([]);
  });

  it("OUB-13: NO enter-the-battlefield effects fire on phase-in -- no queued triggers, no pending choices, and the creature's own cast-resolution effect does not re-run", () => {
    // gainLife3 is a cast-resolution effect: if the phase-in re-ran it, the
    // owner's life total would move. It must not.
    const bear = makeCreature('bear-1', { controller: 'o', effect: 'gainLife3' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [oublietteInHand('oub-1')] });

    let s = castOubliette(state, 'oub-1', 'bear-1');
    const pLifeBefore = s.p.life;
    const oLifeBefore = s.o.life;

    s = zMove(s, 'oub-1', 'p', 'p', 'gy');

    expect(s.o.bf.some(c => c.iid === 'bear-1')).toBe(true);
    expect(s.p.life).toBe(pLifeBefore);
    expect(s.o.life).toBe(oLifeBefore);
    expect(s.triggerQueue).toEqual([]);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.pendingTriggerTarget).toBeFalsy();
    expect(s.pendingSphereTrigger).toBeFalsy();
  });

  it('OUB-14: the phased creature was removed from exile by another effect before Oubliette left -- graceful fizzle, no error', () => {
    const oub = oublietteOnBf('oub-1', {
      exiledCreatureIid: 'bear-1', exiledCreatureOwner: 'o', exiledCreatureCounters: { P1P1: 1 }, exiledAuraRecords: [],
    });
    const state = makeState({ pBf: [oub] }); // bear-1 is NOT in o.exile

    expect(() => zMove(state, 'oub-1', 'p', 'p', 'gy')).not.toThrow();
    const s = zMove(state, 'oub-1', 'p', 'p', 'gy');
    expect(s.o.bf.some(c => c.iid === 'bear-1')).toBe(false);
    expect(s.log.some(e => e.text.includes('no longer in exile'))).toBe(true);
  });

  it('OUB-15: Oubliette leaving the battlefield with nothing tracked (its cast fizzled originally) is a clean no-op', () => {
    const oub = oublietteOnBf('oub-1');
    const state = makeState({ pBf: [oub] });

    expect(() => zMove(state, 'oub-1', 'p', 'p', 'gy')).not.toThrow();
    const s = zMove(state, 'oub-1', 'p', 'p', 'gy');
    expect(s.p.gy.some(c => c.iid === 'oub-1')).toBe(true);
  });

  it('OUB-16: two Oubliettes phase out two different creatures -- each tracks and returns its own independently', () => {
    const bear1 = makeCreature('bear-1', { controller: 'o' });
    const bear2 = makeCreature('bear-2', { controller: 'o' });
    const state = makeState({
      phase: PHASE.MAIN_1, active: 'p', oBf: [bear1, bear2],
      pHand: [oublietteInHand('oub-a'), oublietteInHand('oub-b')],
    });

    let s = castOubliette(state, 'oub-a', 'bear-1');
    s = castOubliette(s, 'oub-b', 'bear-2');

    expect(s.p.bf.find(c => c.iid === 'oub-a').exiledCreatureIid).toBe('bear-1');
    expect(s.p.bf.find(c => c.iid === 'oub-b').exiledCreatureIid).toBe('bear-2');

    s = zMove(s, 'oub-a', 'p', 'p', 'gy');
    expect(s.o.bf.some(c => c.iid === 'bear-1')).toBe(true);
    expect(s.o.exile.some(c => c.iid === 'bear-2')).toBe(true); // still phased out
    expect(s.p.bf.find(c => c.iid === 'oub-b').exiledCreatureIid).toBe('bear-2');

    s = zMove(s, 'oub-b', 'p', 'p', 'gy');
    expect(s.o.bf.some(c => c.iid === 'bear-2')).toBe(true);
  });

  // -- Targeting/UI (OUB-17..20) -----------------------------------------------

  it('OUB-17: casting Oubliette opens castFlow with a required target (EXPLICIT_TARGET_EFFECTS registration)', () => {
    const oub = getCardById('oubliette');
    expect(EXPLICIT_TARGET_EFFECTS.has('oubliettePhaseOut')).toBe(true);
    expect(needsExplicitTarget(oub)).toBe(true);
    expect(needsAnyTarget(oub)).toBe(true);
  });

  it('OUB-18: clicking a non-creature permanent during targeting is a no-op (CREATURE_ONLY_TARGET_EFFECTS guard), driven through the controller-hook guard both screens consume', () => {
    const oub = getCardById('oubliette');
    expect(CREATURE_ONLY_TARGET_EFFECTS.has('oubliettePhaseOut')).toBe(true);
    expect(isCreatureOnlyTarget(oub, null)).toBe(true);
    // Mirror of the screens' click-routing guard:
    // if (isCreatureOnlyTarget(castingCard, abilityId) && !isCre(card)) return;
    const land = makeLand('land-1');
    const bear = makeCreature('bear-1');
    const rejectsLand = isCreatureOnlyTarget(oub, null) && !isCre(land);
    const acceptsBear = !(isCreatureOnlyTarget(oub, null) && !isCre(bear));
    expect(rejectsLand).toBe(true);
    expect(acceptsBear).toBe(true);
  });

  it('OUB-19: resolve-time defense-in-depth -- an invalid/missing target fizzles at the isCre check; Oubliette still enters via the normal ETB push with no tracking fields', () => {
    const bear = makeCreature('bear-1', { controller: 'o' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [oublietteInHand('oub-1')] });
    state = withMana(state, 'p', { B: 2, C: 1 });

    let s = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'oub-1' }); // no tgt
    s = duelReducer(s, { type: 'RESOLVE_STACK' });

    const oubs = s.p.bf.filter(c => c.iid === 'oub-1');
    expect(oubs).toHaveLength(1); // entered via the normal ETB push
    expect(oubs[0].exiledCreatureIid).toBeUndefined();
    expect(s.o.bf.some(c => c.iid === 'bear-1')).toBe(true); // nothing phased out
    expect(s.log.some(e => e.text.includes('fizzles'))).toBe(true);
  });

  it('OUB-20: with zero creatures on either battlefield the cast cannot complete -- no selectable target (engine-wide target-at-cast convention, documented)', () => {
    // In paper Magic, Oubliette could be cast with no creatures anywhere and
    // its enters trigger would simply have no target. This engine chooses
    // targets at CAST time for every when-enters-targeted permanent (a
    // pre-existing documented simplification, not new to this card): the
    // targeting step opens and, with no legal creature to click, the cast
    // cannot be committed.
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [oublietteInHand('oub-1')] });
    expect(needsExplicitTarget(getCardById('oubliette'))).toBe(true);
    const legalTargets = [...state.p.bf, ...state.o.bf].filter(isCre);
    expect(legalTargets).toHaveLength(0);
  });

  // -- Regression/meta (OUB-21..24) ---------------------------------------------

  it("OUB-21: Tawnos's Coffin full round trip is byte-identical to shipped behavior -- LEAVES_BF fires on its exile leg, the returned creature is tapped AND summoning sick, verbatim log wording", () => {
    const listener = makeLeaveListener('listener-1');
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'o', counters: { P1P1: 2 } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [listener, coffin], oBf: [bear] });
    state = withMana(state, 'p', { C: 3 });

    let s = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });
    // The Coffin's exile leg is a real leave-the-battlefield event -- it fires.
    expect(s.p.bf.find(c => c.iid === 'listener-1').counters.P1P1).toBe(1);
    expect(s.o.exile.some(c => c.iid === 'bear-1')).toBe(true);

    s = zMove(s, 'coffin-1', 'p', 'p', 'gy');

    const returned = s.o.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.summoningSick).toBe(true); // an ordinary fresh battlefield entry
    expect(returned.counters).toEqual({ P1P1: 2 });
    expect(s.log.some(e => e.text === 'Grizzly Bears returns to the battlefield tapped.')).toBe(true);
  });

  it("OUB-22: Tawnos's Coffin untap-path return -- unchanged (tapped, summoning sick, counters restored)", () => {
    const coffin = makeCoffin('coffin-1');
    const bear = makeCreature('bear-1', { controller: 'p', counters: { P1P1: 1 } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [coffin, bear] });
    state = withMana(state, 'p', { C: 3 });

    let s = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'coffin-1', tgt: 'bear-1' });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });
    expect(s.p.bf.some(c => c.iid === 'bear-1')).toBe(false);

    s = { ...s, phase: PHASE.UNTAP, pendingUpkeepChoice: { cardName: "Tawnos's Coffin", handlerKey: 'optionalUntap', iid: 'coffin-1' } };
    s = duelReducer(s, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });

    const returned = s.p.bf.find(c => c.iid === 'bear-1');
    expect(returned).toBeDefined();
    expect(returned.tapped).toBe(true);
    expect(returned.summoningSick).toBe(true);
    expect(returned.counters).toEqual({ P1P1: 1 });
  });

  it("OUB-23: an ordinary (non-phasing) leave elsewhere still emits ON_PERMANENT_LEAVES_BF (Titania's Song's own persist trigger fires)", () => {
    const songDef = getCardById('titaniass_song');
    const song = { iid: 'song-1', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', enterTs: 1, ...songDef };
    let state = makeState({ pBf: [song] });

    state = zMove(state, 'song-1', 'p', 'p', 'gy');

    expect(state.p.emblems.length).toBe(1);
    expect(state.p.emblems[0].source).toBe('titanias_song');
  });

  it('OUB-24: the uppercase effect:"STUB" sentinel count in cards.js is exactly 2 (Blaze of Glory, Ring of Ma\'ruf remaining)', () => {
    const cardsPath = fileURLToPath(new URL('../../src/data/cards.js', import.meta.url));
    const src = readFileSync(cardsPath, 'utf8');
    const stubCount = (src.match(/effect:"STUB"/g) || []).length;
    expect(stubCount).toBe(2);
  });

});
