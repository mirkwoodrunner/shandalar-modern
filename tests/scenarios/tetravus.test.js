// tests/scenarios/tetravus.test.js
// Tetravus: etbCounter, two optional upkeep abilities (remove counters -> make
// tokens; exile own tokens -> regain counters), remembered-token tracking.
// See THIRD_PARTY_NOTICES.md for Card-Forge/forge attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function makeTetravus(overrides = {}) {
  return makeCreature('tv-1', {
    id: 'tetravus', name: 'Tetravus', type: 'Artifact Creature', subtype: 'Construct', color: '',
    power: 1, toughness: 1, keywords: ['FLYING'], controller: 'p',
    counters: { P1P1: 3 },
    ...overrides,
  });
}

function toUpkeep(pBf) {
  const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf });
  const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
  return duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues choice(s)
}

describe('@engine Scenario: Tetravus', () => {

  it('enters the battlefield with three +1/+1 counters (etbCounters)', () => {
    const spell = { iid: 'tv-1', id: 'tetravus', name: 'Tetravus', type: 'Artifact Creature', cmc: 6, cost: '6', power: 1, toughness: 1, etbCounters: { P1P1: 3 } };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 6 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'tv-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'tv-1').counters.P1P1).toBe(3);
  });

  it('queues the remove-counters upkeep prompt only when it has counters to remove', () => {
    const s2 = toUpkeep([makeTetravus()]);
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('tetravusRemoveCountersPrompt');
  });

  it('does not queue the remove-counters prompt with zero counters', () => {
    const s2 = toUpkeep([makeTetravus({ counters: { P1P1: 0 } })]);
    expect(s2.pendingUpkeepChoice).toBeNull();
  });

  it('removing 0 counters creates no tokens and leaves counters untouched (choice extreme: minimum)', () => {
    const s2 = toUpkeep([makeTetravus()]);
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE' });
    expect(s3.pendingChoice?.kind).toBe('numberChoice');
    expect(s3.pendingChoice?.handlerKey).toBe('tetravusCreateTokens');
    expect(s3.pendingChoice?.options).toHaveLength(4); // 0..3
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '0' });
    expect(s4.p.bf.find(c => c.iid === 'tv-1').counters.P1P1).toBe(3);
    expect(s4.p.bf.some(c => c.isToken)).toBe(false);
  });

  it('removing all counters (max) creates that many Tetravite tokens tagged with this Tetravus as sourceIid', () => {
    const s2 = toUpkeep([makeTetravus()]);
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE' });
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '3' });
    expect(s4.p.bf.find(c => c.iid === 'tv-1').counters.P1P1).toBe(0);
    const tetravites = s4.p.bf.filter(c => c.isToken && c.tokenId === 'tetravite');
    expect(tetravites).toHaveLength(3);
    expect(tetravites.every(t => t.sourceIid === 'tv-1')).toBe(true);
    expect(tetravites.every(t => t.keywords.includes('FLYING'))).toBe(true);
  });

  it('removing a partial count (2 of 3) creates 2 tokens and leaves 1 counter', () => {
    const s2 = toUpkeep([makeTetravus()]);
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE' });
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '2' });
    expect(s4.p.bf.find(c => c.iid === 'tv-1').counters.P1P1).toBe(1);
    expect(s4.p.bf.filter(c => c.isToken)).toHaveLength(2);
  });

  it('queues the exile-tokens upkeep prompt only when it has its own Tetravite tokens on the battlefield', () => {
    const tetravus = makeTetravus({ counters: { P1P1: 0 } });
    const ownToken = { iid: 'tk-1', tokenId: 'tetravite', name: 'Tetravite', type: 'Artifact Creature', isToken: true, controller: 'p', sourceIid: 'tv-1', power: 1, toughness: 1, damage: 0, counters: {}, keywords: ['FLYING'], tapped: false, enchantments: [] };
    const s2 = toUpkeep([tetravus, ownToken]);
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('tetravusExileTokensPrompt');
  });

  it('remembered-token tracking: exiling only counts tokens sourced from this specific Tetravus, not a hypothetical other source', () => {
    const tetravus = makeTetravus({ counters: { P1P1: 0 } });
    const ownToken1 = { iid: 'tk-1', tokenId: 'tetravite', name: 'Tetravite', type: 'Artifact Creature', isToken: true, controller: 'p', sourceIid: 'tv-1', power: 1, toughness: 1, damage: 0, counters: {}, keywords: ['FLYING'], tapped: false, enchantments: [] };
    const ownToken2 = { ...ownToken1, iid: 'tk-2' };
    // Decoy: a Tetravite-shaped token from a different (hypothetical) source.
    const decoyToken = { ...ownToken1, iid: 'tk-decoy', sourceIid: 'some-other-tetravus' };
    const s2 = toUpkeep([tetravus, ownToken1, ownToken2, decoyToken]);
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('tetravusExileTokensPrompt');
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE' });
    expect(s3.pendingChoice?.kind).toBe('numberChoice');
    // Only the 2 tokens actually sourced from this Tetravus are eligible -- the
    // decoy from a different source must not inflate the option range.
    expect(s3.pendingChoice?.options).toHaveLength(3); // 0..2
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '2' });
    expect(s4.p.bf.some(c => c.iid === 'tk-1')).toBe(false);
    expect(s4.p.bf.some(c => c.iid === 'tk-2')).toBe(false);
    // Decoy survives -- it was never eligible.
    expect(s4.p.bf.some(c => c.iid === 'tk-decoy')).toBe(true);
    expect(s4.p.bf.find(c => c.iid === 'tv-1').counters.P1P1).toBe(2);
  });

  it('exiling 0 tokens (choice extreme: minimum) leaves everything untouched', () => {
    const tetravus = makeTetravus({ counters: { P1P1: 0 } });
    const ownToken = { iid: 'tk-1', tokenId: 'tetravite', name: 'Tetravite', type: 'Artifact Creature', isToken: true, controller: 'p', sourceIid: 'tv-1', power: 1, toughness: 1, damage: 0, counters: {}, keywords: ['FLYING'], tapped: false, enchantments: [] };
    const s2 = toUpkeep([tetravus, ownToken]);
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE' });
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '0' });
    expect(s4.p.bf.some(c => c.iid === 'tk-1')).toBe(true);
    expect(s4.p.bf.find(c => c.iid === 'tv-1').counters.P1P1).toBe(0);
  });

});
