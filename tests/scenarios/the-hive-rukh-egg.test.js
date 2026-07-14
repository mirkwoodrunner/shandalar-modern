// tests/scenarios/the-hive-rukh-egg.test.js
// The Hive and Rukh Egg: token-creation card implementations.
// See THIRD_PARTY_NOTICES.md for Card-Forge/forge attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkDeath } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-card-scenarios-7 Scenario: The Hive, Rukh Egg', () => {

  it('The Hive: {5},{T} creates a 1/1 colorless Insect artifact creature token with flying named Wasp', () => {
    const hive = { iid: 'hive-1', id: 'the_hive', name: 'The Hive', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 5, activated: { cost: '5,T', effect: 'createWaspToken' } };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [hive] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hive-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const tokens = s2.p.bf.filter(c => c.isToken);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ tokenId: 'wasp', name: 'Wasp', power: 1, toughness: 1, keywords: ['FLYING'] });
    expect(s2.p.mana.C).toBe(0);
    expect(s2.p.bf.find(c => c.iid === 'hive-1').tapped).toBe(true);
  });

  it('Rukh Egg: dying queues a pendingEndStepToken instead of creating the Bird immediately', () => {
    const egg = makeCreature('egg-1', { id: 'rukh_egg', name: 'Rukh Egg', subtype: 'Bird Egg', color: 'R', power: 0, toughness: 3, controller: 'p', damage: 3,
      triggeredAbilities: [{ id: 'rukh_egg_dies', trigger: { event: 'ON_CREATURE_DIES', scope: 'self' }, effect: { type: 'queueEndStepToken', tokenId: 'bird_rukh', count: 1 } }] });
    const state = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [egg] });
    const s1 = checkDeath(state);
    expect(s1.p.bf.some(c => c.iid === 'egg-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'egg-1')).toBe(true);
    expect(s1.pendingEndStepTokens).toEqual([{ tokenId: 'bird_rukh', count: 1, controller: 'p' }]);
    // No Bird token yet -- it's delayed until the next end step.
    expect(s1.p.bf.some(c => c.isToken)).toBe(false);
  });

  it('Rukh Egg: the queued Bird token is created (and the queue drained) at the beginning of the next end step', () => {
    const base = makeState({ phase: PHASE.MAIN_2, active: 'p' });
    const state = { ...base, pendingEndStepTokens: [{ tokenId: 'bird_rukh', count: 1, controller: 'p' }] };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> END
    expect(s1.phase).toBe(PHASE.END);
    const birds = s1.p.bf.filter(c => c.isToken);
    expect(birds).toHaveLength(1);
    expect(birds[0]).toMatchObject({ tokenId: 'bird_rukh', name: 'Bird', power: 4, toughness: 4, color: 'R', keywords: ['FLYING'] });
    expect(s1.pendingEndStepTokens).toEqual([]);
  });

});
