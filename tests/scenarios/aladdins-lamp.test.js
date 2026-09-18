/**
 * @module-tag engine
 */
import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { makeState } from '../../src/engine/__tests__/_factory.js';
import { PHASE } from '../../src/engine/phases.js';

describe('@engine-card-scenarios-2 Aladdin\'s Lamp', () => {
  // 2026-09-18: AL-01 and AL-02 asserted on the state returned by
  // ACTIVATE_ABILITY itself. Since the Sprint 7 universal-stack change
  // (CLAUDE.md -- Stack Resolution), ACTIVATE_ABILITY only pushes the ability
  // onto s.stack and opens a priority window; aladdinsLampCharge does not run
  // until RESOLVE_STACK. AL-01 therefore failed and AL-02 passed vacuously
  // (nothing had resolved yet, so "no charge" was true either way). Both now
  // resolve the stack before asserting.
  it('AL-01: activate X=3 pushes charge', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    state.p.mana = { C: 10, W: 0, U: 0, B: 0, R: 0, G: 0 };
    const lampCard = { iid: 'lamp1', id: 'aladdinss_lamp', name: 'Aladdin\'s Lamp', type: 'Artifact', cost: '3', cmc: 3, activated: { cost: 'X,T', effect: 'aladdinsLampCharge' }, tapped: false };
    state.p.bf = [lampCard];

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lamp1', xVal: 3 });
    expect(s1.stack).toHaveLength(1);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.lampCharges).toEqual([3]);
  });

  it('AL-02: X<1 fizzles', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    state.p.mana = { C: 10, W: 0, U: 0, B: 0, R: 0, G: 0 };
    const lampCard = { iid: 'lamp1', id: 'aladdinss_lamp', name: 'Aladdin\'s Lamp', type: 'Artifact', activated: { cost: 'X,T', effect: 'aladdinsLampCharge' }, tapped: false };
    state.p.bf = [lampCard];

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lamp1', xVal: 0 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.lampCharges?.length ?? 0).toBe(0); // Should fizzle, no charge
  });

  // 2026-09-18: this case used to dispatch { type: 'DRAW', who: 'p', n: 1 },
  // which is not an action type duelReducer handles -- it fell through to
  // `default: return s`, so the test asserted against an untouched state and
  // never exercised the lamp's draw replacement at all. Driving the real draw
  // step instead (turn 2 so the first-turn draw skip does not apply).
  it('AL-03: draw suspends on pending lamp pick', () => {
    const state = makeState({ phase: PHASE.UPKEEP, active: 'p', turn: 2 });
    state.p.lib = [
      { iid: 'c1', name: 'Card 1', type: 'Sorcery' },
      { iid: 'c2', name: 'Card 2', type: 'Sorcery' },
      { iid: 'c3', name: 'Card 3', type: 'Sorcery' },
    ];
    state.p.lampCharges = [3];
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    // Should have created pendingLampPicks entry
    expect(s1.pendingLampPicks?.length).toBe(1);
    expect(s1.pendingLampPicks[0].who).toBe('p');
    expect(s1.pendingLampPicks[0].cardIids).toEqual(['c1', 'c2', 'c3']);
    expect(s1.p.hand.length).toBe(0); // No draw yet
    expect(s1.p.lampCharges).toEqual([]); // Charge consumed
  });

  it('AL-04: LAMP_PICK draws and reorders library', () => {
    const state = makeState();
    state.p.lib = [
      { iid: 'c1', name: 'Card 1', type: 'Sorcery' },
      { iid: 'c2', name: 'Card 2', type: 'Sorcery' },
      { iid: 'c3', name: 'Card 3', type: 'Sorcery' },
    ];
    state.pendingLampPicks = [{
      who: 'p',
      x: 3,
      cardIids: ['c1', 'c2', 'c3'],
      remainingDraws: 0,
      followUps: [],
    }];
    const s1 = duelReducer(state, { type: 'LAMP_PICK', iid: 'c2' });
    expect(s1.p.hand.length).toBe(1);
    expect(s1.p.hand[0].iid).toBe('c2');
    // 2026-09-18: the old assertion here was `s1.p.lib[0].iid === 'c2'` with the
    // comment "chosen card is on top". That describes the intermediate state
    // only. LAMP_PICK puts the chosen card on top and then immediately performs
    // the replaced draw (oracle: "...then draw a card"), so c2 ends in hand and
    // cannot also be in the library -- it contradicted the line above it. The
    // two unchosen cards go to the bottom "in a random order" via shuffle(), so
    // their order is not assertable; assert membership instead.
    expect(s1.p.lib.map(c => c.iid).sort()).toEqual(['c1', 'c3']);
    expect(s1.pendingLampPicks?.length ?? 0).toBe(0);
  });

  it('AL-14: CLEANUP clears unused charges', () => {
    const state = makeState({ phase: PHASE.END, active: 'p' });
    state.p.lampCharges = [3, 5];
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.lampCharges?.length ?? 0).toBe(0);
  });
});
