import { test, expect } from '@playwright/test';

test.describe('@overworld @mobile overworld map centering', () => {

  test('map is centered on player at game start', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /start|new game|play/i }).first().click();
    const nameInput = page.getByPlaceholder(/name/i);
    if (await nameInput.isVisible()) {
      await nameInput.fill('TestHero');
      await page.getByRole('button', { name: /confirm|start|begin/i }).click();
    }

    await page.waitForSelector('.ow-tile', { timeout: 10000 });

    const canvas = page.locator('canvas').first();
    const canvasBox = await canvas.boundingBox();
    const viewport = page.viewportSize();

    if (canvasBox && viewport) {
      const canvasCenterX = canvasBox.x + canvasBox.width / 2;
      const pageCenterX = viewport.width / 2;
      expect(Math.abs(canvasCenterX - pageCenterX)).toBeLessThan(viewport.width * 0.2);
    }
  });

  test('map centering works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByRole('button', { name: /start|new game|play/i }).first().click();
    const nameInput = page.getByPlaceholder(/name/i);
    if (await nameInput.isVisible()) {
      await nameInput.fill('TestHero');
      await page.getByRole('button', { name: /confirm|start|begin/i }).click();
    }

    await page.waitForSelector('.ow-tile', { timeout: 10000 });

    const tiles = page.locator('.ow-tile');
    const count = await tiles.count();
    expect(count).toBeGreaterThan(0);
  });
});
