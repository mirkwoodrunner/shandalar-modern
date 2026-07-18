// tests/e2e/legend-rule.spec.js
//
// Legend rule (CR 704.5j) Playwright regression tests (LEGEND-E01 - LEGEND-E06).
//
// LEGEND-E01 - LEGEND-E05 exercise the real DuelCore.js/AI.js engine code via
// page.evaluate + dynamic import, same convention as tests/e2e/layer-engine.spec.js
// -- no full duel session is mounted and there is no viewport split, since
// nothing is rendered for those five.
//
// LEGEND-E06 is the exception: it verifies the AI auto-resolves its own
// legendRuleChoice through the real useDuelController.ts dispatch path
// (chooseLegendRuleKeep -> resolveChoice), which only runs inside a mounted
// React component tree. That one test uses the sandbox harness
// (window.__duelDispatch/__duelState, ?duel=sandbox) instead, matching the
// convention already used by tests/e2e/batch-a4-sphere-cycle.spec.ts's
// "A4-E04: AI auto-resolves sphere trigger without showing modal to human".

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared inline fixtures (e2e fixtures, not engine tests -- mirrors
// src/engine/__tests__/_factory.js's shape closely enough for duelReducer).
// ---------------------------------------------------------------------------

function makeCreature(overrides) {
  return {
    iid: overrides.iid ?? 'c-1',
    id: overrides.id ?? 'test_legend',
    name: overrides.name ?? 'Test Legend',
    type: overrides.type ?? 'Legendary Creature',
    subtype: overrides.subtype ?? '',
    color: overrides.color ?? 'R',
    cmc: overrides.cmc ?? 3,
    cost: overrides.cost ?? '2R',
    power: overrides.power ?? 3,
    toughness: overrides.toughness ?? 3,
    keywords: overrides.keywords ?? [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: overrides.damage ?? 0,
    counters: overrides.counters ?? {},
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

function makeState({ pBf = [], oBf = [] } = {}) {
  return {
    phase: 'MAIN_1', active: 'p', turn: 1, landsPlayed: 0, spellsThisTurn: 0,
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
    p: makePlayerState({ bf: pBf }),
    o: makePlayerState({ bf: oBf }),
  };
}

test.describe('@engine Legend Rule (CR 704.5j)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('LEGEND-E01: two same-name legendary permanents under one controller trigger checkLegendRule', async ({ page }) => {
    const leg1 = makeCreature({ iid: 'leg-1', controller: 'p' });
    const leg2 = makeCreature({ iid: 'leg-2', controller: 'p' });

    const state = makeState({ pBf: [leg1, leg2] });
    const out = await page.evaluate(async (state) => {
      const { checkLegendRule } = await import('/src/engine/DuelCore.js');
      const s1 = checkLegendRule(state);
      return {
        kind: s1.pendingChoice?.kind ?? null,
        controller: s1.pendingChoice?.controller ?? null,
        legendName: s1.pendingChoice?.legendName ?? null,
        optionIds: (s1.pendingChoice?.options ?? []).map((o) => o.id).sort(),
      };
    }, state);

    expect(out.kind).toBe('legendRuleChoice');
    expect(out.controller).toBe('p');
    expect(out.legendName).toBe('Test Legend');
    expect(out.optionIds).toEqual(['leg-1', 'leg-2']);
  });

  test('LEGEND-E02: same-name legendary permanents under different controllers do not trigger the rule', async ({ page }) => {
    const legP = makeCreature({ iid: 'leg-p', controller: 'p' });
    const legO = makeCreature({ iid: 'leg-o', controller: 'o' });
    const state = makeState({ pBf: [legP], oBf: [legO] });

    const pendingChoice = await page.evaluate(async (state) => {
      const { checkLegendRule } = await import('/src/engine/DuelCore.js');
      return checkLegendRule(state).pendingChoice;
    }, state);

    expect(pendingChoice).toBeNull();
  });

  test('LEGEND-E03: three same-name copies offer all three as options; resolving keeps one and sends the other two to the graveyard', async ({ page }) => {
    const leg1 = makeCreature({ iid: 'leg-1', controller: 'p' });
    const leg2 = makeCreature({ iid: 'leg-2', controller: 'p' });
    const leg3 = makeCreature({ iid: 'leg-3', controller: 'p' });
    const state = makeState({ pBf: [leg1, leg2, leg3] });

    const out = await page.evaluate(async (state) => {
      const { checkLegendRule, duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = checkLegendRule(state);
      const optionIds = (s1.pendingChoice?.options ?? []).map((o) => o.id).sort();
      const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'leg-2' });
      return {
        optionIds,
        pendingChoiceAfter: s2.pendingChoice,
        bfIids: s2.p.bf.map((c) => c.iid),
        gyIids: s2.p.gy.map((c) => c.iid).sort(),
      };
    }, state);

    expect(out.optionIds).toEqual(['leg-1', 'leg-2', 'leg-3']);
    expect(out.pendingChoiceAfter).toBeNull();
    expect(out.bfIids).toEqual(['leg-2']);
    expect(out.gyIids).toEqual(['leg-1', 'leg-3']);
  });

  test('LEGEND-E04: RESOLVE_CHOICE keeps the chosen permanent and moves the other to the graveyard (not exile, not logged as destroyed)', async ({ page }) => {
    const leg1 = makeCreature({ iid: 'leg-1', controller: 'p' });
    const leg2 = makeCreature({ iid: 'leg-2', controller: 'p' });
    const state = makeState({ pBf: [leg1, leg2] });

    const out = await page.evaluate(async (state) => {
      const { checkLegendRule, duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = checkLegendRule(state);
      const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'leg-1' });
      return {
        bfIids: s2.p.bf.map((c) => c.iid),
        gyIids: s2.p.gy.map((c) => c.iid),
        exile: s2.p.exile,
        lastLog: s2.log[s2.log.length - 1],
      };
    }, state);

    expect(out.bfIids).toEqual(['leg-1']);
    expect(out.gyIids).toEqual(['leg-2']);
    expect(out.exile).toEqual([]);
    expect(out.lastLog.text.toLowerCase()).not.toContain('destroyed');
    expect(out.lastLog.text.toLowerCase()).toContain('legend rule');
  });

  test('LEGEND-E05: chooseLegendRuleKeep is deterministic across repeated calls', async ({ page }) => {
    const leg1 = makeCreature({ iid: 'leg-1', controller: 'o', counters: { P1P1: 2 } });
    const leg2 = makeCreature({ iid: 'leg-2', controller: 'o' });
    const state = makeState({ oBf: [leg1, leg2] });

    const out = await page.evaluate(async (state) => {
      const { checkLegendRule } = await import('/src/engine/DuelCore.js');
      const { chooseLegendRuleKeep } = await import('/src/engine/AI.js');
      const s1 = checkLegendRule(state);
      const choice = s1.pendingChoice;
      return {
        pick1: chooseLegendRuleKeep(choice, s1),
        pick2: chooseLegendRuleKeep(choice, s1),
        pick3: chooseLegendRuleKeep(choice, s1),
      };
    }, state);

    expect(out.pick1).toBe(out.pick2);
    expect(out.pick2).toBe(out.pick3);
    expect(out.pick1).toBe('leg-1'); // more invested value (P1P1 counters)
  });

  test('LEGEND-E06: the AI auto-resolves its own legendRuleChoice with no modal shown to the human player', async ({ page }) => {
    // Full sandbox duel boot (deck build + mulligan) is slower than the bare
    // page.goto('/') used by LEGEND-E01-E05 above -- bump past the suite's
    // default 30s, same headroom other sandbox specs give this boot path.
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

    const leg1 = makeCreature({ iid: 'e2e-leg-1', controller: 'o', damage: 0 });
    const leg2 = makeCreature({ iid: 'e2e-leg-2', controller: 'o', damage: 1 }); // less invested value -- AI should let this one go

    await page.evaluate(({ leg1, leg2 }) => {
      const s = (window).__duelState();
      (window).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          o: { ...s.o, bf: [leg1, leg2] },
          pendingChoice: {
            id: 'choice_e2e_legend_test',
            kind: 'legendRuleChoice',
            sourceCardId: leg1.iid,
            controller: 'o',
            legendName: 'Test Legend',
            required: true,
            options: [
              { id: leg1.iid, label: 'Test Legend (Copy 1)' },
              { id: leg2.iid, label: 'Test Legend (Copy 2)' },
            ],
          },
        },
      });
    }, { leg1, leg2 });

    // AI should auto-resolve; the ChoiceModal must never appear for the human.
    await page.waitForFunction(() => !(window).__duelState().pendingChoice, { timeout: 8000 });

    const choiceModal = page.locator('[data-testid="choice-modal"]');
    await expect(choiceModal).not.toBeVisible();

    const final = await page.evaluate(() => (window).__duelState());
    expect(final.o.bf.some((c) => c.iid === 'e2e-leg-1')).toBe(true);
    expect(final.o.bf.some((c) => c.iid === 'e2e-leg-2')).toBe(false);
    expect(final.o.gy.some((c) => c.iid === 'e2e-leg-2')).toBe(true);
  });
});
