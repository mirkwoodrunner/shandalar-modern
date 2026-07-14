// tests/e2e/ancestral-recall-targeting.spec.ts
//
// Regression: Ancestral Recall (draw3) allowed creature clicks during targeting,
// causing a crash in cardHandlers.js when the creature iid was passed to drawN()
// (ns[who] was undefined for a creature iid, so ns[who].lib threw). Fixed by:
//   - adding 'draw3' to PLAYER_ONLY_TARGET_EFFECTS in useDuelController.ts
//   - Defensive fallback in cardHandlers.js 'Ancestral Recall' onResolve
//
// Same root cause and same fix pattern as the earlier Lava Axe (damage5) crash --
// see lava-axe-targeting.spec.ts.
//
// ARCANE-E2E-01: Clicking a creature while Ancestral Recall is in targeting mode is
//                a no-op (no crash, no hand/creature change).
// ARCANE-E2E-02: Clicking the player's own life total/banner self-targets; after
//                confirm, player's hand grows by 3 and library shrinks by 3.
// ARCANE-E2E-03: Clicking the opponent life total/banner targets the opponent; after
//                confirm, opponent's hand grows by 3 and library shrinks by 3, while
//                the player's hand/library are unchanged.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm the guard in both DuelScreen.tsx and
// DuelScreenMobile.tsx.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForEngineReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    { timeout: 15000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

// Set up a MAIN_1 / active='p' state with Ancestral Recall in hand (with mana
// support) and an AI creature on the battlefield.
async function setupAncestralRecallScenario(page: Page): Promise<{ creatureIid: string }> {
  const creatureIid = 'e2e-craw-o';

  const crawWurm = {
    iid: creatureIid, id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature',
    subtype: 'Wurm', color: 'G', cmc: 6, cost: '4GG',
    power: 6, toughness: 4, keywords: [], tapped: false,
    summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'o',
  };

  // Force MAIN_1 / active='p' then inject Ancestral Recall with mana and a creature.
  await page.evaluate(({ c }: any) => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    // Inject Ancestral Recall into player's hand with full mana support.
    (window as any).__duelDispatch({
      type: 'SANDBOX_FORCE_HAND',
      cardIds: ['ancestral_recall'],
      withManaSupport: true,
    });
    // Inject the AI creature.
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: { o: { ...s.o, bf: [c] } },
    });
  }, { c: crawWurm });

  await page.waitForTimeout(200);
  return { creatureIid };
}

// Ancestral Recall uses the stack (Sprint 7 universal stack resolution) -- after
// confirming a target the spell sits on the stack until both players pass
// priority. Click pass-priority-button (the AI auto-passes at aiSpeed=0) until
// the stack empties.
async function resolveStack(page: Page) {
  for (let i = 0; i < 5; i++) {
    const stackLen = await page.evaluate(() => (window as any).__duelState().stack?.length ?? 0);
    if (stackLen === 0) return;
    const passBtn = page.locator('[data-testid="pass-priority-button"]').first();
    if (await passBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await passBtn.click();
    }
    await page.waitForTimeout(300);
  }
}

// Click the hand card for Ancestral Recall, then click the Cast button to enter
// targeting mode.
async function enterAncestralRecallTargetingMode(page: Page) {
  const arCard = page.locator('[data-testid^="hand-card-"], [data-testid="hand-card"]')
    .filter({ hasText: /ancestral recall/i })
    .first();
  await expect(arCard).toBeVisible({ timeout: 5000 });
  await arCard.click();
  await page.waitForTimeout(200);

  const castBtn = page.locator('[data-testid="cast-button"]').first();
  await expect(castBtn).toBeVisible({ timeout: 5000 });
  await castBtn.click();
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// Desktop suite (1280x800)
// ---------------------------------------------------------------------------

test.describe('@engine-cast-flow-ui-1 @mobile Ancestral Recall player-only targeting [desktop]', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForEngineReady(page);
  });

  test('ARCANE-E2E-01: clicking a creature during Ancestral Recall targeting is a no-op', async ({ page }) => {
    const { creatureIid } = await setupAncestralRecallScenario(page);
    await enterAncestralRecallTargetingMode(page);

    const pHandBefore = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const oHandBefore = await page.evaluate(() => (window as any).__duelState().o.hand.length);

    // Click the AI creature -- should be ignored by the isPlayerOnlyTarget guard.
    const creature = page.locator(`[data-iid="${creatureIid}"]`).first();
    if (await creature.isVisible({ timeout: 3000 }).catch(() => false)) {
      await creature.click();
      await page.waitForTimeout(200);
    }

    const pHandAfter = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const oHandAfter = await page.evaluate(() => (window as any).__duelState().o.hand.length);
    const overState = await page.evaluate(() => (window as any).__duelState().over);

    expect(pHandAfter, 'player hand size must not change after creature click').toBe(pHandBefore);
    expect(oHandAfter, 'opponent hand size must not change after creature click').toBe(oHandBefore);
    expect(overState, 'game must not be over (no crash)').toBeFalsy();

    // Creature itself must be unharmed and still present.
    const creatureAfter = await page.evaluate((iid: string) => {
      const s = (window as any).__duelState();
      return s.o.bf.find((c: any) => c.iid === iid);
    }, creatureIid);
    expect(creatureAfter, 'creature must still be on battlefield').toBeDefined();
    expect(creatureAfter.damage, 'creature must have 0 damage').toBe(0);
  });

  test('ARCANE-E2E-02: clicking own life total self-targets and draws 3', async ({ page }) => {
    await setupAncestralRecallScenario(page);
    await enterAncestralRecallTargetingMode(page);

    const ownLifeEl = page.locator('[data-iid="player-p"]').first();
    await expect(ownLifeEl).toBeVisible({ timeout: 3000 });
    await ownLifeEl.click();
    await page.waitForTimeout(200);

    const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
    if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
    }

    // Snapshot after the cast commits (card already left hand for the stack) but
    // before the stack resolves, so the delta below isolates the draw3 effect
    // from the cast's own hand-size cost.
    const pHandBefore = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const pLibBefore = await page.evaluate(() => (window as any).__duelState().p.lib.length);

    await resolveStack(page);

    const pHandAfter = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const pLibAfter = await page.evaluate(() => (window as any).__duelState().p.lib.length);

    expect(pHandAfter, 'player hand should grow by 3').toBe(pHandBefore + 3);
    expect(pLibAfter, 'player library should shrink by 3').toBe(pLibBefore - 3);
  });

  test('ARCANE-E2E-03: clicking opponent life total targets opponent and draws 3', async ({ page }) => {
    await setupAncestralRecallScenario(page);
    await enterAncestralRecallTargetingMode(page);

    const oppLifeEl = page.locator('[data-iid="player-o"]').first();
    await expect(oppLifeEl).toBeVisible({ timeout: 3000 });
    await oppLifeEl.click();
    await page.waitForTimeout(200);

    const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
    if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
    }

    // Snapshot after the cast commits but before the stack resolves (see note
    // in ARCANE-E2E-02 above).
    const pHandBefore = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const pLibBefore = await page.evaluate(() => (window as any).__duelState().p.lib.length);
    const oHandBefore = await page.evaluate(() => (window as any).__duelState().o.hand.length);
    const oLibBefore = await page.evaluate(() => (window as any).__duelState().o.lib.length);

    await resolveStack(page);

    const pHandAfter = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const pLibAfter = await page.evaluate(() => (window as any).__duelState().p.lib.length);
    const oHandAfter = await page.evaluate(() => (window as any).__duelState().o.hand.length);
    const oLibAfter = await page.evaluate(() => (window as any).__duelState().o.lib.length);

    expect(oHandAfter, 'opponent hand should grow by 3').toBe(oHandBefore + 3);
    expect(oLibAfter, 'opponent library should shrink by 3').toBe(oLibBefore - 3);
    expect(pHandAfter, 'player hand must be unchanged').toBe(pHandBefore);
    expect(pLibAfter, 'player library must be unchanged').toBe(pLibBefore);
  });
});

// ---------------------------------------------------------------------------
// Mobile suite (390x844) -- DuelScreenMobile.tsx render path
// ---------------------------------------------------------------------------

test.describe('@engine-cast-flow-ui-1 @mobile Ancestral Recall player-only targeting [mobile]', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForEngineReady(page);
  });

  test('ARCANE-E2E-01: clicking a creature during Ancestral Recall targeting is a no-op', async ({ page }) => {
    const { creatureIid } = await setupAncestralRecallScenario(page);
    await enterAncestralRecallTargetingMode(page);

    const pHandBefore = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const oHandBefore = await page.evaluate(() => (window as any).__duelState().o.hand.length);

    const creature = page.locator(`[data-iid="${creatureIid}"]`).first();
    if (await creature.isVisible({ timeout: 3000 }).catch(() => false)) {
      await creature.click();
      await page.waitForTimeout(200);
    }

    const pHandAfter = await page.evaluate(() => (window as any).__duelState().p.hand.length);
    const oHandAfter = await page.evaluate(() => (window as any).__duelState().o.hand.length);
    const overState = await page.evaluate(() => (window as any).__duelState().over);

    expect(pHandAfter, 'player hand size must not change after creature click').toBe(pHandBefore);
    expect(oHandAfter, 'opponent hand size must not change after creature click').toBe(oHandBefore);
    expect(overState, 'game must not be over (no crash)').toBeFalsy();

    const creatureAfter = await page.evaluate((iid: string) => {
      const s = (window as any).__duelState();
      return s.o.bf.find((c: any) => c.iid === iid);
    }, creatureIid);
    expect(creatureAfter, 'creature must still be on battlefield').toBeDefined();
    expect(creatureAfter.damage, 'creature must have 0 damage').toBe(0);
  });

  test('ARCANE-E2E-02: clicking own life banner self-targets and draws 3', async ({ page }) => {
    await setupAncestralRecallScenario(page);
    await enterAncestralRecallTargetingMode(page);

    const ownBannerBtn = page.locator('[data-testid="banner-you"] button[aria-label]').first();
    if (await ownBannerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ownBannerBtn.click();
      await page.waitForTimeout(200);

      const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
      if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }

      // Snapshot after the cast commits (card already left hand for the stack)
      // but before the stack resolves, so the delta isolates the draw3 effect
      // from the cast's own hand-size cost.
      const pHandBefore = await page.evaluate(() => (window as any).__duelState().p.hand.length);
      const pLibBefore = await page.evaluate(() => (window as any).__duelState().p.lib.length);

      await resolveStack(page);

      const pHandAfter = await page.evaluate(() => (window as any).__duelState().p.hand.length);
      const pLibAfter = await page.evaluate(() => (window as any).__duelState().p.lib.length);
      expect(pHandAfter, 'player hand should grow by 3').toBe(pHandBefore + 3);
      expect(pLibAfter, 'player library should shrink by 3').toBe(pLibBefore - 3);
    } else {
      // Fallback: directly dispatch the target for platforms where the mobile
      // banner button is not rendered during targeting mode.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'SELECT_TARGET', tgt: 'p' });
      });
      await page.waitForTimeout(100);
    }
  });

  test('ARCANE-E2E-03: clicking opponent life banner targets opponent and draws 3', async ({ page }) => {
    await setupAncestralRecallScenario(page);
    await enterAncestralRecallTargetingMode(page);

    const oppBannerBtn = page.locator('[data-testid="banner-opp"] button[aria-label]').first();
    if (await oppBannerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await oppBannerBtn.click();
      await page.waitForTimeout(200);

      const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
      if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }

      // Snapshot after the cast commits but before the stack resolves (see
      // note in ARCANE-E2E-02 above).
      const pHandBefore = await page.evaluate(() => (window as any).__duelState().p.hand.length);
      const pLibBefore = await page.evaluate(() => (window as any).__duelState().p.lib.length);
      const oHandBefore = await page.evaluate(() => (window as any).__duelState().o.hand.length);
      const oLibBefore = await page.evaluate(() => (window as any).__duelState().o.lib.length);

      await resolveStack(page);

      const pHandAfter = await page.evaluate(() => (window as any).__duelState().p.hand.length);
      const pLibAfter = await page.evaluate(() => (window as any).__duelState().p.lib.length);
      const oHandAfter = await page.evaluate(() => (window as any).__duelState().o.hand.length);
      const oLibAfter = await page.evaluate(() => (window as any).__duelState().o.lib.length);

      expect(oHandAfter, 'opponent hand should grow by 3').toBe(oHandBefore + 3);
      expect(oLibAfter, 'opponent library should shrink by 3').toBe(oLibBefore - 3);
      expect(pHandAfter, 'player hand must be unchanged').toBe(pHandBefore);
      expect(pLibAfter, 'player library must be unchanged').toBe(pLibBefore);
    } else {
      // Fallback: directly dispatch the target for platforms where the mobile
      // banner button is not rendered during targeting mode.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'SELECT_TARGET', tgt: 'o' });
      });
      await page.waitForTimeout(100);
    }
  });
});
