// tests/scenarios/upkeep-sacrifice-batch-a9.test.js
// A9 upkeep-trigger batch: Junún Efreet, Curse Artifact, Serendib Djinn,
// Dance of Many, Forethought Amulet, Mana Vortex's cast-time additional
// cost. See docs/CURRENT_SPRINT.md / docs/MECHANICS_INDEX.md for the full
// batch. This file covers the sacrifice-shaped upkeep effects; see
// upkeep-damage-batch-a9.test.js for the pure-damage cards and
// upkeep-delayed-and-control-a9.test.js for the delayed-token/control-
// transfer cards in the same batch.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

function makeJununEfreet(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'junun_efreet', name: 'Junún Efreet', type: 'Creature', subtype: 'Efreet',
    color: 'B', cmc: 3, cost: '1BB', power: 3, toughness: 3, keywords: [],
    upkeep: 'sacrificeUnless_BB', controller: 'p',
    ...overrides,
  });
}

function makeCurseArtifactHost(iid, overrides = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 2, cost: '2', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [{ name: 'Curse Artifact' }], controller: 'p',
    ...overrides,
  };
}

function makeSerendibDjinn(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'serendib_djinn', name: 'Serendib Djinn', type: 'Creature', subtype: 'Djinn',
    color: 'U', cmc: 4, cost: '2UU', power: 5, toughness: 6, keywords: [],
    upkeep: 'serendibDjinnUpkeep', sacrificeIfNoLands: true, controller: 'o',
    ...overrides,
  });
}

const DANCE_OF_MANY_ITSELF_LEAVES = { id: 'dance_of_many_itself_leaves', trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' }, effect: { type: 'danceOfManyExileToken' } };

function makeDanceOfMany(iid, overrides = {}) {
  return {
    iid, id: 'dance_of_many', name: 'Dance of Many', type: 'Enchantment', color: 'U',
    cmc: 2, cost: 'UU', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], upkeep: 'sacrificeUnless_UU', effect: 'danceOfManyCopy',
    requiresTarget: true, controller: 'p',
    ...overrides,
  };
}

function makeForethoughtAmulet(iid, overrides = {}) {
  return {
    iid, id: 'forethought_amulet', name: 'Forethought Amulet', type: 'Artifact', color: '',
    cmc: 5, cost: '5', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], upkeep: 'sacrificeUnless_3',
    damageReplacement: { sourceTypes: ['spell'], minAmount: 3, replaceWith: 2 },
    controller: 'p',
    ...overrides,
  };
}

function makeManaVortex(iid, overrides = {}) {
  return makeSpell(iid, {
    id: 'mana_vortex', name: 'Mana Vortex', type: 'Enchantment', color: 'U', cmc: 3, cost: '1UU',
    additionalCost: { type: 'sacrificeLand' },
    ...overrides,
  });
}

describe('@engine Scenario: upkeep-sacrifice-batch-a9 -- sacrifice-shaped upkeep triggers', () => {

  it('Junún Efreet: still sacrificed even when {B}{B} was pre-loaded before the transition (mana burns to zero at the same phase boundary first -- same documented behavior as Nicol Bolas/Palladia-Mors/Vaevictis Asmadi, whose shape sacrificeUnless_BB copies verbatim)', () => {
    const efreet = makeJununEfreet('efreet-1');
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [efreet] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 2 } } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP

    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s1.p.bf.some(c => c.iid === 'efreet-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'efreet-1')).toBe(true);
  });

  it("Junún Efreet: failing to pay {B}{B} at upkeep sacrifices it", () => {
    const efreet = makeJununEfreet('efreet-1');
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [efreet] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP

    expect(s1.p.bf.some(c => c.iid === 'efreet-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'efreet-1')).toBe(true);
  });

  it('Curse Artifact: human sacrifice branch destroys the enchanted artifact, no damage', () => {
    const art = makeCurseArtifactHost('art-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [art] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('curseArtifactUpkeep');

    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'SACRIFICE' });

    expect(s2.p.bf.some(c => c.iid === 'art-1')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'art-1')).toBe(true);
    expect(s2.p.life).toBe(20);
  });

  it('Curse Artifact: human damage branch keeps the artifact and deals 2 damage', () => {
    const art = makeCurseArtifactHost('art-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [art] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'TAKE_DAMAGE' });

    expect(s2.p.bf.some(c => c.iid === 'art-1')).toBe(true);
    expect(s2.p.life).toBe(18);
  });

  it('Serendib Djinn: AI sacrifices its only land (an Island) and takes 3 damage', () => {
    const djinn = makeSerendibDjinn('djinn-1', { controller: 'o' });
    const island = makeLand('isl-1', { name: 'Island', subtype: 'Island', controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [djinn, island] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP

    expect(s1.o.bf.some(c => c.iid === 'isl-1')).toBe(false);
    expect(s1.o.life).toBe(17);
    expect(s1.o.bf.some(c => c.iid === 'djinn-1')).toBe(true);
  });

  it('Serendib Djinn: AI prefers sacrificing a non-Island land and takes no damage', () => {
    const djinn = makeSerendibDjinn('djinn-1', { controller: 'o' });
    const island = makeLand('isl-1', { name: 'Island', subtype: 'Island', controller: 'o' });
    const forest = makeLand('for-1', { name: 'Forest', subtype: 'Forest', controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [djinn, island, forest] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP

    expect(s1.o.bf.some(c => c.iid === 'for-1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'isl-1')).toBe(true);
    expect(s1.o.life).toBe(20);
  });

  it('Serendib Djinn: controlling zero lands auto-sacrifices it at the end step', () => {
    const djinn = makeSerendibDjinn('djinn-1', { controller: 'o' });
    const state = makeState({ phase: PHASE.END, active: 'o', oBf: [djinn] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP

    expect(s1.o.bf.some(c => c.iid === 'djinn-1')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 'djinn-1')).toBe(true);
  });

  it('Dance of Many: casting it creates a token copy of the targeted nontoken creature', () => {
    const bear = makeCreature('bear-1', { name: 'Grizzly Bears', controller: 'o' });
    const dom = makeDanceOfMany('dom-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [dom], oBf: [bear] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 2 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'dom-1', tgt: 'bear-1', xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const domOnBf = s2.p.bf.find(c => c.id === 'dance_of_many');
    expect(domOnBf).toBeTruthy();
    expect(domOnBf.linkedTokenIid).toBeTruthy();
    const token = s2.p.bf.find(c => c.iid === domOnBf.linkedTokenIid);
    expect(token).toBeTruthy();
    expect(token.name).toBe('Grizzly Bears');
    expect(token.isToken).toBe(true);
  });

  it('Dance of Many: if the linked token is already gone, it is sacrificed at its controller\'s next upkeep', () => {
    const dom = makeDanceOfMany('dom-1', { linkedTokenIid: 'long-gone-token' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dom] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP

    expect(s1.p.bf.some(c => c.iid === 'dom-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'dom-1')).toBe(true);
  });

  it('Dance of Many: when it leaves the battlefield, the linked token is exiled', () => {
    const token = { iid: 'tok-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G', power: 2, toughness: 2, keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], isToken: true, sourceIid: 'dom-1', controller: 'p' };
    const dom = makeDanceOfMany('dom-1', { linkedTokenIid: 'tok-1', triggeredAbilities: [DANCE_OF_MANY_ITSELF_LEAVES] });
    // No U mana available -- sacrificeUnless_UU fails and Dance of Many is sacrificed.
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dom, token] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP

    expect(s1.p.bf.some(c => c.iid === 'dom-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'dom-1')).toBe(true);
    // The token is a token, so it vanishes on leaving rather than landing in gy/exile.
    expect(s1.p.bf.some(c => c.iid === 'tok-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'tok-1')).toBe(false);
    expect(s1.p.exile.some(c => c.iid === 'tok-1')).toBe(false);
  });

  it('Forethought Amulet: sacrifice-unless-pay-{3} sacrifices it whether or not mana was pre-loaded (mana burns to zero at the same phase boundary first -- same documented behavior as sacrificeUnless_WW/UBR/BRG/BB above)', () => {
    const amuletPaid = makeForethoughtAmulet('fa-1');
    let statePaid = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [amuletPaid] });
    statePaid = { ...statePaid, p: { ...statePaid.p, mana: { ...statePaid.p.mana, C: 3 } } };
    const s1 = duelReducer(statePaid, { type: 'ADVANCE_PHASE' });
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s1.p.bf.some(c => c.iid === 'fa-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'fa-1')).toBe(true);

    const amuletUnpaid = makeForethoughtAmulet('fa-2');
    const stateUnpaid = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [amuletUnpaid] });
    const s2 = duelReducer(stateUnpaid, { type: 'ADVANCE_PHASE' });
    expect(s2.p.bf.some(c => c.iid === 'fa-2')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'fa-2')).toBe(true);
  });

  it('Forethought Amulet: reduces 3+ damage from an instant/sorcery source to 2, but leaves other sources untouched', () => {
    const amulet = makeForethoughtAmulet('fa-1');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [amulet] });
    const state = { ...base, p: { ...base.p, life: 20 } };

    const s1 = hurt(state, 'p', 5, 'Test Bolt', { sourceIid: 'bolt-1', sourceType: 'spell' });
    expect(s1.p.life).toBe(18); // reduced to 2, not the full 5

    const s2 = hurt(state, 'p', 5, 'Attacking Creature', { sourceIid: 'att-1', sourceType: 'creature', combat: true });
    expect(s2.p.life).toBe(15); // creature damage is untouched by the replacement

    const s3 = hurt(state, 'p', 2, 'Small Bolt', { sourceIid: 'bolt-2', sourceType: 'spell' });
    expect(s3.p.life).toBe(18); // below the 3-damage floor -- untouched
  });

  it('Mana Vortex: CAST_SPELL is blocked (countered) when the caster controls zero lands to sacrifice', () => {
    const vortex = makeManaVortex('vortex-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [vortex], pBf: [] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 2, C: 1 } } };

    const after = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'vortex-1', tgt: null, xVal: 1, additionalCostIid: null });

    expect(after).toBe(state); // unchanged reference -- no mutation occurred
    expect(after.stack.length).toBe(0);
  });

});
