// tests/scenarios/legendary-creatures-batch-1-2.test.js
// Legendary Creatures Batch 1+2: 21 of the planned 26 legendary creatures
// (11 vanilla + 10 single-ability). Five cards from the original batch --
// Xira Arien, Tor Wauki, Lady Caleria, Gwendlyn Di Corci, Adun Oakenshield --
// are deferred: their named "reuse an existing effect" precedents did not
// hold on inspection (see docs/CURRENT_SPRINT.md and docs/MECHANICS_INDEX.md
// for the discrepancy writeup), which is a pre-flight STOP condition per the
// prompt that authored this batch, not an oversight here.
//
// Styled after tests/scenarios/banding-cards-batch.test.js: real CARD_DB-backed
// instances via makeCardInstance, not synthetic fixtures.

import { describe, it, expect } from 'vitest';
import { duelReducer, hasKw, makeCardInstance, checkLegendRule, getPow, getTou } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], enchantments: [], ...overrides };
}

const VANILLA = [
  { id: 'jedit_ojanen', name: 'Jedit Ojanen', subtype: 'Cat Warrior', cost: '4WWU', cmc: 7, power: 5, toughness: 5 },
  { id: 'tobias_andrion', name: 'Tobias Andrion', subtype: 'Human Advisor', cost: '3WU', cmc: 5, power: 4, toughness: 4 },
  { id: 'barktooth_warbeard', name: 'Barktooth Warbeard', subtype: 'Human Warrior', cost: '4BRR', cmc: 7, power: 6, toughness: 5 },
  { id: 'lady_orca', name: 'Lady Orca', subtype: 'Demon', cost: '5BR', cmc: 7, power: 7, toughness: 4 },
  { id: 'the_lady_of_the_mountain', name: 'The Lady of the Mountain', subtype: 'Giant', cost: '4RG', cmc: 6, power: 5, toughness: 5 },
  { id: 'sivitri_scarzam', name: 'Sivitri Scarzam', subtype: 'Human', cost: '5UB', cmc: 7, power: 6, toughness: 4 },
  { id: 'kasimir_the_lone_wolf', name: 'Kasimir the Lone Wolf', subtype: 'Human Warrior', cost: '4WU', cmc: 6, power: 5, toughness: 3 },
  { id: 'sir_shandlar_of_eberyn', name: 'Sir Shandlar of Eberyn', subtype: 'Human Knight', cost: '4GW', cmc: 6, power: 4, toughness: 7 },
  { id: 'jasmine_boreal', name: 'Jasmine Boreal', subtype: 'Human', cost: '3GW', cmc: 5, power: 4, toughness: 5 },
  { id: 'jerrard_of_the_closed_fist', name: 'Jerrard of the Closed Fist', subtype: 'Human Knight', cost: '3RGG', cmc: 6, power: 6, toughness: 5 },
  { id: 'torsten_von_ursus', name: 'Torsten Von Ursus', subtype: 'Human Soldier', cost: '3GGW', cmc: 6, power: 5, toughness: 5 },
];

describe('@engine Scenario: legendary-creatures-batch-1-2 -- vanilla creatures', () => {
  it.each(VANILLA)('$name ($id) has correct type/subtype/cost/cmc/power/toughness', (spec) => {
    const inst = makeCardInstance(spec.id, 'p');
    expect(inst).not.toBeNull();
    expect(inst.name).toBe(spec.name);
    expect(inst.type).toBe('Legendary Creature');
    expect(inst.subtype).toBe(spec.subtype);
    expect(inst.cost).toBe(spec.cost);
    expect(inst.cmc).toBe(spec.cmc);
    expect(inst.power).toBe(spec.power);
    expect(inst.toughness).toBe(spec.toughness);
  });

  it('none of the 11 vanilla creatures carry a leftover effect or activated field', () => {
    for (const spec of VANILLA) {
      const inst = makeCardInstance(spec.id, 'p');
      expect(inst.effect).toBeUndefined();
      expect(inst.activated).toBeUndefined();
    }
  });

  it('checkLegendRule triggers when a player controls two copies of a real vanilla legendary', () => {
    const leg1 = makeReadyInstance('jedit_ojanen', 'p');
    const leg2 = { ...makeReadyInstance('jedit_ojanen', 'p'), iid: 'jedit_ojanen-2' };
    const state = makeState({ pBf: [leg1, leg2] });
    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).not.toBeNull();
    expect(s1.pendingChoice.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.legendName).toBe('Jedit Ojanen');
    expect(s1.pendingChoice.options.map(o => o.id).sort()).toEqual(['jedit_ojanen-1', 'jedit_ojanen-2']);
  });

  it('casting a vanilla legendary with no effect field resolves cleanly onto the battlefield', () => {
    const card = makeSpell('tla-1', { id: 'the_lady_of_the_mountain', name: 'The Lady of the Mountain', type: 'Legendary Creature', subtype: 'Giant', color: 'RG', cmc: 6, cost: '4RG', power: 5, toughness: 5, keywords: [], controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [card] });
    const funded = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 1, G: 1, C: 4 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'tla-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const onBf = s2.p.bf.find(c => c.iid === 'tla-1');
    expect(onBf).toBeDefined();
    expect(onBf.power).toBe(5);
    expect(onBf.toughness).toBe(5);
    expect(s2.over).toBeNull();
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Ramirez DePietro', () => {
  it('has first strike', () => {
    const card = makeCardInstance('ramirez_depietro', 'p');
    expect(hasKw(card, KEYWORDS.FIRST_STRIKE.id)).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Riven Turnbull', () => {
  it('activating adds {B} and taps the creature', () => {
    const riven = makeReadyInstance('riven_turnbull', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [riven] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: riven.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.mana.B).toBe(1);
    expect(s2.p.bf.find(c => c.iid === riven.iid).tapped).toBe(true);
  });

  it('cannot be activated again while already tapped', () => {
    const riven = makeReadyInstance('riven_turnbull', 'p', { tapped: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [riven] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: riven.iid });
    expect(s1.stack.length).toBe(0);
    expect(s1.p.mana.B).toBe(0);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Princess Lucrezia', () => {
  it('activating adds {U} and taps the creature', () => {
    const lucrezia = makeReadyInstance('princess_lucrezia', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [lucrezia] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: lucrezia.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.mana.U).toBe(1);
    expect(s2.p.bf.find(c => c.iid === lucrezia.iid).tapped).toBe(true);
  });

  it('cannot be activated again while already tapped', () => {
    const lucrezia = makeReadyInstance('princess_lucrezia', 'p', { tapped: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [lucrezia] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: lucrezia.iid });
    expect(s1.stack.length).toBe(0);
    expect(s1.p.mana.U).toBe(0);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Sunastian Falconer', () => {
  // Regression coverage: research for this batch found that addMana's resolver
  // treats a 2-char mana string (e.g. "CC") as one unrecognized token and adds
  // nothing (a pre-existing bug also present on Sol Ring/Mana Vault/Mana Crypt's
  // card data, not fixed here per CLAUDE.md's engine-file scope). Sunastian's
  // card data uses the array form (mana:["C","C"]), proven correct by
  // dark_ritual's identical shape, to avoid the same trap.
  it('activating adds exactly two {C} and taps the creature', () => {
    const sunastian = makeReadyInstance('sunastian_falconer', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [sunastian] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: sunastian.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.mana.C).toBe(2);
    expect(s2.p.bf.find(c => c.iid === sunastian.iid).tapped).toBe(true);
  });

  it('cannot be activated again while already tapped', () => {
    const sunastian = makeReadyInstance('sunastian_falconer', 'p', { tapped: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [sunastian] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: sunastian.iid });
    expect(s1.stack.length).toBe(0);
    expect(s1.p.mana.C).toBe(0);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Jacques le Vert', () => {
  it('gives a green creature its controller controls +0/+2', () => {
    const jacques = makeReadyInstance('jacques_le_vert', 'p');
    const greenGuy = makeCreature('gg-1', { controller: 'p', color: 'G', power: 2, toughness: 2 });
    const state = makeState({ pBf: [jacques, greenGuy] });
    expect(getPow(greenGuy, state)).toBe(2);
    expect(getTou(greenGuy, state)).toBe(4);
  });

  it('does not buff a green creature controlled by an opponent (lordControllerOnly)', () => {
    const jacques = makeReadyInstance('jacques_le_vert', 'p');
    const oppGreenGuy = makeCreature('gg-2', { controller: 'o', color: 'G', power: 2, toughness: 2 });
    const state = makeState({ pBf: [jacques], oBf: [oppGreenGuy] });
    expect(getTou(oppGreenGuy, state)).toBe(2);
  });

  // Documents a known engine-wide simplification rather than a bug in this card:
  // layers.js's lordEffect collector unconditionally skips the source's own iid
  // (src.iid === card.iid -> continue), which is what makes every other lord in
  // this codebase implicitly "Other X creatures..." even where the printed card
  // says just "X creatures...". Every existing lordEffect creature in cards.js
  // is worded "Other X" already; Jacques le Vert's real oracle text is not, so
  // this is the first card where that universal self-exclusion is visible as a
  // (minor, documented) deviation rather than the intended behavior.
  it('does not buff itself, despite its own oracle wording not saying "other" (documented engine simplification)', () => {
    const jacques = makeReadyInstance('jacques_le_vert', 'p');
    const state = makeState({ pBf: [jacques] });
    expect(getTou(jacques, state)).toBe(2);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Ramses Overdark', () => {
  it('destroys a target creature that has an Aura attached', () => {
    const ramses = makeReadyInstance('ramses_overdark', 'p');
    const enchanted = makeCreature('ec-1', { controller: 'o', enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ramses], oBf: [enchanted] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ramses.iid, tgt: 'ec-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.some(c => c.iid === 'ec-1')).toBe(false);
    expect(s2.o.gy.some(c => c.iid === 'ec-1')).toBe(true);
  });

  it('fizzles against a target creature with no Auras attached', () => {
    const ramses = makeReadyInstance('ramses_overdark', 'p');
    const bare = makeCreature('bc-1', { controller: 'o', enchantments: [] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ramses], oBf: [bare] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ramses.iid, tgt: 'bc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.some(c => c.iid === 'bc-1')).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Ragnar', () => {
  it('activating regenerates target creature', () => {
    const ragnar = makeReadyInstance('ragnar', 'p');
    const target = makeCreature('tgt-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ragnar, target] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, G: 1, W: 1, U: 1 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ragnar.iid, tgt: 'tgt-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'tgt-1').regenerating).toBe(true);
  });

  it('cannot be activated a second time without untapping in between', () => {
    const ragnar = makeReadyInstance('ragnar', 'p');
    const target = makeCreature('tgt-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ragnar, target] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, G: 2, W: 2, U: 2 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ragnar.iid, tgt: 'tgt-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ragnar.iid, tgt: 'tgt-1' });
    expect(s3.stack.length).toBe(0);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Pavel Maliki', () => {
  it('activating grants +1/+0 until end of turn', () => {
    const pavel = makeReadyInstance('pavel_maliki', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pavel] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: pavel.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === pavel.iid).eotBuffs).toContainEqual({ power: 1 });
  });

  it('does not tap the creature (no {T} in its cost) -- can be activated again the same turn', () => {
    const pavel = makeReadyInstance('pavel_maliki', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pavel] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 2, R: 2 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: pavel.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === pavel.iid).tapped).toBe(false);
    const s3 = duelReducer(s2, { type: 'ACTIVATE_ABILITY', who: 'p', iid: pavel.iid });
    const s4 = duelReducer(s3, { type: 'RESOLVE_STACK' });
    expect(s4.p.bf.find(c => c.iid === pavel.iid).eotBuffs).toContainEqual({ power: 1 });
    expect(s4.p.bf.find(c => c.iid === pavel.iid).eotBuffs.length).toBe(2);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Bartel Runeaxe', () => {
  it("an Aura spell targeting it fizzles and never attaches", () => {
    const bartel = makeReadyInstance('bartel_runeaxe', 'p');
    const aura = makeSpell('aura-1', { id: 'test_aura', name: 'Test Aura', type: 'Enchantment', subtype: 'Aura', color: 'R', cmc: 1, cost: 'R', effect: 'enchantCreature', mod: { power: 1 }, controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [bartel], oHand: [aura] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, R: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'aura-1', tgt: bartel.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const bartelAfter = s2.p.bf.find(c => c.iid === bartel.iid);
    expect(bartelAfter.enchantments).toEqual([]);
    expect(s2.log[s2.log.length - 1].text).toContain("can't be the target of Aura spells");
  });

  it('can still be destroyed by a non-Aura targeted removal effect', () => {
    const bartel = makeReadyInstance('bartel_runeaxe', 'p');
    const removal = makeSpell('rem-1', { id: 'test_removal', name: 'Test Removal', type: 'Sorcery', color: 'B', cmc: 1, cost: 'B', effect: 'destroy', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [bartel], oHand: [removal] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, B: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'rem-1', tgt: bartel.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.some(c => c.iid === bartel.iid)).toBe(false);
    expect(s2.p.gy.some(c => c.iid === bartel.iid)).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-batch-1-2 -- Tuknir Deathlock', () => {
  it('has flying', () => {
    const tuknir = makeCardInstance('tuknir_deathlock', 'p');
    expect(hasKw(tuknir, KEYWORDS.FLYING.id)).toBe(true);
  });

  it('activating grants target creature +2/+2 until end of turn', () => {
    const tuknir = makeReadyInstance('tuknir_deathlock', 'p');
    const target = makeCreature('tgt-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tuknir, target] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 1, G: 1 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: tuknir.iid, tgt: 'tgt-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'tgt-1').eotBuffs).toContainEqual({ power: 2, toughness: 2 });
  });
});
