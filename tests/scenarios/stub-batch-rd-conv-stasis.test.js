// tests/scenarios/stub-batch-rd-conv-stasis.test.js
// Stub Batch: Reverse Damage, Conversion, Stasis. Three small, data-driven
// reuses of existing infrastructure (chooseDamageShieldSource/gainLifeOnPrevent,
// globalTypeEffect's Mountain filter, sacrificeUnless_WW, and the untap-step
// stasisOut gate). No shared code between the three -- batched only because
// each is small. See docs/MECHANICS_INDEX.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt, recomputeTypeEffects } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

function withMana(state, who, mana) {
  return { ...state, [who]: { ...state[who], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } } };
}

// ─── Reverse Damage ───────────────────────────────────────────────────────────

function makeReverseDamage(iid, overrides = {}) {
  return makeSpell(iid, {
    id: 'reverse_damage', name: 'Reverse Damage', type: 'Instant', color: 'W', cost: '1WW', cmc: 3,
    effect: 'chooseDamageShieldSource', damageShieldMode: 'prevent', gainLifeOnPrevent: true,
    ...overrides,
  });
}

describe('@engine Scenario: Reverse Damage', () => {
  it('RD-01: casting with a legal source on board and choosing it (human path) records gainLifeOnPrevent:true', () => {
    const rd = makeReverseDamage('rd-1');
    const redCreature = makeCreature('rc-1', { id: 'shivan_dragon', name: 'Shivan Dragon', color: 'R', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [rd], oBf: [redCreature] });
    const state = { ...base, p: { ...base.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'rd-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingDamageShieldChoice).not.toBeNull();
    expect(s2.pendingDamageShieldChoice.gainLifeOnPrevent).toBe(true);

    const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'rc-1' });
    expect(s3.turnState.damageShields.p).toEqual([
      { chosenSourceIid: 'rc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'rd-1', shieldSourceName: 'Reverse Damage', gainLifeOnPrevent: true },
    ]);
  });

  it('RD-02: the chosen source dealing damage is prevented AND life is gained equal to the prevented amount, via one hurt() call chain', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 15 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'rc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'rd-1', shieldSourceName: 'Reverse Damage', gainLifeOnPrevent: true }], o: [] } },
    };
    const s1 = hurt(state, 'p', 5, 'Shivan Dragon', { sourceIid: 'rc-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(20); // fully prevented, then +5 life gained
    expect(s1.turnState.damageShields.p).toEqual([]); // one-time -- consumed
  });

  it('RD-03: an AI-controlled cast (caster \'o\') auto-chooses the first legal source with the same prevent+gain-life shield', () => {
    const rd = makeReverseDamage('rd-1', { controller: 'o' });
    const whiteCreature = makeCreature('wc-1', { id: 'serra_angel', name: 'Serra Angel', color: 'W', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', oHand: [rd], pBf: [whiteCreature] });
    const state = { ...base, o: { ...base.o, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'o', iid: 'rd-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingDamageShieldChoice).toBeNull();
    expect(s2.turnState.damageShields.o).toEqual([
      { chosenSourceIid: 'wc-1', chosenSourceController: 'p', mode: 'prevent', shieldSourceIid: 'rd-1', shieldSourceName: 'Reverse Damage', gainLifeOnPrevent: true },
    ]);
  });

  it('RD-04: no legal source on board or stack -- fizzles, no shield created, no life gained', () => {
    const rd = makeReverseDamage('rd-1');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [rd] });
    const state = { ...base, p: { ...base.p, life: 10, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'rd-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingDamageShieldChoice).toBeNull();
    expect(s2.turnState.damageShields?.p ?? []).toEqual([]);
    expect(s2.p.life).toBe(10);
  });

  it('RD-05 (regression): Eye for an Eye\'s redirect-mode shield is unaffected -- no life gain fires without gainLifeOnPrevent', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 20 },
      o: { ...base.o, life: 20 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bolt-1', chosenSourceController: 'o', mode: 'redirect', shieldSourceIid: 'efe-1', shieldSourceName: 'Eye for an Eye' }], o: [] } },
    };
    const s1 = hurt(state, 'p', 3, 'Lightning Bolt', { sourceIid: 'bolt-1', sourceType: 'spell' });
    expect(s1.p.life).toBe(17); // original damage still lands (redirect, not prevent)
    expect(s1.o.life).toBe(17); // Eye for an Eye's redirected damage -- accounted for, no extra gain anywhere
  });

  it('RD-06 (regression): a Circle of Protection prevent-mode shield without gainLifeOnPrevent still just prevents, no life gained', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 15 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black' }], o: [] } },
    };
    const s1 = hurt(state, 'p', 4, 'Sengir Vampire', { sourceIid: 'bc-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(15); // prevented, no gain (stays exactly where it was)
    expect(s1.turnState.damageShields.p).toEqual([]);
  });
});

// ─── Conversion ───────────────────────────────────────────────────────────────

const CONVERSION = { id: 'conversion', name: 'Conversion', type: 'Enchantment', color: 'W', cmc: 4, cost: '2WW', keywords: [],
  effect: 'globalTypeEffect', globalTypeEffect: { filter: 'Mountain', setSubtypes: ['Plains'] }, upkeep: 'sacrificeUnless_WW' };

describe('@engine Scenario: Conversion', () => {
  it('CONV-01: casting with a Mountain on the battlefield sets its subtypeEff/landTypeOverride to Plains', () => {
    const mountain = makeLand('mtn-1', { id: 'mountain', name: 'Mountain', subtype: 'Basic Mountain', color: '', produces: ['R'] });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [mountain], pHand: [{ ...CONVERSION, iid: 'conv-hand' }] });
    state = withMana(state, 'p', { W: 2, C: 2 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'conv-hand' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const bakedMountain = s2.p.bf.find(c => c.iid === 'mtn-1');
    expect(bakedMountain.subtypeEff).toBe('Plains');
    expect(bakedMountain.landTypeOverride).toBe('Plains');
  });

  it('CONV-02: the affected Mountain now taps for {W} only, via the same landTypeOverride/LAND_TYPE_MANA mechanism as Blood Moon', () => {
    const mountain = makeLand('mtn-1', { id: 'mountain', name: 'Mountain', subtype: 'Basic Mountain', color: '', produces: ['R'] });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [mountain], pHand: [{ ...CONVERSION, iid: 'conv-hand' }] });
    state = withMana(state, 'p', { W: 2, C: 2 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'conv-hand' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'TAP_LAND', who: 'p', iid: 'mtn-1' });

    expect(s3.p.mana.W).toBe(1);
    expect(s3.p.mana.R).toBe(0);
  });

  it('CONV-03: Conversion sacrificed at upkeep (can\'t pay {W}{W}) -- the Mountain reverts on the next recompute', () => {
    const mountain = makeLand('mtn-1', { id: 'mountain', name: 'Mountain', subtype: 'Basic Mountain', color: '', produces: ['R'] });
    const conv = { ...CONVERSION, iid: 'conv-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], enterTs: 1 };
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [mountain, conv] });
    state = recomputeTypeEffects(state); // bake the effect in, as if it had already been resolved
    expect(state.p.bf.find(c => c.iid === 'mtn-1').landTypeOverride).toBe('Plains');
    state = withMana(state, 'p', { W: 1 }); // insufficient

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.p.bf.find(c => c.iid === 'conv-1')).toBeUndefined(); // sacrificed
    expect(s1.p.bf.find(c => c.iid === 'mtn-1').landTypeOverride).toBeUndefined(); // reverted
  });

  it('CONV-04: mana is checked at exactly the {W}{W} threshold -- burnMana\'s per-phase-boundary reset (existing engine behavior, shared with Force of Nature) means even a pre-loaded, cost-matching pool is cleared before the upkeep check runs, so Conversion is still sacrificed', () => {
    // See FN-02 (src/engine/__tests__/phase6.test.js) for the equivalent existing
    // regression guard on Force of Nature's direct-check upkeep branch -- this is
    // not new behavior introduced by Conversion, it's ADVANCE_PHASE's unconditional
    // burnMana call (every phase boundary) running before ANY sacrificeUnless_*
    // case gets to inspect the mana pool.
    const conv = { ...CONVERSION, iid: 'conv-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], enterTs: 1 };
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [conv] });
    state = withMana(state, 'p', { W: 2 }); // exactly the cost -- still cleared first

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.mana.W).toBe(0);
    expect(s1.p.bf.find(c => c.iid === 'conv-1')).toBeUndefined();
  });

  it('CONV-05 (regression): Blood Moon\'s own nonBasicLand filter/effect is unaffected by the new Mountain filter branch -- both active simultaneously don\'t interfere', () => {
    const dual = makeLand('dual-1', { id: 'taiga', name: 'Taiga', subtype: undefined, color: '', produces: ['R', 'G'] });
    const mountain = makeLand('mtn-1', { id: 'mountain', name: 'Mountain', subtype: 'Basic Mountain', color: '', produces: ['R'] });
    const moon = { id: 'blood_moon', name: 'Blood Moon', type: 'Enchantment', color: 'R', cmc: 3, cost: '2R', keywords: [],
      effect: 'globalTypeEffect', globalTypeEffect: { filter: 'nonBasicLand', setSubtypes: ['Mountain'] },
      iid: 'bm-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], enterTs: 1 };
    const conv = { ...CONVERSION, iid: 'conv-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], enterTs: 2 };
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dual, mountain, moon, conv] });
    state = recomputeTypeEffects(state);

    // Blood Moon still turns the nonbasic dual into a Mountain (base subtype has no
    // "Mountain" substring, so Conversion's filter never matches it -- no interference).
    expect(state.p.bf.find(c => c.iid === 'dual-1').landTypeOverride).toBe('Mountain');
    // Conversion still turns the real Mountain into a Plains (Blood Moon's nonBasicLand
    // filter doesn't match it since it IS basic -- no interference the other way either).
    expect(state.p.bf.find(c => c.iid === 'mtn-1').landTypeOverride).toBe('Plains');
  });

  it('CONV-06: a land with no Mountain subtype (Island) is unaffected by Conversion', () => {
    const island = makeLand('isl-1', { id: 'island', name: 'Island', subtype: 'Basic Island', color: '', produces: ['U'] });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [island], pHand: [{ ...CONVERSION, iid: 'conv-hand' }] });
    state = withMana(state, 'p', { W: 2, C: 2 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'conv-hand' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const bakedIsland = s2.p.bf.find(c => c.iid === 'isl-1');
    expect(bakedIsland.landTypeOverride).toBeUndefined();
    expect(bakedIsland.subtypeEff).toBeUndefined();
  });
});

// ─── Stasis ───────────────────────────────────────────────────────────────────

function makeStasis(iid, overrides = {}) {
  return {
    id: 'stasis', name: 'Stasis', type: 'Enchantment', color: 'U', cmc: 2, cost: '1U', keywords: [],
    globalUntapSkip: true, upkeep: 'sacrificeUnless_U',
    iid, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', enterTs: 1,
    ...overrides,
  };
}

describe('@engine Scenario: Stasis', () => {
  it('STAS-01: with Stasis on the battlefield, the active player\'s untap step leaves their battlefield completely untouched', () => {
    const stasis = makeStasis('stasis-1');
    const tappedLand = makeLand('land-1', { tapped: true, controller: 'p' });
    const tappedCreature = makeCreature('cre-1', { tapped: true, summoningSick: true, damage: 2, controller: 'p' });
    const state = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [stasis, tappedLand, tappedCreature] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // CLEANUP -> UNTAP; active becomes 'p'
    expect(s1.phase).toBe(PHASE.UNTAP);
    expect(s1.active).toBe('p');
    const land = s1.p.bf.find(c => c.iid === 'land-1');
    const cre = s1.p.bf.find(c => c.iid === 'cre-1');
    expect(land.tapped).toBe(true); // stays tapped
    expect(cre.tapped).toBe(true); // stays tapped
    expect(cre.summoningSick).toBe(true); // not cleared
    expect(cre.damage).toBe(2); // not cleared
  });

  it('STAS-02: Stasis skips the untap step for BOTH players as turns alternate, not just the original caster', () => {
    const stasis = makeStasis('stasis-1', { controller: 'p' });
    const oTappedLand = makeLand('oland-1', { tapped: true, controller: 'o' });
    const state = makeState({ phase: PHASE.CLEANUP, active: 'p', pBf: [stasis], oBf: [oTappedLand] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // CLEANUP -> UNTAP; active becomes 'o'
    expect(s1.active).toBe('o');
    expect(s1.o.bf.find(c => c.iid === 'oland-1').tapped).toBe(true); // opponent's untap also skipped
  });

  it('STAS-03: Stasis sacrificed at upkeep (can\'t pay {U}) -- the very next untap step proceeds normally', () => {
    const stasis = makeStasis('stasis-1');
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [stasis] });
    state = withMana(state, 'p', { U: 5 }); // burnMana clears this before the check -- sacrificed regardless

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP: sacrifice fires
    expect(s1.p.bf.find(c => c.iid === 'stasis-1')).toBeUndefined();

    // Roll forward through the rest of this turn cycle to CLEANUP.
    let s = s1;
    for (let i = 0; i < 12 && s.phase !== PHASE.CLEANUP; i++) {
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    }
    expect(s.phase).toBe(PHASE.CLEANUP);

    // Give the about-to-become-active player a tapped land, then advance into
    // their untap step -- it should untap normally now that Stasis is gone.
    const nextActive = s.active === 'p' ? 'o' : 'p';
    const tappedLand = makeLand('land-2', { tapped: true, controller: nextActive });
    s = { ...s, [nextActive]: { ...s[nextActive], bf: [...s[nextActive].bf, tappedLand] } };

    const s2 = duelReducer(s, { type: 'ADVANCE_PHASE' }); // CLEANUP -> UNTAP
    expect(s2.phase).toBe(PHASE.UNTAP);
    expect(s2[nextActive].bf.find(c => c.iid === 'land-2').tapped).toBe(false);
  });

  it('CONV-04-equivalent / STAS-04: mana is checked at exactly the {U} threshold -- burnMana\'s per-phase-boundary reset means even a pre-loaded, cost-matching pool is cleared before the check, so Stasis is still sacrificed (same existing engine behavior as Force of Nature\'s FN-02)', () => {
    const stasis = makeStasis('stasis-1');
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [stasis] });
    state = withMana(state, 'p', { U: 1 }); // exactly the cost -- still cleared first

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.mana.U).toBe(0);
    expect(s1.p.bf.find(c => c.iid === 'stasis-1')).toBeUndefined();
    // The untap-skip gate itself is unaffected by the sacrifice happening one phase
    // later -- next untap step (tested in STAS-03) still proceeds normally only
    // because Stasis is gone by then, not because of anything in this upkeep step.
  });

  it('STAS-05 (regression): Winter Orb/Damping Field/Magnetic Mountain gates still function correctly when Stasis is NOT on the battlefield', () => {
    const winterOrb = { id: 'winter_orb', name: 'Winter Orb', type: 'Artifact', color: '', cmc: 2, cost: '2', keywords: [],
      tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', iid: 'wo-1', enterTs: 1 };
    const land1 = makeLand('l1', { tapped: true, controller: 'p' });
    const land2 = makeLand('l2', { tapped: true, controller: 'p' });
    const state = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [winterOrb, land1, land2] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const untappedCount = [s1.p.bf.find(c => c.iid === 'l1').tapped, s1.p.bf.find(c => c.iid === 'l2').tapped]
      .filter(t => t === false).length;
    expect(untappedCount).toBe(1); // Winter Orb still limits untapping to exactly one land
  });

  it('STAS-06: no stray queueUpkeepChoice calls fire for optionalUntap creatures when Stasis skips the step', () => {
    const stasis = makeStasis('stasis-1');
    const gremlin = makeCreature('grem-1', {
      id: 'phyrexian_gremlins', name: 'Phyrexian Gremlins',
      optionalUntap: true, optionalUntapAlways: true, tapped: true, controller: 'p',
    });
    const state = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [stasis, gremlin] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.pendingUpkeepChoiceQueue).toEqual([]);
    expect(s1.pendingUpkeepChoice).toBeNull();
    expect(s1.p.bf.find(c => c.iid === 'grem-1').tapped).toBe(true); // nothing to decide -- nothing untapped
  });
});
