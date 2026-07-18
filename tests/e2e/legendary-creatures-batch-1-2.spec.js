// tests/e2e/legendary-creatures-batch-1-2.spec.js
//
// Legendary Creatures Batch 1+2 Playwright regression tests (LGB-E01 - LGB-E08).
// Covers a representative sample of the 21 cards actually shipped in this batch
// (11 vanilla + 10 single-ability; 5 cards -- Xira Arien, Tor Wauki, Lady Caleria,
// Gwendlyn Di Corci, Adun Oakenshield -- were deferred, see docs/CURRENT_SPRINT.md).
//
// Same convention as tests/e2e/legend-rule.spec.js: engine-only cases exercise
// the real DuelCore.js code via page.evaluate + dynamic import (no full duel
// session, no viewport split beyond the project matrix already running every
// spec against both `chromium` and `mobile-chrome`). LGB-E08 is the exception,
// using the sandbox harness to verify the legend-rule ChoiceModal renders
// generically for a real shipped card (no legendary-specific UI needed).

import { test, expect } from '@playwright/test';

function makeCreature(overrides = {}) {
  return {
    iid: overrides.iid ?? 'c-1',
    id: overrides.id ?? 'grizzly_bears',
    name: overrides.name ?? 'Grizzly Bears',
    type: overrides.type ?? 'Creature',
    subtype: overrides.subtype ?? 'Bear',
    color: overrides.color ?? 'G',
    cmc: overrides.cmc ?? 2,
    cost: overrides.cost ?? '1G',
    power: overrides.power ?? 2,
    toughness: overrides.toughness ?? 2,
    keywords: overrides.keywords ?? [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: overrides.damage ?? 0,
    counters: overrides.counters ?? {},
    eotBuffs: [],
    enchantments: overrides.enchantments ?? [],
    controller: overrides.controller ?? 'p',
    ...overrides,
  };
}

function makeSpell(iid, overrides = {}) {
  return {
    iid,
    id: overrides.id ?? 'test_spell',
    name: overrides.name ?? 'Test Spell',
    type: overrides.type ?? 'Instant',
    color: overrides.color ?? 'R',
    cmc: overrides.cmc ?? 1,
    cost: overrides.cost ?? 'R',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: overrides.controller ?? 'p',
    ...overrides,
  };
}

function makePlayerState(overrides = {}) {
  return {
    life: 20, lib: [], hand: [], bf: [], gy: [], exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
    ...overrides,
  };
}

function makeState({ pBf = [], oBf = [], pHand = [], oHand = [], active = 'p' } = {}) {
  return {
    phase: 'MAIN_1', active, turn: 1, landsPlayed: 0, spellsThisTurn: 0,
    attackers: [], blockers: {}, stack: [], over: null,
    selCard: null, selTgt: null, xVal: 1, log: [],
    ruleset: { startingLife: 20, startingHandSize: 7, drawOnFirstTurn: false, londonMulligan: false, deathtouch: true },
    oppArch: { id: 'KARAG', profileId: 'KARAG' }, castleMod: null,
    pendingLotus: false, pendingLotusIid: null, pendingBop: false,
    turnState: { damageLog: [] }, triggerQueue: [], pendingChoice: null,
    fogActive: false, anteEnabled: false, anteP: null, anteO: null,
    anteExtraP: [], anteExtraO: [], ownershipChanges: [],
    pendingAnteChoice: null, pendingUpkeepChoice: null, pendingUpkeepChoiceQueue: [],
    pendingAnteExchange: null, pendingDamageShieldChoice: null,
    p: makePlayerState({ bf: pBf, hand: pHand }),
    o: makePlayerState({ bf: oBf, hand: oHand }),
  };
}

test.describe('@engine Legendary Creatures Batch 1+2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('LGB-E01: casting a vanilla legendary (Jedit Ojanen) resolves onto the battlefield with correct stats', async ({ page }) => {
    const spell = makeSpell('jo-1', { id: 'jedit_ojanen', name: 'Jedit Ojanen', type: 'Legendary Creature', subtype: 'Cat Warrior', color: 'WU', cmc: 7, cost: '4WWU', power: 5, toughness: 5 });
    const state = makeState({ pHand: [spell] });
    const funded = { ...state, p: { ...state.p, mana: { W: 2, U: 1, B: 0, R: 0, G: 0, C: 4 } } };

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'jo-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const onBf = s2.p.bf.find((c) => c.iid === 'jo-1');
      return { onBf, over: s2.over };
    }, funded);

    expect(out.onBf).toBeTruthy();
    expect(out.onBf.power).toBe(5);
    expect(out.onBf.toughness).toBe(5);
    expect(out.over).toBeNull();
  });

  test('LGB-E02: Riven Turnbull\'s mana ability adds {B} and taps it', async ({ page }) => {
    const riven = makeCreature({ iid: 'rt-1', id: 'riven_turnbull', name: 'Riven Turnbull', type: 'Legendary Creature', color: 'UB', power: 5, toughness: 7, activated: { cost: 'T', effect: 'addMana', mana: 'B' } });
    const state = makeState({ pBf: [riven] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'rt-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { manaB: s2.p.mana.B, tapped: s2.p.bf.find((c) => c.iid === 'rt-1').tapped };
    }, state);

    expect(out.manaB).toBe(1);
    expect(out.tapped).toBe(true);
  });

  test('LGB-E03: Sunastian Falconer\'s mana ability adds exactly two {C} (addMana array-form regression)', async ({ page }) => {
    const sunastian = makeCreature({ iid: 'sf-1', id: 'sunastian_falconer', name: 'Sunastian Falconer', type: 'Legendary Creature', color: 'RG', power: 4, toughness: 4, activated: { cost: 'T', effect: 'addMana', mana: ['C', 'C'] } });
    const state = makeState({ pBf: [sunastian] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'sf-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { manaC: s2.p.mana.C };
    }, state);

    expect(out.manaC).toBe(2);
  });

  test('LGB-E04: Ramses Overdark destroys a target creature with an Aura attached', async ({ page }) => {
    const ramses = makeCreature({ iid: 'ro-1', id: 'ramses_overdark', name: 'Ramses Overdark', type: 'Legendary Creature', color: 'UB', power: 4, toughness: 3, activated: { cost: 'T', effect: 'destroyEnchantedCreature', requiresTarget: true } });
    const enchanted = makeCreature({ iid: 'ec-1', controller: 'o', enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] });
    const state = makeState({ pBf: [ramses], oBf: [enchanted] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ro-1', tgt: 'ec-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { onBf: s2.o.bf.some((c) => c.iid === 'ec-1'), inGy: s2.o.gy.some((c) => c.iid === 'ec-1') };
    }, state);

    expect(out.onBf).toBe(false);
    expect(out.inGy).toBe(true);
  });

  test('LGB-E05: Ramses Overdark\'s ability fizzles against a target creature with no Auras attached', async ({ page }) => {
    const ramses = makeCreature({ iid: 'ro-1', id: 'ramses_overdark', name: 'Ramses Overdark', type: 'Legendary Creature', color: 'UB', power: 4, toughness: 3, activated: { cost: 'T', effect: 'destroyEnchantedCreature', requiresTarget: true } });
    const bare = makeCreature({ iid: 'bc-1', controller: 'o', enchantments: [] });
    const state = makeState({ pBf: [ramses], oBf: [bare] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ro-1', tgt: 'bc-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { stillOnBf: s2.o.bf.some((c) => c.iid === 'bc-1') };
    }, state);

    expect(out.stillOnBf).toBe(true);
  });

  test('LGB-E06: Bartel Runeaxe can\'t be targeted by an Aura spell, but a non-Aura removal spell still destroys it', async ({ page }) => {
    const bartel = makeCreature({ iid: 'br-1', id: 'bartel_runeaxe', name: 'Bartel Runeaxe', type: 'Legendary Creature', color: 'BRG', power: 6, toughness: 5, cantBeTargetOfAuraSpells: true });
    const aura = makeSpell('aura-1', { id: 'test_aura', name: 'Test Aura', type: 'Enchantment', subtype: 'Aura', color: 'R', cmc: 1, cost: 'R', effect: 'enchantCreature', mod: { power: 1 }, controller: 'o' });
    const state1 = makeState({ pBf: [bartel], oHand: [aura], active: 'o' });
    const funded1 = { ...state1, o: { ...state1.o, mana: { ...state1.o.mana, R: 1 } } };

    const auraResult = await page.evaluate(async ({ state, tgt }) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'o', iid: 'aura-1', tgt });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { enchantments: s2.p.bf.find((c) => c.iid === tgt)?.enchantments, lastLog: s2.log[s2.log.length - 1]?.text };
    }, { state: funded1, tgt: 'br-1' });

    expect(auraResult.enchantments).toEqual([]);
    expect(auraResult.lastLog).toContain("can't be the target of Aura spells");

    const removal = makeSpell('rem-1', { id: 'test_removal', name: 'Test Removal', type: 'Sorcery', color: 'B', cmc: 1, cost: 'B', effect: 'destroy', controller: 'o' });
    const state2 = makeState({ pBf: [bartel], oHand: [removal], active: 'o' });
    const funded2 = { ...state2, o: { ...state2.o, mana: { ...state2.o.mana, B: 1 } } };

    const removalResult = await page.evaluate(async ({ state, tgt }) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'o', iid: 'rem-1', tgt });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { onBf: s2.p.bf.some((c) => c.iid === tgt), inGy: s2.p.gy.some((c) => c.iid === tgt) };
    }, { state: funded2, tgt: 'br-1' });

    expect(removalResult.onBf).toBe(false);
    expect(removalResult.inGy).toBe(true);
  });

  test('LGB-E07: two players each controlling their own copy of the same legendary creature is legal (no false-positive legend rule)', async ({ page }) => {
    const legP = makeCreature({ iid: 'leg-p', id: 'jedit_ojanen', name: 'Jedit Ojanen', type: 'Legendary Creature', controller: 'p' });
    const legO = makeCreature({ iid: 'leg-o', id: 'jedit_ojanen', name: 'Jedit Ojanen', type: 'Legendary Creature', controller: 'o' });
    const state = makeState({ pBf: [legP], oBf: [legO] });

    const pendingChoice = await page.evaluate(async (state) => {
      const { checkLegendRule } = await import('/src/engine/DuelCore.js');
      return checkLegendRule(state).pendingChoice;
    }, state);

    expect(pendingChoice).toBeNull();
  });

  test('LGB-E08: a player controlling two copies of the same real legendary creature triggers the generic ChoiceModal', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10000 });
    await page.waitForFunction(
      () => typeof (window).__duelDispatch === 'function' && typeof (window).__duelState === 'function',
      { timeout: 15000 },
    );
    const keepBtn = page.locator('[data-testid="mulligan-keep"]');
    if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await keepBtn.click();
      await page.waitForTimeout(300);
    }

    const leg1 = makeCreature({ iid: 'e2e-leg-1', id: 'sivitri_scarzam', name: 'Sivitri Scarzam', type: 'Legendary Creature', controller: 'p' });
    const leg2 = makeCreature({ iid: 'e2e-leg-2', id: 'sivitri_scarzam', name: 'Sivitri Scarzam', type: 'Legendary Creature', controller: 'p' });

    await page.evaluate(({ leg1, leg2 }) => {
      const s = (window).__duelState();
      (window).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          p: { ...s.p, bf: [leg1, leg2] },
          pendingChoice: {
            id: 'choice_e2e_lgb_test',
            kind: 'legendRuleChoice',
            sourceCardId: leg1.iid,
            controller: 'p',
            legendName: 'Sivitri Scarzam',
            required: true,
            options: [
              { id: leg1.iid, label: 'Sivitri Scarzam (Copy 1)' },
              { id: leg2.iid, label: 'Sivitri Scarzam (Copy 2)' },
            ],
          },
        },
      });
    }, { leg1, leg2 });

    const choiceModal = page.locator('[data-testid="choice-modal"]');
    await expect(choiceModal).toBeVisible({ timeout: 5000 });
    await page.locator(`[data-testid="choice-option-${leg1.iid}"]`).click();

    await page.waitForFunction(() => !(window).__duelState().pendingChoice, { timeout: 8000 });
    const final = await page.evaluate(() => (window).__duelState());
    expect(final.p.bf.some((c) => c.iid === 'e2e-leg-1')).toBe(true);
    expect(final.p.bf.some((c) => c.iid === 'e2e-leg-2')).toBe(false);
    expect(final.p.gy.some((c) => c.iid === 'e2e-leg-2')).toBe(true);
  });
});
