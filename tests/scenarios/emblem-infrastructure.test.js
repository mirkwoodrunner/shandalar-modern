// tests/scenarios/emblem-infrastructure.test.js
// Shared "outlives its source" emblem infrastructure: state.p/o.emblems,
// consumed by layers.js collectEffects (Layer 4/6/7a) and DuelCore.js
// emitEvent/resolveTrigger/CLEANUP. See docs/MECHANICS_INDEX.md.
// Card-specific behavior (Titania's Song, Cyclopean Tomb) is covered by
// tests/scenarios/titanias-song.test.js and tests/scenarios/cyclopean-tomb.test.js.

import { describe, it, expect } from 'vitest';
import { buildDuelState, duelReducer } from '../../src/engine/DuelCore.js';
import { computeCharacteristics } from '../../src/engine/layers.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import RULESETS from '../../src/data/rulesets.js';

function makeTestArtifact(iid, overrides = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 3, cost: '3', keywords: [], protection: [], tapped: false, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    ...overrides,
  };
}

describe('@engine-card-scenarios-4 Scenario: emblem infrastructure (shared)', () => {

  it('EMB-01: buildDuelState initializes emblems:[] for both players', () => {
    const pDeckIds = Array(8).fill('forest');
    const state = buildDuelState(pDeckIds, 'RED_BURN', RULESETS.CLASSIC, null, null, false, null);
    expect(state.p.emblems).toEqual([]);
    expect(state.o.emblems).toEqual([]);
  });

  it('EMB-02: collectEffects reads globalTypeEffect from an injected emblem and applies Layer 4', () => {
    const art = makeTestArtifact('art-1');
    const emblem = { id: 'em1', controller: 'p', duration: 'endOfTurn', enterTs: 1,
      globalTypeEffect: { filter: 'nonCreatureArtifact', addTypes: ['Creature'] } };
    let state = makeState({ pBf: [art] });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    const ch = computeCharacteristics(art, state);
    expect(ch.types).toContain('Creature');
  });

  it('EMB-03: collectEffects applies wipeAbilities from an emblem-sourced Layer 6 effect', () => {
    const art = makeTestArtifact('art-1', { keywords: ['FLYING'], protection: ['R'] });
    const emblem = { id: 'em1', controller: 'p', duration: 'endOfTurn', enterTs: 1,
      globalTypeEffect: { filter: 'nonCreatureArtifact', wipeAbilities: true } };
    let state = makeState({ pBf: [art] });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    const ch = computeCharacteristics(art, state);
    expect(ch.keywords).toEqual([]);
    expect(ch.protection).toEqual([]);
  });

  it('EMB-04: collectEffects applies a CDA powerFn/toughnessFn from an emblem-sourced Layer 7a effect', () => {
    const art = makeTestArtifact('art-1', { cmc: 5 });
    const emblem = { id: 'em1', controller: 'p', duration: 'endOfTurn', enterTs: 1,
      globalTypeEffect: { filter: 'nonCreatureArtifact', powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA' } };
    let state = makeState({ pBf: [art] });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    const ch = computeCharacteristics(art, state);
    expect(ch.power).toBe(5);
    expect(ch.toughness).toBe(5);
  });

  it("EMB-05: emitEvent fires an emblem's controller-scoped triggeredAbility on a matching event", () => {
    const emblem = {
      id: 'em1', controller: 'p', duration: 'permanent',
      triggeredAbilities: [{ id: 't1', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'gainLifeController', amount: 3 } }],
    };
    let state = makeState({ phase: PHASE.UNTAP, active: 'p' });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (p's upkeep)
    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.p.life).toBe(23);
  });

  it("EMB-06: emitEvent does not fire an emblem's ability for a non-matching event type", () => {
    const emblem = {
      id: 'em1', controller: 'p', duration: 'permanent',
      triggeredAbilities: [{ id: 't1', trigger: { event: 'ON_CREATURE_DIES', scope: 'self' }, effect: { type: 'gainLifeController', amount: 3 } }],
    };
    let state = makeState({ phase: PHASE.UNTAP, active: 'p' });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    // Advancing to UPKEEP only fires ON_UPKEEP_START, never ON_CREATURE_DIES.
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.life).toBe(20);
  });

  it("EMB-07: resolveTrigger finds an emblem via findEmblem and resolves its effect with the emblem as sourceCard", () => {
    // Same shape as EMB-05 but on the opponent's own upkeep, proving resolveTrigger's
    // findEmblem lookup (not just emitEvent's scan) resolves the correct emblem object.
    const emblem = {
      id: 'em-o', controller: 'o', duration: 'permanent',
      triggeredAbilities: [{ id: 't1', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'gainLifeController', amount: 5 } }],
    };
    let state = makeState({ phase: PHASE.UNTAP, active: 'o' });
    state = { ...state, o: { ...state.o, emblems: [emblem] } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP (o's upkeep)
    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.o.life).toBe(25);
  });

  it('EMB-08: CLEANUP removes an endOfTurn-duration emblem', () => {
    const emblem = { id: 'em1', controller: 'p', duration: 'endOfTurn' };
    let state = makeState({ phase: PHASE.END, active: 'p' });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.phase).toBe(PHASE.CLEANUP);
    expect(s1.p.emblems).toEqual([]);
  });

  it('EMB-09: CLEANUP does NOT remove a permanent-duration emblem', () => {
    const emblem = { id: 'em1', controller: 'p', duration: 'permanent' };
    let state = makeState({ phase: PHASE.END, active: 'p' });
    state = { ...state, p: { ...state.p, emblems: [emblem] } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.phase).toBe(PHASE.CLEANUP);
    expect(s1.p.emblems).toEqual([emblem]);
  });

  it('EMB-10: two emblems belonging to different players never cross-contaminate', () => {
    const emblemP = { id: 'emP', controller: 'p', duration: 'permanent',
      triggeredAbilities: [{ id: 'tp', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'gainLifeController', amount: 5 } }] };
    const emblemO = { id: 'emO', controller: 'o', duration: 'permanent',
      triggeredAbilities: [{ id: 'to', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'gainLifeController', amount: 5 } }] };
    let state = makeState({ phase: PHASE.UNTAP, active: 'p' });
    state = { ...state, p: { ...state.p, emblems: [emblemP] }, o: { ...state.o, emblems: [emblemO] } };

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // p's upkeep
    expect(s1.p.life).toBe(25); // p's own emblem fires
    expect(s1.o.life).toBe(20); // o's emblem must not fire on p's upkeep
  });

});
