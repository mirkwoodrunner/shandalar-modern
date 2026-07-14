// tests/scenarios/coral-helm.test.js
// Coral Helm: {3}, Discard a card at random: Target creature gets +2/+2 until end of turn.
// Verifies the discardRandom cost token, pumpCreature eotBuff, and preflight guard.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

function makeHelm(overrides = {}) {
  return {
    iid: 'helm-1',
    id: 'coral_helm',
    name: 'Coral Helm',
    type: 'Artifact',
    color: '',
    cmc: 3,
    cost: '3',
    keywords: [],
    rarity: 'U',
    text: '{3}, Discard a card at random: Target creature gets +2/+2 until end of turn.',
    activated: { cost: '3,discardRandom', effect: 'pumpCreature' },
    mod: { power: 2, toughness: 2 },
    tapped: false,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'p',
    ...overrides,
  };
}

describe('@engine-card-scenarios-4 Coral Helm -- discardRandom cost + pumpCreature', () => {

  it('HELM-01: activation discards a hand card and pumps the target creature +2/+2', () => {
    const helm = makeHelm();
    const bear = makeCreature('bear-1', { controller: 'p' });
    const handCard = makeSpell('spell-1', { controller: 'p', id: 'lightning_bolt', name: 'Lightning Bolt' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [helm, bear], pHand: [handCard] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'helm-1', tgt: 'bear-1' });
    // discardRandom cost should have consumed the hand card and pushed the ability to the stack
    expect(s1.p.hand).toHaveLength(0);
    expect(s1.stack).toHaveLength(1);

    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const pumped = s2.p.bf.find(c => c.iid === 'bear-1');
    expect(pumped.eotBuffs).toHaveLength(1);
    expect(pumped.eotBuffs[0].power).toBe(2);
    expect(pumped.eotBuffs[0].toughness).toBe(2);
  });

  it('HELM-02: the +2/+2 buff is absent after CLEANUP', () => {
    const helm = makeHelm();
    const bear = makeCreature('bear-1', { controller: 'p' });
    const handCard = makeSpell('spell-1', { controller: 'p', id: 'lightning_bolt', name: 'Lightning Bolt' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [helm, bear], pHand: [handCard] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'helm-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    // Advance through CLEANUP to clear eotBuffs
    const cleanup = { ...s2, phase: PHASE.CLEANUP };
    const s3 = duelReducer(cleanup, { type: 'ADVANCE_PHASE' });
    const bear3 = s3.p.bf.find(c => c.iid === 'bear-1') || s3.o.bf.find(c => c.iid === 'bear-1');
    expect(bear3.eotBuffs).toHaveLength(0);
  });

  it('HELM-03: activation is rejected at preflight when the activating player has no cards in hand', () => {
    const helm = makeHelm();
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [helm, bear], pHand: [] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } };

    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'helm-1', tgt: 'bear-1' });
    expect(ns.stack).toHaveLength(0);
    expect(ns.p.hand).toHaveLength(0);
    const bear2 = ns.p.bf.find(c => c.iid === 'bear-1');
    expect(bear2.eotBuffs).toHaveLength(0);
  });

  it('HELM-04: ability is not pushed to the stack when the player cannot afford the {3} mana cost', () => {
    const helm = makeHelm();
    const bear = makeCreature('bear-1', { controller: 'p' });
    const handCard = makeSpell('spell-1', { controller: 'p', id: 'lightning_bolt', name: 'Lightning Bolt' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [helm, bear], pHand: [handCard] });
    // mana is 0 -- cannot afford {3}; UI/AI gate prevents this dispatch in practice
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } };

    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'helm-1', tgt: 'bear-1' });
    // The ability never reaches the stack; the creature is not pumped
    expect(ns.stack).toHaveLength(0);
    const bear2 = ns.p.bf.find(c => c.iid === 'bear-1');
    expect(bear2.eotBuffs).toHaveLength(0);
  });

});
