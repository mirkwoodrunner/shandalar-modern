// src/engine/__tests__/sphereCycle.test.js
// @engine
// Sphere lifegain cycle: Crystal Rod, Iron Star, Ivory Cup, Wooden Sphere.
// Tests CAST_SPELL trigger detection and SPHERE_TRIGGER_RESOLVE resolution.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { PHASE } from '../phases.js';
import { makePlayerState } from './_factory.js';

// Minimal test state for sphere trigger tests.
function buildState({
  pBf = [],
  oBf = [],
  pHand = [],
  oHand = [],
  pMana = {},
  oMana = {},
  pLife = 20,
  oLife = 20,
  pendingSphereTrigger = null,
} = {}) {
  return {
    phase: PHASE.MAIN_1,
    active: 'p',
    turn: 1,
    landsPlayed: 0,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack: [],
    over: null,
    selCard: null,
    selTgt: null,
    xVal: 1,
    log: [],
    ruleset: {
      startingLife: 20,
      startingHandSize: 7,
      drawOnFirstTurn: false,
      londonMulligan: false,
      deathtouch: true,
      manaBurn: false,
      maxHandSize: 7,
    },
    oppArch: { id: 'KARAG', profileId: 'KARAG' },
    castleMod: null,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    pendingChoice: null,
    pendingUpkeepChoice: null,
    pendingConditionalCounter: null,
    pendingSphereTrigger,
    priorityWindow: false,
    priorityPasser: null,
    manaTapSnapshot: null,
    turnState: { damageLog: [], sengirDamagedIids: [], powerSurgeUntappedCount: 0, attackedThisCombat: [], mustAttackEligible: [], venomTargets: [] },
    triggerQueue: [],
    fogActive: false,
    anteEnabled: false,
    anteP: null,
    anteO: null,
    p: makePlayerState({ bf: pBf, hand: pHand, life: pLife, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pMana } }),
    o: makePlayerState({ bf: oBf, hand: oHand, life: oLife, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...oMana } }),
  };
}

function makeSphereArtifact(id, name, controller = 'p') {
  return {
    iid: `${id}-iid`,
    id,
    name,
    type: 'Artifact',
    color: '',
    cmc: 1,
    cost: '1',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    effect: 'sphereTrigger',
    controller,
  };
}

function makeBlueSpell(iid) {
  return {
    iid,
    id: 'air_elemental',
    name: 'Air Elemental',
    type: 'Creature',
    color: 'U',
    cmc: 5,
    cost: '3UU',
    keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    power: 4, toughness: 4, controller: 'o',
  };
}

function makeRedSpell(iid) {
  return {
    iid,
    id: 'lightning_bolt',
    name: 'Lightning Bolt',
    type: 'Instant',
    color: 'R',
    cmc: 1,
    cost: 'R',
    keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
  };
}

function makeWhiteSpell(iid) {
  return {
    iid,
    id: 'savannah_lions',
    name: 'Savannah Lions',
    type: 'Creature',
    color: 'W',
    cmc: 1,
    cost: 'W',
    keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    power: 2, toughness: 1, controller: 'p',
  };
}

function makeGreenSpell(iid) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    color: 'G',
    cmc: 2,
    cost: '1G',
    keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    power: 2, toughness: 2, controller: 'o',
  };
}

describe('@engine Sphere Lifegain Cycle', () => {

  // SPHERE-01: Crystal Rod on player bf, opponent casts blue -> trigger set for player.
  it('SPHERE-01: Crystal Rod triggers when opponent casts a blue spell', () => {
    const rod = makeSphereArtifact('crystal_rod', 'Crystal Rod', 'p');
    const spell = makeBlueSpell('spell-u1');
    const state = buildState({
      pBf: [rod],
      // opponent casts -- we set active='o' and move spell to o hand
      oHand: [spell],
      pMana: { C: 2 }, // player (sphere controller) has mana to pay
      oMana: { U: 3, C: 3 }, // opponent has mana to cast
    });
    // Opponent is active for their main phase
    const s = { ...state, active: 'o', phase: PHASE.MAIN_1 };

    const result = duelReducer(s, { type: 'CAST_SPELL', who: 'o', iid: 'spell-u1' });

    expect(result.pendingSphereTrigger).not.toBeNull();
    expect(result.pendingSphereTrigger.controller).toBe('p');
    expect(result.pendingSphereTrigger.sphereCardId).toBe('crystal_rod');
    expect(result.pendingSphereTrigger.queue).toHaveLength(0);
  });

  // SPHERE-02: Pay -> lose 1 mana, gain 1 life, trigger cleared.
  it('SPHERE-02: SPHERE_TRIGGER_RESOLVE paid=true deducts mana and grants life', () => {
    const trigger = {
      sphereCardId: 'crystal_rod',
      sphereCardName: 'Crystal Rod',
      controller: 'p',
      queue: [],
    };
    const state = buildState({ pMana: { C: 2 }, pLife: 18, pendingSphereTrigger: trigger });

    const result = duelReducer(state, { type: 'SPHERE_TRIGGER_RESOLVE', paid: true });

    expect(result.pendingSphereTrigger).toBeNull();
    const totalMana = Object.values(result.p.mana).reduce((a, v) => a + v, 0);
    expect(totalMana).toBe(1); // was 2, paid 1
    expect(result.p.life).toBe(19); // was 18, gained 1
  });

  // SPHERE-03: Decline -> no state change except trigger cleared.
  it('SPHERE-03: SPHERE_TRIGGER_RESOLVE paid=false clears trigger without effect', () => {
    const trigger = {
      sphereCardId: 'crystal_rod',
      sphereCardName: 'Crystal Rod',
      controller: 'p',
      queue: [],
    };
    const state = buildState({ pMana: { C: 2 }, pLife: 18, pendingSphereTrigger: trigger });

    const result = duelReducer(state, { type: 'SPHERE_TRIGGER_RESOLVE', paid: false });

    expect(result.pendingSphereTrigger).toBeNull();
    const totalMana = Object.values(result.p.mana).reduce((a, v) => a + v, 0);
    expect(totalMana).toBe(2); // unchanged
    expect(result.p.life).toBe(18); // unchanged
  });

  // SPHERE-04: Crystal Rod present but opponent casts a red spell -> no trigger.
  it('SPHERE-04: Crystal Rod does not trigger on non-blue spells', () => {
    const rod = makeSphereArtifact('crystal_rod', 'Crystal Rod', 'p');
    const spell = makeRedSpell('spell-r1');
    // player casts red spell on their own turn
    const state = buildState({
      pBf: [rod],
      pHand: [spell],
      pMana: { R: 1 },
    });

    const result = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-r1' });

    expect(result.pendingSphereTrigger).toBeNull();
  });

  // SPHERE-05: Crystal Rod controller has 0 mana -> no trigger set.
  it('SPHERE-05: Crystal Rod does not trigger when controller has 0 mana', () => {
    const rod = makeSphereArtifact('crystal_rod', 'Crystal Rod', 'p');
    const spell = makeBlueSpell('spell-u2');
    const state = buildState({
      pBf: [rod],
      oHand: [spell],
      pMana: {}, // player has NO mana
      oMana: { U: 3, C: 3 },
    });
    const s = { ...state, active: 'o', phase: PHASE.MAIN_1 };

    const result = duelReducer(s, { type: 'CAST_SPELL', who: 'o', iid: 'spell-u2' });

    expect(result.pendingSphereTrigger).toBeNull();
  });

  // SPHERE-06: Sphere controller casts their own matching-color spell -> trigger still fires.
  it('SPHERE-06: Crystal Rod triggers when its controller casts a blue spell', () => {
    const rod = makeSphereArtifact('crystal_rod', 'Crystal Rod', 'p');
    const spell = makeBlueSpell('spell-u3');
    const state = buildState({
      pBf: [rod],
      pHand: [spell],
      pMana: { U: 3, C: 3 }, // player has mana to cast AND to pay the trigger
    });

    const result = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-u3' });

    // Player is both caster and sphere controller: trigger still fires.
    expect(result.pendingSphereTrigger).not.toBeNull();
    expect(result.pendingSphereTrigger.controller).toBe('p');
    expect(result.pendingSphereTrigger.sphereCardId).toBe('crystal_rod');
  });

  // Iron Star: red spell triggers
  it('IRON STAR: triggers on red spell cast', () => {
    const star = makeSphereArtifact('iron_star', 'Iron Star', 'p');
    const spell = makeRedSpell('spell-r2');
    const state = buildState({
      pBf: [star],
      pHand: [spell],
      pMana: { R: 2, C: 2 },
    });

    const result = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-r2' });

    expect(result.pendingSphereTrigger).not.toBeNull();
    expect(result.pendingSphereTrigger.sphereCardId).toBe('iron_star');
  });

  // Iron Star: blue spell does not trigger it
  it('IRON STAR: does not trigger on non-red spell', () => {
    const star = makeSphereArtifact('iron_star', 'Iron Star', 'p');
    const spell = makeBlueSpell('spell-u4');
    const state = buildState({
      pBf: [star],
      oHand: [spell],
      pMana: { C: 2 },
      oMana: { U: 3, C: 3 },
    });
    const s = { ...state, active: 'o', phase: PHASE.MAIN_1 };

    const result = duelReducer(s, { type: 'CAST_SPELL', who: 'o', iid: 'spell-u4' });

    expect(result.pendingSphereTrigger).toBeNull();
  });

  // Ivory Cup: white spell triggers
  it('IVORY CUP: triggers on white spell cast', () => {
    const cup = makeSphereArtifact('ivory_cup', 'Ivory Cup', 'p');
    const spell = makeWhiteSpell('spell-w1');
    const state = buildState({
      pBf: [cup],
      pHand: [spell],
      pMana: { W: 2, C: 2 },
    });

    const result = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-w1' });

    expect(result.pendingSphereTrigger).not.toBeNull();
    expect(result.pendingSphereTrigger.sphereCardId).toBe('ivory_cup');
  });

  // Ivory Cup: non-white spell does not trigger
  it('IVORY CUP: does not trigger on non-white spell', () => {
    const cup = makeSphereArtifact('ivory_cup', 'Ivory Cup', 'p');
    const spell = makeGreenSpell('spell-g1');
    const state = buildState({
      pBf: [cup],
      oHand: [spell],
      pMana: { C: 2 },
      oMana: { G: 2, C: 2 },
    });
    const s = { ...state, active: 'o', phase: PHASE.MAIN_1 };

    const result = duelReducer(s, { type: 'CAST_SPELL', who: 'o', iid: 'spell-g1' });

    expect(result.pendingSphereTrigger).toBeNull();
  });

  // Wooden Sphere: green spell triggers
  it('WOODEN SPHERE: triggers on green spell cast', () => {
    const sphere = makeSphereArtifact('wooden_sphere', 'Wooden Sphere', 'p');
    const spell = makeGreenSpell('spell-g2');
    const state = buildState({
      pBf: [sphere],
      oHand: [spell],
      pMana: { C: 2 },
      oMana: { G: 2, C: 2 },
    });
    const s = { ...state, active: 'o', phase: PHASE.MAIN_1 };

    const result = duelReducer(s, { type: 'CAST_SPELL', who: 'o', iid: 'spell-g2' });

    expect(result.pendingSphereTrigger).not.toBeNull();
    expect(result.pendingSphereTrigger.sphereCardId).toBe('wooden_sphere');
  });

  // Wooden Sphere: non-green spell does not trigger
  it('WOODEN SPHERE: does not trigger on non-green spell', () => {
    const sphere = makeSphereArtifact('wooden_sphere', 'Wooden Sphere', 'p');
    const spell = makeRedSpell('spell-r3');
    const state = buildState({
      pBf: [sphere],
      pHand: [spell],
      pMana: { R: 2, C: 2 },
    });

    const result = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-r3' });

    expect(result.pendingSphereTrigger).toBeNull();
  });

  // Multiple spheres: both players have Crystal Rod, blue spell cast -> queue
  it('QUEUE: two Crystal Rods fire in order when a blue spell is cast', () => {
    const pRod = makeSphereArtifact('crystal_rod', 'Crystal Rod', 'p');
    const oRod = { ...makeSphereArtifact('crystal_rod', 'Crystal Rod', 'o'), iid: 'crystal_rod-iid-o' };
    const spell = makeBlueSpell('spell-u5');
    const state = buildState({
      pBf: [pRod],
      oBf: [oRod],
      oHand: [spell],
      pMana: { C: 2 },
      oMana: { U: 3, C: 3 },
    });
    const s = { ...state, active: 'o', phase: PHASE.MAIN_1 };

    const result = duelReducer(s, { type: 'CAST_SPELL', who: 'o', iid: 'spell-u5' });

    // Player's trigger is first (p scanned before o)
    expect(result.pendingSphereTrigger).not.toBeNull();
    expect(result.pendingSphereTrigger.controller).toBe('p');
    // Opponent's trigger is queued
    expect(result.pendingSphereTrigger.queue).toHaveLength(1);
    expect(result.pendingSphereTrigger.queue[0].controller).toBe('o');

    // After resolving first (declined), next trigger becomes active
    const afterFirst = duelReducer(result, { type: 'SPHERE_TRIGGER_RESOLVE', paid: false });
    expect(afterFirst.pendingSphereTrigger).not.toBeNull();
    expect(afterFirst.pendingSphereTrigger.controller).toBe('o');
    expect(afterFirst.pendingSphereTrigger.queue).toHaveLength(0);

    // After resolving second, cleared
    const afterSecond = duelReducer(afterFirst, { type: 'SPHERE_TRIGGER_RESOLVE', paid: false });
    expect(afterSecond.pendingSphereTrigger).toBeNull();
  });

  // ADVANCE_PHASE is blocked while pendingSphereTrigger is set
  it('ADVANCE_PHASE is blocked while pendingSphereTrigger is set', () => {
    const trigger = {
      sphereCardId: 'crystal_rod',
      sphereCardName: 'Crystal Rod',
      controller: 'p',
      queue: [],
    };
    const state = buildState({ pendingSphereTrigger: trigger });
    const phaseBefore = state.phase;

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(phaseBefore); // phase did not advance
  });

});
