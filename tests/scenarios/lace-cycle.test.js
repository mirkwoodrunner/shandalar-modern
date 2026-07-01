// tests/scenarios/lace-cycle.test.js
// The five "lace" color-changing instants (Chaoslace, Deathlace, Lifelace,
// Purelace, Thoughtlace) share one effect id, "colorLace", parameterized by
// card.laceColor. Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

function laceCard(iid, name, laceColor) {
  return {
    iid, id: name.toLowerCase(), name, type: 'Instant', color: laceColor === 'B' ? 'B' : 'X',
    cmc: 1, effect: 'colorLace', laceColor,
    keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
  };
}

describe('@engine Scenario: Lace cycle (Chaoslace/Deathlace/Lifelace/Purelace/Thoughtlace)', () => {

  it('Chaoslace: turns a targeted permanent red', () => {
    const target = makeCreature('cr-1', { controller: 'o', color: 'U' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target] });
    const state = {
      ...base,
      stack: [{ id: 'si-1', card: laceCard('cl-1', 'Chaoslace', 'R'), caster: 'p', targets: ['cr-1'], xVal: 1 }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const cr = s1.o.bf.find(c => c.iid === 'cr-1');
    expect(cr.color).toBe('R');
  });

  it('Deathlace: turns a targeted spell on the stack black', () => {
    const targetSpell = makeSpell('sp-1', { color: 'W' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      stack: [
        { id: 'target-si', card: targetSpell, caster: 'o', targets: [], xVal: 1 },
        { id: 'si-1', card: laceCard('dl-1', 'Deathlace', 'B'), caster: 'p', targets: ['target-si'], xVal: 1 },
      ],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const remaining = s1.stack.find(i => i.id === 'target-si');
    expect(remaining.card.color).toBe('B');
  });

  it('Lifelace: turns a targeted permanent green', () => {
    const target = makeCreature('cr-1', { controller: 'p', color: 'W' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [target] });
    const state = {
      ...base,
      stack: [{ id: 'si-1', card: laceCard('ll-1', 'Lifelace', 'G'), caster: 'p', targets: ['cr-1'], xVal: 1 }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const cr = s1.p.bf.find(c => c.iid === 'cr-1');
    expect(cr.color).toBe('G');
  });

  it('Purelace: turns a targeted permanent white', () => {
    const target = makeCreature('cr-1', { controller: 'o', color: 'B' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target] });
    const state = {
      ...base,
      stack: [{ id: 'si-1', card: laceCard('pl-1', 'Purelace', 'W'), caster: 'p', targets: ['cr-1'], xVal: 1 }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const cr = s1.o.bf.find(c => c.iid === 'cr-1');
    expect(cr.color).toBe('W');
  });

  it('Thoughtlace: turns a targeted permanent blue', () => {
    const target = makeCreature('cr-1', { controller: 'o', color: 'R' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target] });
    const state = {
      ...base,
      stack: [{ id: 'si-1', card: laceCard('tl-1', 'Thoughtlace', 'U'), caster: 'p', targets: ['cr-1'], xVal: 1 }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const cr = s1.o.bf.find(c => c.iid === 'cr-1');
    expect(cr.color).toBe('U');
  });

  it('fizzles harmlessly with no valid target', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      stack: [{ id: 'si-1', card: laceCard('cl-1', 'Chaoslace', 'R'), caster: 'p', targets: ['nonexistent'], xVal: 1 }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.log.at(-1).text).toMatch(/fizzles/);
  });

});
