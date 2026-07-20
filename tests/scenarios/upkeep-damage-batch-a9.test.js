// tests/scenarios/upkeep-damage-batch-a9.test.js
// A9 upkeep-trigger batch: Serendib Efreet, Cursed Land, Copper Tablet,
// Storm World, The Fallen. See docs/CURRENT_SPRINT.md / docs/MECHANICS_INDEX.md
// for the full batch. This file covers the pure-damage upkeep effects; see
// upkeep-sacrifice-batch-a9.test.js and upkeep-delayed-and-control-a9.test.js
// for the sacrifice/control-transfer/delayed-token cards in the same batch.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function advanceUntil(state, predicate, maxSteps = 20) {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    if (predicate(s)) return s;
  }
  throw new Error('advanceUntil: predicate never satisfied within maxSteps');
}

function makeSerendibEfreet(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'serendib_efreet', name: 'Serendib Efreet', type: 'Creature', subtype: 'Efreet',
    color: 'U', cmc: 3, cost: '2U', power: 3, toughness: 4, keywords: [],
    upkeep: 'selfDamage1', controller: 'p',
    ...overrides,
  });
}

function makeCopperTablet(iid, overrides = {}) {
  return {
    iid, id: 'copper_tablet', name: 'Copper Tablet', type: 'Artifact', color: '',
    cmc: 2, cost: '2', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], controller: 'p',
    ...overrides,
  };
}

function makeStormWorld(iid, overrides = {}) {
  return {
    iid, id: 'storm_world', name: 'Storm World', type: 'Enchantment', color: 'R',
    cmc: 1, cost: 'R', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], controller: 'p',
    ...overrides,
  };
}

function makeTheFallen(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'the_fallen', name: 'The Fallen', type: 'Creature', subtype: 'Zombie',
    color: 'B', cmc: 4, cost: '1BBB', power: 2, toughness: 3, keywords: [],
    upkeep: 'theFallenUpkeep', controller: 'o',
    triggeredAbilities: [{ id: 'the_fallen_record_damage', trigger: { event: 'ON_PLAYER_DAMAGED' }, condition: { type: 'selfIsPlayerDamageSource' }, effect: { type: 'theFallenRecordDamage' } }],
    ...overrides,
  });
}

function makeHand(count) {
  return Array.from({ length: count }, (_, i) => makeLand(`hand-${i}`));
}

describe('@engine Scenario: upkeep-damage-batch-a9 -- pure-damage upkeep triggers', () => {

  it('Serendib Efreet: deals 1 damage to its controller at their upkeep', () => {
    const efreet = makeSerendibEfreet('efreet-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [efreet] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP

    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.p.life).toBe(19);
  });

  it('Cursed Land: enchanted land deals 1 damage to that land\'s controller at their upkeep, regardless of who controls the Aura', () => {
    const land = makeLand('land-1', { controller: 'o', enchantments: [{ name: 'Cursed Land' }] });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [land] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)

    expect(s1.o.life).toBe(19);
  });

  it('Cursed Land: does not fire on the non-enchanted-land-controller\'s upkeep', () => {
    const land = makeLand('land-1', { controller: 'o', enchantments: [{ name: 'Cursed Land' }] });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', oBf: [land] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (p's upkeep)

    expect(s1.p.life).toBe(20);
    expect(s1.o.life).toBe(20);
  });

  it('Copper Tablet: deals 1 damage to whichever player\'s upkeep is currently active', () => {
    const tablet = makeCopperTablet('tablet-1', { controller: 'p' });
    const stateOUpkeep = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [tablet] });

    const s1 = duelReducer(stateOUpkeep, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)
    expect(s1.o.life).toBe(19);
    expect(s1.p.life).toBe(20);
  });

  it('Copper Tablet: fires again on the OTHER player\'s upkeep too (a single permanent affects both players over the game)', () => {
    const tablet = makeCopperTablet('tablet-1', { controller: 'p' });
    let state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [tablet] });
    state = { ...state, p: { ...state.p, lib: makeHand(10) }, o: { ...state.o, lib: makeHand(10) } };

    const s1 = advanceUntil(state, s => s.phase === PHASE.UPKEEP && s.active === 'p');

    expect(s1.p.life).toBe(19);
  });

  it('Storm World: damage scales with 4 minus the active player\'s hand size', () => {
    const stormWorld = makeStormWorld('storm-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [stormWorld], oHand: makeHand(1) });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)

    expect(s1.o.life).toBe(17); // 4 - 1 = 3 damage
  });

  it('Storm World: no damage when the active player already holds 4 or more cards', () => {
    const stormWorld = makeStormWorld('storm-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [stormWorld], pHand: makeHand(4) });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (p's upkeep)

    expect(s1.p.life).toBe(20);
  });

  it('The Fallen: deals no damage before it has ever dealt damage to its opponent', () => {
    const fallen = makeTheFallen('fallen-1', { controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [fallen] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)

    expect(s1.p.life).toBe(20);
  });

  it('The Fallen: deals 1 damage to the opponent it has already dealt damage to this game', () => {
    const fallen = makeTheFallen('fallen-1', { controller: 'o', hasDamagedPlayers: { p: true } });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [fallen] });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)

    expect(s1.p.life).toBe(19);
  });

  it('The Fallen: records damage from an unblocked attack, then deals 1 more damage on each subsequent upkeep', () => {
    const fallen = makeTheFallen('fallen-1', { controller: 'o' });
    let state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [fallen] });
    state = { ...state, p: { ...state.p, lib: makeHand(20) }, o: { ...state.o, lib: makeHand(20) } };

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'fallen-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves (2 damage, unblocked)

    expect(s5.p.life).toBe(18);
    expect(s5.o.bf.find(c => c.iid === 'fallen-1')?.hasDamagedPlayers?.p).toBe(true);

    // Advance all the way to o's next upkeep -- The Fallen should ping p for 1 more.
    const s6 = advanceUntil(s5, s => s.phase === PHASE.UPKEEP && s.active === 'o', 40);
    expect(s6.p.life).toBe(17);

    // And it persists into the turn after that too.
    const s7 = advanceUntil(s6, s => s.phase === PHASE.UPKEEP && s.active === 'o', 40);
    expect(s7.p.life).toBe(16);
  });

});
