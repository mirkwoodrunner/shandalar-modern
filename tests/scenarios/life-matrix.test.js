// tests/scenarios/life-matrix.test.js
// Life Matrix: "{4}, {T}: Put a matrix counter on target creature and that
// creature gains 'Remove a matrix counter from this creature: Regenerate
// this creature.' Activate only during your upkeep." Combines the
// Regeneration Aura's "c.activated || {...}" grant-if-none-present
// convention with the counter-cost regen idiom (Scavenging Ghoul/Triskelion).
// See docs/MECHANICS_INDEX.md.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function makeLifeMatrix(iid, overrides = {}) {
  return {
    iid, id: 'life_matrix', name: 'Life Matrix', type: 'Artifact', color: '', cmc: 4, cost: '4',
    keywords: [], tapped: false, counters: {}, eotBuffs: [], enchantments: [],
    activated: { cost: '4,T', effect: 'grantMatrixCounterRegen', myUpkeepOnly: true },
    controller: 'p',
    ...overrides,
  };
}

describe('@engine Scenario: Life Matrix', () => {
  it('grants activated:{cost:"counter",effect:"matrixRegen"} plus a MATRIX counter to a creature with no existing activated ability', () => {
    const matrix = makeLifeMatrix('lm-1');
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [matrix, bear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 4 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lm-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const bearAfter = s2.p.bf.find(c => c.iid === 'bear-1');
    expect(bearAfter.counters.MATRIX).toBe(1);
    expect(bearAfter.activated).toEqual({ cost: 'counter', effect: 'matrixRegen' });
  });

  it('does not overwrite an existing activated ability on the target', () => {
    const matrix = makeLifeMatrix('lm-1');
    const existingAbility = { cost: 'G', effect: 'regenerate' };
    const bear = makeCreature('bear-1', { controller: 'p', activated: existingAbility });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [matrix, bear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 4 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lm-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const bearAfter = s2.p.bf.find(c => c.iid === 'bear-1');
    expect(bearAfter.counters.MATRIX).toBe(1);
    expect(bearAfter.activated).toEqual(existingAbility);
  });

  it('activating the granted matrixRegen ability removes a MATRIX counter and sets regenerating:true', () => {
    const bear = makeCreature('bear-1', {
      controller: 'p',
      counters: { MATRIX: 1 },
      activated: { cost: 'counter', effect: 'matrixRegen' },
    });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [bear] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const bearAfter = s2.p.bf.find(c => c.iid === 'bear-1');
    expect(bearAfter.counters.MATRIX).toBe(0);
    expect(bearAfter.regenerating).toBe(true);
  });

  it("Life Matrix's own {4},{T} ability is gated to myUpkeepOnly", () => {
    const matrix = makeLifeMatrix('lm-1');
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [matrix, bear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 4 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lm-1', tgt: 'bear-1' });
    expect(s1.stack).toHaveLength(0);
    expect(s1.p.bf.find(c => c.iid === 'lm-1').tapped).toBe(false);
  });
});
