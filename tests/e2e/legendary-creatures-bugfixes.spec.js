// tests/e2e/legendary-creatures-bugfixes.spec.js
//
// Legendary Creatures Cleanup batch follow-up: three bugs surfaced (not fixed) by
// that batch's completion report. See docs/CURRENT_SPRINT.md and
// docs/MECHANICS_INDEX.md for the fix writeup.
//
// LGCBF-E01/E02 (Ramses Overdark) and LGCBF-E03 (Gwendlyn Di Corci) exercise the
// real DuelCore.js/useDuelController.ts engine code via page.evaluate + dynamic
// import, same convention as tests/e2e/legendary-creatures-cleanup.spec.js and
// tests/e2e/legend-rule.spec.js's LEGEND-E01-E05 -- no full duel session, no
// viewport split beyond the project matrix already running every spec against
// both `chromium` and `mobile-chrome`.
//
// LGCBF-E04/E05 (Regrowth's gyCardChoice) are the exception: they verify the
// generic ChoiceModal actually renders and resolves for a human player, which
// only happens inside a mounted React component tree. These use the sandbox
// harness (window.__duelDispatch/__duelState, ?duel=sandbox, DEBUG_SET_ACTIVE)
// same convention as tests/e2e/legend-rule.spec.js's LEGEND-E06.

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

test.describe('@engine Legendary Creatures Bugfixes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('LGCBF-E01: destroyEnchantedCreature is registered in ACTIVATE_TARGET_EFFECTS so Ramses Overdark now opens a targeting step', async ({ page }) => {
    const has = await page.evaluate(async () => {
      const { ACTIVATE_TARGET_EFFECTS } = await import('/src/hooks/useDuelController.ts');
      return ACTIVATE_TARGET_EFFECTS.has('destroyEnchantedCreature');
    });
    expect(has).toBe(true);
  });

  test('LGCBF-E02: Ramses Overdark destroys a target creature with an aura attached, but fizzles against one with none', async ({ page }) => {
    const ramsesA = makeCreature({ iid: 'ro-a', id: 'ramses_overdark', name: 'Ramses Overdark', type: 'Legendary Creature', power: 4, toughness: 3, activated: { cost: 'T', effect: 'destroyEnchantedCreature', requiresTarget: true } });
    const bare = makeCreature({ iid: 'bare-1', controller: 'o' });
    const stateA = makeState({ pBf: [ramsesA], oBf: [bare] });

    const ramsesB = makeCreature({ iid: 'ro-b', id: 'ramses_overdark', name: 'Ramses Overdark', type: 'Legendary Creature', power: 4, toughness: 3, activated: { cost: 'T', effect: 'destroyEnchantedCreature', requiresTarget: true } });
    const enchanted = makeCreature({ iid: 'en-1', controller: 'o', enchantments: [{ iid: 'aura-1', name: 'Pacifism' }] });
    const stateB = makeState({ pBf: [ramsesB], oBf: [enchanted] });

    const out = await page.evaluate(async ({ stateA, stateB }) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const a1 = duelReducer(stateA, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ro-a', tgt: 'bare-1' });
      const a2 = duelReducer(a1, { type: 'RESOLVE_STACK' });
      const b1 = duelReducer(stateB, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ro-b', tgt: 'en-1' });
      const b2 = duelReducer(b1, { type: 'RESOLVE_STACK' });
      return {
        bareAlive: a2.o.bf.some((c) => c.iid === 'bare-1'),
        enchantedDestroyed: !b2.o.bf.some((c) => c.iid === 'en-1') && b2.o.gy.some((c) => c.iid === 'en-1'),
      };
    }, { stateA, stateB });

    expect(out.bareAlive).toBe(true);
    expect(out.enchantedDestroyed).toBe(true);
  });

  test('LGCBF-E03: Gwendlyn Di Corci is blocked on the opponent\'s turn and works normally on her controller\'s own turn', async ({ page }) => {
    const gwendlyn = makeCreature({ iid: 'gd-1', id: 'gwendlyn_di_corci', name: 'Gwendlyn Di Corci', type: 'Legendary Creature', power: 3, toughness: 5, activated: { cost: 'T', effect: 'discardOneTgt', requiresTarget: true, myTurnOnly: true } });
    const oppCard = { iid: 'oc-1', id: 'forest', name: 'Forest', type: 'Land' };
    const blockedState = makeState({ pBf: [gwendlyn], oHand: [oppCard], active: 'o' });
    const allowedState = makeState({ pBf: [gwendlyn], oHand: [oppCard], active: 'p' });

    const out = await page.evaluate(async ({ blockedState, allowedState }) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(blockedState, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'gd-1', tgt: 'o' });
      const s2 = duelReducer(allowedState, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'gd-1', tgt: 'o' });
      const s3 = duelReducer(s2, { type: 'RESOLVE_STACK' });
      return {
        blockedLog: s1.log[s1.log.length - 1]?.text ?? '',
        blockedStackLen: s1.stack.length,
        allowedOppHand: s3.o.hand.length,
        allowedOppGy: s3.o.gy.some((c) => c.iid === 'oc-1'),
      };
    }, { blockedState, allowedState });

    expect(out.blockedLog).toContain('can only be activated during your turn');
    expect(out.blockedStackLen).toBe(0);
    expect(out.allowedOppHand).toBe(0);
    expect(out.allowedOppGy).toBe(true);
  });

  test('LGCBF-E04: Regrowth\'s gyCardChoice pendingChoice renders the ChoiceModal with one option per eligible graveyard card', async ({ page }) => {
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

    const cardA = { iid: 'gy-a', id: 'forest', name: 'Forest', type: 'Land' };
    const cardB = { iid: 'gy-b', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };

    await page.evaluate(({ cardA, cardB }) => {
      const s = (window).__duelState();
      (window).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          p: { ...s.p, gy: [cardA, cardB] },
          pendingChoice: {
            id: 'choice_e2e_regrowth_test',
            kind: 'gyCardChoice',
            mode: 'regrowth',
            sourceCardId: 'regrowth-src',
            controller: 'p',
            required: true,
            options: [
              { id: cardA.iid, label: cardA.name },
              { id: cardB.iid, label: cardB.name },
            ],
          },
        },
      });
    }, { cardA, cardB });

    await expect(page.locator('[data-testid="choice-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="choice-option-gy-a"]')).toBeVisible();
    await expect(page.locator('[data-testid="choice-option-gy-b"]')).toBeVisible();
  });

  test('LGCBF-E05: clicking a Regrowth graveyard choice option resolves it and returns that card to hand', async ({ page }) => {
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

    const cardA = { iid: 'gy-a', id: 'forest', name: 'Forest', type: 'Land' };
    const cardB = { iid: 'gy-b', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };

    await page.evaluate(({ cardA, cardB }) => {
      const s = (window).__duelState();
      (window).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          p: { ...s.p, gy: [cardA, cardB] },
          pendingChoice: {
            id: 'choice_e2e_regrowth_resolve_test',
            kind: 'gyCardChoice',
            mode: 'regrowth',
            sourceCardId: 'regrowth-src',
            controller: 'p',
            required: true,
            options: [
              { id: cardA.iid, label: cardA.name },
              { id: cardB.iid, label: cardB.name },
            ],
          },
        },
      });
    }, { cardA, cardB });

    await page.locator('[data-testid="choice-option-gy-b"]').click();
    await page.waitForFunction(() => !(window).__duelState().pendingChoice, { timeout: 8000 });

    const final = await page.evaluate(() => (window).__duelState());
    expect(final.p.hand.some((c) => c.iid === 'gy-b')).toBe(true);
    expect(final.p.gy.some((c) => c.iid === 'gy-a')).toBe(true);
    expect(final.p.gy.some((c) => c.iid === 'gy-b')).toBe(false);
  });
});
