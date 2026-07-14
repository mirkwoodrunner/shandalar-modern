// tests/scenarios/primal-clay.test.js
// Primal Clay: "As this creature enters, it becomes your choice of a 3/3
// artifact creature, a 2/2 artifact creature with flying, or a 1/6 Wall
// artifact creature with defender in addition to its other types." A fixed
// three-mode ETB choice routed through the generic pendingChoice mechanism
// (kind: 'primalClayChoice') -- NOT a copy effect, does not use
// applyPermanentCopy.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function makePrimalClay(iid = 'pc-1') {
  return {
    iid, id: 'primal_clay', name: 'Primal Clay', type: 'Artifact Creature',
    subtype: 'Shapeshifter', color: '', cmc: 4, cost: '4', power: 0, toughness: 0,
    effect: 'primalClayChoice', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], controller: 'p',
  };
}

function stateWithClayOnStack() {
  const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
  return {
    ...base,
    stack: [{ id: 'si-1', card: makePrimalClay(), caster: 'p', targets: [], xVal: 1 }],
  };
}

describe('@engine-card-scenarios-7 Scenario: Primal Clay', () => {

  it('presents a pendingChoice with all three modes after entering the battlefield', () => {
    const s1 = duelReducer(stateWithClayOnStack(), { type: 'RESOLVE_STACK' });
    const onBf = s1.p.bf.find(c => c.iid === 'pc-1');
    expect(onBf).toBeDefined();
    expect(s1.pendingChoice).toBeDefined();
    expect(s1.pendingChoice.kind).toBe('primalClayChoice');
    expect(s1.pendingChoice.options.map(o => o.id)).toEqual(['vanilla', 'flying', 'wall']);
  });

  it('mode 1: becomes a 3/3 artifact creature', () => {
    let s = duelReducer(stateWithClayOnStack(), { type: 'RESOLVE_STACK' });
    s = duelReducer(s, { type: 'RESOLVE_CHOICE', optionId: 'vanilla' });
    const clay = s.p.bf.find(c => c.iid === 'pc-1');
    expect(clay.power).toBe(3);
    expect(clay.toughness).toBe(3);
    expect(clay.keywords).not.toContain(KEYWORDS.FLYING.id);
    expect(clay.keywords).not.toContain(KEYWORDS.DEFENDER.id);
    expect(clay.subtype).toBe('Shapeshifter');
    expect(s.pendingChoice).toBeNull();
  });

  it('mode 2: becomes a 2/2 artifact creature with flying', () => {
    let s = duelReducer(stateWithClayOnStack(), { type: 'RESOLVE_STACK' });
    s = duelReducer(s, { type: 'RESOLVE_CHOICE', optionId: 'flying' });
    const clay = s.p.bf.find(c => c.iid === 'pc-1');
    expect(clay.power).toBe(2);
    expect(clay.toughness).toBe(2);
    expect(clay.keywords).toContain(KEYWORDS.FLYING.id);
  });

  it('mode 3: becomes a 1/6 Wall artifact creature with defender, Wall added in addition to its other types', () => {
    let s = duelReducer(stateWithClayOnStack(), { type: 'RESOLVE_STACK' });
    s = duelReducer(s, { type: 'RESOLVE_CHOICE', optionId: 'wall' });
    const clay = s.p.bf.find(c => c.iid === 'pc-1');
    expect(clay.power).toBe(1);
    expect(clay.toughness).toBe(6);
    expect(clay.keywords).toContain(KEYWORDS.DEFENDER.id);
    // "in addition to its other types" -- Shapeshifter is retained, Wall is added.
    expect(clay.subtype).toBe('Shapeshifter Wall');
  });

  it('is not routed through applyPermanentCopy -- type stays Artifact Creature, no color/text copied from another card', () => {
    let s = duelReducer(stateWithClayOnStack(), { type: 'RESOLVE_STACK' });
    s = duelReducer(s, { type: 'RESOLVE_CHOICE', optionId: 'vanilla' });
    const clay = s.p.bf.find(c => c.iid === 'pc-1');
    expect(clay.type).toBe('Artifact Creature');
    expect(clay.name).toBe('Primal Clay');
  });
});
