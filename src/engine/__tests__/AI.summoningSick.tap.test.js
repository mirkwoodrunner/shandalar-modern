// src/engine/__tests__/AI.summoningSick.tap.test.js
// Regression tests for summoning sickness blocking AI tap-for-mana planning.
// A creature that entered this turn must not be counted as a mana source or
// be allowed to activate {T} abilities, even if untapped.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { aiDecide } from '../AI.js';
import { PHASE } from '../phases.js';
import { makeState, makeCreature } from './_factory.js';

// Helper: build a mana-producing non-land creature (e.g. Llanowar Elves).
function makeManaDork(iid, opts = {}) {
  return {
    ...makeCreature(iid, { summoningSick: true, ...opts }),
    activated: { cost: 'T', effect: 'addMana', mana: 'G' },
  };
}

// Helper: apply AI decisions to state.
function runAI(state) {
  const acts = aiDecide(state);
  return duelReducer(state, { type: 'AI_ACTS', acts });
}

describe('@engine AI summoning sickness -- mana planning', () => {
  it('does not count a summoning-sick mana dork as available mana', () => {
    // AI has a sick Llanowar Elves and no lands. It should not be able to cast
    // a 1G creature because the sick Elves cannot tap for mana.
    const dork = makeManaDork('elf-1');
    const creatureInHand = {
      iid: 'bears-hand-1',
      id: 'grizzly_bears',
      name: 'Grizzly Bears',
      type: 'Creature',
      subtype: 'Bear',
      color: 'G',
      cost: '1G',
      cmc: 2,
      power: 2,
      toughness: 2,
      keywords: [],
      effect: null,
    };
    const state = makeState({
      phase: PHASE.MAIN_1,
      active: 'o',
      oBf: [dork],
      oHand: [creatureInHand],
    });

    const result = runAI(state);

    // The spell should NOT have been cast -- sick dork provides no mana.
    expect(result.o.hand.some(c => c.iid === 'bears-hand-1')).toBe(true);
    // No TAP_ART_MANA should have been issued for the dork.
    expect(result.o.bf.find(c => c.iid === 'elf-1')?.tapped).toBeFalsy();
  });

  it('does count a healthy (non-sick) mana dork as available mana', () => {
    // Same setup but the dork is NOT summoning sick -- it should be tapped for
    // mana and the creature should be cast.
    const dork = makeManaDork('elf-1', { summoningSick: false });
    const creatureInHand = {
      iid: 'bears-hand-1',
      id: 'grizzly_bears',
      name: 'Grizzly Bears',
      type: 'Creature',
      subtype: 'Bear',
      color: 'G',
      cost: 'G',
      cmc: 1,
      power: 2,
      toughness: 2,
      keywords: [],
      effect: null,
    };
    const state = makeState({
      phase: PHASE.MAIN_1,
      active: 'o',
      oBf: [dork],
      oHand: [creatureInHand],
    });

    const result = runAI(state);

    // The dork should have been tapped to produce mana for the spell.
    expect(result.o.bf.find(c => c.iid === 'elf-1')?.tapped).toBe(true);
  });

  it('plans ACTIVATE_ABILITY for a summoning-sick creature with a non-tap cost (Triskelion)', () => {
    // Triskelion's cost is removing a +1/+1 counter -- no {T}.
    // CR 302.6 restricts only tap-symbol abilities, so a sick Triskelion should
    // still appear in the AI's action plan.
    const triskelion = {
      ...makeCreature('tri-1', { summoningSick: true }),
      activated: { cost: 'counter', effect: 'triskelionPing' },
      counters: { P1P1: 3 },
    };
    const baseState = makeState({
      phase: PHASE.MAIN_1,
      active: 'o',
      oBf: [triskelion],
    });
    // Set player life low so the AI fires the ping-face branch.
    const state = { ...baseState, p: { ...baseState.p, life: 3 } };

    const acts = aiDecide(state);

    // aiDecide translates sourceId -> iid when building DuelCore actions.
    const activateAct = acts.find(a => a.type === 'ACTIVATE_ABILITY' && a.iid === 'tri-1');
    expect(activateAct).toBeDefined();
  });
});
