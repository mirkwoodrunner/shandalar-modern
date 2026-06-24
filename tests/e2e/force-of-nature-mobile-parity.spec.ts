import { test, expect } from '@playwright/test';

// Force of Nature upkeep modal — desktop/mobile parity suite.
//
// Covers:
//   FON-01: Modal renders when pendingUpkeepChoice is set and active === 'p'.
//   FON-02: Pay GGGG button is disabled when player has < 4 green mana.
//   FON-03: Clicking Pay GGGG clears pendingUpkeepChoice, deducts 4G, logs payment.
//   FON-04: Clicking Take 8 Damage clears pendingUpkeepChoice, deals 8 damage, logs it.
//   FON-05: Modal does NOT render when pendingUpkeepChoice is not set (regression guard).
//
// Each test runs at both desktop (1280x800) and mobile (390x844) — 10 assertions total.
//
// Sandbox escape hatches used:
//   window.__duelDispatch(action) -- drive the engine from page.evaluate
//   window.__duelState()          -- read GameState snapshot
//   DEBUG_SET_ACTIVE { patch }    -- inject arbitrary state (existing engine action)

const DUEL_URL = '/?duel=sandbox&aiSpeed=0';

const FON_PENDING = {
  cardName: 'Force of Nature',
  handlerKey: 'forceOfNatureUpkeep',
  options: ['PAY_GGGG', 'TAKE_DAMAGE'],
};

async function waitForDuelReady(page: any) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 15000 });
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' && typeof (window as any).__duelState === 'function',
    null,
    { timeout: 10000 },
  );
  // Dismiss mulligan if present.
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(200);
  }
}

async function injectFonState(page: any, greenMana: number) {
  await page.evaluate(
    ({ pending, g }: { pending: typeof FON_PENDING; g: number }) => {
      const s = (window as any).__duelState();
      (window as any).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          pendingUpkeepChoice: pending,
          active: 'p',
          p: { ...s.p, mana: { ...s.p.mana, G: g, W: 0, U: 0, B: 0, R: 0, C: 0 } },
        },
      });
    },
    { pending: FON_PENDING, g: greenMana },
  );
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// DESKTOP (1280x800)
// ---------------------------------------------------------------------------
test.describe('@engine @mobile Force of Nature upkeep modal [desktop]', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('FON-01: modal visible when pendingUpkeepChoice is set', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await injectFonState(page, 2);

    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toBeVisible({ timeout: 3000 });
  });

  test('FON-02: Pay GGGG button disabled when green mana < 4', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await injectFonState(page, 2);

    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="fon-pay-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="fon-pay-button"]')).toBeDisabled();
  });

  test('FON-03: Pay GGGG resolves choice, deducts 4G, logs payment', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await injectFonState(page, 5);

    await expect(page.locator('[data-testid="fon-pay-button"]')).toBeEnabled({ timeout: 3000 });
    await page.locator('[data-testid="fon-pay-button"]').click();
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return {
        pendingCleared: s.pendingUpkeepChoice === null,
        greenMana: s.p.mana?.G ?? -1,
        logged: s.log.some((l: any) => l.text?.includes('paid GGGG upkeep')),
      };
    });

    expect(result.pendingCleared, 'pendingUpkeepChoice should be null after paying').toBe(true);
    expect(result.greenMana, 'green mana should be 5 - 4 = 1').toBe(1);
    expect(result.logged, 'log should record GGGG payment').toBe(true);
    // Modal is gone: ADVANCE_PHASE is no longer blocked by pendingUpkeepChoice.
    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toHaveCount(0);
  });

  test('FON-04: Take 8 Damage resolves choice, deals damage, logs it', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);

    const startLife = await page.evaluate(() => (window as any).__duelState().p.life as number);
    await injectFonState(page, 0);

    await expect(page.locator('[data-testid="fon-damage-button"]')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="fon-damage-button"]').click();
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return {
        pendingCleared: s.pendingUpkeepChoice === null,
        life: s.p.life as number,
        logged: s.log.some((l: any) => l.text?.includes('player takes 8 damage')),
      };
    });

    expect(result.pendingCleared, 'pendingUpkeepChoice should be null after taking damage').toBe(true);
    expect(result.life, 'player life should be reduced by 8').toBe(startLife - 8);
    expect(result.logged, 'log should record 8 damage').toBe(true);
    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toHaveCount(0);
  });

  test('FON-05: no modal when pendingUpkeepChoice is not set', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);

    const pending = await page.evaluate(() => (window as any).__duelState().pendingUpkeepChoice);
    expect(pending, 'pendingUpkeepChoice should be null at game start').toBeNull();
    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// MOBILE (390x844)
// ---------------------------------------------------------------------------
test.describe('@engine @mobile Force of Nature upkeep modal [mobile]', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('FON-01: modal visible when pendingUpkeepChoice is set', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await injectFonState(page, 2);

    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toBeVisible({ timeout: 3000 });
  });

  test('FON-02: Pay GGGG button disabled when green mana < 4', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await injectFonState(page, 2);

    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="fon-pay-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="fon-pay-button"]')).toBeDisabled();
  });

  test('FON-03: Pay GGGG resolves choice, deducts 4G, logs payment', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await injectFonState(page, 5);

    await expect(page.locator('[data-testid="fon-pay-button"]')).toBeEnabled({ timeout: 3000 });
    await page.locator('[data-testid="fon-pay-button"]').click();
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return {
        pendingCleared: s.pendingUpkeepChoice === null,
        greenMana: s.p.mana?.G ?? -1,
        logged: s.log.some((l: any) => l.text?.includes('paid GGGG upkeep')),
      };
    });

    expect(result.pendingCleared, 'pendingUpkeepChoice should be null after paying').toBe(true);
    expect(result.greenMana, 'green mana should be 5 - 4 = 1').toBe(1);
    expect(result.logged, 'log should record GGGG payment').toBe(true);
    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toHaveCount(0);
  });

  test('FON-04: Take 8 Damage resolves choice, deals damage, logs it', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);

    const startLife = await page.evaluate(() => (window as any).__duelState().p.life as number);
    await injectFonState(page, 0);

    await expect(page.locator('[data-testid="fon-damage-button"]')).toBeVisible({ timeout: 3000 });
    await page.locator('[data-testid="fon-damage-button"]').click();
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return {
        pendingCleared: s.pendingUpkeepChoice === null,
        life: s.p.life as number,
        logged: s.log.some((l: any) => l.text?.includes('player takes 8 damage')),
      };
    });

    expect(result.pendingCleared, 'pendingUpkeepChoice should be null after taking damage').toBe(true);
    expect(result.life, 'player life should be reduced by 8').toBe(startLife - 8);
    expect(result.logged, 'log should record 8 damage').toBe(true);
    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toHaveCount(0);
  });

  test('FON-05: no modal when pendingUpkeepChoice is not set', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);

    const pending = await page.evaluate(() => (window as any).__duelState().pendingUpkeepChoice);
    expect(pending, 'pendingUpkeepChoice should be null at game start').toBeNull();
    await expect(page.locator('[data-testid="fon-upkeep-modal"]')).toHaveCount(0);
  });
});
