import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

test('desktop overworld renders toolbar and sidebars', async ({ page }) => {
  await page.goto('/?overworld=sandbox');
  await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 10000 });
  await expect(page.locator('[data-testid="ow-desktop-toolbar"]')).toBeVisible();
  await expect(page.locator('[data-testid="ow-right-sidebar"]')).toBeVisible();
  // Mobile elements must NOT exist at desktop width
  await expect(page.locator('[data-testid="ow-mobile-menu-btn"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="ow-mobile-quickstat"]')).toHaveCount(0);
});
