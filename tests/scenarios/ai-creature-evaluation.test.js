// tests/scenarios/ai-creature-evaluation.test.js
// Scenario tests for evaluateCreatureValue() / evaluateBoard() (src/engine/AI.js).
// Covers the Forge CreatureEvaluator port -- see docs/SYSTEMS.md and
// THIRD_PARTY_NOTICES.md for provenance.

import { describe, it, expect } from 'vitest';
import { evaluateCreatureValue, evaluateBoard } from '../../src/engine/AI.js';
import KEYWORDS from '../../src/data/keywords.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: creature evaluator (Forge CreatureEvaluator port)', () => {
  it('scores a vanilla 2/2 using the base + power/toughness/cmc formula', () => {
    const state = makeState();
    const bear = makeCreature('c1', { power: 2, toughness: 2, cmc: 2, keywords: [] });
    // base(80) + non-token(20) + power(2*15=30) + toughness(2*10=20) + cmc(2*5=10) + untapped(1)
    expect(evaluateCreatureValue(bear, state)).toBe(80 + 20 + 30 + 20 + 10 + 1);
  });

  it('values a flying creature higher than a vanilla creature of the same P/T', () => {
    const state = makeState();
    const vanilla = makeCreature('c1', { power: 2, toughness: 2, keywords: [] });
    const flyer = makeCreature('c2', { power: 2, toughness: 2, keywords: [KEYWORDS.FLYING.id] });
    expect(evaluateCreatureValue(flyer, state)).toBeGreaterThan(evaluateCreatureValue(vanilla, state));
    expect(evaluateCreatureValue(flyer, state) - evaluateCreatureValue(vanilla, state)).toBe(2 * 10);
  });

  it('values a deathtouch creature higher than a vanilla creature of the same P/T', () => {
    const state = makeState();
    const vanilla = makeCreature('c1', { power: 1, toughness: 1, keywords: [] });
    const dt = makeCreature('c2', { power: 1, toughness: 1, keywords: [KEYWORDS.DEATHTOUCH.id] });
    expect(evaluateCreatureValue(dt, state) - evaluateCreatureValue(vanilla, state)).toBe(25);
  });

  it('applies the defender penalty', () => {
    const state = makeState();
    const vanilla = makeCreature('c1', { power: 3, toughness: 3, keywords: [] });
    const wall = makeCreature('c2', { power: 3, toughness: 3, keywords: [KEYWORDS.DEFENDER.id] });
    expect(evaluateCreatureValue(wall, state)).toBe(evaluateCreatureValue(vanilla, state) - ((3 * 9) + 40));
  });

  it('stacks flying + first strike higher than either keyword alone', () => {
    const state = makeState();
    const vanilla = makeCreature('c1', { power: 3, toughness: 2, keywords: [] });
    const flyer = makeCreature('c2', { power: 3, toughness: 2, keywords: [KEYWORDS.FLYING.id] });
    const fsFlyer = makeCreature('c3', {
      power: 3, toughness: 2, keywords: [KEYWORDS.FLYING.id, KEYWORDS.FIRST_STRIKE.id],
    });
    expect(evaluateCreatureValue(fsFlyer, state)).toBeGreaterThan(evaluateCreatureValue(flyer, state));
    expect(evaluateCreatureValue(flyer, state)).toBeGreaterThan(evaluateCreatureValue(vanilla, state));
  });

  it('evaluateBoard favors a board with a high-value keyword creature over a vanilla creature of the same P/T', () => {
    const vanillaState = makeState({ oBf: [makeCreature('c1', { power: 2, toughness: 2, keywords: [] })] });
    const keywordState = makeState({
      oBf: [makeCreature('c1', {
        power: 2, toughness: 2,
        keywords: [KEYWORDS.FLYING.id, KEYWORDS.DEATHTOUCH.id, KEYWORDS.LIFELINK.id],
      })],
    });
    expect(evaluateBoard(keywordState)).toBeGreaterThan(evaluateBoard(vanillaState));
  });
});
