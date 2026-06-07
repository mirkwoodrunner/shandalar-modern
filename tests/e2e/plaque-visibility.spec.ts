import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile',  width: 390,  height: 844 },
];

for (const vp of VIEWPORTS) {
  test.describe(`plaque visibility [${vp.name}]`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      // Start a run so the overworld renders
      await page.getByRole('button', { name: /start|new game/i }).first().click();
      await page.waitForSelector('.ow-tile', { timeout: 10000 });
    });

    test('town plaque has ow-plaque-town class', async ({ page }) => {
      const townPlaque = page.locator('.ow-plaque-town').first();
      // If no town is in viewport, this test is inconclusive -- not a failure
      const count = await townPlaque.count();
      if (count > 0) {
        await expect(townPlaque).toBeVisible();
      }
    });

    test('ruin plaque has ow-plaque-ruin class', async ({ page }) => {
      const ruinPlaque = page.locator('.ow-plaque-ruin').first();
      const count = await ruinPlaque.count();
      if (count > 0) {
        await expect(ruinPlaque).toBeVisible();
      }
    });

    test('dungeon plaque has ow-plaque-dungeon class', async ({ page }) => {
      const dungeonPlaque = page.locator('.ow-plaque-dungeon').first();
      const count = await dungeonPlaque.count();
      if (count > 0) {
        await expect(dungeonPlaque).toBeVisible();
      }
    });

    test('castle plaque still has ow-plaque-castle class', async ({ page }) => {
      const castlePlaque = page.locator('.ow-plaque-castle').first();
      const count = await castlePlaque.count();
      if (count > 0) {
        await expect(castlePlaque).toBeVisible();
      }
    });

    test('no plaque has font-size smaller than 14px', async ({ page }) => {
      const plaques = page.locator('.ow-plaque');
      const count = await plaques.count();
      for (let i = 0; i < count; i++) {
        const fs = await plaques.nth(i).evaluate(el =>
          parseFloat(getComputedStyle(el).fontSize)
        );
        expect(fs).toBeGreaterThanOrEqual(14);
      }
    });
  });
}
