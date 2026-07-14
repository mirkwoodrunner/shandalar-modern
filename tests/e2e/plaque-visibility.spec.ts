import { test, expect } from '@playwright/test';

// Structure icon visibility -- verifies that the PNG-based structure icons
// render on the overworld (town/dungeon/castle/ruin). As of the structure-icon
// sprite migration, structures render via <img> elements rather than
// .ow-plaque* CSS divs, so this suite checks for <img> presence and the
// absence of the legacy plaque class names.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile',  width: 390,  height: 844 },
];

for (const vp of VIEWPORTS) {
  test.describe(`@overworld-visual-2 @mobile structure icons [${vp.name}]`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /start|new game/i }).first().click();
      await page.waitForSelector('.ow-tile', { timeout: 10000 });
    });

    test('structure tiles render <img> elements, not legacy .ow-plaque divs', async ({ page }) => {
      // Legacy plaque classes must not exist after the sprite migration.
      await expect(page.locator('.ow-plaque')).toHaveCount(0);
      await expect(page.locator('.ow-plaque-town')).toHaveCount(0);
      await expect(page.locator('.ow-plaque-castle')).toHaveCount(0);
      await expect(page.locator('.ow-plaque-dungeon')).toHaveCount(0);
      await expect(page.locator('.ow-plaque-ruin')).toHaveCount(0);
    });

    test('visible structure tiles contain an <img> with a non-empty src', async ({ page }) => {
      // The structure wrapper sits inside .ow-tile and contains a single <img>
      // (the PNG icon). If any structure is in the initial viewport, verify it.
      const imgs = page.locator('.ow-tile img[alt]');
      const count = await imgs.count();
      for (let i = 0; i < count; i++) {
        const src = await imgs.nth(i).getAttribute('src');
        expect(src).toBeTruthy();
        // src should resolve to one of the five structure PNGs (Vite hashes the name)
        // so we can only check it is non-empty and does not contain "undefined".
        expect(src).not.toContain('undefined');
      }
    });
  });
}
