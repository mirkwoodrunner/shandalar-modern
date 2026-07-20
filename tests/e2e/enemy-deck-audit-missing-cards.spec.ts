// tests/e2e/enemy-deck-audit-missing-cards.spec.ts
//
// Regression guard for the enemy-deck-audit missing-cards batch: 23 new
// CARD_DB entries (src/data/cards.js) added by the enemy-deck-audit false-
// positive fix + missing-card batch. Data-only change, but a parse-time or
// init-time break in cards.js would take down duel boot on both screens
// (same CARD_DB import feeds DuelScreen.tsx and DuelScreenMobile.tsx), so
// this just confirms the sandbox boots cleanly with the new entries present.
// One test, run once per configured Playwright project (chromium,
// mobile-chrome -- see playwright.config.js) for desktop/mobile parity.
// Modeled on tests/e2e/ai-creature-evaluation-smoke.spec.ts.

import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

test.describe('@engine @mobile Enemy-deck-audit missing-cards batch boot smoke', () => {
  test('sandbox boots with no EngineErrorOverlay and a valid duel state', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });

    await expect(page.getByText('Duel Engine Error')).not.toBeVisible();

    const state = await page.evaluate(() => (window as any).__duelState?.());
    expect(state).toBeTruthy();
    expect(state.phase).toBeTruthy();
  });
});
