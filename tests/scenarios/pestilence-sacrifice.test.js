// tests/scenarios/pestilence-sacrifice.test.js
// Bug fix: Pestilence's end-step sacrifice check was gated on "controller has
// no black creatures" instead of the oracle condition "no creatures are on
// the battlefield" (either side, any color). See DuelCore.js CLEANUP handling.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

function makePestilence(iid, overrides = {}) {
  return makeSpell(iid, {
    id: 'pestilence',
    name: 'Pestilence',
    type: 'Enchantment',
    color: 'B',
    cmc: 4,
    cost: '2BB',
    controller: 'p',
    ...overrides,
  });
}

function advanceToCleanup(state) {
  const preCleanup = { ...state, phase: PHASE.END };
  return duelReducer(preCleanup, { type: 'ADVANCE_PHASE' });
}

describe('@engine Scenario: pestilence-sacrifice -- end-step sacrifice condition', () => {
  it('PEST-01: remains on battlefield when opponent controls a non-black creature and p controls none', () => {
    const pest = makePestilence('pest-1', { controller: 'p' });
    const whiteCre = makeCreature('wc-1', { id: 'white_knight', name: 'White Knight', color: 'W', controller: 'o' });
    const state = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [pest], oBf: [whiteCre] });

    const s1 = advanceToCleanup(state);

    expect(s1.p.bf.some(c => c.iid === 'pest-1')).toBe(true);
    expect(s1.p.gy.some(c => c.iid === 'pest-1')).toBe(false);
  });

  it('PEST-02: is sacrificed when no creatures exist on either battlefield', () => {
    const pest = makePestilence('pest-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [pest], oBf: [] });

    const s1 = advanceToCleanup(state);

    expect(s1.p.bf.some(c => c.iid === 'pest-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'pest-1')).toBe(true);
    expect(s1.log.some(l => l.text.includes('sacrificed'))).toBe(true);
  });

  it('PEST-03: remains on battlefield when its controller has a black creature (regression guard)', () => {
    const pest = makePestilence('pest-1', { controller: 'p' });
    const blackCre = makeCreature('bc-1', { id: 'dark_ritual_bear', name: 'Black Bear', color: 'B', controller: 'p' });
    const state = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [pest, blackCre], oBf: [] });

    const s1 = advanceToCleanup(state);

    expect(s1.p.bf.some(c => c.iid === 'pest-1')).toBe(true);
  });

  it('PEST-04: both players\' Pestilences are sacrificed simultaneously when no creatures exist', () => {
    const pestP = makePestilence('pest-p', { controller: 'p' });
    const pestO = makePestilence('pest-o', { controller: 'o' });
    const state = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [pestP], oBf: [pestO] });

    const s1 = advanceToCleanup(state);

    expect(s1.p.bf.some(c => c.iid === 'pest-p')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'pest-p')).toBe(true);
    expect(s1.o.bf.some(c => c.iid === 'pest-o')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 'pest-o')).toBe(true);
  });
});
