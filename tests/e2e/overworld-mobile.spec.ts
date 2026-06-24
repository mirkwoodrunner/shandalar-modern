import { test, expect } from '@playwright/test';

test.describe('@overworld @mobile overworld mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile overworld renders compact layout', async ({ page }) => {
    await page.goto('/?overworld=sandbox');
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="ow-mobile-menu-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="ow-mobile-quickstat"]')).toBeVisible();

    // Desktop elements must not exist
    await expect(page.locator('[data-testid="ow-desktop-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="ow-right-sidebar"]')).toHaveCount(0);
  });

  test('mobile drawer opens and shows tabs', async ({ page }) => {
    await page.goto('/?overworld=sandbox');
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]');
    await page.click('[data-testid="ow-mobile-menu-btn"]');
    await expect(page.locator('[data-testid="ow-mobile-drawer"]')).toBeVisible();
    await expect(page.locator('[data-testid="ow-mobile-tab-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="ow-mobile-tab-mages"]')).toBeVisible();
    await expect(page.locator('[data-testid="ow-mobile-tab-deck"]')).toBeVisible();
    await expect(page.locator('[data-testid="ow-mobile-tab-magics"]')).toBeVisible();
  });

  test('quick-stat bar tap opens mages tab', async ({ page }) => {
    await page.goto('/?overworld=sandbox');
    await page.waitForSelector('[data-testid="ow-mobile-quickstat"]');
    await page.click('[data-testid="ow-mobile-quickstat"]');
    await expect(page.locator('[data-testid="ow-mobile-drawer"]')).toBeVisible();
    await expect(page.locator('[data-testid="ow-mobile-tab-mages"]')).toHaveCSS(
      'border-bottom-color', 'rgb(192, 160, 64)'
    );
  });

  test('mobile drawer scrim closes drawer', async ({ page }) => {
    await page.goto('/?overworld=sandbox');
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]');
    await page.click('[data-testid="ow-mobile-menu-btn"]');
    await expect(page.locator('[data-testid="ow-mobile-drawer"]')).toBeVisible();
    // Click the scrim (top-left corner, outside drawer)
    await page.mouse.click(10, 10);
    await expect(page.locator('[data-testid="ow-mobile-drawer"]')).toHaveCount(0);
  });
});
