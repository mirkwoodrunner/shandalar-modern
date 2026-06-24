// tests/e2e/duel-persistence.spec.ts
//
// Duel state persistence suite -- verifies save/resume/discard/clear flows.
//
// Covers:
//   PERSIST-01: After a move, reload shows the resume-duel-modal.
//   PERSIST-02: Clicking Resume restores the saved board state.
//   PERSIST-03: Clicking Discard starts fresh and clears localStorage.
//   PERSIST-04: Completing a duel (forfeit/game-over) clears localStorage.
//   PERSIST-05: Fresh context with no prior save -- resume modal never appears.
//
// Each test runs at both desktop (1280x800, /?duel=sandbox) and
// mobile (390x844, /?duel=sandbox-mobile) -- 10 assertions total.
//
// Sandbox escape hatches used:
//   window.__duelDispatch(action)  -- drive the engine from page.evaluate
//   window.__duelState()           -- read current GameState snapshot
//   DEBUG_SET_ACTIVE { patch }     -- inject arbitrary state into the engine

import { test, expect, Page } from '@playwright/test';

const DESKTOP_URL = '/?duel=sandbox&aiSpeed=0';
const MOBILE_URL  = '/?duel=sandbox-mobile&aiSpeed=0';
const STORAGE_KEY = 'shandalar:duel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForDuelReady(page: Page) {
  // duel-screen-wrapper is present in both sandbox (DuelScreen) and
  // sandbox-mobile (DuelScreenMobile) App entry points.
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
  // Wait for engine escape hatches injected by useDuelController.
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    null,
    { timeout: 10000 },
  );
  // Dismiss mulligan modal if it appears.
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

// Dispatch a DEBUG_SET_ACTIVE patch, then wait long enough for usePersistence's
// useEffect to serialise and write the new state to localStorage.
async function patchAndWaitForSave(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: p });
  }, patch);
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// DESKTOP (1280x800) -- DuelScreen.tsx
// ---------------------------------------------------------------------------

test.describe('Duel persistence [desktop]', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('PERSIST-01: resume modal appears after reload when a save exists', async ({ page }) => {
    await page.goto(DESKTOP_URL);
    await waitForDuelReady(page);

    // Patch the state to create a distinctive save; usePersistence writes it.
    await patchAndWaitForSave(page, { landsPlayed: 77 });

    await page.reload();
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    await expect(page.locator('[data-testid="resume-duel-modal"]')).toBeVisible({ timeout: 5000 });
  });

  test('PERSIST-02: clicking Resume restores the saved board state', async ({ page }) => {
    await page.goto(DESKTOP_URL);
    await waitForDuelReady(page);

    await patchAndWaitForSave(page, { landsPlayed: 77 });

    await page.reload();
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="resume-duel-button"]').click();
    await page.waitForTimeout(300);

    // After LOAD_STATE is dispatched, the escape hatch reflects the restored state.
    await page.waitForFunction(
      () => typeof (window as any).__duelState === 'function',
      null,
      { timeout: 5000 },
    );

    const restored = await page.evaluate(
      () => (window as any).__duelState().landsPlayed as number,
    );
    expect(restored, 'landsPlayed should be restored from the saved state').toBe(77);
  });

  test('PERSIST-03: clicking Discard starts fresh and removes the localStorage key', async ({ page }) => {
    await page.goto(DESKTOP_URL);
    await waitForDuelReady(page);

    await patchAndWaitForSave(page, { landsPlayed: 77 });

    await page.reload();
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="resume-duel-discard-button"]').click();
    await page.waitForTimeout(200);

    const savedAfterDiscard = await page.evaluate(
      () => localStorage.getItem('shandalar:duel'),
    );
    expect(savedAfterDiscard, 'localStorage key should be null after discarding').toBeNull();

    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);
  });

  test('PERSIST-04: forfeiting clears the saved duel from localStorage', async ({ page }) => {
    await page.goto(DESKTOP_URL);
    await waitForDuelReady(page);

    // usePersistence will have saved the initial state by now; confirm there is something.
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(before, 'save should exist before forfeit').not.toBeNull();

    // Click Forfeit -- handleDuelEndWithClear calls clearDuel() then onDuelEnd (navigates).
    await page.getByRole('button', { name: 'Forfeit' }).click();
    await page.waitForURL('http://localhost:5173/', { timeout: 5000 });

    const after = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(after, 'localStorage should be cleared after forfeit').toBeNull();
  });

  test('PERSIST-05: fresh context -- resume modal never appears', async ({ page }) => {
    // Fresh Playwright context has empty localStorage by default.
    await page.goto(DESKTOP_URL);
    const saved = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(saved, 'localStorage should be empty in a fresh context').toBeNull();

    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    // Modal must never appear when there is no saved state.
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// MOBILE (390x844) -- DuelScreenMobile.tsx  (?duel=sandbox-mobile)
// ---------------------------------------------------------------------------

test.describe('Duel persistence [mobile]', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('PERSIST-01: resume modal appears after reload when a save exists', async ({ page }) => {
    await page.goto(MOBILE_URL);
    await waitForDuelReady(page);

    await patchAndWaitForSave(page, { landsPlayed: 77 });

    await page.reload();
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    await expect(page.locator('[data-testid="resume-duel-modal"]')).toBeVisible({ timeout: 5000 });
  });

  test('PERSIST-02: clicking Resume restores the saved board state', async ({ page }) => {
    await page.goto(MOBILE_URL);
    await waitForDuelReady(page);

    await patchAndWaitForSave(page, { landsPlayed: 77 });

    await page.reload();
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="resume-duel-button"]').click();
    await page.waitForTimeout(300);

    await page.waitForFunction(
      () => typeof (window as any).__duelState === 'function',
      null,
      { timeout: 5000 },
    );

    const restored = await page.evaluate(
      () => (window as any).__duelState().landsPlayed as number,
    );
    expect(restored, 'landsPlayed should be restored from the saved state').toBe(77);
  });

  test('PERSIST-03: clicking Discard starts fresh and removes the localStorage key', async ({ page }) => {
    await page.goto(MOBILE_URL);
    await waitForDuelReady(page);

    await patchAndWaitForSave(page, { landsPlayed: 77 });

    await page.reload();
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="resume-duel-discard-button"]').click();
    await page.waitForTimeout(200);

    const savedAfterDiscard = await page.evaluate(
      () => localStorage.getItem('shandalar:duel'),
    );
    expect(savedAfterDiscard, 'localStorage key should be null after discarding').toBeNull();

    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);
  });

  test('PERSIST-04: game over clears the saved duel from localStorage', async ({ page }) => {
    await page.goto(MOBILE_URL);
    await waitForDuelReady(page);

    // usePersistence will have saved the initial state; confirm it.
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(before, 'save should exist before game over').not.toBeNull();

    // Trigger game over via DEBUG_SET_ACTIVE.
    // useDuelController's game-over effect fires onDuelEnd after a 3000ms timer.
    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: { over: { winner: 'p' } },
      });
    });

    // Wait for the 3000ms game-over timer to fire handleDuelEndWithClear, which
    // calls clearDuel() then navigates away via onDuelEnd.
    await page.waitForURL('http://localhost:5173/', { timeout: 5000 });

    const after = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(after, 'localStorage should be cleared after game over').toBeNull();
  });

  test('PERSIST-05: fresh context -- resume modal never appears', async ({ page }) => {
    await page.goto(MOBILE_URL);
    const saved = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(saved, 'localStorage should be empty in a fresh context').toBeNull();

    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);
  });
});
