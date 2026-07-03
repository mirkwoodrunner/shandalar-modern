// tests/scenarios/ante-zone-setup.test.js
// Regression coverage for the Part 1 buildDuelState library-removal fix, and
// the Part 2 generalized ante zone (anteExtraP/anteExtraO) + handleDuelEnd
// reconciliation model.

import { describe, it, expect } from 'vitest';
import { buildDuelState, resolveEff } from '../../src/engine/DuelCore.js';
import RULESETS from '../../src/data/rulesets.js';

describe('@engine Scenario: ante zone setup and reconciliation', () => {

  it('removes the anted card from the library so it can never be drawn', () => {
    const pDeckIds = ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'savannah_lions'];
    const state = buildDuelState(pDeckIds, 'RED_BURN', RULESETS.CLASSIC, null, null, true, null);

    expect(state.anteP).not.toBeNull();
    // The anted card must not still be sitting in the library.
    expect(state.p.lib.some(c => c.iid === state.anteP.iid)).toBe(false);
    // Nor should it be in the opening hand (it was set aside before the hand was drawn).
    expect(state.p.hand.some(c => c.iid === state.anteP.iid)).toBe(false);
    // Every remaining card across lib+hand should be exactly deck size minus 1 (the ante).
    expect(state.p.lib.length + state.p.hand.length).toBe(pDeckIds.length - 1);
  });

  it('does not set anteP/anteO when ante is disabled', () => {
    const pDeckIds = ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'savannah_lions'];
    const state = buildDuelState(pDeckIds, 'RED_BURN', RULESETS.CLASSIC, null, null, false, null);
    expect(state.anteP).toBeNull();
    expect(state.anteO).toBeNull();
    expect(state.p.lib.length + state.p.hand.length).toBe(pDeckIds.length);
  });

  it('initializes anteExtraP/anteExtraO as empty arrays and ownershipChanges as an empty array', () => {
    const pDeckIds = ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'savannah_lions'];
    const state = buildDuelState(pDeckIds, 'RED_BURN', RULESETS.CLASSIC, null, null, true, null);
    expect(state.anteExtraP).toEqual([]);
    expect(state.anteExtraO).toEqual([]);
    expect(state.ownershipChanges).toEqual([]);
  });

  it('anteExtraP accumulates mid-game ante cards without touching the pre-game anteP scalar (Demonic Attorney, resolved twice)', () => {
    const pDeckIds = Array(12).fill('forest').concat(['llanowar_elves', 'llanowar_elves', 'llanowar_elves']);
    let state = buildDuelState(pDeckIds, 'RED_BURN', RULESETS.CLASSIC, null, null, true, null);
    const anteP0 = state.anteP;

    const attorney = { iid: 'attorney1', id: 'demonic_attorney', name: 'Demonic Attorney', effect: 'demonicAttorney' };
    state = resolveEff(state, { card: attorney, caster: 'p', targets: [], xVal: 1 });
    expect(state.anteExtraP.length).toBe(1);
    expect(state.anteExtraO.length).toBe(1);
    // The pre-game scalar must be untouched by the mid-game addition.
    expect(state.anteP).toBe(anteP0);

    const attorney2 = { iid: 'attorney2', id: 'demonic_attorney', name: 'Demonic Attorney', effect: 'demonicAttorney' };
    state = resolveEff(state, { card: attorney2, caster: 'p', targets: [], xVal: 1 });
    expect(state.anteExtraP.length).toBe(2);
    expect(state.anteExtraO.length).toBe(2);
  });

});
