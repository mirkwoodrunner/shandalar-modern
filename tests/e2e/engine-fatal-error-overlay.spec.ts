// tests/e2e/engine.spec.ts
//
// Regression coverage for the fatal-AI-error overlay (useDuelController.ts's
// "AI priority window effect" and "AI main loop" heuristic path). Both call
// aiDecide(s) inside a setTimeout; before this change neither had error
// handling anywhere in the file, and there is no ErrorBoundary in the app --
// an uncaught throw in either simply died silently, leaving whatever UI was
// mid-transition frozen. This is the confirmed mechanism behind a reported
// bug: clicking End Turn left the "Ending Turn..." button disabled forever
// with no visible error.
//
// window.__forceAiError is a test-only fault-injection global, checked at the
// top of both try blocks and inert unless explicitly set, used here to force
// this exact path deterministically instead of depending on a real AI.js
// edge case.
//
// ENGINE-ERR-01/03: forcing the error after End Turn shows the "Duel Engine
//                    Error" overlay instead of a permanent "Ending Turn..."
//                    freeze (01 desktop, 03 mobile).
// ENGINE-ERR-02/04: "Exit to Overworld" on the overlay forfeits and navigates
//                    away instead of leaving the player with no way out
//                    (02 desktop, 04 mobile).
//
// The mobile suite uses ?duel=sandbox-mobile (real DuelScreenMobile.tsx tree)
// rather than the desktop URL at a narrow viewport, unlike
// tests/e2e/end-turn-skip-ahead.spec.ts's mobile suite -- that one reuses the
// desktop tree and does not exercise src/ui/Mobile/ActionBar.tsx or the
// mobile EngineErrorOverlay wiring added in DuelScreenMobile.tsx.
//
// All page.goto() calls pass waitUntil: 'domcontentloaded' instead of the
// Playwright default 'load' (see tests/e2e/ante-system-complete.spec.ts for
// the same established convention): the title screen's <link> to
// fonts.googleapis.com hangs the 'load' event indefinitely under this
// environment's outbound network policy, and the app is fully interactive
// well before web fonts resolve.

import { test, expect, Page } from '@playwright/test';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// DuelScreenMobile.tsx never renders a node with data-testid="duel-screen"
// (only DuelScreen.tsx does) -- the sandbox-mobile route's outer wrapper is
// duel-screen-wrapper (see land-destruction-pyramids.spec.ts precedent).
async function waitForDuelMobile(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 10_000 });
}

async function dismissMulligan(page: Page) {
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click();
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 });
  }
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// Sets the fault-injection flag *before* End Turn is clicked, then clicks it.
// End Turn's whole job is to skip ahead until the engine needs the AI (or the
// player) to decide something -- forcing the flag first guarantees the very
// first aiDecide() call in that skip-ahead throws, regardless of which of the
// two effects reaches it first.
async function triggerFatalErrorViaEndTurn(page: Page) {
  await dismissMulligan(page);
  await waitForMain1(page);

  await page.evaluate(() => { (window as any).__forceAiError = true; });

  const endTurnBtn = page.getByTestId('end-turn-button');
  await expect(endTurnBtn).toBeEnabled();
  await endTurnBtn.click();

  await expect(page.getByText('Duel Engine Error')).toBeVisible({ timeout: 5_000 });
}

test.describe('@engine-cast-flow-ui-2 Fatal AI error overlay -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('ENGINE-ERR-01: forced AI error after End Turn shows the error overlay instead of a permanent freeze', async ({ page }) => {
    await page.goto('/?duel=sandbox&aiSpeed=0', { waitUntil: 'domcontentloaded' });
    await waitForDuel(page);
    await triggerFatalErrorViaEndTurn(page);

    await expect(page.getByText(/forced AI error for testing/)).toBeVisible();
  });

  test('ENGINE-ERR-02: "Exit to Overworld" on the error overlay forfeits and navigates away', async ({ page }) => {
    await page.goto('/?duel=sandbox&aiSpeed=0', { waitUntil: 'domcontentloaded' });
    await waitForDuel(page);
    await triggerFatalErrorViaEndTurn(page);

    await page.getByRole('button', { name: 'Exit to Overworld' }).click();
    // page.waitForURL() waits for a *future* navigation event; the reload here
    // completes before the call is even reached, so there's no event left to
    // observe and it hangs to its timeout regardless of the current URL.
    // expect(page).toHaveURL() polls the current URL instead, so it works
    // whether the navigation already landed or is still in flight.
    await expect(page).toHaveURL('/', { timeout: 5_000 });
  });
});

test.describe('@engine-cast-flow-ui-2 @mobile Fatal AI error overlay -- mobile (real DuelScreenMobile tree)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ENGINE-ERR-03: forced AI error after End Turn shows the error overlay on the mobile ActionBar', async ({ page }) => {
    await page.goto('/?duel=sandbox-mobile&aiSpeed=0', { waitUntil: 'domcontentloaded' });
    await waitForDuelMobile(page);
    await triggerFatalErrorViaEndTurn(page);

    await expect(page.getByText(/forced AI error for testing/)).toBeVisible();
  });

  test('ENGINE-ERR-04: "Exit to Overworld" works on the mobile overlay', async ({ page }) => {
    await page.goto('/?duel=sandbox-mobile&aiSpeed=0', { waitUntil: 'domcontentloaded' });
    await waitForDuelMobile(page);
    await triggerFatalErrorViaEndTurn(page);

    await page.getByRole('button', { name: 'Exit to Overworld' }).click();
    // See the desktop suite's ENGINE-ERR-02 comment on toHaveURL vs waitForURL.
    await expect(page).toHaveURL('/', { timeout: 5_000 });
  });
});
