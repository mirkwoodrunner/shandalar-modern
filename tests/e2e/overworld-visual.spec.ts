import { test, expect } from '@playwright/test';

const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 390, height: 844 };

for (const [label, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
  test.describe(`@overworld-visual-2 @mobile Overworld visual polish — ${label}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      // The title screen is a three-step flow: intro -> color/difficulty
      // choice -> enter. Clicking "start-game" alone only reaches step two.
      await page.click('[data-testid="start-game"]');
      await page.click('[data-testid="color-W"]');
      await page.click('[data-testid="enter-shandalar"]');
      await page.waitForSelector('.ow-tile', { timeout: 8000 });
    });

    // Rewritten 2026-09-18. The original asserted the pre-sprite-migration
    // rendering (tile icons as an inline-block <span>); structures have since
    // rendered as <img>, so it could never pass -- it only looked green
    // because the beforeEach timed out before reaching it. See
    // plaque-visibility.spec.ts's header for the migration, and
    // docs/TEST_AUDIT_LOG.md 2026-09-18 Finding 3, cause 1.
    test('OVP-01 structure icons render as sized <img>, not legacy spans', async ({ page }) => {
      // The legacy span-based icon must be gone from every tile.
      await expect(page.locator('.ow-tile span[style*="inline-block"]')).toHaveCount(0);

      // Map seeds vary per run, so a structure may not be in the opening
      // viewport. When one is, its icon must occupy a real box -- the polish
      // property this case exists to guard.
      const icons = page.locator('.ow-tile img');
      const count = await icons.count();
      for (let i = 0; i < count; i++) {
        const box = await icons.nth(i).boundingBox();
        expect(box, 'structure icon should have a layout box').not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
      }
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
