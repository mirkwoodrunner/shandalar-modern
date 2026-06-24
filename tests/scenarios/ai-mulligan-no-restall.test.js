// tests/scenarios/ai-mulligan-no-restall.test.js
//
// Regression tests for the AI re-mulligan stall bug.
//
// Root cause: aiDecide had no terminal pregame state. The instant-response
// priority effect called aiDecide on every open priority window during the
// player's turn, and shouldMulligan re-evaluated every time -- firing
// duplicate MULLIGAN actions that never resolved into PASS_PRIORITY.
//
// Fix:
//   1. o.mulliganDecided flag in GameState (set by MULLIGAN reducer for 'o').
//   2. shouldMulligan bails immediately when the flag is true.
//   3. New MULLIGAN_KEEP action sets the flag when the AI keeps its opening hand.
//   4. Controller's instant-response effect rejects MULLIGAN/MULLIGAN_KEEP during
//      an open priority window (defense-in-depth), falling back to PASS_PRIORITY.
//
// Playwright eject: _factory.js exposes no seed/force-hand mechanism, so
// the e2e version of this test would depend on RNG-determined hand quality.
// These unit tests cover the engine and AI behaviour directly.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { aiDecide } from '../../src/engine/AI.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand, makeCreature } from '../../src/engine/__tests__/_factory.js';

// Build a minimal card object suitable for filling a hand / library.
function makeCard(iid, type = 'Creature') {
  return {
    iid,
    id: `card_${iid}`,
    name: `Card ${iid}`,
    type,
    subtype: '',
    color: type === 'Land' ? 'G' : 'R',
    cmc: type === 'Land' ? 0 : 2,
    cost: type === 'Land' ? '' : '1R',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    produces: type === 'Land' ? ['G'] : undefined,
    controller: 'o',
  };
}

// Build a state with mulliganDecided explicitly set for both players.
// makeState / makePlayerState do not include this field, so we extend here.
function stateWithMulliganFlag(overrides = {}, pFlag = false, oFlag = false) {
  const base = makeState(overrides);
  return {
    ...base,
    p: { ...base.p, mulliganDecided: pFlag },
    o: { ...base.o, mulliganDecided: oFlag },
  };
}

// --- MULLIGAN reducer --------------------------------------------------------

describe('@engine MULLIGAN reducer -- o.mulliganDecided flag', () => {
  it('sets o.mulliganDecided to true on the first opponent mulligan', () => {
    const cards = Array.from({ length: 14 }, (_, i) => makeCard(`c${i}`, i < 7 ? 'Land' : 'Creature'));
    const s = stateWithMulliganFlag(
      { oHand: cards.slice(0, 7), turn: 1 },
      false,
      false,
    );
    const sWithLib = { ...s, o: { ...s.o, lib: cards.slice(7) } };

    const s1 = duelReducer(sWithLib, { type: 'MULLIGAN', who: 'o' });

    expect(s1.o.mulliganDecided).toBe(true);
    expect(s1.o.mulls).toBe(1);
  });

  it('is a no-op when o.mulliganDecided is already true', () => {
    const cards = Array.from({ length: 14 }, (_, i) => makeCard(`c${i}`));
    const s = stateWithMulliganFlag(
      { oHand: cards.slice(0, 7), turn: 1 },
      false,
      true, // already decided
    );
    const sWithLib = { ...s, o: { ...s.o, lib: cards.slice(7) } };

    const s1 = duelReducer(sWithLib, { type: 'MULLIGAN', who: 'o' });

    expect(s1.o.mulliganDecided).toBe(true);
    expect(s1.o.mulls).toBe(0);
    expect(s1.o.hand.length).toBe(7);
  });

  it('does NOT set p.mulliganDecided -- player mulligans are unaffected', () => {
    const cards = Array.from({ length: 14 }, (_, i) => makeCard(`p${i}`));
    const s = stateWithMulliganFlag(
      { pHand: cards.slice(0, 7), turn: 1 },
      false,
      false,
    );
    const sWithLib = { ...s, p: { ...s.p, lib: cards.slice(7) } };

    const s1 = duelReducer(sWithLib, { type: 'MULLIGAN', who: 'p' });

    expect(s1.p.mulls).toBe(1);
    // The reducer does not write mulliganDecided for 'p'; it remains unchanged.
    expect(s1.p.mulliganDecided).toBe(false);
  });

  it('allows a second player mulligan (mulliganDecided does not block p)', () => {
    const cards = Array.from({ length: 14 }, (_, i) => makeCard(`p${i}`));
    const s = stateWithMulliganFlag(
      { pHand: cards.slice(0, 7), turn: 1 },
      false,
      false,
    );
    const sWithLib = { ...s, p: { ...s.p, lib: cards.slice(7), mulls: 1 } };

    const s1 = duelReducer(sWithLib, { type: 'MULLIGAN', who: 'p' });

    expect(s1.p.mulls).toBe(2);
  });
});

// --- MULLIGAN_KEEP reducer ---------------------------------------------------

describe('@engine MULLIGAN_KEEP reducer', () => {
  it('sets o.mulliganDecided to true without changing the hand', () => {
    const cards = Array.from({ length: 7 }, (_, i) => makeCard(`k${i}`));
    const s = stateWithMulliganFlag({ oHand: cards }, false, false);

    const s1 = duelReducer(s, { type: 'MULLIGAN_KEEP', who: 'o' });

    expect(s1.o.mulliganDecided).toBe(true);
    expect(s1.o.hand.length).toBe(7);
    expect(s1.o.mulls).toBe(0);
  });

  it('is a no-op when o.mulliganDecided is already true', () => {
    const cards = Array.from({ length: 7 }, (_, i) => makeCard(`k${i}`));
    const s = stateWithMulliganFlag({ oHand: cards }, false, true);

    const s1 = duelReducer(s, { type: 'MULLIGAN_KEEP', who: 'o' });

    expect(s1).toBe(s);
  });
});

// --- aiDecide -- shouldMulligan gating via mulliganDecided -------------------

describe('@engine aiDecide -- mulliganDecided prevents shouldMulligan from re-firing', () => {
  // Bad hand: 1 land in 7 cards -- shouldMulligan returns true.
  function badHand() {
    return [
      makeCard('l1', 'Land'),
      ...Array.from({ length: 6 }, (_, i) => makeCard(`c${i}`, 'Creature')),
    ];
  }

  it('returns MULLIGAN for a bad hand when mulliganDecided is false (turn 1, empty bf)', () => {
    // Conditions for shouldMulligan: turn===1, o.bf empty, landsPlayed===0, mulls<2.
    const s = stateWithMulliganFlag(
      { oHand: badHand(), turn: 1, phase: PHASE.MAIN_1, active: 'o' },
      false, false,
    );
    const acts = aiDecide(s);
    expect(acts[0]?.type).toBe('MULLIGAN');
    expect(acts[0]?.who).toBe('o');
  });

  it('does NOT return MULLIGAN once mulliganDecided is true (even with a bad hand)', () => {
    const s = stateWithMulliganFlag(
      { oHand: badHand(), turn: 1, phase: PHASE.MAIN_1, active: 'o' },
      false, true,
    );
    const acts = aiDecide(s);
    const hasMulligan = acts.some(a => a.type === 'MULLIGAN');
    expect(hasMulligan).toBe(false);
  });

  it('does not short-circuit for old-format states (mulliganDecided === undefined)', () => {
    // States built without mulliganDecided (e.g. existing tests) must not
    // be affected. shouldMulligan guards cover them independently.
    const s = makeState({
      oHand: badHand(),
      oBf: [makeCreature('bf1')], // bf.length > 0 -> shouldMulligan returns false
      turn: 1,
      phase: PHASE.MAIN_1,
      active: 'o',
    });
    expect(s.o.mulliganDecided).toBeUndefined();
    const acts = aiDecide(s);
    const hasMulligan = acts.some(a => a.type === 'MULLIGAN');
    expect(hasMulligan).toBe(false);
  });
});

// --- Integration: MULLIGAN dispatch seals the decision -----------------------

describe('@engine Integration: MULLIGAN dispatch -> mulliganDecided -> no re-fire', () => {
  it('a second aiDecide call after a dispatched MULLIGAN does not re-offer mulligan', () => {
    // Bad hand triggers MULLIGAN on first aiDecide call.
    const hand = [makeCard('l1', 'Land'), ...Array.from({ length: 6 }, (_, i) => makeCard(`c${i}`, 'Creature'))];
    const lib = Array.from({ length: 7 }, (_, i) => makeCard(`lib${i}`, 'Land'));
    const s0 = stateWithMulliganFlag(
      { oHand: hand, turn: 1, phase: PHASE.MAIN_1, active: 'o' },
      false, false,
    );
    const s0WithLib = { ...s0, o: { ...s0.o, lib } };

    // First call: expects MULLIGAN (bad hand, mulliganDecided: false).
    const acts0 = aiDecide(s0WithLib);
    expect(acts0[0]?.type).toBe('MULLIGAN');

    // Dispatch it so mulliganDecided becomes true.
    const s1 = duelReducer(s0WithLib, { type: 'MULLIGAN', who: 'o' });
    expect(s1.o.mulliganDecided).toBe(true);

    // Second call: mulliganDecided is true, shouldMulligan returns false immediately.
    const acts1 = aiDecide(s1);
    const hasMulligan = acts1.some(a => a.type === 'MULLIGAN');
    expect(hasMulligan).toBe(false);
  });
});
