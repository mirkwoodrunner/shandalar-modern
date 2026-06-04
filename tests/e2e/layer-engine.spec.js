// tests/e2e/layer-engine.spec.js
//
// Layer Engine regression tests (LYR-01 through LYR-06).
//
// Tests verify that computeCharacteristics() correctly applies CR 613 layer
// ordering for lord effects (7c), absolute set P/T (7b), CDA evaluators (7a),
// and that 7b records stored in eotBuffs are never baked at cast time.
//
// All tests use page.evaluate with dynamic import of the engine modules so they
// exercise the real production code without a full browser duel session.

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared card factories (inline -- these are e2e fixtures, not engine tests)
// ---------------------------------------------------------------------------

function makeCreature(overrides) {
  return {
    iid: overrides.iid ?? 'c-1',
    id: overrides.id ?? 'test_creature',
    name: overrides.name ?? 'Test Creature',
    type: 'Creature',
    subtype: overrides.subtype ?? '',
    color: overrides.color ?? 'R',
    cmc: overrides.cmc ?? 2,
    cost: overrides.cost ?? '1R',
    power: overrides.power ?? 1,
    toughness: overrides.toughness ?? 1,
    keywords: overrides.keywords ?? [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: overrides.counters ?? {},
    eotBuffs: overrides.eotBuffs ?? [],
    enchantments: [],
    effect: overrides.effect ?? null,
    controller: overrides.controller ?? 'p',
    enterTs: overrides.enterTs ?? 0,
    ...(overrides.layerDef ? { layerDef: overrides.layerDef } : {}),
    ...(overrides.subtype2 ? { subtype2: overrides.subtype2 } : {}),
  };
}

function makeLand(overrides) {
  return {
    iid: overrides.iid ?? 'l-1',
    id: overrides.id ?? 'mountain',
    name: overrides.name ?? 'Mountain',
    type: 'Land',
    subtype: overrides.subtype ?? 'Mountain',
    color: overrides.color ?? 'R',
    cmc: 0,
    cost: '',
    keywords: [],
    tapped: overrides.tapped ?? false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    produces: overrides.produces ?? ['R'],
    controller: overrides.controller ?? 'p',
    enterTs: overrides.enterTs ?? 0,
  };
}

function makeState(overrides) {
  return {
    p: {
      life: 20,
      mana: {},
      hand: [],
      bf: overrides.pBf ?? [],
      graveyard: [],
    },
    o: {
      life: 20,
      mana: {},
      hand: [],
      bf: overrides.oBf ?? [],
      graveyard: [],
    },
    stack: [],
    phase: 'MAIN_1',
    active: 'p',
    turnState: {},
    layerClock: overrides.layerClock ?? 0,
  };
}

// ---------------------------------------------------------------------------

test.describe('Layer Engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  // -------------------------------------------------------------------------
  // LYR-01: Lord effect (Layer 7c) — goblin lord grants +1/+1 to goblins
  // A 1/1 goblin controlled by the same player who controls a goblin lord
  // should compute as 2/2. A non-goblin 1/1 should remain 1/1.
  // -------------------------------------------------------------------------
  test('LYR-01: lord effect pumps matching subtype creature via Layer 7c', async ({ page }) => {
    const goblin = makeCreature({
      iid: 'gob-1', id: 'goblin_token', name: 'Goblin',
      subtype: 'Goblin', color: 'R', power: 1, toughness: 1, controller: 'p',
    });
    const lord = makeCreature({
      iid: 'lord-1', id: 'goblin_king', name: 'Goblin King',
      subtype: 'Goblin', color: 'R', power: 2, toughness: 2, controller: 'p',
      effect: 'lordEffect',
    });
    const nonGoblin = makeCreature({
      iid: 'bear-1', id: 'grizzly_bears', name: 'Grizzly Bears',
      subtype: 'Bear', color: 'G', power: 2, toughness: 2, controller: 'p',
    });

    const result = await page.evaluate(async ({ goblin, lord, nonGoblin }) => {
      const { computeCharacteristics } = await import('/src/engine/layers.js');
      const state = {
        p: { life: 20, mana: {}, hand: [], bf: [goblin, lord, nonGoblin], graveyard: [] },
        o: { life: 20, mana: {}, hand: [], bf: [], graveyard: [] },
        stack: [], phase: 'MAIN_1', active: 'p', turnState: {}, layerClock: 0,
      };
      const goblinCh = computeCharacteristics(goblin, state);
      const nonGoblinCh = computeCharacteristics(nonGoblin, state);
      return {
        goblinPow: goblinCh.power,
        goblinTou: goblinCh.toughness,
        nonGoblinPow: nonGoblinCh.power,
        nonGoblinTou: nonGoblinCh.toughness,
      };
    }, { goblin, lord, nonGoblin });

    // Goblin King gives +1/+1 to other goblins
    expect(result.goblinPow).toBe(2);
    expect(result.goblinTou).toBe(2);
    // Non-goblin unaffected
    expect(result.nonGoblinPow).toBe(2);
    expect(result.nonGoblinTou).toBe(2);
  });

  // -------------------------------------------------------------------------
  // LYR-02: Sorceress Queen Layer 7b record — eotBuffs stores layerDef, not delta
  // When a creature has { layerDef: { layer:"7b", setPower:0, setToughness:2 } }
  // in its eotBuffs, computeCharacteristics should return power=0, toughness=2
  // regardless of the card's base stats.
  // -------------------------------------------------------------------------
  test('LYR-02: Layer 7b eotBuff sets absolute P/T overriding base stats', async ({ page }) => {
    const target = makeCreature({
      iid: 'tgt-1', name: 'Hill Giant', power: 3, toughness: 3, controller: 'o',
      eotBuffs: [{ layerDef: { layer: '7b', setPower: 0, setToughness: 2 } }],
    });

    const result = await page.evaluate(async ({ target }) => {
      const { computeCharacteristics } = await import('/src/engine/layers.js');
      const state = {
        p: { life: 20, mana: {}, hand: [], bf: [], graveyard: [] },
        o: { life: 20, mana: {}, hand: [], bf: [target], graveyard: [] },
        stack: [], phase: 'MAIN_1', active: 'p', turnState: {}, layerClock: 0,
      };
      const ch = computeCharacteristics(target, state);
      return { power: ch.power, toughness: ch.toughness };
    }, { target });

    expect(result.power).toBe(0);
    expect(result.toughness).toBe(2);
  });

  // -------------------------------------------------------------------------
  // LYR-03: 7b record is NOT baked at activation time
  // A 3/3 and a 5/5 both under Sorceress Queen effect should both read as 0/2,
  // proving the record is evaluated fresh each call, not stored as a delta.
  // -------------------------------------------------------------------------
  test('LYR-03: Layer 7b evaluates fresh each call, not baked at activation time', async ({ page }) => {
    const smallTarget = makeCreature({
      iid: 'sm-1', name: 'Small Creature', power: 1, toughness: 1, controller: 'o',
      eotBuffs: [{ layerDef: { layer: '7b', setPower: 0, setToughness: 2 } }],
    });
    const largeTarget = makeCreature({
      iid: 'lg-1', name: 'Large Creature', power: 7, toughness: 7, controller: 'o',
      eotBuffs: [{ layerDef: { layer: '7b', setPower: 0, setToughness: 2 } }],
    });

    const result = await page.evaluate(async ({ smallTarget, largeTarget }) => {
      const { computeCharacteristics } = await import('/src/engine/layers.js');
      const state = {
        p: { life: 20, mana: {}, hand: [], bf: [], graveyard: [] },
        o: { life: 20, mana: {}, hand: [], bf: [smallTarget, largeTarget], graveyard: [] },
        stack: [], phase: 'MAIN_1', active: 'p', turnState: {}, layerClock: 0,
      };
      const smCh = computeCharacteristics(smallTarget, state);
      const lgCh = computeCharacteristics(largeTarget, state);
      return {
        smallPow: smCh.power, smallTou: smCh.toughness,
        largePow: lgCh.power, largeTou: lgCh.toughness,
      };
    }, { smallTarget, largeTarget });

    // Both should be 0/2 regardless of base stats
    expect(result.smallPow).toBe(0);
    expect(result.smallTou).toBe(2);
    expect(result.largePow).toBe(0);
    expect(result.largeTou).toBe(2);
  });

  // -------------------------------------------------------------------------
  // LYR-04: Plague Rats CDA (Layer 7a) — P/T equals count of all Plague Rats
  // Two Plague Rats on the battlefield should each compute as 2/2, not 0/0.
  // -------------------------------------------------------------------------
  test('LYR-04: Plague Rats CDA produces P/T equal to Plague Rats count', async ({ page }) => {
    const rat1 = makeCreature({
      iid: 'rat-1', id: 'plague_rats', name: 'Plague Rats',
      power: 0, toughness: 0, controller: 'p',
      layerDef: { layer: '7a', powerFn: 'plagueRats', toughnessFn: 'plagueRats' },
    });
    const rat2 = makeCreature({
      iid: 'rat-2', id: 'plague_rats', name: 'Plague Rats',
      power: 0, toughness: 0, controller: 'p',
      layerDef: { layer: '7a', powerFn: 'plagueRats', toughnessFn: 'plagueRats' },
    });

    const result = await page.evaluate(async ({ rat1, rat2 }) => {
      const { computeCharacteristics } = await import('/src/engine/layers.js');
      const state = {
        p: { life: 20, mana: {}, hand: [], bf: [rat1, rat2], graveyard: [] },
        o: { life: 20, mana: {}, hand: [], bf: [], graveyard: [] },
        stack: [], phase: 'MAIN_1', active: 'p', turnState: {}, layerClock: 0,
      };
      const ch1 = computeCharacteristics(rat1, state);
      const ch2 = computeCharacteristics(rat2, state);
      return {
        rat1Pow: ch1.power, rat1Tou: ch1.toughness,
        rat2Pow: ch2.power, rat2Tou: ch2.toughness,
      };
    }, { rat1, rat2 });

    // 2 rats on BF => each should be 2/2
    expect(result.rat1Pow).toBe(2);
    expect(result.rat1Tou).toBe(2);
    expect(result.rat2Pow).toBe(2);
    expect(result.rat2Tou).toBe(2);
  });

  // -------------------------------------------------------------------------
  // LYR-05: Keldon Warlord CDA (Layer 7a) — P/T = untapped creatures you control
  // Warlord + 2 untapped creatures: warlord itself does not count itself, so
  // the warlord should be 2/2 (counting the other two untapped creatures).
  // -------------------------------------------------------------------------
  test('LYR-05: Keldon Warlord CDA counts other untapped controlled creatures', async ({ page }) => {
    const warlord = makeCreature({
      iid: 'kw-1', id: 'keldon_warlord', name: 'Keldon Warlord',
      power: 0, toughness: 0, controller: 'p',
      layerDef: { layer: '7a', powerFn: 'keldonWarlord', toughnessFn: 'keldonWarlord' },
    });
    const ally1 = makeCreature({
      iid: 'ally-1', name: 'Ally 1', power: 1, toughness: 1, controller: 'p', tapped: false,
    });
    const ally2 = makeCreature({
      iid: 'ally-2', name: 'Ally 2', power: 1, toughness: 1, controller: 'p', tapped: false,
    });

    const result = await page.evaluate(async ({ warlord, ally1, ally2 }) => {
      const { computeCharacteristics } = await import('/src/engine/layers.js');
      const state = {
        p: { life: 20, mana: {}, hand: [], bf: [warlord, ally1, ally2], graveyard: [] },
        o: { life: 20, mana: {}, hand: [], bf: [], graveyard: [] },
        stack: [], phase: 'MAIN_1', active: 'p', turnState: {}, layerClock: 0,
      };
      const ch = computeCharacteristics(warlord, state);
      return { power: ch.power, toughness: ch.toughness };
    }, { warlord, ally1, ally2 });

    // 2 other untapped creatures => Keldon Warlord is 2/2
    expect(result.power).toBe(2);
    expect(result.toughness).toBe(2);
  });

  // -------------------------------------------------------------------------
  // LYR-06: Two 7b records coexist — last timestamp wins
  // A creature with two 7b eotBuffs from different sources; the second (higher
  // enterTs) should win. No crash. Final P/T is the second record's values.
  // -------------------------------------------------------------------------
  test('LYR-06: two Layer 7b eotBuff records coexist without crash; last-applied wins', async ({ page }) => {
    const target = makeCreature({
      iid: 'tgt-1', name: 'Big Creature', power: 5, toughness: 5, controller: 'o',
      eotBuffs: [
        { layerDef: { layer: '7b', setPower: 0, setToughness: 2 }, enterTs: 1 },
        { layerDef: { layer: '7b', setPower: 1, setToughness: 1 }, enterTs: 2 },
      ],
    });

    const result = await page.evaluate(async ({ target }) => {
      const { computeCharacteristics } = await import('/src/engine/layers.js');
      const state = {
        p: { life: 20, mana: {}, hand: [], bf: [], graveyard: [] },
        o: { life: 20, mana: {}, hand: [], bf: [target], graveyard: [] },
        stack: [], phase: 'MAIN_1', active: 'p', turnState: {}, layerClock: 2,
      };
      let threw = false;
      let power = null, toughness = null;
      try {
        const ch = computeCharacteristics(target, state);
        power = ch.power;
        toughness = ch.toughness;
      } catch (e) {
        threw = true;
      }
      return { threw, power, toughness };
    }, { target });

    expect(result.threw).toBe(false);
    // Second record (enterTs:2) wins — 1/1
    expect(result.power).toBe(1);
    expect(result.toughness).toBe(1);
  });
});
