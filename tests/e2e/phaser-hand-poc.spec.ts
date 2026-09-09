import { test, expect } from '@playwright/test';

// @engine Phaser hand-rendering POC (Phase 1)
// Exercises the feature-flagged ?duel=sandbox-phaser entry point: a Phaser
// canvas mounted alongside the existing DuelScreen. DuelScreen remains the
// default, playable renderer — this spec only verifies the Phaser overlay.

test.describe('@engine Phaser hand POC', () => {
  test.beforeEach(async ({ page }) => {
    // &cards=mountain guarantees a land is present in the opening hand so
    // the land-tap cases below don't depend on the random draw.
    await page.goto('/?duel=sandbox-phaser&aiSpeed=0&cards=mountain');
    await page.waitForFunction(() => typeof (window as any).__duelState === 'function');
    await page.waitForFunction(() => typeof (window as any).__phaserHand === 'function');
    await expect.poll(() => page.evaluate(() => (window as any).__phaserHand()?.length ?? -1))
      .toBeGreaterThan(0);
  });

  test('mounts a phaser-host with a canvas', async ({ page }) => {
    const host = page.locator('[data-testid="phaser-host"]');
    await expect(host).toBeVisible();
    await expect(host.locator('canvas')).toHaveCount(1);
  });

  test('rendered hand length matches real GameState hand length', async ({ page }) => {
    const [phaserLen, stateLen] = await page.evaluate(() => [
      (window as any).__phaserHand().length,
      (window as any).__duelState().p.hand.length,
    ]);
    expect(phaserLen).toBe(stateLen);
  });

  test('every layout entry x is within the viewport', async ({ page }) => {
    const viewport = page.viewportSize()!;
    const layout = await page.evaluate(() => (window as any).__phaserHand());
    for (const card of layout) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x).toBeLessThanOrEqual(viewport.width);
    }
  });

  test('tapping a land moves it out of hand', async ({ page }) => {
    const landIid = await page.evaluate(() => {
      const hand = (window as any).__duelState().p.hand;
      const land = hand.find((c: any) => (c.typeEff ?? c.type)?.includes('Land'));
      return land?.iid ?? null;
    });
    expect(landIid).not.toBeNull();

    const beforeInHand = await page.evaluate((iid) =>
      (window as any).__duelState().p.hand.some((c: any) => c.iid === iid), landIid);
    expect(beforeInHand).toBe(true);

    await page.evaluate((iid) => (window as any).__phaserTapCard(iid), landIid);

    await expect.poll(() => page.evaluate((iid) =>
      (window as any).__duelState().p.hand.some((c: any) => c.iid === iid), landIid))
      .toBe(false);
  });

  test('phaser hand length decreases by one after the tap, confirming a real-state sync', async ({ page }) => {
    const before = await page.evaluate(() => (window as any).__phaserHand().length);

    const landIid = await page.evaluate(() => {
      const hand = (window as any).__duelState().p.hand;
      const land = hand.find((c: any) => (c.typeEff ?? c.type)?.includes('Land'));
      return land?.iid ?? null;
    });
    expect(landIid).not.toBeNull();

    await page.evaluate((iid) => (window as any).__phaserTapCard(iid), landIid);

    await expect.poll(() => page.evaluate(() => (window as any).__phaserHand().length))
      .toBe(before - 1);
  });

  test('navigating away and back leaves exactly one canvas in the DOM', async ({ page }) => {
    // Away target is a different sandbox route (not the title screen) so
    // this only exercises the unmount/remount cycle this test is actually
    // checking, without the title screen's own asset loading in the mix.
    await page.goto('/?duel=sandbox');
    await page.goto('/?duel=sandbox-phaser&aiSpeed=0');
    await page.waitForFunction(() => typeof (window as any).__phaserHand === 'function');
    await expect(page.locator('[data-testid="phaser-host"] canvas')).toHaveCount(1);
  });
});
