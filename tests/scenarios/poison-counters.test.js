// tests/scenarios/poison-counters.test.js
// Poison counters: threshold fix (5 -> 10), grantPoisonCounters trigger effect,
// Marsh Viper / Pit Scorpion / Serpent Generator's Snake token.
// See THIRD_PARTY_NOTICES.md for Card-Forge/forge attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkWinConditions } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-card-scenarios-7 Scenario: Poison counters', () => {

  it('the win threshold is 10, not 5 (default when ruleset.poisonCountersToWin is unset)', () => {
    const s9 = makeState({ phase: PHASE.MAIN_1 });
    s9.p.poisonCounters = 9;
    expect(checkWinConditions(s9)).toBeNull();

    const s10 = makeState({ phase: PHASE.MAIN_1 });
    s10.p.poisonCounters = 10;
    expect(checkWinConditions(s10)).toEqual({ winner: 'o', reason: 'POISON' });
  });

  it('a player with 5 poison counters (old default) does not lose', () => {
    const s5 = makeState({ phase: PHASE.MAIN_1 });
    s5.o.poisonCounters = 5;
    expect(checkWinConditions(s5)).toBeNull();
  });

  it('Marsh Viper: unblocked combat damage to a player grants 2 poison counters', () => {
    const viper = makeCreature('mv-1', {
      id: 'marsh_viper', name: 'Marsh Viper', subtype: 'Snake', color: 'G', power: 1, toughness: 2, controller: 'o',
      triggeredAbilities: [{ id: 'marsh_viper_poison', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSourceToPlayer' }, effect: { type: 'grantPoisonCounters', amount: 2 } }],
    });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [viper] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'mv-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s5.p.poisonCounters).toBe(2);
  });

  it('Pit Scorpion: unblocked combat damage to a player grants 1 poison counter', () => {
    const scorpion = makeCreature('ps-1', {
      id: 'pit_scorpion', name: 'Pit Scorpion', subtype: 'Scorpion', color: 'B', power: 1, toughness: 1, controller: 'o',
      triggeredAbilities: [{ id: 'pit_scorpion_poison', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSourceToPlayer' }, effect: { type: 'grantPoisonCounters', amount: 1 } }],
    });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [scorpion] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'ps-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s5.p.poisonCounters).toBe(1);
  });

  it('grantPoisonCounters does not fire when the damage target is a creature, not a player', () => {
    const viper = makeCreature('mv-1', {
      id: 'marsh_viper', name: 'Marsh Viper', subtype: 'Snake', color: 'G', power: 1, toughness: 2, controller: 'o',
      triggeredAbilities: [{ id: 'marsh_viper_poison', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSourceToPlayer' }, effect: { type: 'grantPoisonCounters', amount: 2 } }],
    });
    const blocker = makeCreature('bl-1', { controller: 'p', power: 2, toughness: 5 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [viper], pBf: [blocker] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'mv-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'mv-1', blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s6.p.poisonCounters || 0).toBe(0);
    expect(s6.o.poisonCounters || 0).toBe(0);
  });

  it('Serpent Generator token: the created Snake carries the same poison-granting trigger', () => {
    const snakeToken = {
      iid: 'sn-1', tokenId: 'snake_poison', id: 'snake_poison', name: 'Snake', type: 'Artifact Creature', subtype: 'Snake',
      isToken: true, controller: 'o', power: 1, toughness: 1, damage: 0, counters: {}, keywords: [], tapped: false, enchantments: [], summoningSick: false,
      triggeredAbilities: [{ id: 'snake_poison_dmg', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSourceToPlayer' }, effect: { type: 'grantPoisonCounters', amount: 1 } }],
    };
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [snakeToken] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'sn-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s5.p.poisonCounters).toBe(1);
  });

  it('the alt-loss condition actually ends the duel once a player reaches 10 poison counters', () => {
    const viper = makeCreature('mv-1', {
      id: 'marsh_viper', name: 'Marsh Viper', subtype: 'Snake', color: 'G', power: 1, toughness: 2, controller: 'o',
      triggeredAbilities: [{ id: 'marsh_viper_poison', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSourceToPlayer' }, effect: { type: 'grantPoisonCounters', amount: 2 } }],
    });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [viper] });
    state.p.poisonCounters = 9;
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'mv-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s5.p.poisonCounters).toBe(11);
    expect(s5.over).toEqual({ winner: 'o', reason: 'POISON' });
  });

});
