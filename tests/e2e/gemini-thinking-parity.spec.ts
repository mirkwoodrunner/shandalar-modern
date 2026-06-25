import { test, expect } from '@playwright/test';

// NOTE: isGeminiThinking is React component state set only when fetchGeminiMove
// fires against a live Gemini API. There is no deterministic sandbox mechanism
// to force it to true, so these tests cover the "not thinking" default state
// and structural presence of the indicator elements.

test.describe('@gemini @mobile Gemini thinking indicator -- desktop parity', () => {
  test('desktop: .gemini-thinking is not visible by default in sandbox', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 15000 });

    const indicator = page.locator('.gemini-thinking');
    await expect(indicator).not.toBeVisible();
  });

  test('mobile: existing gemini thinking indicator is not visible by default -- regression guard', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 15000 });

    const indicator = page.locator('text=Gemini is thinking');
    await expect(indicator).not.toBeVisible();
  });
});
