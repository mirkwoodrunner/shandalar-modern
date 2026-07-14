// tests/scenarios/animate-artifact.test.js
// Animate Artifact: "Enchant artifact. As long as enchanted artifact isn't a
// creature, it's an artifact creature with power and toughness each equal to
// its mana value." Reuses Titania's Song's manaValueCDA evaluator and mirrors
// enchantLand's card.mod embedded-attach branch shape. See
// docs/ENGINE_CONTRACT_SPEC.md and docs/MECHANICS_INDEX.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  duelReducer, zMove, recomputeTypeEffects, checkDeath, isCre, isArt,
  getPow, getTou,
} from '../../src/engine/DuelCore.js';
import { computeCharacteristics, CDA_EVALUATORS } from '../../src/engine/layers.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import { getCardById } from '../../src/data/cards.js';
import {
  EXPLICIT_TARGET_EFFECTS, isArtifactOnlyTarget, isCreatureOnlyTarget, isLandOnlyTarget,
  needsAnyTarget, getEffectiveAbilityEffect,
} from '../../src/hooks/useDuelController';

function makeArtifact(iid, overrides = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 3, cost: '3', power: null, toughness: null, keywords: [], tapped: false,
    summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller: 'o',
    ...overrides,
  };
}

function makeArtifactCreature(iid, overrides = {}) {
  return {
    iid, id: 'test_art_creature', name: 'Test Artifact Creature', type: 'Artifact Creature',
    subtype: 'Golem', color: '', cmc: 5, cost: '5', power: 5, toughness: 3, keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
    ...overrides,
  };
}

function makeGuardianBeast(iid, controller) {
  return {
    iid, id: 'guardian_beast', name: 'Guardian Beast', type: 'Creature', subtype: 'Beast',
    color: '', cmc: 4, cost: '2GU', power: 2, toughness: 4, keywords: [], tapped: false,
    summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller,
  };
}

function makeAnimateArtifactInHand(iid, overrides = {}) {
  const def = getCardById('animate_artifact');
  return { iid, ...def, ...overrides };
}

function castAndResolve(state, who, iid, tgt) {
  let s = duelReducer(state, { type: 'CAST_SPELL', who, iid, tgt });
  s = duelReducer(s, { type: 'RESOLVE_STACK' });
  return s;
}

const FULL_MANA = { W: 0, U: 1, B: 0, R: 0, G: 0, C: 3 };

describe('@engine-card-scenarios-3 Scenario: Animate Artifact', () => {

  it("AA-01: attaches via the embedded path -- lands in the target's enchantments[] array, not tracked via enchantedArtifactIid", () => {
    const art = makeArtifact('art-1');
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [art] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    const s = castAndResolve(state, 'p', 'aa-1', 'art-1');
    const artAfter = s.o.bf.find(c => c.iid === 'art-1');
    expect(artAfter.enchantments.some(e => e.name === 'Animate Artifact')).toBe(true);

    // The Kudzu-style link field must never appear anywhere for this attach.
    const allPerms = [...s.p.bf, ...s.o.bf];
    expect(allPerms.some(c => c.enchantedArtifactIid === 'art-1')).toBe(false);
  });

  it('AA-02: Living Artifact (no mod) still attaches via the Kudzu-style path, unchanged', () => {
    const art = makeArtifact('art-1');
    const la = { iid: 'la-1', ...getCardById('living_artifact') };
    let state = makeState({ pHand: [la], oBf: [art] });
    // Living Artifact costs G.
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } } };

    const s = castAndResolve(state, 'p', 'la-1', 'art-1');
    const hostPerm = s.p.bf.find(c => c.enchantedArtifactIid === 'art-1');
    expect(hostPerm).toBeTruthy();
    expect(hostPerm.name).toBe('Living Artifact');
    expect(s.log.some(e => (e.text ?? '').includes('Living Artifact enchants Test Artifact.'))).toBe(true);
    const artAfter = s.o.bf.find(c => c.iid === 'art-1');
    expect(artAfter.enchantments).toEqual([]);
  });

  it('AA-03: Artifact Possession and Relic Bind still attach via the Kudzu-style path (regression)', () => {
    const art1 = makeArtifact('art-1');
    const ap = { iid: 'ap-1', ...getCardById('artifact_possession') };
    let s1 = makeState({ pHand: [ap], oBf: [art1] });
    s1 = { ...s1, p: { ...s1.p, mana: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 2 } } };
    s1 = castAndResolve(s1, 'p', 'ap-1', 'art-1');
    const apHost = s1.p.bf.find(c => c.enchantedArtifactIid === 'art-1');
    expect(apHost?.name).toBe('Artifact Possession');
    expect(s1.o.bf.find(c => c.iid === 'art-1').enchantments).toEqual([]);

    const art2 = makeArtifact('art-2', { controller: 'o' });
    const rb = { iid: 'rb-1', ...getCardById('relic_bind') };
    let s2 = makeState({ pHand: [rb], oBf: [art2] });
    s2 = { ...s2, p: { ...s2.p, mana: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 2 } } };
    s2 = castAndResolve(s2, 'p', 'rb-1', 'art-2');
    const rbHost = s2.p.bf.find(c => c.enchantedArtifactIid === 'art-2');
    expect(rbHost?.name).toBe('Relic Bind');
    expect(s2.o.bf.find(c => c.iid === 'art-2').enchantments).toEqual([]);
  });

  it('AA-04: Guardian Beast prevents a new Animate Artifact attachment to a noncreature artifact its controller controls', () => {
    const art = makeArtifact('art-1', { controller: 'o' });
    const beast = makeGuardianBeast('gb-1', 'o');
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [art, beast] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    const s = castAndResolve(state, 'p', 'aa-1', 'art-1');
    const artAfter = s.o.bf.find(c => c.iid === 'art-1');
    expect(artAfter.enchantments).toEqual([]);
    expect(s.log.some(e => (e.text ?? '').includes('Guardian Beast prevents Animate Artifact from enchanting Test Artifact.'))).toBe(true);
  });

  it('AA-05: Guardian Beast does NOT prevent attachment to an artifact CREATURE', () => {
    const artCre = makeArtifactCreature('ac-1', { controller: 'o' });
    const beast = makeGuardianBeast('gb-1', 'o');
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [artCre, beast] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    const s = castAndResolve(state, 'p', 'aa-1', 'ac-1');
    const artAfter = s.o.bf.find(c => c.iid === 'ac-1');
    expect(artAfter.enchantments.some(e => e.name === 'Animate Artifact')).toBe(true);
    expect(s.log.some(e => (e.text ?? '').includes('Guardian Beast prevents'))).toBe(false);
  });

  it('AA-06: targeting a non-artifact permanent fizzles -- no attachment, no error', () => {
    const bear = makeCreature('bear-1', { controller: 'o' });
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [bear] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    expect(() => castAndResolve(state, 'p', 'aa-1', 'bear-1')).not.toThrow();
    const s = castAndResolve(state, 'p', 'aa-1', 'bear-1');
    const bearAfter = s.o.bf.find(c => c.iid === 'bear-1');
    expect(bearAfter.enchantments).toEqual([]);
    expect(s.log.some(e => (e.text ?? '').includes('Animate Artifact enchants'))).toBe(false);
  });

  it('AA-07: a noncreature artifact enchanted by Animate Artifact becomes a creature with P/T equal to its mana value', () => {
    const art = makeArtifact('art-1', { cmc: 5 });
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [art] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    const s = castAndResolve(state, 'p', 'aa-1', 'art-1');
    const artAfter = s.o.bf.find(c => c.iid === 'art-1');
    expect(isCre(artAfter)).toBe(true);
    expect(getPow(artAfter, s)).toBe(5);
    expect(getTou(artAfter, s)).toBe(5);
  });

  it('AA-08: checkDeath applies to the now-creature artifact when its toughness drops to 0', () => {
    const art = makeArtifact('art-1', { cmc: 2 });
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [art] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    let s = castAndResolve(state, 'p', 'aa-1', 'art-1');
    expect(isCre(s.o.bf.find(c => c.iid === 'art-1'))).toBe(true);

    s = { ...s, o: { ...s.o, bf: s.o.bf.map(c => c.iid === 'art-1' ? { ...c, eotBuffs: [...c.eotBuffs, { toughness: -2 }] } : c) } };
    s = recomputeTypeEffects(s);
    s = checkDeath(s);
    expect(s.o.bf.some(c => c.iid === 'art-1')).toBe(false);
    expect(s.o.gy.some(c => c.iid === 'art-1')).toBe(true);
  });

  it('AA-09: the animated artifact is not freshly summoning-sick -- it uses the same convention as Living Lands', () => {
    const art = makeArtifact('art-1', { summoningSick: false });
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [art] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    const s = castAndResolve(state, 'p', 'aa-1', 'art-1');
    const artAfter = s.o.bf.find(c => c.iid === 'art-1');
    expect(isCre(artAfter)).toBe(true);
    expect(artAfter.summoningSick).toBe(false);
  });

  it("AA-10: enchanting an already-creature artifact leaves its real printed P/T untouched (Juggernaut-style)", () => {
    const artCre = makeArtifactCreature('ac-1', { power: 5, toughness: 3, cmc: 5 });
    const aaAura = { iid: 'aa-1', name: 'Animate Artifact', enterTs: 1,
      mod: { addTypes: ['Creature'], powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA', onlyIfNotCreature: true } };
    const enchanted = { ...artCre, enchantments: [aaAura] };
    const state = makeState({ oBf: [enchanted] });

    const ch = computeCharacteristics(enchanted, state);
    expect(ch.power).toBe(5);
    expect(ch.toughness).toBe(3);
    expect(ch.types).toContain('Creature');
  });

  it('AA-11: removing Animate Artifact reverts the artifact to non-creature on the next recompute', () => {
    const art = makeArtifact('art-1', { cmc: 3 });
    const aaAura = { iid: 'aa-1', name: 'Animate Artifact', enterTs: 1,
      mod: { addTypes: ['Creature'], powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA', onlyIfNotCreature: true } };
    let state = makeState({ oBf: [{ ...art, enchantments: [aaAura] }] });
    state = recomputeTypeEffects(state);
    expect(isCre(state.o.bf.find(c => c.iid === 'art-1'))).toBe(true);

    // Aura removed via an unrelated effect (e.g. Disenchant) -- modeled directly
    // at the state level since the removal mechanism itself is orthogonal to
    // what this test targets: layers.js re-evaluating without the aura present.
    let after = { ...state, o: { ...state.o, bf: state.o.bf.map(c => c.iid === 'art-1' ? { ...c, enchantments: [] } : c) } };
    after = recomputeTypeEffects(after);
    expect(isCre(after.o.bf.find(c => c.iid === 'art-1'))).toBe(false);
  });

  it("AA-12: P/T tracks the artifact's mana value dynamically, not a one-time snapshot", () => {
    const aaAura = { iid: 'aa-1', name: 'Animate Artifact', enterTs: 1,
      mod: { addTypes: ['Creature'], powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA', onlyIfNotCreature: true } };
    const artLow = makeArtifact('art-1', { cmc: 2, enchantments: [aaAura] });
    const stateLow = makeState({ oBf: [artLow] });
    const chLow = computeCharacteristics(artLow, stateLow);
    expect(chLow.power).toBe(2);
    expect(chLow.toughness).toBe(2);

    const artHigh = makeArtifact('art-1', { cmc: 7, enchantments: [aaAura] });
    const stateHigh = makeState({ oBf: [artHigh] });
    const chHigh = computeCharacteristics(artHigh, stateHigh);
    expect(chHigh.power).toBe(7);
    expect(chHigh.toughness).toBe(7);
  });

  it("AA-13: onlyIfNotCreature checks the raw printed type, not typeEff -- no oscillation once typeEff is baked", () => {
    const art = makeArtifact('art-1', { cmc: 4 });
    const aaAura = { iid: 'aa-1', name: 'Animate Artifact', enterTs: 1,
      mod: { addTypes: ['Creature'], powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA', onlyIfNotCreature: true } };
    let state = makeState({ oBf: [{ ...art, enchantments: [aaAura] }] });

    state = recomputeTypeEffects(state);
    const baked = state.o.bf.find(c => c.iid === 'art-1');
    expect(baked.typeEff).toBe('Artifact Creature');

    // Re-running computeCharacteristics against the now-baked card must still
    // detect it as a noncreature artifact via card.type (unaffected by its own
    // already-baked typeEff) -- otherwise the effect would fall off the moment
    // it was first applied.
    const ch = computeCharacteristics(baked, state);
    expect(ch.types).toContain('Creature');
    expect(ch.power).toBe(baked.cmc);
    expect(ch.toughness).toBe(baked.cmc);
  });

  it('AA-14: a second Aura using addTypes WITHOUT onlyIfNotCreature still applies unconditionally, independent of Animate Artifact\'s gate', () => {
    // Base permanent already a creature, so Animate Artifact's own gated
    // addTypes is suppressed -- but a second, ungated aura's addTypes must
    // still land, proving onlyIfNotCreature is opt-in per-aura, not global.
    const gatedAura = { iid: 'aa-1', name: 'Animate Artifact', enterTs: 1,
      mod: { addTypes: ['TestMarkerA'], onlyIfNotCreature: true } };
    const ungatedAura = { iid: 'other-1', name: 'Test Other Aura', enterTs: 2,
      mod: { addTypes: ['TestMarkerB'] } };
    const bear = makeCreature('bear-1', { enchantments: [gatedAura, ungatedAura] });
    const state = makeState({ oBf: [bear] });

    const ch = computeCharacteristics(bear, state);
    expect(ch.types).not.toContain('TestMarkerA');
    expect(ch.types).toContain('TestMarkerB');
  });

  it('AA-15: casting Animate Artifact opens castFlow with requiresTarget=true (EXPLICIT_TARGET_EFFECTS membership)', () => {
    expect(EXPLICIT_TARGET_EFFECTS.has('enchantArtifact')).toBe(true);
    const animateArtifactCard = getCardById('animate_artifact');
    expect(needsAnyTarget(animateArtifactCard)).toBe(true);
  });

  it('AA-16: isArtifactOnlyTarget rejects a non-artifact click for enchantArtifact, and does not fire for enchantCreature/enchantLand', () => {
    const animateArtifactCard = getCardById('animate_artifact');
    expect(isArtifactOnlyTarget(animateArtifactCard, null)).toBe(true);
    // Regression: unrelated Aura effects must not be caught by the new set.
    expect(isArtifactOnlyTarget(getCardById('flight'), null)).toBe(false);
    expect(isArtifactOnlyTarget(getCardById('wild_growth'), null)).toBe(false);
  });

  it('AA-17: a legal artifact target is accepted (isArtifactOnlyTarget composes correctly with isArt)', () => {
    const animateArtifactCard = getCardById('animate_artifact');
    const art = makeArtifact('art-1');
    const bear = makeCreature('bear-1');
    // Simulates the exact guard line used in DuelScreen.tsx/DuelScreenMobile.tsx:
    // `if (isArtifactOnlyTarget(castingCard, abilityId) && !isArt(card)) return;`
    const rejectsArt = isArtifactOnlyTarget(animateArtifactCard, null) && !isArt(art);
    const rejectsBear = isArtifactOnlyTarget(animateArtifactCard, null) && !isArt(bear);
    expect(rejectsArt).toBe(false);
    expect(rejectsBear).toBe(true);
  });

  it('AA-18: Living Artifact/Artifact Possession/Relic Bind now open a targeting step and only accept artifact targets (side-benefit fix)', () => {
    for (const id of ['living_artifact', 'artifact_possession', 'relic_bind']) {
      const card = getCardById(id);
      expect(needsAnyTarget(card)).toBe(true);
      expect(isArtifactOnlyTarget(card, null)).toBe(true);
    }
  });

  it('AA-19: isArtifactOnlyTarget does not affect enchantCreature/enchantLand click-routing (regression)', () => {
    expect(isArtifactOnlyTarget(getCardById('flight'), null)).toBe(false);
    expect(isArtifactOnlyTarget(getCardById('wild_growth'), null)).toBe(false);
    // And conversely, enchantArtifact must never be caught by the OTHER two guards.
    const animateArtifactCard = getCardById('animate_artifact');
    expect(isCreatureOnlyTarget(animateArtifactCard, null)).toBe(false);
    expect(isLandOnlyTarget(animateArtifactCard, null)).toBe(false);
  });

  it("AA-20: Relic Bind's card-data requiresTarget:'opponentArtifact' field does not collide with the CastFlowState.requiresTarget boolean", () => {
    const relicBind = getCardById('relic_bind');
    // The card-data field is a separate, string-typed mechanism enforced by a
    // dedicated CAST_SPELL gate (DuelCore.js) -- getEffectiveAbilityEffect must
    // still resolve the real targeting effect name unaffected by its presence.
    expect(relicBind.requiresTarget).toBe('opponentArtifact');
    expect(getEffectiveAbilityEffect(relicBind, null)).toBe('enchantArtifact');
    expect(needsAnyTarget(relicBind)).toBe(true);
  });

  it('AA-21: the resolve-time isArt(tgtC) fizzle check is reachable as defense-in-depth for the Kudzu-style path too', () => {
    const bear = makeCreature('bear-1', { controller: 'o' });
    const la = { iid: 'la-1', ...getCardById('living_artifact') };
    let state = makeState({ pHand: [la], oBf: [bear] });
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } } };

    expect(() => castAndResolve(state, 'p', 'la-1', 'bear-1')).not.toThrow();
    const s = castAndResolve(state, 'p', 'la-1', 'bear-1');
    expect(s.p.bf.some(c => c.enchantedArtifactIid === 'bear-1')).toBe(false);
  });

  it('AA-22: casting Animate Artifact with zero legal artifact targets on either battlefield fizzles cleanly, no error', () => {
    const aa = makeAnimateArtifactInHand('aa-1');
    const bear = makeCreature('bear-1', { controller: 'o' });
    let state = makeState({ pHand: [aa], oBf: [bear] });
    state = { ...state, p: { ...state.p, mana: FULL_MANA } };

    expect(() => castAndResolve(state, 'p', 'aa-1', null)).not.toThrow();
    const s = castAndResolve(state, 'p', 'aa-1', null);
    expect(s.log.some(e => (e.text ?? '').includes('Animate Artifact enchants'))).toBe(false);
  });

  it('AA-23: untriaged stub count is exactly 1 (Tawnos\'s Coffin only)', () => {
    const cardsPath = fileURLToPath(new URL('../../src/data/cards.js', import.meta.url));
    const src = readFileSync(cardsPath, 'utf8');
    const stubCount = (src.match(/effect:"stub"/g) || []).length;
    expect(stubCount).toBe(1);
  });

  it('AA-24: Animate Artifact reuses manaValueCDA unchanged -- no new CDA evaluator was added', () => {
    const animateArtifactCard = getCardById('animate_artifact');
    expect(animateArtifactCard.mod.powerFn).toBe('manaValueCDA');
    expect(animateArtifactCard.mod.toughnessFn).toBe('manaValueCDA');
    expect(CDA_EVALUATORS.manaValueCDA(animateArtifactCard)).toBe(animateArtifactCard.cmc);
    expect(Object.keys(CDA_EVALUATORS).some(k => /animate/i.test(k))).toBe(false);
  });

  it('AA-25: the embedded aura record carries a real enterTs for correct CR 613.7d layer ordering', () => {
    const art = makeArtifact('art-1');
    const aa = makeAnimateArtifactInHand('aa-1');
    let state = makeState({ pHand: [aa], oBf: [art], turn: 1 });
    state = { ...state, p: { ...state.p, mana: FULL_MANA }, layerClock: 41 };

    const s = castAndResolve(state, 'p', 'aa-1', 'art-1');
    const artAfter = s.o.bf.find(c => c.iid === 'art-1');
    const record = artAfter.enchantments.find(e => e.name === 'Animate Artifact');
    expect(typeof record.enterTs).toBe('number');
  });

  it("AA-26: Guardian Beast's new check is scoped to the embedded (mod) branch only -- it does not block Living Artifact's Kudzu-style attach", () => {
    const art = makeArtifact('art-1', { controller: 'o' });
    const beast = makeGuardianBeast('gb-1', 'o');
    const la = { iid: 'la-1', ...getCardById('living_artifact') };
    let state = makeState({ pHand: [la], oBf: [art, beast] });
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } } };

    const s = castAndResolve(state, 'p', 'la-1', 'art-1');
    const hostPerm = s.p.bf.find(c => c.enchantedArtifactIid === 'art-1');
    expect(hostPerm?.name).toBe('Living Artifact');
    expect(s.log.some(e => (e.text ?? '').includes('Guardian Beast prevents'))).toBe(false);
  });

});
