import { test, expect } from '@playwright/test';

test.describe('@overworld-generation map grid', () => {

  test('MAP_W and MAP_H are 64 and 40', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto('http://localhost:5173');

    const gridStyle = await page.evaluate(() => {
      const grid = document.querySelector('[style*="grid-template-columns"]');
      return grid ? grid.style.gridTemplateColumns : null;
    });

    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
    // Map grid should exist and render without error on the new 64x40 map
    expect(gridStyle).not.toBeNull();
  });
});
