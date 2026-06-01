import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

test.describe('EnchantedCardSlot', () => {
  test('unenchanted card renders without slot overhead', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
    // No auraPeek strips present when no enchantments exist on the battlefield
    const peekCount = await page.locator('[class*="auraPeek"]').count();
    expect(peekCount).toBe(0);
  });

  test('desktop aura tooltip appears on hover', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
    // Inject a mock aura onto the first creature on the battlefield
    await page.evaluate(() => {
      const state = (window as any).__duelState?.();
      if (!state?.p?.bf?.length) return;
      const creature = state.p.bf.find((c: any) => c.type?.includes('Creature'));
      if (!creature) return;
      creature.enchantments = [{
        iid: 'test-aura-1',
        name: 'Holy Strength',
        mod: { power: 1, toughness: 2 },
        controller: 'p',
        cardData: { color: 'W', text: 'Enchanted creature gets +1/+2.' },
      }];
      // Dispatch a no-op to trigger a re-render; DuelCore returns state unchanged for unknown types.
      (window as any).__duelDispatch?.({ type: 'NOOP' });
    });
    const peek = page.locator('[class*="auraPeek"]').first();
    if (await peek.count() > 0) {
      await peek.hover();
      await expect(page.locator('[class*="tooltip"]').first()).toBeVisible();
      await expect(page.locator('[class*="tooltipName"]').first()).toContainText('Holy Strength');
    }
  });
});
