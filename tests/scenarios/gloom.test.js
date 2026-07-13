// tests/scenarios/gloom.test.js
// Gloom: "White spells cost {3} more to cast. Activated abilities of white
// enchantments cost {3} more to activate." New shared applyCostTax() helper
// (DuelCore.js) appends a plain digit-string tax to the end of a raw cost
// string -- safe against parseMana's digit-run accumulation and the
// activated-ability cost-stripping regex chain. See docs/ENGINE_CONTRACT_SPEC.md.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { duelReducer, applyCostTax, canPay } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';
import { getManaShortfall, getMaxAffordableX } from '../../src/hooks/useDuelController';

function withMana(state, who, mana) {
  return { ...state, [who]: { ...state[who], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } } };
}

function makeGloom(iid, overrides = {}) {
  return {
    iid, id: 'gloom', name: 'Gloom', type: 'Enchantment', color: 'B', cmc: 3, cost: '2B', keywords: [],
    tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', enterTs: 1,
    ...overrides,
  };
}

function makeWhiteSpell(iid, overrides = {}) {
  return makeSpell(iid, { id: 'test_white_spell', name: 'Test White Spell', type: 'Instant', color: 'W', cost: '1W', cmc: 2, effect: undefined, ...overrides });
}

function makeWhiteEnchAbility(iid, overrides = {}) {
  return {
    iid, id: 'test_white_ench_ability', name: 'Test White Enchantment', type: 'Enchantment', color: 'W', cmc: 2, cost: '1W', keywords: [],
    tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', enterTs: 1,
    activated: { cost: '1W', effect: 'testNoop' },
    ...overrides,
  };
}

// ─── applyCostTax unit tests (GLOOM-01 .. GLOOM-06) ────────────────────────────

describe('@engine Scenario: Gloom -- applyCostTax unit tests', () => {
  it('GLOOM-01: Gloom absent -- cost string returned unchanged for both a white and a non-white card', () => {
    const state = makeState({ pBf: [], oBf: [] });
    expect(applyCostTax('1W', { color: 'W' }, state)).toBe('1W');
    expect(applyCostTax('1R', { color: 'R' }, state)).toBe('1R');
  });

  it('GLOOM-02: Gloom present, white spell, requireEnchantment false (default) -- "3" appended', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    expect(applyCostTax('1W', { color: 'W' }, state)).toBe('1W3');
  });

  it('GLOOM-03: Gloom present, non-white spell -- unchanged', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    expect(applyCostTax('2R', { color: 'R' }, state)).toBe('2R');
  });

  it('GLOOM-04: Gloom present, white enchantment permanent, requireEnchantment true -- "3" appended', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    expect(applyCostTax('W', { color: 'W', type: 'Enchantment' }, state, true)).toBe('W3');
  });

  it('GLOOM-05: Gloom present, white NON-enchantment permanent (a white creature), requireEnchantment true -- unchanged (clause 2 restriction holds)', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    expect(applyCostTax('W', { color: 'W', type: 'Creature' }, state, true)).toBe('W');
  });

  it('GLOOM-06: empty/null cost string input -- returned as-is, no error', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    expect(applyCostTax('', { color: 'W' }, state)).toBe('');
    expect(applyCostTax(null, { color: 'W' }, state)).toBe(null);
    expect(applyCostTax(undefined, { color: 'W' }, state)).toBe(undefined);
  });
});

// ─── Spell-casting integration (GLOOM-07 .. GLOOM-12) ──────────────────────────

describe('@engine Scenario: Gloom -- spell-casting integration', () => {
  it('GLOOM-07: CAST_SPELL -- a white spell costs 3 more with Gloom out; printed-cost-sufficient mana no longer suffices', () => {
    const spell = makeWhiteSpell('spell-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { W: 1, C: 1 }); // exactly the printed cost '1W'

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1' });
    expect(s1.stack.length).toBe(0);
    expect(s1.p.hand.some(c => c.iid === 'spell-1')).toBe(true);
  });

  it('GLOOM-08: CAST_SPELL -- succeeds with mana covering the tax, and payMana deducts the taxed amount', () => {
    const spell = makeWhiteSpell('spell-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { W: 1, C: 4 }); // taxed cost '1W3' -> W:1, generic:4

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.hand.some(c => c.iid === 'spell-1')).toBe(false);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it('GLOOM-09: CAST_SPELL -- a non-white spell is completely unaffected with Gloom out', () => {
    const spell = makeSpell('spell-1', { id: 'test_red_spell', name: 'Test Red Spell', type: 'Instant', color: 'R', cost: '1R', cmc: 2 });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { R: 1, C: 1 }); // exactly the printed cost

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it('GLOOM-10: Gloom removed from the battlefield mid-game -- the next white spell cast is untaxed', () => {
    const spell = makeWhiteSpell('spell-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [] }); // Gloom already gone
    state = withMana(state, 'p', { W: 1, C: 1 }); // exactly the printed cost, sufficient without Gloom

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it('GLOOM-11: CAST_SPELL -- an {X} white spell -- tax applies to the fixed portion, X itself is unaffected', () => {
    const spell = makeSpell('spell-1', { id: 'test_x_white_spell', name: 'Test X White Spell', type: 'Instant', color: 'W', cost: 'XW', cmc: 1 });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = { ...state, xVal: 2 };
    state = withMana(state, 'p', { W: 1, C: 5 }); // taxed fixed cost 'XW3' (W:1, generic:3) + X=2 -> 5 generic total

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s1.stack[0].xVal).toBe(2);
  });

  it('GLOOM-12: CAST_SPELL -- casting Gloom itself (black) while another copy is already out -- unaffected, no self-referential tax bug', () => {
    const gloomInHand = makeSpell('gloom-2', { id: 'gloom', name: 'Gloom', type: 'Enchantment', color: 'B', cost: '2B', cmc: 3 });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [gloomInHand], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { B: 1, C: 2 }); // exactly the printed cost '2B'

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'gloom-2' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });
});

// ─── Activated-ability integration (GLOOM-13 .. GLOOM-18) ──────────────────────

describe('@engine Scenario: Gloom -- activated-ability integration', () => {
  it('GLOOM-13: ACTIVATE_ABILITY -- a white enchantment\'s ability costs 3 more with Gloom out; printed-cost-sufficient mana no longer suffices', () => {
    const ench = makeWhiteEnchAbility('ench-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ench], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { W: 1, C: 1 }); // exactly the printed cost '1W'

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ench-1' });
    expect(s1.stack.length).toBe(0);
    expect(s1.p.mana).toEqual({ W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 });
  });

  it('GLOOM-14: ACTIVATE_ABILITY -- succeeds with mana covering the tax, and the correct (taxed) amount is deducted', () => {
    const ench = makeWhiteEnchAbility('ench-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ench], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { W: 1, C: 4 }); // taxed cost '1W3' -> W:1, generic:4

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ench-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it('GLOOM-15: ACTIVATE_ABILITY -- a white NON-enchantment permanent\'s ability (a white creature) is unaffected by Gloom', () => {
    const cre = makeCreature('cre-1', { id: 'test_white_creature', name: 'Test White Creature', color: 'W', controller: 'p', activated: { cost: '1W', effect: 'testNoop' } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cre], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { W: 1, C: 1 }); // exactly the printed cost -- succeeds because unaffected

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cre-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it('GLOOM-16: ACTIVATE_ABILITY -- a non-white enchantment\'s ability is unaffected by Gloom', () => {
    const ench = makeWhiteEnchAbility('ench-1', { color: 'U' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ench], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { W: 1, C: 1 }); // exactly the printed cost -- succeeds because unaffected

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ench-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it('GLOOM-17: ACTIVATE_ABILITY -- a "GG,T"-shaped cost still parses to the correct mana requirement after tax is appended (comma/tap-token stripping regression)', () => {
    const ench = makeWhiteEnchAbility('ench-1', { activated: { cost: 'GG,T', effect: 'testNoop' } });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ench], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { G: 2, C: 3 }); // taxed 'GG,T3' strips to 'GG3' -> G:2, generic:3

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ench-1' });
    expect(s1.stack.length).toBe(1);
    expect(s1.p.bf.find(c => c.iid === 'ench-1')?.tapped).toBe(true);
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  });

  it('GLOOM-18: the Pyramids array-ability cost-check site is confirmed UNCHANGED and untaxed by Gloom, even for a hypothetical white-enchantment array-ability fixture (explicit scope boundary)', () => {
    const land = makeLand('land-1', { controller: 'p' });
    const whiteArrayAbilityEnch = {
      iid: 'arr-1', id: 'test_white_array_ability_ench', name: 'Test White Array-Ability Enchantment',
      type: 'Enchantment', color: 'W', cmc: 2, cost: '1W', keywords: [],
      tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', enterTs: 1,
      activatedAbilities: [{ id: 'ability1', effect: 'preventLandDestructionOnce', cost: { generic: 2 } }],
    };
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [whiteArrayAbilityEnch, land], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    state = withMana(state, 'p', { C: 2 }); // exactly the untaxed array-ability cost -- would be insufficient (needs 5) if taxed

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'arr-1', abilityId: 'ability1', tgt: 'land-1' });
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }); // fully spent -- activation succeeded untaxed
  });
});

// ─── Client-side / shortfall (GLOOM-19 .. GLOOM-21) ────────────────────────────

describe('@engine Scenario: Gloom -- client-side shortfall and X-affordability', () => {
  it('GLOOM-19: getManaShortfall, given a tax-adjusted cost string for a white spell, correctly reports the increased needed.generic amount', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    const whiteSpellCard = { color: 'W', cost: '1W' };
    const taxedCost = applyCostTax(whiteSpellCard.cost, whiteSpellCard, state);

    const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const result = getManaShortfall(pool, taxedCost, 0);
    expect(result).not.toBeNull();
    expect(result.needed.W).toBe(1);
    expect(result.needed.generic).toBe(4); // printed generic 1 + tax 3
  });

  it('GLOOM-20: the client-side spell-cast canPay gating (useDuelController.ts:1247, the instant-cast shortcut / mana-mode fallback decision) evaluates against the taxed cost -- no @testing-library/react hook-rendering harness exists in this repo (confirmed during scoping), so this exercises the identical canPay(pool, applyCostTax(cost, card, state), xSpend) expression the hook evaluates at that call site', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    const card = { color: 'W', cost: '1W' };

    const shortPool = { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 }; // printed-cost-sufficient only
    expect(canPay(shortPool, applyCostTax(card.cost, card, state), 0)).toBe(false);

    const fullPool = { W: 1, U: 0, B: 0, R: 0, G: 0, C: 4 }; // taxed-cost-sufficient
    expect(canPay(fullPool, applyCostTax(card.cost, card, state), 0)).toBe(true);
  });

  it('GLOOM-21: getMaxAffordableX -- a real call site exists at useDuelController.ts:1190 (not dead code); the tax reduces affordable X by exactly 3 for a white X-spell', () => {
    const state = makeState({ pBf: [], oBf: [makeGloom('gloom-1', { controller: 'o' })] });
    const card = { color: 'W', cost: 'XW' };
    const pool = { W: 1, U: 0, B: 0, R: 0, G: 0, C: 5 };

    const untaxedMax = getMaxAffordableX(pool, card.cost);
    const taxedMax = getMaxAffordableX(pool, applyCostTax(card.cost, card, state));
    expect(untaxedMax).toBe(5);
    expect(taxedMax).toBe(2);
  });
});

// ─── Meta (GLOOM-22) ────────────────────────────────────────────────────────────

describe('@engine Scenario: Gloom -- stub count meta test', () => {
  it('GLOOM-22: exactly 2 lowercase effect:"stub" entries remain in cards.js (Animate Artifact, Tawnos\'s Coffin) -- Gloom no longer appears in that bucket', () => {
    const src = readFileSync(new URL('../../src/data/cards.js', import.meta.url), 'utf8');
    const matches = src.match(/effect:"stub"/g) || [];
    expect(matches).toHaveLength(2);
  });
});
