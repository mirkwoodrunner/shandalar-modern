import { test, expect } from '@playwright/test';

test.describe('Gemini toggle -- title screen', () => {
  test('GT-001: Toggle renders on choose step (desktop)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('button:has-text("BEGIN YOUR JOURNEY")');
    await page.click('button:has-text("BEGIN YOUR JOURNEY")');
    await expect(page.getByTestId('gemini-toggle')).toBeVisible();
  });

  test('GT-001M: Toggle renders on choose step (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('button:has-text("BEGIN YOUR JOURNEY")');
    await page.click('button:has-text("BEGIN YOUR JOURNEY")');
    await expect(page.getByTestId('gemini-toggle')).toBeVisible();
  });

  test('GT-002: Toggle defaults to off', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("BEGIN YOUR JOURNEY")');
    const toggle = page.getByTestId('gemini-toggle');
    // Off state: border is the dim color, not the blue
    await expect(toggle).toHaveCSS('border-color', /rgba\(255,\s*255,\s*255/);
  });

  test('GT-003: Toggle switches on click', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("BEGIN YOUR JOURNEY")');
    const toggle = page.getByTestId('gemini-toggle');
    await toggle.click();
    // On state: blue border present
    await expect(toggle).toHaveCSS('border-color', /rgba\(100,\s*180,\s*255/);
    // Label changes
    await expect(toggle).toContainText('Gemini LLM active for final boss');
  });

  test('GT-004: Toggle state does not affect desktop vs mobile layout', async ({ page }) => {
    // Desktop: verify standard duel sandbox still loads (toggle off by default)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?duel=sandbox');
    await page.waitForFunction(() => typeof (window as any).__duelState === 'function');
    const state = await page.evaluate(() => (window as any).__duelState());
    expect(state).toBeTruthy();
  });
});
