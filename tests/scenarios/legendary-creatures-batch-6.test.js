/**
 * @module-tag engine
 */
// tests/scenarios/legendary-creatures-batch-6.test.js
// Legendary Creatures Batch 6 (9 cards): Sol'kanar the Swamp King, Boris
// Devilboon, Gosta Dirk, Lord Magnus, Ur-Drago, Livonya Silone, Rubinia
// Soulsinger, Ayesha Tanaka, Rasputin Dreamweaver.
//
// New shared infrastructure covered here:
//   - landwalk nullification (nullifiesLandwalk field, canBlockDuel)
//   - legendary landwalk (landwalkLegendary field, canBlockDuel)
//   - whileGrantorControlledAndTapped control-grant condition (checkControlGrants)
//   - colored/ability-aware pendingConditionalCounter extension (costColor, targetIsAbility)
//
// See docs/MECHANICS_INDEX.md for the full batch writeup.

import { describe, it, expect } from 'vitest';
import { duelReducer, canBlockDuel, makeCardInstance, checkDeath } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { getCardById } from '../../src/data/cards.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

function readyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, ...overrides };
}

// ── Landwalk-nullify family + regression ────────────────────────────────────

describe('@engine Legendary Creatures Batch 6: landwalk nullification (Gosta Dirk / Lord Magnus / Ur-Drago)', () => {

  it('Gosta Dirk card data: 4/4 first strike, nullifiesLandwalk island', () => {
    const card = getCardById('gosta_dirk');
    expect(card).toBeTruthy();
    expect(card.power).toBe(4);
    expect(card.toughness).toBe(4);
    expect(card.keywords).toContain('FIRST_STRIKE');
    expect(card.nullifiesLandwalk).toEqual(['island']);
  });

  it('Gosta Dirk in play: an islandwalk attacker is now legally blockable', () => {
    const gosta = readyInstance('gosta_dirk', 'p', { controller: 'p' });
    const attacker = makeCreature('att-1', { keywords: ['ISLANDWALK'], controller: 'o' });
    const island = makeLand('isl-1', { id: 'island', name: 'Island', subtype: 'Basic Island', produces: ['U'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [gosta, blocker, island], oBf: [attacker] });
    expect(canBlockDuel(blocker, attacker, state.p.bf, state)).toBe(true);
  });

  it('Lord Magnus card data: 4/3 first strike, nullifiesLandwalk plains+forest', () => {
    const card = getCardById('lord_magnus');
    expect(card).toBeTruthy();
    expect(card.power).toBe(4);
    expect(card.toughness).toBe(3);
    expect(card.keywords).toContain('FIRST_STRIKE');
    expect(card.nullifiesLandwalk).toEqual(['plains', 'forest']);
  });

  it('Lord Magnus in play: a plainswalk attacker is legally blockable', () => {
    const magnus = readyInstance('lord_magnus', 'p', { controller: 'p' });
    const attacker = makeCreature('att-1', { keywords: ['PLAINSWALK'], controller: 'o' });
    const plains = makeLand('pl-1', { id: 'plains', name: 'Plains', subtype: 'Basic Plains', produces: ['W'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [magnus, blocker, plains], oBf: [attacker] });
    expect(canBlockDuel(blocker, attacker, state.p.bf, state)).toBe(true);
  });

  it('Lord Magnus in play: a forestwalk attacker is legally blockable', () => {
    const magnus = readyInstance('lord_magnus', 'p', { controller: 'p' });
    const attacker = makeCreature('att-1', { keywords: ['FORESTWALK'], controller: 'o' });
    const forest = makeLand('fo-1', { id: 'forest', name: 'Forest', subtype: 'Basic Forest', produces: ['G'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [magnus, blocker, forest], oBf: [attacker] });
    expect(canBlockDuel(blocker, attacker, state.p.bf, state)).toBe(true);
  });

  it('Ur-Drago card data: 4/4 first strike, nullifiesLandwalk swamp', () => {
    const card = getCardById('ur_drago');
    expect(card).toBeTruthy();
    expect(card.power).toBe(4);
    expect(card.toughness).toBe(4);
    expect(card.keywords).toContain('FIRST_STRIKE');
    expect(card.nullifiesLandwalk).toEqual(['swamp']);
  });

  it('Ur-Drago in play: a swampwalk attacker is legally blockable', () => {
    const urDrago = readyInstance('ur_drago', 'p', { controller: 'p' });
    const attacker = makeCreature('att-1', { keywords: ['SWAMPWALK'], controller: 'o' });
    const swamp = makeLand('sw-1', { id: 'swamp', name: 'Swamp', subtype: 'Basic Swamp', produces: ['B'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [urDrago, blocker, swamp], oBf: [attacker] });
    expect(canBlockDuel(blocker, attacker, state.p.bf, state)).toBe(true);
  });

  it('regression: without any nullifier in play, all 4 walk types still grant unblockability', () => {
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const walkFixtures = [
      ['ISLANDWALK', 'island', 'Island', 'Basic Island'],
      ['PLAINSWALK', 'plains', 'Plains', 'Basic Plains'],
      ['FORESTWALK', 'forest', 'Forest', 'Basic Forest'],
      ['SWAMPWALK', 'swamp', 'Swamp', 'Basic Swamp'],
    ];
    for (const [kw, id, name, subtype] of walkFixtures) {
      const attacker = makeCreature('att-1', { keywords: [kw], controller: 'o' });
      const land = makeLand('land-1', { id, name, subtype, color: '' });
      const state = makeState({ pBf: [blocker, land], oBf: [attacker] });
      expect(canBlockDuel(blocker, attacker, state.p.bf, state), `${kw} regression`).toBe(false);
    }
  });

  it('nullification is global: a nullifier controlled by the attacking creature\'s own controller still shuts off that attacker\'s landwalk', () => {
    // Gosta Dirk sits on the ATTACKING side (o), not in defBf (p's battlefield)
    // at all -- proving the nullification scan reads both full battlefields via
    // `state`, not just the defBf parameter the pre-existing walk checks use.
    const gosta = readyInstance('gosta_dirk', 'o', { controller: 'o' });
    const attacker = makeCreature('att-1', { keywords: ['ISLANDWALK'], controller: 'o' });
    const island = makeLand('isl-1', { id: 'island', name: 'Island', subtype: 'Basic Island', produces: ['U'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [blocker, island], oBf: [gosta, attacker] });
    expect(canBlockDuel(blocker, attacker, state.p.bf, state)).toBe(true);
  });

  it('mountainwalk is unaffected by any of the 3 nullifiers (only their specifically named types are nullified)', () => {
    const gosta = readyInstance('gosta_dirk', 'p', { iid: 'gd-1', controller: 'p' });
    const magnus = readyInstance('lord_magnus', 'p', { iid: 'lm-1', controller: 'p' });
    const urDrago = readyInstance('ur_drago', 'p', { iid: 'ud-1', controller: 'p' });
    const attacker = makeCreature('att-1', { keywords: ['MOUNTAINWALK'], controller: 'o' });
    const mountain = makeLand('mt-1', { id: 'mountain', name: 'Mountain', subtype: 'Basic Mountain', produces: ['R'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [gosta, magnus, urDrago, blocker, mountain], oBf: [attacker] });
    expect(canBlockDuel(blocker, attacker, state.p.bf, state)).toBe(false);
  });

});

// ── Legendary landwalk (Livonya Silone) ─────────────────────────────────────

describe('@engine Legendary Creatures Batch 6: legendary landwalk (Livonya Silone)', () => {

  it('Livonya Silone card data: 4/4 first strike, landwalkLegendary true', () => {
    const card = getCardById('livonya_silone');
    expect(card).toBeTruthy();
    expect(card.power).toBe(4);
    expect(card.toughness).toBe(4);
    expect(card.keywords).toContain('FIRST_STRIKE');
    expect(card.landwalkLegendary).toBe(true);
  });

  it('Livonya Silone is blockable when the defender controls no legendary land (only reachable case today)', () => {
    const livonya = readyInstance('livonya_silone', 'o', { controller: 'o' });
    const ordinaryLand = makeLand('sw-1', { id: 'swamp', name: 'Swamp', subtype: 'Basic Swamp', produces: ['B'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [blocker, ordinaryLand], oBf: [livonya] });
    expect(canBlockDuel(blocker, livonya, state.p.bf, state)).toBe(true);
  });

  it('synthetic: defender controlling a Legendary Land makes Livonya unblockable', () => {
    const livonya = readyInstance('livonya_silone', 'o', { controller: 'o' });
    const legendaryLand = makeLand('kar-1', { id: 'karakas', name: 'Karakas', type: 'Legendary Land', subtype: '', produces: ['W'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [blocker, legendaryLand], oBf: [livonya] });
    expect(canBlockDuel(blocker, livonya, state.p.bf, state)).toBe(false);
  });

});

// ── Rubinia Soulsinger ───────────────────────────────────────────────────────

describe('@engine Legendary Creatures Batch 6: Rubinia Soulsinger control theft', () => {

  it('card data: optionalUntap/optionalUntapAlways, T-only activation cost targeting a creature', () => {
    const card = getCardById('rubinia_soulsinger');
    expect(card).toBeTruthy();
    expect(card.optionalUntap).toBe(true);
    expect(card.optionalUntapAlways).toBe(true);
    expect(card.activated).toEqual({ cost: 'T', effect: 'rubiniaSteal', requiresTarget: true });
  });

  it('activating steals a target creature; stolen creature is untapped and summoning sick under the new controller', () => {
    const rubinia = readyInstance('rubinia_soulsinger', 'p', { controller: 'p' });
    const target = makeCreature('c-1', { controller: 'o', tapped: true });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [rubinia], oBf: [target] });
    const item = { id: 'si-1', card: { ...rubinia, effect: 'rubiniaSteal' }, caster: 'p', targets: ['c-1'], xVal: 1, isAbility: true };
    const s1 = duelReducer({ ...state, stack: [item] }, { type: 'RESOLVE_STACK' });

    expect(s1.o.bf.some(c => c.iid === 'c-1')).toBe(false);
    const stolen = s1.p.bf.find(c => c.iid === 'c-1');
    expect(stolen).toBeDefined();
    expect(stolen.controller).toBe('p');
    expect(stolen.tapped).toBe(false);
    expect(stolen.summoningSick).toBe(true);
    expect(stolen.controlGrant).toEqual({ grantorIid: rubinia.iid, grantorController: 'o', condition: 'whileGrantorControlledAndTapped' });
  });

  it('stolen creature reverts to its original controller when Rubinia leaves the battlefield', () => {
    const stolenCreature = makeCreature('c-1', {
      controller: 'p',
      controlGrant: { grantorIid: 'rb-1', grantorController: 'o', condition: 'whileGrantorControlledAndTapped' },
    });
    // Rubinia ('rb-1') is NOT present on any battlefield -- it left play.
    const state = makeState({ pBf: [stolenCreature], oBf: [] });
    const s1 = checkDeath(state);

    expect(s1.p.bf.some(c => c.iid === 'c-1')).toBe(false);
    const reverted = s1.o.bf.find(c => c.iid === 'c-1');
    expect(reverted).toBeDefined();
    expect(reverted.controller).toBe('o');
    expect(reverted.controlGrant).toBeUndefined();
  });

  it('stolen creature reverts when Rubinia becomes untapped by an outside effect', () => {
    const rubinia = readyInstance('rubinia_soulsinger', 'p', { iid: 'rb-1', tapped: false }); // untapped
    const stolenCreature = makeCreature('c-1', {
      controller: 'p',
      controlGrant: { grantorIid: 'rb-1', grantorController: 'o', condition: 'whileGrantorControlledAndTapped' },
    });
    const state = makeState({ pBf: [rubinia, stolenCreature], oBf: [] });
    const s1 = checkDeath(state);

    expect(s1.p.bf.some(c => c.iid === 'c-1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'c-1')).toBe(true);
  });

  it('regression: stolen creature does NOT revert on an ordinary turn where Rubinia stays tapped and in play', () => {
    const rubinia = readyInstance('rubinia_soulsinger', 'p', { iid: 'rb-1', tapped: true });
    const stolenCreature = makeCreature('c-1', {
      controller: 'p',
      controlGrant: { grantorIid: 'rb-1', grantorController: 'o', condition: 'whileGrantorControlledAndTapped' },
    });
    const state = makeState({ pBf: [rubinia, stolenCreature], oBf: [] });
    const s1 = checkDeath(state);

    expect(s1.p.bf.some(c => c.iid === 'c-1')).toBe(true);
    const stillStolen = s1.p.bf.find(c => c.iid === 'c-1');
    expect(stillStolen.controlGrant?.condition).toBe('whileGrantorControlledAndTapped');
  });

});

// ── Ayesha Tanaka ────────────────────────────────────────────────────────────

describe('@engine Legendary Creatures Batch 6: Ayesha Tanaka activated-ability counter', () => {

  it('card data: Banding, T-only cost, requiresTarget', () => {
    const card = getCardById('ayesha_tanaka');
    expect(card).toBeTruthy();
    expect(card.keywords).toContain('BANDING');
    expect(card.activated).toEqual({ cost: 'T', effect: 'counterActivatedAbilityUnlessPay', requiresTarget: true });
  });

  it('decline to pay {W}: the targeted artifact ability is removed from the stack, the artifact itself remains on the battlefield', () => {
    const ayesha = readyInstance('ayesha_tanaka', 'p', { controller: 'p' });
    const artifact = { iid: 'art-1', id: 'aladdinss_ring', name: "Aladdin's Ring", type: 'Artifact', color: '', cmc: 8, keywords: [], tapped: true, controller: 'o', damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ayesha], oBf: [artifact] });
    const abilityItem = { id: 'ab-1', card: { ...artifact, effect: 'damage4Any' }, caster: 'o', targets: [], xVal: 1, isAbility: true };
    const ayeshaItem = { id: 'ay-1', card: { ...ayesha, effect: 'counterActivatedAbilityUnlessPay' }, caster: 'p', targets: ['ab-1'], xVal: 1, isAbility: true };
    const s1 = duelReducer({ ...state, stack: [abilityItem, ayeshaItem] }, { type: 'RESOLVE_STACK' });

    expect(s1.pendingConditionalCounter).toMatchObject({ cardId: 'ayesha_tanaka', stackItemId: 'ab-1', targetCaster: 'o', cost: 1, costColor: 'W', targetIsAbility: true });

    const s2 = duelReducer(s1, { type: 'CONDITIONAL_COUNTER_CHOICE', paid: false });
    expect(s2.stack.some(i => i.id === 'ab-1')).toBe(false);
    // The artifact permanent itself is untouched -- still on the battlefield, not in any graveyard.
    expect(s2.o.bf.some(c => c.iid === 'art-1')).toBe(true);
    expect(s2.o.gy.some(c => c.iid === 'art-1')).toBe(false);
  });

  it('pay {W}: exactly 1 white mana is deducted (not 1 generic from any color), ability resolves normally', () => {
    const ayesha = readyInstance('ayesha_tanaka', 'p', { controller: 'p' });
    const artifact = { iid: 'art-1', id: 'aladdinss_ring', name: "Aladdin's Ring", type: 'Artifact', color: '', cmc: 8, keywords: [], tapped: true, controller: 'o', damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ayesha], oBf: [artifact] });
    const funded = { ...state, o: { ...state.o, mana: { ...state.o.mana, W: 1, C: 5 } } };
    const abilityItem = { id: 'ab-1', card: { ...artifact, effect: 'damage4Any' }, caster: 'o', targets: [], xVal: 1, isAbility: true };
    const ayeshaItem = { id: 'ay-1', card: { ...ayesha, effect: 'counterActivatedAbilityUnlessPay' }, caster: 'p', targets: ['ab-1'], xVal: 1, isAbility: true };
    const s1 = duelReducer({ ...funded, stack: [abilityItem, ayeshaItem] }, { type: 'RESOLVE_STACK' });

    const s2 = duelReducer(s1, { type: 'CONDITIONAL_COUNTER_CHOICE', paid: true });
    expect(s2.o.mana.W).toBe(0);
    expect(s2.o.mana.C).toBe(5); // untouched -- payment came only from W
    expect(s2.stack.some(i => i.id === 'ab-1')).toBe(true); // ability remains on stack, resolves normally
  });

  it('targeting a spell (not an ability) fizzles', () => {
    const ayesha = readyInstance('ayesha_tanaka', 'p', { controller: 'p' });
    const spell = makeSpell('sp-1', { id: 'test_artifact_spell', name: 'Test Artifact Spell', type: 'Artifact', color: '', controller: 'o' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ayesha], oHand: [] });
    const spellItem = { id: 'sp-item-1', card: spell, caster: 'o', targets: [], xVal: 1 }; // isAbility not set
    const ayeshaItem = { id: 'ay-1', card: { ...ayesha, effect: 'counterActivatedAbilityUnlessPay' }, caster: 'p', targets: ['sp-item-1'], xVal: 1, isAbility: true };
    const s1 = duelReducer({ ...state, stack: [spellItem, ayeshaItem] }, { type: 'RESOLVE_STACK' });

    expect(s1.pendingConditionalCounter).toBeFalsy();
    expect(s1.stack.some(i => i.id === 'sp-item-1')).toBe(true); // untouched
  });

  it('targeting an ability from a non-artifact source (a creature\'s activated ability) fizzles', () => {
    const ayesha = readyInstance('ayesha_tanaka', 'p', { controller: 'p' });
    const creature = makeCreature('cr-1', { controller: 'o', activated: { cost: 'T', effect: 'ping' } });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ayesha], oBf: [creature] });
    const abilityItem = { id: 'ab-1', card: { ...creature, effect: 'ping' }, caster: 'o', targets: [], xVal: 1, isAbility: true };
    const ayeshaItem = { id: 'ay-1', card: { ...ayesha, effect: 'counterActivatedAbilityUnlessPay' }, caster: 'p', targets: ['ab-1'], xVal: 1, isAbility: true };
    const s1 = duelReducer({ ...state, stack: [abilityItem, ayeshaItem] }, { type: 'RESOLVE_STACK' });

    expect(s1.pendingConditionalCounter).toBeFalsy();
    expect(s1.stack.some(i => i.id === 'ab-1')).toBe(true); // untouched
  });

});

// ── Rasputin Dreamweaver ─────────────────────────────────────────────────────

describe('@engine Legendary Creatures Batch 6: Rasputin Dreamweaver dream counters', () => {

  it('card data: enters with 7 dream counters', () => {
    const card = getCardById('rasputin_dreamweaver');
    expect(card).toBeTruthy();
    expect(card.etbCounters).toEqual({ DREAM: 7 });
  });

  it('rasputinAddMana: removes 1 dream counter, adds {C} to the caster\'s pool', () => {
    const rasp = readyInstance('rasputin_dreamweaver', 'p', { controller: 'p', counters: { DREAM: 7 } });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [rasp] });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: rasp.iid, abilityId: 'rasputin_add_mana' });

    expect(s1.p.bf.find(c => c.iid === rasp.iid).counters.DREAM).toBe(6);
    expect(s1.p.mana.C).toBe(1);
  });

  it('rasputinPreventDamage1Self: removes 1 dream counter, next 1 damage to Rasputin this turn is prevented', () => {
    const rasp = readyInstance('rasputin_dreamweaver', 'p', { controller: 'p', counters: { DREAM: 7 } });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [rasp] });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: rasp.iid, abilityId: 'rasputin_prevent_damage' });

    const updated = s1.p.bf.find(c => c.iid === rasp.iid);
    expect(updated.counters.DREAM).toBe(6);
    expect(updated.damageShield).toBe(1);
  });

  it('upkeep: Rasputin untapped at upkeep with DREAM < 7 gains 1 dream counter', () => {
    const rasp = makeCreature('rasp-1', { id: 'rasputin_dreamweaver', name: 'Rasputin Dreamweaver', upkeep: 'rasputinUpkeep', tapped: false, counters: { DREAM: 3 }, controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [rasp] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.p.bf.find(c => c.iid === 'rasp-1').counters.DREAM).toBe(4);
  });

  it('upkeep: tapped Rasputin does not gain a counter; a Rasputin already at 7 does not exceed the cap', () => {
    const tappedRasp = makeCreature('rasp-1', { id: 'rasputin_dreamweaver', name: 'Rasputin Dreamweaver', upkeep: 'rasputinUpkeep', tapped: true, counters: { DREAM: 3 }, controller: 'p' });
    const tappedState = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [tappedRasp] });
    const s1 = duelReducer(tappedState, { type: 'ADVANCE_PHASE' });
    expect(s1.p.bf.find(c => c.iid === 'rasp-1').counters.DREAM).toBe(3);

    const cappedRasp = makeCreature('rasp-2', { id: 'rasputin_dreamweaver', name: 'Rasputin Dreamweaver', upkeep: 'rasputinUpkeep', tapped: false, counters: { DREAM: 7 }, controller: 'p' });
    const cappedState = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [cappedRasp] });
    const s2 = duelReducer(cappedState, { type: 'ADVANCE_PHASE' });
    expect(s2.p.bf.find(c => c.iid === 'rasp-2').counters.DREAM).toBe(7);
  });

});

// ── Boris Devilboon ──────────────────────────────────────────────────────────

describe('@engine Legendary Creatures Batch 6: Boris Devilboon Minor Demon token', () => {

  it('card data: 2/2, {2}{B}{R},{T} activation cost', () => {
    const card = getCardById('boris_devilboon');
    expect(card).toBeTruthy();
    expect(card.power).toBe(2);
    expect(card.toughness).toBe(2);
    expect(card.activated).toEqual({ cost: '2BR,T', effect: 'borisCreateMinorDemon' });
  });

  it('activating creates a 1/1 black-and-red Minor Demon token via TOKEN_DB', () => {
    const boris = readyInstance('boris_devilboon', 'p', { controller: 'p' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [boris] });
    const funded = { ...state, p: { ...state.p, mana: { ...state.p.mana, C: 2, B: 1, R: 1 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: boris.iid });
    expect(s1.stack.length).toBe(1);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const token = s2.p.bf.find(c => c.tokenId === 'minor_demon');
    expect(token).toBeDefined();
    expect(token.name).toBe('Minor Demon');
    expect(token.power).toBe(1);
    expect(token.toughness).toBe(1);
    expect(token.color).toBe('BR');
  });

});

// ── Sol'kanar the Swamp King ─────────────────────────────────────────────────

describe('@engine Legendary Creatures Batch 6: Sol\'kanar the Swamp King', () => {

  it('card data: 5/5, swampwalk keyword', () => {
    const card = getCardById('solkanar_the_swamp_king');
    expect(card).toBeTruthy();
    expect(card.power).toBe(5);
    expect(card.toughness).toBe(5);
    expect(card.keywords).toContain('SWAMPWALK');
  });

  it('casting a black spell (either player) triggers Sol\'kanar\'s controller gaining 1 life', () => {
    const solkanar = readyInstance('solkanar_the_swamp_king', 'p', { controller: 'p' });
    const blackSpell = makeSpell('bs-1', { id: 'test_black', name: 'Test Black Spell', type: 'Sorcery', color: 'B', cmc: 1, cost: 'B', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [solkanar], oHand: [blackSpell] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, B: 1 } }, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'bs-1' });
    expect(s1.p.life).toBe(21);
  });

  it('casting a non-black spell does not trigger the life gain', () => {
    const solkanar = readyInstance('solkanar_the_swamp_king', 'p', { controller: 'p' });
    const whiteSpell = makeSpell('ws-1', { id: 'test_white', name: 'Test White Spell', type: 'Sorcery', color: 'W', cmc: 1, cost: 'W', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [solkanar], oHand: [whiteSpell] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, W: 1 } }, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'ws-1' });
    expect(s1.p.life).toBe(20);
  });

  it('regression: Sol\'kanar\'s own swampwalk still works as an ordinary landwalk keyword (unaffected by the new nullify mechanism)', () => {
    const solkanar = readyInstance('solkanar_the_swamp_king', 'o', { controller: 'o' });
    const swamp = makeLand('sw-1', { id: 'swamp', name: 'Swamp', subtype: 'Basic Swamp', produces: ['B'], color: '' });
    const blocker = makeCreature('bl-1', { controller: 'p' });
    const state = makeState({ pBf: [blocker, swamp], oBf: [solkanar] });
    expect(canBlockDuel(blocker, solkanar, state.p.bf, state)).toBe(false);
  });

});
