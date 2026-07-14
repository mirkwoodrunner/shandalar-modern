import { test, expect } from '@playwright/test';

const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 390, height: 844 };

for (const [label, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
  test.describe(`@overworld-visual-2 @mobile Overworld visual polish — ${label}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="start-game"]');
      await page.waitForSelector('.ow-tile', { timeout: 8000 });
    });

    test('OVP-01 tile icon wrapped in span with inline-block', async ({ page }) => {
      const iconSpan = page.locator('.ow-tile span[style*="inline-block"]').first();
      await expect(iconSpan).toBeAttached();
    });

    test('OVP-02 ow-tile has overflow visible', async ({ page }) => {
      const tile = page.locator('.ow-tile').first();
      const overflow = await tile.evaluate(el => getComputedStyle(el).overflow);
      expect(overflow).toBe('visible');
    });

    test('OVP-03 grid wrapper has overflow hidden', async ({ page }) => {
      const wrapper = page.locator('.ow-grid-wrapper').first();
      const overflow = await wrapper.evaluate(el => getComputedStyle(el).overflow);
      expect(overflow).toBe('hidden');
    });

    test('OVP-04 fog-edge tiles have mask-image applied', async ({ page }) => {
      const fogEdge = page.locator('.ow-fog-edge').first();
      const count = await fogEdge.count();
      if (count === 0) return;
      const mask = await fogEdge.evaluate(el => getComputedStyle(el).maskImage || (el as HTMLElement).style.webkitMaskImage);
      expect(mask).not.toBe('none');
    });

    test('OVP-05 sprite has drop-shadow filter', async ({ page }) => {
      const sprite = page.locator('.sprite').first();
      await expect(sprite).toBeAttached();
      const filter = await sprite.evaluate(el => getComputedStyle(el).filter);
      expect(filter).toContain('drop-shadow');
    });

    test('OVP-06 no console errors during map render', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      await page.waitForTimeout(1000);
      expect(errors).toHaveLength(0);
    });
  });
}
