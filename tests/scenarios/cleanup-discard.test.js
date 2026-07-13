// tests/scenarios/cleanup-discard.test.js
// Cleanup-step hand-limit discard: the human player ('p') now chooses which
// cards to discard via pendingCleanupDiscard + RESOLVE_CLEANUP_DISCARD,
// instead of the engine auto-discarding the last N cards in hand order.
// The AI ('o') keeps the original auto-discard (see discard-centralization.test.js
// DISC-P13). See docs/SYSTEMS.md Section 29 and docs/MECHANICS_INDEX.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, makeCardInstance } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeSpell } from '../../src/engine/__tests__/_factory.js';

function withMaxHandSize(state, maxHandSize = 7) {
  return { ...state, ruleset: { ...state.ruleset, maxHandSize } };
}

describe('@engine Scenario: Cleanup-step hand-limit discard (pendingCleanupDiscard)', () => {
  it('CLEAN-01: p over hand limit at CLEANUP -- sets pendingCleanupDiscard instead of auto-discarding', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP

    expect(ns.phase).toBe(PHASE.CLEANUP);
    expect(ns.p.hand.length).toBe(9);
    expect(ns.p.gy).toEqual([]);
    expect(ns.pendingCleanupDiscard).toEqual({ controller: 'p', count: 2 });
  });

  it('CLEAN-02: p exactly at hand limit -- no prompt', () => {
    const hand = Array.from({ length: 7 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(ns.pendingCleanupDiscard).toBeFalsy();
  });

  it('CLEAN-03: ADVANCE_PHASE no-ops while pendingCleanupDiscard is set', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));
    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> CLEANUP, pendingCleanupDiscard set

    const stalled = duelReducer(ns, { type: 'ADVANCE_PHASE' });

    expect(stalled.phase).toBe(PHASE.CLEANUP);
    expect(stalled.pendingCleanupDiscard).toEqual({ controller: 'p', count: 2 });
    expect(stalled.turn).toBe(ns.turn);
  });

  it('CLEAN-04: RESOLVE_CLEANUP_DISCARD rejects wrong count', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));
    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    const s1 = duelReducer(ns, { type: 'RESOLVE_CLEANUP_DISCARD', iids: ['c0'] }); // only 1, need 2
    expect(s1.pendingCleanupDiscard).toEqual({ controller: 'p', count: 2 });
    expect(s1.p.hand.length).toBe(9);

    const s2 = duelReducer(ns, { type: 'RESOLVE_CLEANUP_DISCARD', iids: ['c0', 'c1', 'c2'] }); // 3, need 2
    expect(s2.pendingCleanupDiscard).toEqual({ controller: 'p', count: 2 });
    expect(s2.p.hand.length).toBe(9);
  });

  it('CLEAN-05: RESOLVE_CLEANUP_DISCARD rejects duplicate iids', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));
    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    const s1 = duelReducer(ns, { type: 'RESOLVE_CLEANUP_DISCARD', iids: ['c0', 'c0'] });

    expect(s1.pendingCleanupDiscard).toEqual({ controller: 'p', count: 2 });
    expect(s1.p.hand.length).toBe(9);
  });

  it('CLEAN-06: RESOLVE_CLEANUP_DISCARD rejects an iid not in the hand', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));
    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    const s1 = duelReducer(ns, { type: 'RESOLVE_CLEANUP_DISCARD', iids: ['c0', 'not-in-hand'] });

    expect(s1.pendingCleanupDiscard).toEqual({ controller: 'p', count: 2 });
    expect(s1.p.hand.length).toBe(9);
  });

  it('CLEAN-07: RESOLVE_CLEANUP_DISCARD with a valid set discards the chosen cards and clears the prompt', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));
    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    const s1 = duelReducer(ns, { type: 'RESOLVE_CLEANUP_DISCARD', iids: ['c3', 'c7'] });

    expect(s1.pendingCleanupDiscard).toBeNull();
    expect(s1.p.hand.length).toBe(7);
    expect(s1.p.hand.map(c => c.iid)).not.toContain('c3');
    expect(s1.p.hand.map(c => c.iid)).not.toContain('c7');
    expect(s1.p.gy.map(c => c.iid).sort()).toEqual(['c3', 'c7']);
    expect(s1.log.some(l => l.text === 'p discards 2 card(s) to hand size.')).toBe(true);
  });

  it('CLEAN-08: phase resumes to the next turn once the discard is resolved', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pHand: hand, phase: PHASE.END, active: 'p' }));
    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> CLEANUP
    const resolved = duelReducer(ns, { type: 'RESOLVE_CLEANUP_DISCARD', iids: ['c0', 'c1'] });

    const s1 = duelReducer(resolved, { type: 'ADVANCE_PHASE' }); // -> next turn's UNTAP

    expect(s1.phase).toBe(PHASE.UNTAP);
    expect(s1.active).toBe('o');
  });

  it('CLEAN-09: Library of Leng -- no prompt for p even with a 10-card hand', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const hand = Array.from({ length: 10 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const state = withMaxHandSize(makeState({ pBf: [leng], pHand: hand, phase: PHASE.END, active: 'p' }));

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(ns.pendingCleanupDiscard).toBeFalsy();
    expect(ns.p.hand.length).toBe(10);
    expect(ns.p.gy).toEqual([]);
  });

  it('CLEAN-10: RESOLVE_CLEANUP_DISCARD is a no-op when nothing is pending', () => {
    const state = withMaxHandSize(makeState({ phase: PHASE.MAIN_1, active: 'p' }));

    const ns = duelReducer(state, { type: 'RESOLVE_CLEANUP_DISCARD', iids: ['x'] });

    expect(ns).toBe(state);
  });
});
