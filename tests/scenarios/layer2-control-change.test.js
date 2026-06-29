// tests/scenarios/layer2-control-change.test.js
// Layer 2 (control): Aladdin activated ability, Old Man of the Sea activated ability,
// and Guardian Beast static prevention. Tests conditional control-change with revert.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkDeath } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

// Minimal noncreature artifact (no type: 'Creature' substring).
function makeArtifact(iid, overrides = {}) {
  return {
    iid,
    id: 'mox_sapphire',
    name: 'Mox Sapphire',
    type: 'Artifact',
    subtype: '',
    color: '',
    cmc: 0,
    cost: '0',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'o',
    ...overrides,
  };
}

// Minimal Aladdin card object.
function makeAladdin(iid = 'al-1', ctrl = 'p') {
  return makeCreature(iid, {
    id: 'aladdin',
    name: 'Aladdin',
    type: 'Creature',
    subtype: 'Human Rogue',
    color: 'R',
    cmc: 4,
    power: 1,
    toughness: 1,
    keywords: [],
    controller: ctrl,
  });
}

// Minimal Old Man of the Sea card object.
function makeOldMan(iid = 'om-1', overrides = {}) {
  return makeCreature(iid, {
    id: 'old_man_of_the_sea',
    name: 'Old Man of the Sea',
    type: 'Creature',
    subtype: 'Djinn',
    color: 'U',
    cmc: 3,
    power: 2,
    toughness: 3,
    keywords: [],
    controller: 'p',
    ...overrides,
  });
}

// Minimal Guardian Beast card object.
function makeGuardianBeast(iid = 'gb-1', tapped = false, ctrl = 'o') {
  return makeCreature(iid, {
    id: 'guardian_beast',
    name: 'Guardian Beast',
    type: 'Creature',
    subtype: 'Beast',
    color: 'B',
    cmc: 4,
    power: 2,
    toughness: 4,
    effect: 'guardianBeast',
    keywords: [],
    tapped,
    controller: ctrl,
  });
}

// Build a stack item for an activated ability resolution.
function makeAbilityItem(card, caster, targetIid) {
  return {
    id: 'si-1',
    card,
    caster,
    targets: targetIid ? [targetIid] : [],
    xVal: 1,
    isAbility: true,
  };
}

describe('@engine Scenario: Layer 2 -- Control Change (Aladdin, Old Man, Guardian Beast)', () => {

  // ── Aladdin ────────────────────────────────────────────────────────────────

  it('Aladdin: activating steals the target artifact to caster\'s bf with controlGrant', () => {
    const mox = makeArtifact('mox-1', { controller: 'o' });
    const aladdin = makeAladdin('al-1', 'p');
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [aladdin], oBf: [mox] });
    const item = { ...makeAbilityItem({ ...aladdin, effect: 'aladdinsSteal' }, 'p', 'mox-1') };
    const s = { ...state, stack: [item] };
    const s1 = duelReducer(s, { type: 'RESOLVE_STACK' });

    // Mox moves to caster's bf.
    expect(s1.o.bf.some(c => c.iid === 'mox-1')).toBe(false);
    const stolen = s1.p.bf.find(c => c.iid === 'mox-1');
    expect(stolen).toBeDefined();
    expect(stolen.controller).toBe('p');
    // controlGrant records the granting condition.
    expect(stolen.controlGrant?.grantorIid).toBe('al-1');
    expect(stolen.controlGrant?.grantorController).toBe('o');
    expect(stolen.controlGrant?.condition).toBe('whileGrantorControlled');
  });

  it('Aladdin: stolen artifact reverts to original controller when Aladdin leaves the battlefield', () => {
    // Start with Aladdin already gone from any bf; stolen Mox is still on p's bf.
    const stolenMox = makeArtifact('mox-1', {
      controller: 'p',
      controlGrant: {
        grantorIid: 'al-1',
        grantorController: 'o',
        condition: 'whileGrantorControlled',
      },
    });
    const state = makeState({ pBf: [stolenMox], oBf: [] });
    // checkDeath → checkControlGrants: grantor 'al-1' not on any bf → revert.
    const s1 = checkDeath(state);

    expect(s1.p.bf.some(c => c.iid === 'mox-1')).toBe(false);
    const reverted = s1.o.bf.find(c => c.iid === 'mox-1');
    expect(reverted).toBeDefined();
    expect(reverted.controller).toBe('o');
    expect(reverted.controlGrant).toBeUndefined();
    expect(reverted.tapped).toBe(false);
    expect(reverted.summoningSick).toBe(false);
  });

  // ── Old Man of the Sea ──────────────────────────────────────────────────────

  it('Old Man: steals a creature whose power is <= Old Man\'s power', () => {
    const target = makeCreature('c-1', { controller: 'o', power: 2, toughness: 2 });
    const oldMan = makeOldMan('om-1', { tapped: false });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [oldMan], oBf: [target] });
    const item = { ...makeAbilityItem({ ...oldMan, effect: 'oldManSteal' }, 'p', 'c-1') };
    const s = { ...state, stack: [item] };
    const s1 = duelReducer(s, { type: 'RESOLVE_STACK' });

    expect(s1.o.bf.some(c => c.iid === 'c-1')).toBe(false);
    const stolen = s1.p.bf.find(c => c.iid === 'c-1');
    expect(stolen).toBeDefined();
    expect(stolen.controlGrant?.condition).toBe('whileTappedAndPowerLte');
    expect(stolen.controlGrant?.maxPower).toBe(2);
  });

  it('Old Man: fizzles when target creature power exceeds Old Man\'s power', () => {
    const target = makeCreature('c-1', { controller: 'o', power: 5, toughness: 5 });
    const oldMan = makeOldMan('om-1', { power: 2 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [oldMan], oBf: [target] });
    const item = { ...makeAbilityItem({ ...oldMan, effect: 'oldManSteal' }, 'p', 'c-1') };
    const s = { ...state, stack: [item] };
    const s1 = duelReducer(s, { type: 'RESOLVE_STACK' });

    // Target is still on o's bf; not stolen.
    expect(s1.o.bf.some(c => c.iid === 'c-1')).toBe(true);
    expect(s1.p.bf.some(c => c.iid === 'c-1')).toBe(false);
  });

  it('Old Man: reverts when stolen creature\'s power exceeds Old Man\'s power (SBE pass)', () => {
    // Stolen creature (power 2) is on p's bf; Old Man (power 2) is also on p's bf and tapped.
    // Then the stolen creature receives a buff that pushes its power to 3.
    const stolenCreature = makeCreature('c-1', {
      controller: 'p',
      power: 2,
      toughness: 2,
      controlGrant: {
        grantorIid: 'om-1',
        grantorController: 'o',
        condition: 'whileTappedAndPowerLte',
        maxPower: 2,
      },
    });
    const oldMan = makeOldMan('om-1', { tapped: true, power: 2, controller: 'p' });
    const state = makeState({ pBf: [oldMan, stolenCreature], oBf: [] });

    // Simulate a buff that pushes the stolen creature's power above maxPower.
    // We directly mutate the eotBuff (simulating the result of a pump effect).
    const buffedCreature = { ...stolenCreature, eotBuffs: [{ power: 1, toughness: 0, enterTs: 1 }] };
    const buffedState = {
      ...state,
      p: { ...state.p, bf: [oldMan, buffedCreature] },
    };

    // checkDeath → checkControlGrants evaluates: getPow(stolen, ns) = 3 > maxPower 2 → revert.
    const s1 = checkDeath(buffedState);

    expect(s1.p.bf.some(c => c.iid === 'c-1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'c-1')).toBe(true);
  });

  it('Old Man: stolen creature reverts before Old Man untaps at the start of the active player\'s turn', () => {
    // Setup: it is o's turn at CLEANUP. p controls Old Man (tapped) and has a stolen creature.
    // When ADVANCE_PHASE runs, active switches to p, and p's untap step fires.
    // The pre-untap hook reverts the stolen creature before Old Man untaps.
    const stolenCreature = makeCreature('c-1', {
      controller: 'p',
      power: 1,
      toughness: 1,
      controlGrant: {
        grantorIid: 'om-1',
        grantorController: 'o',
        condition: 'whileTappedAndPowerLte',
        maxPower: 2,
      },
    });
    const oldMan = makeOldMan('om-1', { tapped: true, power: 2, controller: 'p' });
    const state = makeState({
      phase: PHASE.CLEANUP,
      active: 'o', // o's turn is ending; p's turn begins next
      pBf: [oldMan, stolenCreature],
      oBf: [],
    });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });

    // Stolen creature reverts to o before Old Man untaps.
    expect(s1.p.bf.some(c => c.iid === 'c-1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'c-1')).toBe(true);
    // Old Man is now on p's bf and untapped.
    const om = s1.p.bf.find(c => c.iid === 'om-1');
    expect(om).toBeDefined();
    expect(om.tapped).toBe(false);
  });

  // ── Guardian Beast ──────────────────────────────────────────────────────────

  it('Guardian Beast (untapped): Aladdin ability fizzles when targeting a protected noncreature artifact', () => {
    const gb = makeGuardianBeast('gb-1', false, 'o'); // untapped, o controls it
    const mox = makeArtifact('mox-1', { controller: 'o' });
    const aladdin = makeAladdin('al-1', 'p');
    const state = makeState({ pBf: [aladdin], oBf: [gb, mox] });
    const item = { ...makeAbilityItem({ ...aladdin, effect: 'aladdinsSteal' }, 'p', 'mox-1') };
    const s = { ...state, stack: [item] };
    const s1 = duelReducer(s, { type: 'RESOLVE_STACK' });

    // Mox stays on o's bf -- fizzled.
    expect(s1.o.bf.some(c => c.iid === 'mox-1')).toBe(true);
    expect(s1.p.bf.some(c => c.iid === 'mox-1')).toBe(false);
  });

  it('Guardian Beast (tapped): Aladdin ability succeeds on the same noncreature artifact', () => {
    const gb = makeGuardianBeast('gb-1', true, 'o'); // TAPPED, protection lifted
    const mox = makeArtifact('mox-1', { controller: 'o' });
    const aladdin = makeAladdin('al-1', 'p');
    const state = makeState({ pBf: [aladdin], oBf: [gb, mox] });
    const item = { ...makeAbilityItem({ ...aladdin, effect: 'aladdinsSteal' }, 'p', 'mox-1') };
    const s = { ...state, stack: [item] };
    const s1 = duelReducer(s, { type: 'RESOLVE_STACK' });

    // Mox now on p's bf.
    expect(s1.o.bf.some(c => c.iid === 'mox-1')).toBe(false);
    expect(s1.p.bf.some(c => c.iid === 'mox-1')).toBe(true);
  });

  it('Guardian Beast (untapped): enchanting a protected noncreature artifact is prevented', () => {
    const gb = makeGuardianBeast('gb-1', false, 'o');
    const mox = makeArtifact('mox-1', { controller: 'o' });
    // Animate Artifact aura targeting the Mox.
    const animateCard = {
      iid: 'aa-1',
      id: 'animate_artifact',
      name: 'Animate Artifact',
      type: 'Enchantment',
      subtype: 'Aura',
      color: 'U',
      cmc: 4,
      effect: 'enchantCreature',
      mod: { power: 0, toughness: 0 },
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'p',
    };
    const state = makeState({ pBf: [], oBf: [gb, mox] });
    const s = {
      ...state,
      stack: [{ id: 'si-1', card: animateCard, caster: 'p', targets: ['mox-1'], xVal: 1 }],
    };
    const s1 = duelReducer(s, { type: 'RESOLVE_STACK' });

    // The Mox's enchantments[] must NOT contain the aura record.
    const moxOnBf = s1.o.bf.find(c => c.iid === 'mox-1');
    expect(moxOnBf).toBeDefined();
    expect(moxOnBf.enchantments?.length ?? 0).toBe(0);
  });

  it('Guardian Beast (untapped): creature can still be enchanted (GB protects only noncreature artifacts)', () => {
    const gb = makeGuardianBeast('gb-1', false, 'p'); // p controls GB
    const creature = makeCreature('cr-1', { controller: 'p' });
    const flightCard = {
      iid: 'fl-1',
      id: 'flight',
      name: 'Flight',
      type: 'Enchantment',
      subtype: 'Aura',
      color: 'U',
      cmc: 1,
      effect: 'enchantCreature',
      mod: { keywords: ['FLYING'] },
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'p',
    };
    const state = makeState({ pBf: [gb, creature], oBf: [] });
    const s = {
      ...state,
      stack: [{ id: 'si-1', card: flightCard, caster: 'p', targets: ['cr-1'], xVal: 1 }],
    };
    const s1 = duelReducer(s, { type: 'RESOLVE_STACK' });

    // Flight attaches to the creature (GB doesn't protect creatures).
    const cr = s1.p.bf.find(c => c.iid === 'cr-1');
    expect(cr).toBeDefined();
    expect(cr.enchantments?.some(e => e.name === 'Flight')).toBe(true);
  });

});
