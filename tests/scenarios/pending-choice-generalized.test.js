// tests/scenarios/pending-choice-generalized.test.js
// Generalize Existing Choice Mechanisms (Part 1): pendingChoice can now be
// created directly from resolveEff (createPendingChoice), not only from
// resolveTrigger()'s requiresChoice path. See docs/SYSTEMS.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkDeath } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function makeArt(iid, overrides = {}) {
  return { iid, id: 'alchorss_tomb', name: "Alchor's Tomb", type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 4, ...overrides };
}

describe('@engine-card-scenarios-7 Scenario: generalized pendingChoice (Part 1)', () => {

  it('a choice created directly from resolveEff (colorChoiceTarget, no triggered ability) resolves correctly', () => {
    const tomb = makeArt('tomb-1', { activated: { cost: '2,T', effect: 'colorChoiceTarget' } });
    const bear = makeCreature('bear-1', { controller: 'p', color: 'G' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tomb, bear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingChoice).not.toBeNull();
    expect(s2.pendingChoice.kind).toBe('colorChoice');
    expect(s2.pendingChoice.controller).toBe('p');
    expect(s2.pendingChoice.options.map(o => o.id).sort()).toEqual(['B', 'G', 'R', 'U', 'W']);

    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'U' });
    expect(s3.pendingChoice).toBeNull();
    expect(s3.p.bf.find(c => c.iid === 'bear-1').color).toBe('U');
  });

  it('colorChoiceTarget fizzles with no pendingChoice when the target is not controlled by the caster', () => {
    const tomb = makeArt('tomb-1', { activated: { cost: '2,T', effect: 'colorChoiceTarget' } });
    const oppBear = makeCreature('bear-1', { controller: 'o', color: 'G' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tomb], oBf: [oppBear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingChoice).toBeNull();
    expect(s2.o.bf.find(c => c.iid === 'bear-1').color).toBe('G');
  });

  it('existing triggered-ability choice flow (Soul Net, requiresChoice) still works unchanged', () => {
    const soulNet = {
      iid: 'sn-1', id: 'soul_net', name: 'Soul Net', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      triggeredAbilities: [{
        id: 'soulnet_trigger', trigger: { event: 'ON_CREATURE_DIES' }, requiresChoice: true,
        effect: { options: [
          { id: 'pay', label: 'Pay {1}: gain 1 life', effect: { type: 'payGenericGainLife', cost: 1, amount: 1 } },
          { id: 'decline', label: 'Decline', effect: { type: 'noop' } },
        ] },
      }],
    };
    const victim = makeCreature('v-1', { controller: 'o', toughness: 1, damage: 1 });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [soulNet], oBf: [victim] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = checkDeath(state);
    expect(s1.pendingChoice).not.toBeNull();
    expect(s1.pendingChoice.kind).toBe('triggered_ability_choice');

    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'pay' });
    expect(s2.p.life).toBe(21);
    expect(s2.p.mana.C).toBe(0);
  });
});
