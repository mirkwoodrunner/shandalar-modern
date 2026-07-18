// tests/scenarios/legend-rule-infrastructure.test.js
// Legend rule (CR 704.5j) infrastructure: isLegendary, checkLegendRule SBA,
// the legendRuleChoice pendingChoice/RESOLVE_CHOICE branch, and the AI policy
// function that resolves it. Infra-only -- no cards.js entry is Legendary yet
// (61 Legends-set creatures land in a future batch, see docs/ROADMAP.md).
// Uses inline makeCreature/makeLand/makeSpell overrides (type: 'Legendary ...')
// rather than real card data, same convention as
// tests/scenarios/emblem-infrastructure.test.js.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkLegendRule } from '../../src/engine/DuelCore.js';
import { chooseLegendRuleKeep } from '../../src/engine/AI.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell, makeStackItem } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: legend rule infrastructure (CR 704.5j)', () => {

  it('LEGEND-01: two same-name legendary permanents under one controller trigger checkLegendRule', () => {
    const leg1 = makeCreature('leg-1', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const leg2 = makeCreature('leg-2', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const state = makeState({ pBf: [leg1, leg2] });

    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).not.toBeNull();
    expect(s1.pendingChoice.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.controller).toBe('p');
    expect(s1.pendingChoice.legendName).toBe('Test Legend');
    expect(s1.pendingChoice.options.map(o => o.id).sort()).toEqual(['leg-1', 'leg-2']);
  });

  it('LEGEND-02: two differently-named legendary permanents under one controller do not trigger the rule', () => {
    const leg1 = makeCreature('leg-1', { name: 'Test Legend A', type: 'Legendary Creature', controller: 'p' });
    const leg2 = makeCreature('leg-2', { name: 'Test Legend B', type: 'Legendary Creature', controller: 'p' });
    const state = makeState({ pBf: [leg1, leg2] });

    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).toBeNull();
  });

  it('LEGEND-03: same-name legendary permanents under different controllers do not trigger the rule', () => {
    const legP = makeCreature('leg-p', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const legO = makeCreature('leg-o', { name: 'Test Legend', type: 'Legendary Creature', controller: 'o' });
    const state = makeState({ pBf: [legP], oBf: [legO] });

    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).toBeNull();
  });

  it('LEGEND-04: three same-name copies offer all three as options; resolving keeps one and sends the other two to the graveyard', () => {
    const leg1 = makeCreature('leg-1', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const leg2 = makeCreature('leg-2', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const leg3 = makeCreature('leg-3', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const state = makeState({ pBf: [leg1, leg2, leg3] });

    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice.options.map(o => o.id).sort()).toEqual(['leg-1', 'leg-2', 'leg-3']);

    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'leg-2' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.p.bf.map(c => c.iid)).toEqual(['leg-2']);
    expect(s2.p.gy.map(c => c.iid).sort()).toEqual(['leg-1', 'leg-3']);
  });

  it('LEGEND-05: a non-legendary permanent sharing a name is unaffected (no false positive)', () => {
    const c1 = makeCreature('c-1', { name: 'Grizzly Bears', type: 'Creature', controller: 'p' });
    const c2 = makeCreature('c-2', { name: 'Grizzly Bears', type: 'Creature', controller: 'p' });
    const state = makeState({ pBf: [c1, c2] });

    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).toBeNull();
    expect(s1.p.bf).toHaveLength(2);
  });

  it('LEGEND-06: RESOLVE_CHOICE keeps the chosen permanent and moves the other to the graveyard (not exile, not logged as destroyed)', () => {
    const leg1 = makeCreature('leg-1', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const leg2 = makeCreature('leg-2', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const state = makeState({ pBf: [leg1, leg2] });

    const s1 = checkLegendRule(state);
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'leg-1' });

    expect(s2.p.bf.map(c => c.iid)).toEqual(['leg-1']);
    expect(s2.p.gy.map(c => c.iid)).toEqual(['leg-2']);
    expect(s2.p.exile).toEqual([]);
    const lastLog = s2.log[s2.log.length - 1];
    expect(lastLog.text.toLowerCase()).not.toContain('destroyed');
    expect(lastLog.text.toLowerCase()).toContain('legend rule');
  });

  it('LEGEND-07: chooseLegendRuleKeep is deterministic across repeated calls', () => {
    const leg1 = makeCreature('leg-1', { name: 'Test Legend', type: 'Legendary Creature', controller: 'o', counters: { P1P1: 2 } });
    const leg2 = makeCreature('leg-2', { name: 'Test Legend', type: 'Legendary Creature', controller: 'o' });
    const state = makeState({ oBf: [leg1, leg2] });

    const s1 = checkLegendRule(state);
    const choice = s1.pendingChoice;

    const pick1 = chooseLegendRuleKeep(choice, s1);
    const pick2 = chooseLegendRuleKeep(choice, s1);
    const pick3 = chooseLegendRuleKeep(choice, s1);

    expect(pick1).toBe(pick2);
    expect(pick2).toBe(pick3);
    expect(pick1).toBe('leg-1'); // more invested value (P1P1 counters)
  });

  it('LEGEND-08: casting a permanent (RESOLVE_STACK) triggers the legend rule against one already on the battlefield', () => {
    const existing = makeCreature('leg-1', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const incoming = makeCreature('leg-2', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    let state = makeState({ pBf: [existing] });
    state = { ...state, stack: [makeStackItem(incoming, 'p')] };

    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.pendingChoice?.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.legendName).toBe('Test Legend');
  });

  it('LEGEND-09: playing a land (PLAY_LAND) triggers the legend rule against one already on the battlefield', () => {
    const existing = makeLand('leg-land-1', { name: 'Test Legendary Land', type: 'Legendary Land', subtype: 'Legendary Land', controller: 'p' });
    const incoming = makeLand('leg-land-2', { name: 'Test Legendary Land', type: 'Legendary Land', subtype: 'Legendary Land', controller: 'p' });
    const state = makeState({ pBf: [existing], pHand: [incoming], phase: PHASE.MAIN_1, active: 'p' });

    const s1 = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'leg-land-2' });
    expect(s1.pendingChoice?.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.legendName).toBe('Test Legendary Land');
  });

  it('LEGEND-10: a control-change effect (controlCreature) triggers the legend rule when the stolen permanent duplicates one the new controller already has', () => {
    const already = makeCreature('leg-mine', { name: 'Test Legend', type: 'Legendary Creature', controller: 'p' });
    const target = makeCreature('leg-theirs', { name: 'Test Legend', type: 'Legendary Creature', controller: 'o' });
    const spell = makeSpell('spell-1', { name: 'Test Control Spell', effect: 'controlCreature', controller: 'p' });
    let state = makeState({ pBf: [already], oBf: [target] });
    state = { ...state, stack: [makeStackItem(spell, 'p', ['leg-theirs'])] };

    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.pendingChoice?.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.controller).toBe('p');
    expect(s1.o.bf.some(c => c.iid === 'leg-theirs')).toBe(false);
    expect(s1.p.bf.some(c => c.iid === 'leg-theirs')).toBe(true);
  });

});
