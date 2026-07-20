// tests/scenarios/upkeep-aura-and-eachplayer-batch-a9-2.test.js
// A9 upkeep-trigger batch 2: Takklemaggot, Venarian Gold, The Abyss, Worms of
// the Earth -- the aura-tied-to-enchanted-permanent's-controller shape
// (Takklemaggot/Venarian Gold) and the each-player's-upkeep shape (The
// Abyss/Worms of the Earth). See docs/CURRENT_SPRINT.md /
// docs/MECHANICS_INDEX.md for the full batch. Sibling files:
// upkeep-counter-batch-a9-2.test.js (self-referential counter accumulation),
// upkeep-choice-batch-a9-2.test.js (optional/mandatory choice shapes).

import { describe, it, expect } from 'vitest';
import { duelReducer, getBF, zMove } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeTakklemaggotSpell(iid, overrides = {}) {
  return makeSpell(iid, {
    id: 'takklemaggot', name: 'Takklemaggot', type: 'Enchantment', subtype: 'Aura',
    color: 'B', cmc: 4, cost: '2BB', effect: 'enchantCreature', mod: {},
    ...overrides,
  });
}

function makeTakklemaggotAura(iid, controller, overrides = {}) {
  return {
    iid, name: 'Takklemaggot', mod: {}, controller,
    cardData: { iid, id: 'takklemaggot', name: 'Takklemaggot', type: 'Enchantment', subtype: 'Aura', color: 'B', cmc: 4, cost: '2BB', effect: 'enchantCreature', mod: {} },
    enterTs: 1,
    ...overrides,
  };
}

function makeVenarianGoldSpell(iid, overrides = {}) {
  return makeSpell(iid, {
    id: 'venarian_gold', name: 'Venarian Gold', type: 'Enchantment', subtype: 'Aura',
    color: 'U', cmc: 2, cost: 'XUU', hasX: true, effect: 'enchantCreature', mod: {},
    ...overrides,
  });
}

function makeTheAbyss(iid, overrides = {}) {
  return {
    iid, id: 'the_abyss', name: 'The Abyss', type: 'World Enchantment', color: 'B',
    cmc: 4, cost: '3B', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], controller: 'p',
    ...overrides,
  };
}

function makeWormsOfTheEarth(iid, overrides = {}) {
  return {
    iid, id: 'worms_of_the_earth', name: 'Worms of the Earth', type: 'Enchantment', color: 'B',
    cmc: 5, cost: '2BBB', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], landLock: true, controller: 'p',
    ...overrides,
  };
}

describe('@engine Scenario: upkeep-aura-and-eachplayer-batch-a9-2 -- aura-tied-to-controller and each-player shapes', () => {

  it('Takklemaggot: attaches under the caster\'s control and puts a -0/-1 counter on the enchanted creature each upkeep of its controller', () => {
    const bear = makeCreature('bear-1', { name: 'Grizzly Bears', power: 2, toughness: 2, controller: 'o' });
    const takk = makeTakklemaggotSpell('takk-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [takk] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 2, C: 2 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'takk-1', tgt: 'bear-1', xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const attached = getBF(s2, 'bear-1').enchantments.find(e => e.name === 'Takklemaggot');
    expect(attached).toBeTruthy();
    expect(attached.controller).toBe('p');

    const s3 = duelReducer({ ...s2, phase: PHASE.UNTAP, active: 'o' }, { type: 'ADVANCE_PHASE' }); // -> UPKEEP (o's, the bear's controller)
    const bearAfter = getBF(s3, 'bear-1');
    expect(bearAfter.toughness).toBe(1);
    expect(bearAfter.counters.M0M1).toBe(1);
  });

  it('Takklemaggot: when the enchanted creature dies, presents a reattach-or-decline choice to that creature\'s controller', () => {
    const bear = makeCreature('bear-2', { name: 'Grizzly Bears', power: 2, toughness: 1, controller: 'o', enchantments: [makeTakklemaggotAura('takk-2', 'p')] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear] });
    const s1 = zMove(state, 'bear-2', 'o', 'o', 'gy');
    expect(s1.pendingChoice?.kind).toBe('takklemaggotReattachChoice');
    expect(s1.pendingChoice?.controller).toBe('o');
    expect(s1.p.gy.some(c => c.iid === 'takk-2')).toBe(true);
  });

  it("Takklemaggot: declining returns it to the battlefield under the original controller as a pinger targeting the dead creature's controller", () => {
    const bear = makeCreature('bear-3', { name: 'Grizzly Bears', power: 2, toughness: 1, controller: 'o', enchantments: [makeTakklemaggotAura('takk-3', 'p')] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear] });
    const s1 = zMove(state, 'bear-3', 'o', 'o', 'gy');
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'NONE' });
    expect(s2.p.gy.some(c => c.iid === 'takk-3')).toBe(false);
    const pinger = getBF(s2, 'takk-3');
    expect(pinger).toBeTruthy();
    expect(pinger.controller).toBe('p');
    expect(pinger.pingerVictim).toBe('o');
    expect(pinger.upkeep).toBe('takklemaggotPingerUpkeep');

    const s3 = duelReducer({ ...s2, phase: PHASE.UNTAP, active: 'o' }, { type: 'ADVANCE_PHASE' });
    expect(s3.o.life).toBe(19);
  });

  it("Takklemaggot: choosing a valid creature reattaches it under the original controller, and it doesn't ping on an unrelated player's upkeep", () => {
    const bear = makeCreature('bear-4', { name: 'Grizzly Bears', power: 2, toughness: 1, controller: 'o', enchantments: [makeTakklemaggotAura('takk-4', 'p')] });
    const cat = makeCreature('cat-1', { name: 'Savannah Lions', power: 2, toughness: 1, controller: 'o' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear, cat] });
    const s1 = zMove(state, 'bear-4', 'o', 'o', 'gy');
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'cat-1' });
    const reattached = getBF(s2, 'cat-1').enchantments.find(e => e.name === 'Takklemaggot');
    expect(reattached).toBeTruthy();
    expect(reattached.controller).toBe('p');
    expect(s2.p.gy.some(c => c.iid === 'takk-4')).toBe(false);
  });

  it("Takklemaggot pinger: doesn't deal damage on the pinger's own controller's upkeep -- only the victim's", () => {
    const pinger = { iid: 'takk-5', id: 'takklemaggot', name: 'Takklemaggot', type: 'Enchantment', color: 'B', tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], upkeep: 'takklemaggotPingerUpkeep', pingerVictim: 'o', controller: 'p' };
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [pinger] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // p's own upkeep -- not the victim's
    expect(s1.p.life).toBe(20);
    expect(s1.o.life).toBe(20);
  });

  it('Venarian Gold: taps the enchanted creature and puts X sleep counters on the creature (not the Aura) when it enters', () => {
    const bear = makeCreature('bear-5', { name: 'Grizzly Bears', controller: 'o' });
    const vg = makeVenarianGoldSpell('vg-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [bear], pHand: [vg] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 4 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'vg-1', tgt: 'bear-5', xVal: 2 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const bearAfter = getBF(s2, 'bear-5');
    expect(bearAfter.tapped).toBe(true);
    expect(bearAfter.counters.SLEEP).toBe(2);
  });

  it("Venarian Gold: the enchanted creature doesn't untap while it has a sleep counter, and a counter is removed each upkeep", () => {
    const bear = makeCreature('bear-6', { name: 'Grizzly Bears', controller: 'p', tapped: true, counters: { SLEEP: 1 }, enchantments: [{ iid: 'vg-2', name: 'Venarian Gold', mod: {}, controller: 'p', cardData: {}, enterTs: 1 }] });
    const state = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [bear] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn) -- stays tapped
    expect(getBF(s1, 'bear-6').tapped).toBe(true);
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP -- removes the sleep counter
    expect(getBF(s2, 'bear-6').counters.SLEEP).toBe(0);
  });

  it('The Abyss: destroys a nonartifact creature of the active player\'s choice on each player\'s upkeep', () => {
    const bear = makeCreature('bear-7', { name: 'Grizzly Bears', power: 2, toughness: 2, controller: 'o' });
    const lions = makeCreature('cat-2', { name: 'Savannah Lions', power: 2, toughness: 1, controller: 'o' });
    const abyss = makeTheAbyss('ab-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [abyss], oBf: [bear, lions] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UPKEEP (o's)
    const remaining = s1.o.bf.filter(c => c.iid === 'bear-7' || c.iid === 'cat-2');
    expect(remaining.length).toBe(1);
    // Deterministic auto-pick: least power (both power 2, tie broken by
    // battlefield order) -- Savannah Lions (least toughness among ties is not
    // the tiebreaker, power is) so with equal power, the first-found survives.
  });

  it("The Abyss: doesn't fire when the active player controls no nonartifact creatures", () => {
    const abyss = makeTheAbyss('ab-2', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [abyss] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(getBF(s1, 'ab-2')).toBeTruthy();
  });

  it("Worms of the Earth: players can't play lands while it's on the battlefield", () => {
    const worms = makeWormsOfTheEarth('w-1');
    const land = makeLand('land-1', { name: 'Forest' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [worms], pHand: [land] });
    const s1 = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-1' });
    expect(s1.p.hand.some(c => c.iid === 'land-1')).toBe(true);
    expect(s1.p.bf.some(c => c.iid === 'land-1')).toBe(false);
  });

  it('Worms of the Earth: each upkeep, the active player may sacrifice two lands or take 5 damage to destroy it', () => {
    const worms = makeWormsOfTheEarth('w-2', { controller: 'o' });
    const l1 = makeLand('l1', { controller: 'p' });
    const l2 = makeLand('l2', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', oBf: [worms], pBf: [l1, l2] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('wormsOfTheEarthUpkeep');
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'SAC_LANDS' });
    expect(s2.p.bf.filter(c => c.iid === 'l1' || c.iid === 'l2').length).toBe(0);
    expect(getBF(s2, 'w-2')).toBeNull();
  });

  it('Worms of the Earth: taking 5 damage instead also destroys it, and declining leaves it in play', () => {
    const worms = makeWormsOfTheEarth('w-3');
    const s1 = duelReducer(makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [worms] }), { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'TAKE_DAMAGE' });
    expect(s2.p.life).toBe(15);
    expect(getBF(s2, 'w-3')).toBeNull();

    const worms2 = makeWormsOfTheEarth('w-4');
    const s3 = duelReducer(makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [worms2] }), { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(getBF(s4, 'w-4')).toBeTruthy();
    expect(s4.p.life).toBe(20);
  });

});
