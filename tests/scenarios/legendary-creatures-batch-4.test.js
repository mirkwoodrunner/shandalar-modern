// tests/scenarios/legendary-creatures-batch-4.test.js
// Legendary Creatures Batch 4: Lady Evangela, Angus Mackenzie, Dakkon Blackblade,
// Tetsuo Umezawa. Angus Mackenzie reuses the existing "fog" effect directly as an
// activated ability (same effect Fog/Holy Day/Darkness already use), gated by a
// new act.beforeCombatDamageOnly timing check mirroring myUpkeepOnly/myTurnOnly's
// exact shape. Lady Evangela is a one-shot, single-target sibling of Sewers of
// Estark's preventCombatDamageDealt flag (already wired through all 6 combat-damage
// checkpoints and cleared at CLEANUP) rather than a new damage-prevention
// mechanism. Dakkon Blackblade adds a `landCount` CDA evaluator to
// CDA_EVALUATORS, same shape as swampCount/forestCount. Tetsuo Umezawa reuses
// Bartel Runeaxe's cantBeTargetOfAuraSpells flag directly and adds a new
// destroyTappedOrBlocking case (same shape as destroyTapped/destroyEnchantedCreature,
// predicate widened to tapped OR blocking), registered in both
// CREATURE_ONLY_TARGET_EFFECTS and ACTIVATE_TARGET_EFFECTS in useDuelController.ts.
//
// Styled after tests/scenarios/legendary-creatures-batch-3.test.js and
// tests/scenarios/legendary-creatures-cleanup.test.js: real CARD_DB-backed
// instances via makeCardInstance, not synthetic fixtures.

import { describe, it, expect } from 'vitest';
import { duelReducer, makeCardInstance, checkLegendRule, getPow, getTou } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell, makeLand } from '../../src/engine/__tests__/_factory.js';
import { CREATURE_ONLY_TARGET_EFFECTS, ACTIVATE_TARGET_EFFECTS } from '../../src/hooks/useDuelController';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], enchantments: [], ...overrides };
}

describe('@engine Scenario: legendary-creatures-batch-4 -- Angus Mackenzie', () => {
  it('fires correctly: prevents all combat damage this turn when activated before the combat damage step', () => {
    const angus = makeReadyInstance('angus_mackenzie', 'p');
    const attacker = makeCreature('atk-1', { controller: 'p', power: 3, toughness: 3 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [angus, attacker] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'atk-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const funded = { ...s4, p: { ...s4.p, mana: { ...s4.p.mana, G: 1, W: 1, U: 1 } } };
    const s5 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: angus.iid });
    const s6 = duelReducer(s5, { type: 'RESOLVE_STACK' });
    expect(s6.fogActive).toBe(true);
    const s7 = duelReducer(s6, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, fog resolves
    expect(s7.o.life).toBe(20);
    expect(s7.fogActive).toBe(false);
  });

  it('is blocked outside its timing window ("Activate only before the combat damage step")', () => {
    const angus = makeReadyInstance('angus_mackenzie', 'p');
    const state = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [angus] });
    const funded = { ...state, p: { ...state.p, mana: { ...state.p.mana, G: 1, W: 1, U: 1 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: angus.iid });
    expect(s1.stack.length).toBe(0);
    expect(s1.p.mana).toEqual(funded.p.mana);
    expect(s1.log[s1.log.length - 1].text).toContain('before the combat damage step');
  });
});

describe('@engine Scenario: legendary-creatures-batch-4 -- Lady Evangela', () => {
  it('prevents combat damage dealt by the targeted attacking creature', () => {
    const evangela = makeReadyInstance('lady_evangela', 'p');
    const attacker = makeCreature('atk-1', { controller: 'o', power: 4, toughness: 4 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', pBf: [evangela], oBf: [attacker] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'atk-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const funded = { ...s4, p: { ...s4.p, mana: { ...s4.p.mana, W: 1, B: 1 } } };
    const s5 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: evangela.iid, tgt: 'atk-1' });
    const s6 = duelReducer(s5, { type: 'RESOLVE_STACK' });
    expect(s6.o.bf.find(c => c.iid === 'atk-1').preventCombatDamageDealt).toBe(true);
    const s7 = duelReducer(s6, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    expect(s7.p.life).toBe(20);
  });

  it('does not prevent combat damage from other attacking creatures in the same combat', () => {
    const evangela = makeReadyInstance('lady_evangela', 'p');
    const atk1 = makeCreature('atk-1', { controller: 'o', power: 4, toughness: 4 });
    const atk2 = makeCreature('atk-2', { controller: 'o', power: 3, toughness: 3 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', pBf: [evangela], oBf: [atk1, atk2] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'atk-1' });
    const s1b = duelReducer(s1, { type: 'DECLARE_ATTACKER', iid: 'atk-2' });
    const s2 = duelReducer(s1b, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' });
    const funded = { ...s4, p: { ...s4.p, mana: { ...s4.p.mana, W: 1, B: 1 } } };
    const s5 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: evangela.iid, tgt: 'atk-1' });
    const s6 = duelReducer(s5, { type: 'RESOLVE_STACK' });
    const s7 = duelReducer(s6, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    expect(s7.p.life).toBe(17); // only atk-2's 3 damage gets through
  });

  it('the preventCombatDamageDealt flag it sets expires at CLEANUP (until end of turn only)', () => {
    const flagged = makeCreature('atk-1', { controller: 'o', preventCombatDamageDealt: true });
    const state = makeState({ phase: PHASE.END, active: 'p', oBf: [flagged] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.o.bf.find(c => c.iid === 'atk-1').preventCombatDamageDealt).toBe(false);
  });
});

describe('@engine Scenario: legendary-creatures-batch-4 -- Dakkon Blackblade', () => {
  it("power and toughness are each equal to the number of lands its controller controls", () => {
    const dakkon = makeReadyInstance('dakkon_blackblade', 'p');
    const lands = [makeLand('l-1', { controller: 'p' }), makeLand('l-2', { controller: 'p' }), makeLand('l-3', { controller: 'p' })];
    const state = makeState({ pBf: [dakkon, ...lands] });
    expect(getPow(dakkon, state)).toBe(3);
    expect(getTou(dakkon, state)).toBe(3);
  });

  it('recomputes as lands enter or leave the battlefield', () => {
    const dakkon = makeReadyInstance('dakkon_blackblade', 'p');
    const oneLand = makeLand('l-1', { controller: 'p' });
    const stateOne = makeState({ pBf: [dakkon, oneLand] });
    expect(getPow(dakkon, stateOne)).toBe(1);
    const twoLands = [oneLand, makeLand('l-2', { controller: 'p' })];
    const stateTwo = makeState({ pBf: [dakkon, ...twoLands] });
    expect(getPow(dakkon, stateTwo)).toBe(2);
    const stateZero = makeState({ pBf: [dakkon] });
    expect(getPow(dakkon, stateZero)).toBe(0);
  });

  it('checkLegendRule triggers when a player controls two copies of Dakkon Blackblade', () => {
    const leg1 = makeReadyInstance('dakkon_blackblade', 'p');
    const leg2 = { ...makeReadyInstance('dakkon_blackblade', 'p'), iid: 'dakkon_blackblade-2' };
    const state = makeState({ pBf: [leg1, leg2] });
    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).not.toBeNull();
    expect(s1.pendingChoice.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.legendName).toBe('Dakkon Blackblade');
    expect(s1.pendingChoice.options.map(o => o.id).sort()).toEqual(['dakkon_blackblade-1', 'dakkon_blackblade-2']);
  });
});

describe('@engine Scenario: legendary-creatures-batch-4 -- Tetsuo Umezawa', () => {
  it("can't be the target of Aura spells -- an Aura spell targeting it fizzles and never attaches", () => {
    const tetsuo = makeReadyInstance('tetsuo_umezawa', 'p');
    const aura = makeSpell('aura-1', { id: 'test_aura', name: 'Test Aura', type: 'Enchantment', subtype: 'Aura', color: 'R', cmc: 1, cost: 'R', effect: 'enchantCreature', mod: { power: 1 }, controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [tetsuo], oHand: [aura] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, R: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'aura-1', tgt: tetsuo.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const tetsuoAfter = s2.p.bf.find(c => c.iid === tetsuo.iid);
    expect(tetsuoAfter.enchantments).toEqual([]);
    expect(s2.log[s2.log.length - 1].text).toContain("can't be the target of Aura spells");
  });

  it('can still be targeted by a non-Aura targeted effect (anti-Aura restriction does not overreach)', () => {
    const tetsuo = makeReadyInstance('tetsuo_umezawa', 'p');
    const removal = makeSpell('rem-1', { id: 'test_removal', name: 'Test Removal', type: 'Sorcery', color: 'B', cmc: 1, cost: 'B', effect: 'destroy', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [tetsuo], oHand: [removal] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, B: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'rem-1', tgt: tetsuo.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.some(c => c.iid === tetsuo.iid)).toBe(false);
    expect(s2.p.gy.some(c => c.iid === tetsuo.iid)).toBe(true);
  });

  it('destroyTappedOrBlocking: destroys a target creature that is tapped, and separately one that is blocking', () => {
    const tetsuo1 = makeReadyInstance('tetsuo_umezawa', 'p');
    const tappedTarget = makeCreature('tt-1', { controller: 'o', tapped: true });
    const base1 = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tetsuo1], oBf: [tappedTarget] });
    const funded1 = { ...base1, p: { ...base1.p, mana: { ...base1.p.mana, U: 1, B: 1, R: 1 } } };
    const s1 = duelReducer(funded1, { type: 'ACTIVATE_ABILITY', who: 'p', iid: tetsuo1.iid, tgt: 'tt-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.some(c => c.iid === 'tt-1')).toBe(false);
    expect(s2.o.gy.some(c => c.iid === 'tt-1')).toBe(true);

    const tetsuo2 = makeReadyInstance('tetsuo_umezawa', 'p', { iid: 'tetsuo-2' });
    const blockingTarget = makeCreature('bt-1', { controller: 'o', blocking: 'some-attacker-iid' });
    const base2 = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tetsuo2], oBf: [blockingTarget] });
    const funded2 = { ...base2, p: { ...base2.p, mana: { ...base2.p.mana, U: 1, B: 1, R: 1 } } };
    const s3 = duelReducer(funded2, { type: 'ACTIVATE_ABILITY', who: 'p', iid: tetsuo2.iid, tgt: 'bt-1' });
    const s4 = duelReducer(s3, { type: 'RESOLVE_STACK' });
    expect(s4.o.bf.some(c => c.iid === 'bt-1')).toBe(false);
    expect(s4.o.gy.some(c => c.iid === 'bt-1')).toBe(true);
  });

  it('destroyTappedOrBlocking: fizzles against a creature that is neither tapped nor blocking', () => {
    const tetsuo = makeReadyInstance('tetsuo_umezawa', 'p');
    const bystander = makeCreature('by-1', { controller: 'o', tapped: false, blocking: null });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tetsuo], oBf: [bystander] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, U: 1, B: 1, R: 1 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: tetsuo.iid, tgt: 'by-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.some(c => c.iid === 'by-1')).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-batch-4 -- card data and registration', () => {
  it('all four cards have correct printed card data', () => {
    const evangela = makeCardInstance('lady_evangela', 'p');
    expect(evangela.type).toBe('Legendary Creature');
    expect(evangela.subtype).toBe('Human Cleric');
    expect(evangela.cost).toBe('WUB');
    expect(evangela.cmc).toBe(3);
    expect(evangela.power).toBe(1);
    expect(evangela.toughness).toBe(2);

    const angus = makeCardInstance('angus_mackenzie', 'p');
    expect(angus.type).toBe('Legendary Creature');
    expect(angus.subtype).toBe('Human Cleric');
    expect(angus.cost).toBe('GWU');
    expect(angus.cmc).toBe(3);
    expect(angus.power).toBe(2);
    expect(angus.toughness).toBe(2);

    const dakkon = makeCardInstance('dakkon_blackblade', 'p');
    expect(dakkon.type).toBe('Legendary Creature');
    expect(dakkon.subtype).toBe('Human Warrior');
    expect(dakkon.cost).toBe('2WUUB');
    expect(dakkon.cmc).toBe(6);

    const tetsuo = makeCardInstance('tetsuo_umezawa', 'p');
    expect(tetsuo.type).toBe('Legendary Creature');
    expect(tetsuo.subtype).toBe('Human Archer');
    expect(tetsuo.cost).toBe('UBR');
    expect(tetsuo.cmc).toBe(3);
    expect(tetsuo.power).toBe(3);
    expect(tetsuo.toughness).toBe(3);
    expect(tetsuo.cantBeTargetOfAuraSpells).toBe(true);
  });

  it('destroyTappedOrBlocking and preventCombatDamageDealtTarget are registered in BOTH CREATURE_ONLY_TARGET_EFFECTS and ACTIVATE_TARGET_EFFECTS (the exact split-registration gap flagged from a prior batch)', () => {
    expect(CREATURE_ONLY_TARGET_EFFECTS.has('destroyTappedOrBlocking')).toBe(true);
    expect(ACTIVATE_TARGET_EFFECTS.has('destroyTappedOrBlocking')).toBe(true);
    expect(CREATURE_ONLY_TARGET_EFFECTS.has('preventCombatDamageDealtTarget')).toBe(true);
    expect(ACTIVATE_TARGET_EFFECTS.has('preventCombatDamageDealtTarget')).toBe(true);
  });
});
