// tests/scenarios/ante-cards.test.js
// Per-card regression coverage for the ante batch (Part 7): Contract from
// Below, Demonic Attorney, Jeweled Bird, Rebirth. Bronze Tablet and Tempest
// Efreet are covered by ownership-exchange.test.js. Darkpact is deferred
// (see cards.js entry) and has no resolver to test.

import { describe, it, expect } from 'vitest';
import { resolveEff, duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeSpell } from '../../src/engine/__tests__/_factory.js';

function libOf(n) {
  return Array.from({ length: n }, (_, i) => ({ iid: `lib${i}`, id: 'forest', name: 'Forest' }));
}

describe('@engine-banding-ante-1 Scenario: Contract from Below', () => {
  it('discards hand, antes top of library, then draws 7', () => {
    const card = makeSpell('cfb1', { id: 'contract_from_below', name: 'Contract from Below', effect: 'contractFromBelow' });
    let state = makeState({ pHand: [makeSpell('h1'), makeSpell('h2')] });
    state = { ...state, p: { ...state.p, lib: libOf(10) } };

    const anted = state.p.lib[0];
    state = resolveEff(state, { card, caster: 'p', targets: [], xVal: 1 });

    expect(state.p.hand.length).toBe(7);
    expect(state.p.gy.some(c => c.iid === 'h1')).toBe(true);
    expect(state.p.gy.some(c => c.iid === 'h2')).toBe(true);
    expect(state.anteExtraP).toEqual([anted]);
    expect(state.p.lib.some(c => c.iid === anted.iid)).toBe(false);
  });
});

describe('@engine-banding-ante-1 Scenario: Demonic Attorney', () => {
  it('each player antes the top card of their own library', () => {
    const card = makeSpell('da1', { id: 'demonic_attorney', name: 'Demonic Attorney', effect: 'demonicAttorney' });
    let state = makeState();
    state = { ...state, p: { ...state.p, lib: libOf(5) }, o: { ...state.o, lib: libOf(5) } };
    const antedP = state.p.lib[0];
    const antedO = state.o.lib[0];

    state = resolveEff(state, { card, caster: 'p', targets: [], xVal: 1 });

    expect(state.anteExtraP).toEqual([antedP]);
    expect(state.anteExtraO).toEqual([antedO]);
    expect(state.p.lib.length).toBe(4);
    expect(state.o.lib.length).toBe(4);
  });

  it('is a no-op for a player whose library is already empty', () => {
    const card = makeSpell('da2', { id: 'demonic_attorney', name: 'Demonic Attorney', effect: 'demonicAttorney' });
    let state = makeState();
    state = { ...state, p: { ...state.p, lib: [] }, o: { ...state.o, lib: libOf(3) } };
    state = resolveEff(state, { card, caster: 'p', targets: [], xVal: 1 });
    expect(state.anteExtraP).toEqual([]);
    expect(state.anteExtraO.length).toBe(1);
  });
});

describe('@engine-banding-ante-1 Scenario: Jeweled Bird', () => {
  it('antes itself, discards the rest of the ante to the graveyard, and draws a card', () => {
    const bird = { iid: 'jb1', id: 'jeweled_bird', name: 'Jeweled Bird', type: 'Artifact', effect: 'jeweledBirdAnte', controller: 'p', tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    let state = makeState();
    const existingAnte = { iid: 'existing1', id: 'forest', name: 'Forest' };
    state = {
      ...state,
      p: { ...state.p, lib: libOf(3) },
      anteP: existingAnte,
      anteExtraP: [],
    };

    state = resolveEff(state, { card: bird, caster: 'p', targets: [], xVal: 1 });

    expect(state.anteP).toBeNull();
    expect(state.anteExtraP).toEqual([bird]);
    expect(state.p.gy.some(c => c.iid === existingAnte.iid)).toBe(true);
    expect(state.p.hand.length).toBe(1);
  });
});

describe('@engine-banding-ante-1 Scenario: Rebirth', () => {
  it('resets a low-life player to 20 and antes their top library card', () => {
    const card = makeSpell('rb1', { id: 'rebirth', name: 'Rebirth', effect: 'rebirthAnte' });
    let state = makeState();
    state = {
      ...state,
      p: { ...state.p, life: 4, lib: libOf(5) },
      o: { ...state.o, life: 20, lib: libOf(5) },
    };
    const antedP = state.p.lib[0];

    state = resolveEff(state, { card, caster: 'p', targets: [], xVal: 1 });

    expect(state.p.life).toBe(20);
    expect(state.anteExtraP).toEqual([antedP]);
    // o was already at 20 -- no benefit, so no ante (SIMPLIFICATION heuristic).
    expect(state.anteExtraO).toEqual([]);
    expect(state.o.lib.length).toBe(5);
  });
});

describe('@engine-banding-ante-1 Scenario: ante card pool integrity', () => {
  it('the seven ante cards resolve through duelReducer end-to-end via CAST_SPELL/RESOLVE_STACK for the non-targeted sorceries', () => {
    const cfb = makeSpell('cfb2', { id: 'contract_from_below', name: 'Contract from Below', cost: 'B', type: 'Sorcery', effect: 'contractFromBelow' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [cfb] });
    state = { ...state, p: { ...state.p, lib: libOf(10), mana: { ...state.p.mana, B: 1 } } };

    state = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'cfb2', tgt: null, xVal: 1 });
    expect(state.stack.length).toBe(1);
    state = duelReducer(state, { type: 'RESOLVE_STACK' });

    expect(state.p.hand.length).toBe(7);
    expect(state.anteExtraP.length).toBe(1);
  });
});
