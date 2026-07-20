// tests/scenarios/upkeep-delayed-and-control-a9.test.js
// A9 upkeep-trigger batch: Hazezon Tamar (delayed upkeep tokens), Rohgahh of
// Kher Keep (named anthem + upkeep control transfer), Mana Vortex's
// each-player's-upkeep land sacrifice. See docs/CURRENT_SPRINT.md /
// docs/MECHANICS_INDEX.md for the full batch. This file covers the
// delayed-token and control-transfer cards; see upkeep-damage-batch-a9.test.js
// and upkeep-sacrifice-batch-a9.test.js for the rest of the batch.

import { describe, it, expect } from 'vitest';
import { duelReducer, getPow, getTou } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

function makeHazezonTamar(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'hazezon_tamar', name: 'Hazezon Tamar', type: 'Legendary Creature', subtype: 'Human Warrior',
    color: 'RGW', cmc: 7, cost: '4RGW', power: 2, toughness: 4, keywords: [],
    effect: 'hazezonTamarEtb',
    triggeredAbilities: [{ id: 'hazezon_tamar_leaves', trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' }, effect: { type: 'hazezonTamarExileSandWarriors' } }],
    controller: 'p',
    ...overrides,
  });
}

function makeSandWarrior(iid, sourceIid, overrides = {}) {
  return makeCreature(iid, {
    tokenId: 'sand_warrior', name: 'Sand Warrior', type: 'Creature', subtype: 'Warrior',
    color: 'RGW', power: 1, toughness: 1, keywords: [], isToken: true, sourceIid,
    controller: 'p',
    ...overrides,
  });
}

function makeRohgahh(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'rohgahh_of_kher_keep', name: 'Rohgahh of Kher Keep', type: 'Legendary Creature', subtype: 'Kobold',
    color: 'BR', cmc: 6, cost: '2BBRR', power: 5, toughness: 5, keywords: [],
    upkeep: 'rohgahhUpkeep', anthemNamed: { cardName: 'Kobolds of Kher Keep', power: 2, toughness: 2 },
    controller: 'p',
    ...overrides,
  });
}

function makeKobold(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'kobolds_of_kher_keep', name: 'Kobolds of Kher Keep', type: 'Creature', subtype: 'Kobold',
    color: 'R', cmc: 0, cost: '0', power: 0, toughness: 1, keywords: [],
    controller: 'p',
    ...overrides,
  });
}

function makeManaVortex(iid, overrides = {}) {
  return {
    iid, id: 'mana_vortex', name: 'Mana Vortex', type: 'Enchantment', color: 'U', cmc: 3, cost: '1UU',
    keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    additionalCost: { type: 'sacrificeLand' }, controller: 'p',
    ...overrides,
  };
}

function makeDestroySpell(iid, overrides = {}) {
  return makeSpell(iid, { id: 'test_destroy', name: 'Test Destroy', type: 'Instant', color: 'B', cmc: 1, cost: 'B', effect: 'destroy', ...overrides });
}

describe('@engine Scenario: upkeep-delayed-and-control-a9 -- delayed tokens, named anthems, control transfer', () => {

  it('Hazezon Tamar: token count is locked in at ETB resolution, not recomputed at the later upkeep', () => {
    const hazezon = makeHazezonTamar('haz-1');
    const land1 = makeLand('land-1', { controller: 'p' });
    const land2 = makeLand('land-2', { controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [hazezon], pBf: [land1, land2] });
    state = { ...state, p: { ...state.p, mana: { W: 1, U: 0, B: 0, R: 1, G: 1, C: 4 } } };

    // Cast Hazezon Tamar while controlling 2 lands -- the pending token count
    // should lock in at 2 right here, at ETB resolution.
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'haz-1', tgt: null, xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingUpkeepTokens).toEqual([{ tokenId: 'sand_warrior', count: 2, controller: 'p', sourceIid: 'haz-1' }]);

    // Lose a land AFTER Hazezon resolved but BEFORE the upkeep fires --
    // the eventual token count must still be 2, not recomputed down to 1.
    const s3 = { ...s2, phase: PHASE.UNTAP, p: { ...s2.p, bf: s2.p.bf.filter(c => c.iid !== 'land-2') } };
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP, drains pendingUpkeepTokens

    const warriors = s4.p.bf.filter(c => c.tokenId === 'sand_warrior');
    expect(warriors).toHaveLength(2);
    expect(s4.pendingUpkeepTokens).toEqual([]);
  });

  it('Hazezon Tamar: leaving the battlefield exiles all of its Sand Warrior tokens', () => {
    const hazezon = makeHazezonTamar('haz-1');
    const w1 = makeSandWarrior('sw-1', 'haz-1');
    const w2 = makeSandWarrior('sw-2', 'haz-1');
    const otherToken = makeSandWarrior('sw-3', 'some-other-source'); // not linked to this Hazezon
    const destroySpell = makeDestroySpell('destroy-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [destroySpell], pBf: [hazezon, w1, w2, otherToken] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'destroy-1', tgt: 'haz-1', xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.bf.some(c => c.iid === 'haz-1')).toBe(false);
    expect(s2.p.bf.some(c => c.iid === 'sw-1')).toBe(false);
    expect(s2.p.bf.some(c => c.iid === 'sw-2')).toBe(false);
    // Sand Warriors from a DIFFERENT source are untouched.
    expect(s2.p.bf.some(c => c.iid === 'sw-3')).toBe(true);
  });

  it('Rohgahh of Kher Keep: anthemNamed grants +2/+2 to creatures named Kobolds of Kher Keep the same controller controls', () => {
    const rohgahh = makeRohgahh('rohgahh-1');
    const kobold = makeKobold('kobold-1', { controller: 'p' });
    const oppKobold = makeKobold('kobold-2', { controller: 'o' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [rohgahh, kobold], oBf: [oppKobold] });

    const boostedKobold = state.p.bf.find(c => c.iid === 'kobold-1');
    const unboostedOppKobold = state.o.bf.find(c => c.iid === 'kobold-2');
    expect(getPow(boostedKobold, state)).toBe(2); // 0 + 2
    expect(getTou(boostedKobold, state)).toBe(3); // 1 + 2
    // Opponent's same-named creature is untouched -- "creatures YOU control".
    expect(getPow(unboostedOppKobold, state)).toBe(0);
    expect(getTou(unboostedOppKobold, state)).toBe(1);
  });

  it('Rohgahh of Kher Keep: paying {R}{R}{R} at upkeep keeps it under its controller', () => {
    const rohgahh = makeRohgahh('rohgahh-1');
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [rohgahh] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('rohgahhUpkeep');

    // Mana is added AFTER the phase transition (in response to the queued
    // choice), so it survives to the UPKEEP_CHOICE_RESOLVE dispatch --
    // unlike the direct-switch sacrificeUnless_* idiom, this path isn't
    // subject to the mana-burns-at-every-phase-boundary timing issue.
    const s2 = { ...s1, p: { ...s1.p, mana: { ...s1.p.mana, R: 3 } } };
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });

    expect(s3.p.bf.some(c => c.iid === 'rohgahh-1')).toBe(true);
    expect(s3.o.bf.some(c => c.iid === 'rohgahh-1')).toBe(false);
    expect(s3.p.mana.R).toBe(0);
  });

  it('Rohgahh of Kher Keep: the AI declining to pay taps it and all Kobolds of Kher Keep it controls, then transfers control to the opponent', () => {
    const rohgahh = makeRohgahh('rohgahh-1', { controller: 'o' });
    const kobold = makeKobold('kobold-1', { controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [rohgahh, kobold] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP; AI has 0 red mana, can't pay

    expect(s1.o.bf.some(c => c.iid === 'rohgahh-1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'kobold-1')).toBe(false);
    const movedRohgahh = s1.p.bf.find(c => c.iid === 'rohgahh-1');
    const movedKobold = s1.p.bf.find(c => c.iid === 'kobold-1');
    expect(movedRohgahh).toBeTruthy();
    expect(movedRohgahh.tapped).toBe(true);
    expect(movedKobold).toBeTruthy();
    expect(movedKobold.tapped).toBe(true);
  });

  it('Mana Vortex: each player sacrifices a land on their own upkeep', () => {
    const vortex = makeManaVortex('vortex-1', { controller: 'p' });
    const pLand = makeLand('pland-1', { controller: 'p' });
    const oLand = makeLand('oland-1', { controller: 'o' });
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [vortex, pLand], oBf: [oLand] });
    state = { ...state, p: { ...state.p, lib: makeLandHand(10) }, o: { ...state.o, lib: makeLandHand(10) } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (p's upkeep)
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('manaVortexUpkeep');
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'pland-1' });
    expect(s2.p.bf.some(c => c.iid === 'pland-1')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'pland-1')).toBe(true);

    const s3 = advanceUntil(s2, s => s.phase === PHASE.UPKEEP && s.active === 'o', 40);
    // o's own land is auto-sacrificed by the AI branch -- no oland-1 left.
    expect(s3.o.bf.some(c => c.iid === 'oland-1')).toBe(false);
    expect(s3.o.gy.some(c => c.iid === 'oland-1')).toBe(true);
  });

});

function makeLandHand(count) {
  return Array.from({ length: count }, (_, i) => makeLand(`lib-${i}`));
}

function advanceUntil(state, predicate, maxSteps = 20) {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    if (predicate(s)) return s;
  }
  throw new Error('advanceUntil: predicate never satisfied within maxSteps');
}
