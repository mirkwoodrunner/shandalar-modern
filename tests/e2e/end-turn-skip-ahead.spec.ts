// tests/e2e/end-turn-skip-ahead.spec.ts
//
// End-to-end tests for the End Turn skip-ahead feature (useDuelController.endTurn).
// Clicking End Turn drives the duel forward automatically -- auto-passing the
// player's own priority and stepping the phase -- until a new turn begins, the
// game ends, or the engine needs a player choice it can't make on the player's
// behalf. Reuses the existing requestPhaseAdvance/passPriority dispatchers; does
// not touch DuelCore.js.
//
// Uses the sandbox URL and window.__duelDispatch / window.__duelState escape
// hatches, the same pattern as tests/e2e/sandbox.spec.ts and
// tests/e2e/duel-controller.spec.ts. Runs at both desktop (1280x800) and mobile
// (390x844) viewports, following the dual-viewport pattern used in
// tests/e2e/first-strike-combat.spec.ts.
//
// END-TURN-01: End Turn from Main 1 skips ahead to the opponent's turn.
// END-TURN-02: End Turn still completes when an instant in hand opens a
//              mid-skip priority window -- no manual Pass Priority needed.
// END-TURN-03: End Turn is not interactively available when it is not the
//              player's turn (regression guard).
// END-TURN-04: while endTurnPending is true, other action controls are not
//              present/clickable.
// END-TURN-05 (mobile only): parity check -- same behavior on the mobile
//              ActionBar, and the desktop assertions are unaffected.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// MulliganModal is always shown on load; click Keep to dismiss it. Same
// pattern as tests/e2e/duel-controller.spec.ts's dismissMulligan().
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

// END-TURN-01: click End Turn, assert disabled "Ending Turn..." state, then
// assert the turn skips ahead to the opponent without manual interaction.
async function runEndTurn01(page: Page) {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await dismissMulligan(page);
  await waitForMain1(page);

  const beforeTurn = await page.evaluate(() => (window as any).__duelState().turn);

  const endTurnBtn = page.getByTestId('end-turn-button');
  await expect(endTurnBtn).toBeEnabled();
  await endTurnBtn.click();

  await expect(endTurnBtn).toBeDisabled();
  await expect(endTurnBtn).toHaveText(/Ending Turn/);

  await page.waitForFunction(
    (prevTurn) => {
      const s = (window as any).__duelState?.();
      return s && (s.active === 'o' || s.turn !== prevTurn);
    },
    beforeTurn,
    { timeout: 15_000 }
  );
}

// END-TURN-02: seed an instant into the player's hand so a priority window
// opens mid-skip; the turn must still complete without the player clicking
// Pass Priority.
async function runEndTurn02(page: Page) {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await dismissMulligan(page);
  await waitForMain1(page);

  await page.evaluate(() => {
    (window as any).__duelDispatch({
      type: 'SANDBOX_FORCE_HAND',
      who: 'p',
      cardIds: ['lightning_bolt'],
      withManaSupport: true,
    });
  });

  const beforeTurn = await page.evaluate(() => (window as any).__duelState().turn);

  const endTurnBtn = page.getByTestId('end-turn-button');
  await endTurnBtn.click();
  await expect(endTurnBtn).toBeDisabled();

  await page.waitForFunction(
    (prevTurn) => {
      const s = (window as any).__duelState?.();
      return s && (s.active === 'o' || s.turn !== prevTurn);
    },
    beforeTurn,
    { timeout: 15_000 }
  );
}

// END-TURN-03: End Turn must not be interactively available when it is not
// the player's turn -- regression guard, unrelated to this feature's changes.
async function runEndTurn03(page: Page) {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await dismissMulligan(page);
  await waitForMain1(page);

  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
  });
  await page.waitForFunction(() => (window as any).__duelState?.()?.active === 'o', { timeout: 5_000 });

  const endTurnBtn = page.getByTestId('end-turn-button');
  if (await endTurnBtn.count()) {
    await expect(endTurnBtn).toBeDisabled();
  }
}

// END-TURN-04: while the skip-ahead loop runs, Cast/Activate/Pass-Priority
// controls must not be present or clickable.
async function runEndTurn04(page: Page) {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await dismissMulligan(page);
  await waitForMain1(page);

  const endTurnBtn = page.getByTestId('end-turn-button');
  await endTurnBtn.click();
  await expect(endTurnBtn).toBeDisabled();
  await expect(endTurnBtn).toHaveText(/Ending Turn/);

  await expect(page.getByTestId('cast-button')).toHaveCount(0);
  await expect(page.getByTestId('pass-priority-button')).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// Desktop suite (1280x800)
// ---------------------------------------------------------------------------

test.describe('@engine-phases-priority-2 @mobile End Turn skip-ahead -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('END-TURN-01: End Turn skips ahead to opponent turn', async ({ page }) => {
    await runEndTurn01(page);
  });

  test('END-TURN-02: End Turn completes through a mid-skip priority window', async ({ page }) => {
    await runEndTurn02(page);
  });

  test('END-TURN-03: End Turn not interactive when it is not the player turn', async ({ page }) => {
    await runEndTurn03(page);
  });

  test('END-TURN-04: other action controls suppressed while ending turn', async ({ page }) => {
    await runEndTurn04(page);
  });
});

// ---------------------------------------------------------------------------
// Mobile suite (390x844) -- parity check, not a new feature
// ---------------------------------------------------------------------------

test.describe('@engine-phases-priority-2 @mobile End Turn skip-ahead -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('END-TURN-05: End Turn skips ahead to opponent turn (mobile ActionBar)', async ({ page }) => {
    await runEndTurn01(page);
  });

  test('END-TURN-02: End Turn completes through a mid-skip priority window (mobile)', async ({ page }) => {
    await runEndTurn02(page);
  });

  test('END-TURN-03: End Turn not interactive when it is not the player turn (mobile)', async ({ page }) => {
    await runEndTurn03(page);
  });

  test('END-TURN-04: other action controls suppressed while ending turn (mobile)', async ({ page }) => {
    await runEndTurn04(page);
  });
});
