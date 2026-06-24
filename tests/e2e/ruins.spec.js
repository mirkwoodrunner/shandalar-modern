import { test, expect } from '@playwright/test';

test.describe('@overworld @mobile Ruins — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('ruin tile renders plaque on revealed map', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await expect(page.locator('.ow-plaque-ruin').first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('@overworld @mobile Ruins — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ruin tile renders plaque on mobile', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await expect(page.locator('.ow-plaque-ruin').first()).toBeVisible({ timeout: 15000 });
  });
});
