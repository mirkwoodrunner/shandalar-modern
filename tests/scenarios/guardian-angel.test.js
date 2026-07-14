import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-card-scenarios-5 Guardian Angel', () => {
  it('GA-01: prevents X damage to creature', () => {
    const tgt = makeCreature('c1');
    const gaCard = { iid: 'ga1', id: 'guardian_angel', name: 'Guardian Angel', type: 'Enchantment', cost: 'W', cmc: 1, effect: 'guardianAngel', requiresTarget: true };
    const state = makeState({ pBf: [tgt], pHand: [gaCard] });
    const s1 = duelReducer(state, {
      type: 'CAST_SPELL',
      who: 'p',
      iid: 'ga1',
      tgt: 'c1',
      xVal: 3,
    });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const resolved = s2.p.bf.find(c => c.iid === 'c1');
    expect(resolved.damageShield).toBe(3);
  });

  it('GA-03: creates tempAbilities entry on resolution', () => {
    const gaCard = { iid: 'ga1', id: 'guardian_angel', name: 'Guardian Angel', type: 'Enchantment', cost: 'W', cmc: 1, effect: 'guardianAngel' };
    const state = makeState({ pHand: [gaCard] });
    const s1 = duelReducer(state, {
      type: 'CAST_SPELL',
      who: 'p',
      iid: 'ga1',
      tgt: 'p',
      xVal: 2,
    });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.tempAbilities?.length).toBe(1);
    expect(s2.p.tempAbilities[0].cost).toBe('1');
  });

  it('GA-04: ACTIVATE_TEMP_ABILITY pays mana and applies shield', () => {
    const state = makeState({
      phase: PHASE.MAIN_1,
      active: 'p',
    });
    state.p.mana = { C: 5, W: 0, U: 0, B: 0, R: 0, G: 0 };
    state.p.tempAbilities = [{
      id: 'temp1',
      source: 'guardian_angel',
      label: 'GA — pay {1}: prevent 1',
      cost: '1',
      kind: 'preventOne',
      targetPlayer: 'p',
      targetIid: null,
    }];
    const s1 = duelReducer(state, { type: 'ACTIVATE_TEMP_ABILITY', who: 'p', tempId: 'temp1' });
    expect(s1.p.damageShield).toBe(1);
    expect(s1.p.mana.C).toBe(4);
  });

  it('GA-05: refuses activation without mana', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    state.p.mana = { C: 0, W: 0, U: 0, B: 0, R: 0, G: 0 };
    state.p.tempAbilities = [{
      id: 'temp1',
      source: 'guardian_angel',
      label: 'GA',
      cost: '1',
      kind: 'preventOne',
      targetPlayer: 'p',
      targetIid: null,
    }];
    const s1 = duelReducer(state, { type: 'ACTIVATE_TEMP_ABILITY', who: 'p', tempId: 'temp1' });
    expect(s1.p.mana.C).toBe(0);
    expect(s1.log[s1.log.length - 1].text).toContain('Not enough mana');
  });

  it('GA-09: CLEANUP clears tempAbilities', () => {
    const state = makeState({ phase: PHASE.END, active: 'p' });
    state.p.tempAbilities = [{ id: 'temp1', source: 'guardian_angel', label: 'GA', cost: '1', kind: 'preventOne', targetPlayer: 'p', targetIid: null }];
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.tempAbilities.length).toBe(0);
  });
});
