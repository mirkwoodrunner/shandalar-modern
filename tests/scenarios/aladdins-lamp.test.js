import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { makeState } from '../../src/engine/__tests__/_factory.js';

describe('@engine-card-scenarios-2 Aladdin\'s Lamp', () => {
  it('AL-01: activate X=3 pushes charge', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    state.p.mana = { C: 10, W: 0, U: 0, B: 0, R: 0, G: 0 };
    const lampCard = { iid: 'lamp1', id: 'aladdinss_lamp', name: 'Aladdin\'s Lamp', type: 'Artifact', cost: '3', cmc: 3, activated: { cost: 'X,T', effect: 'aladdinsLampCharge' }, tapped: false };
    state.p.bf = [lampCard];

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lamp1', xVal: 3 });
    expect(s1.p.lampCharges?.length ?? 0).toBeGreaterThan(0);
  });

  it('AL-02: X<1 fizzles', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    state.p.mana = { C: 10, W: 0, U: 0, B: 0, R: 0, G: 0 };
    const lampCard = { iid: 'lamp1', id: 'aladdinss_lamp', name: 'Aladdin\'s Lamp', type: 'Artifact', activated: { cost: 'X,T', effect: 'aladdinsLampCharge' }, tapped: false };
    state.p.bf = [lampCard];

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lamp1', xVal: 0 });
    expect(s1.p.lampCharges?.length ?? 0).toBe(0); // Should fizzle, no charge
  });

  it('AL-03: draw suspends on pending lamp pick', () => {
    const state = makeState();
    state.p.lib = [
      { iid: 'c1', name: 'Card 1', type: 'Sorcery' },
      { iid: 'c2', name: 'Card 2', type: 'Sorcery' },
      { iid: 'c3', name: 'Card 3', type: 'Sorcery' },
    ];
    state.p.lampCharges = [3];
    const s1 = duelReducer(state, { type: 'DRAW', who: 'p', n: 1 });
    // Should have created pendingLampPicks entry
    expect(s1.pendingLampPicks?.length).toBe(1);
    expect(s1.p.hand.length).toBe(0); // No draw yet
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
    expect(s1.p.lib[0].iid).toBe('c2'); // Chosen card is on top
    expect(s1.pendingLampPicks?.length ?? 0).toBe(0);
  });

  it('AL-14: CLEANUP clears unused charges', () => {
    const state = makeState({ phase: PHASE.END, active: 'p' });
    state.p.lampCharges = [3, 5];
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.lampCharges?.length ?? 0).toBe(0);
  });
});
