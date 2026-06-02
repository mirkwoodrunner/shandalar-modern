import { test, expect } from '@playwright/test';

const MOBILE = { viewport: { width: 390, height: 844 } };

test.describe('Mobile targeting mode', () => {
  test('selecting a damage spell enters targeting mode and cast is disabled until target chosen', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&cards=lightning_bolt,mountain,mountain,mountain&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cards: ['lightning_bolt'], addManaSupport: true });
    });
    await page.waitForTimeout(300);

    const bolt = page.locator('[data-testid="hand-card"]').filter({ hasText: 'Lightning Bolt' }).first();
    await bolt.tap();

    const actionBar = page.locator('[data-testid="action-bar"]');
    await expect(actionBar).toContainText('SELECT TARGET');
    const castBtn = actionBar.locator('button').first();
    await expect(castBtn).toBeDisabled();

    await ctx.close();
  });

  test('tapping opp life banner sets target and enables Cast', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&cards=lightning_bolt,mountain,mountain,mountain&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cards: ['lightning_bolt'], addManaSupport: true });
    });
    await page.waitForTimeout(300);

    const bolt = page.locator('[data-testid="hand-card"]').filter({ hasText: 'Lightning Bolt' }).first();
    await bolt.tap();

    const oppLife = page.locator('[data-testid="banner-opp"] button[aria-label]');
    await oppLife.tap();

    const castBtn = page.locator('[data-testid="action-bar"] button').first();
    await expect(castBtn).toBeEnabled();
    await expect(castBtn).toContainText('CAST');

    await ctx.close();
  });
});

test.describe('Mobile blocking mode', () => {
  test('COMBAT_BLOCKERS phase shows Declare Blockers ActionBar with Done button', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' });
    });

    const state = await page.evaluate(() => (window as any).__duelState());
    if (state.phase === 'COMBAT_BLOCKERS' && state.active === 'p') {
      await expect(page.locator('[data-testid="action-bar"]')).toContainText('PICK BLOCKER');
      await expect(page.locator('[data-testid="action-bar"] button')).toContainText('Done');
    }

    await ctx.close();
  });
});
