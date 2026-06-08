import { test, expect } from '@playwright/test';

test('island tiles never render rotated icons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?overworld=sandbox');
  await page.waitForSelector('.ow-tile.ow-island', { timeout: 10000 });

  const rotatedIslandIcons = await page.evaluate(() => {
    const rotationClasses = ['tile-icon-v2', 'tile-icon-v3', 'tile-icon-v4', 'tile-icon-v5'];
    const spans = Array.from(document.querySelectorAll('.ow-island span'));
    return spans.filter(s => rotationClasses.some(c => s.classList.contains(c))).length;
  });

  expect(rotatedIslandIcons).toBe(0);
});

test('island tiles never render rotated icons (mobile)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?overworld=sandbox');
  await page.waitForSelector('.ow-tile.ow-island', { timeout: 10000 });

  const rotatedIslandIcons = await page.evaluate(() => {
    const rotationClasses = ['tile-icon-v2', 'tile-icon-v3', 'tile-icon-v4', 'tile-icon-v5'];
    const spans = Array.from(document.querySelectorAll('.ow-island span'));
    return spans.filter(s => rotationClasses.some(c => s.classList.contains(c))).length;
  });

  expect(rotatedIslandIcons).toBe(0);
});
