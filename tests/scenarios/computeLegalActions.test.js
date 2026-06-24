import { describe, it, expect } from 'vitest';
import { computeLegalActions } from '../../src/engine/LegalActions.js';
import { buildDuelState } from '../../src/engine/DuelCore.js';
import { RULESETS } from '../../src/data/rulesets.js';
import { ARCHETYPES } from '../../src/data/cards.js';

const ALL_PHASES = ['MAIN_1', 'MAIN_2', 'COMBAT_ATTACKERS', 'COMBAT_BLOCKERS', 'UPKEEP', 'END'];

describe('@engine computeLegalActions -- index 0 invariant', () => {
  const state = buildDuelState(ARCHETYPES.BOSS_RED.deck, 'BOSS_RED', RULESETS.CLASSIC);

  for (const phase of ALL_PHASES) {
    it(`index 0 is PASS_PRIORITY for phase ${phase}`, () => {
      const actions = computeLegalActions(state, phase);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].type).toBe('PASS_PRIORITY');
    });
  }
});

describe('@engine computeLegalActions -- does not throw on empty board', () => {
  it('handles empty hand and battlefield without throwing', () => {
    const state = buildDuelState(ARCHETYPES.BOSS_RED.deck, 'BOSS_RED', RULESETS.CLASSIC);
    const emptyState = {
      ...state,
      o: { ...state.o, hand: [], bf: [] },
      p: { ...state.p, bf: [] },
      attackers: [],
    };
    for (const phase of ALL_PHASES) {
      expect(() => computeLegalActions(emptyState, phase)).not.toThrow();
    }
  });
});

describe('@engine computeLegalActions -- COMBAT_BLOCKERS attacker lookup', () => {
  it('does not throw with empty attacker list', () => {
    const state = buildDuelState(ARCHETYPES.BOSS_RED.deck, 'BOSS_RED', RULESETS.CLASSIC);
    const noAttackers = { ...state, attackers: [] };
    expect(() => computeLegalActions(noAttackers, 'COMBAT_BLOCKERS')).not.toThrow();
  });
});
