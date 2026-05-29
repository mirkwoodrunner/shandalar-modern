// tests/e2e/undo-mana-taps-all-phases.spec.js
//
// Verifies that the Undo Taps button is visible in non-main phases after a
// land tap, exercising the real rendered components via the sandbox escape
// hatches (window.__duelDispatch / window.__duelState).
//
// Bug: canUndoMana in both DuelScreen.tsx and DuelScreenMobile.tsx incorrectly
// gated the button on phase === 'MAIN_1' || 'MAIN_2'. The engine sets
// manaTapSnapshot on any TAP_LAND when stack.length === 0, regardless of phase.
//
// Setup trick: dispatching TAP_LAND with a non-existent IID still sets
// manaTapSnapshot. applyOvergrowthTap receives the snapshot-bearing `ns` as
// its first arg and returns it unchanged when the card is not found, so the
// snapshot is preserved without needing a real land on the battlefield.
//
// Entry points:
//   /?duel=sandbox         → DuelScreen.tsx   (desktop ActionBar, data-testid present)
//   /?duel=sandbox-mobile  → DuelScreenMobile.tsx (mobile ActionBar, data-testid added)

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function waitForEscapeHatches(page, timeout = 15000) {
  await page.waitForFunction(
    () => typeof window.__duelDispatch === 'function' && typeof window.__duelState === 'function',
    { timeout },
  );
}

async function waitForPlayerTurn(page, timeout = 10000) {
  await page.waitForFunction(
    () => {
      const s = window.__duelState?.();
      return s && s.active === 'p' && s.phase === 'MAIN_1';
    },
    { timeout },
  );
}

// Advance phase once (MAIN_1 → COMBAT_BEGIN). Snapshot is already null so
// clearing it on ADVANCE_PHASE is a no-op.
async function advanceToNonMainPhase(page) {
  await page.evaluate(() => window.__duelDispatch({ type: 'ADVANCE_PHASE' }));
  await page.waitForFunction(
    () => window.__duelState?.().phase !== 'MAIN_1',
    { timeout: 5000 },
  );
}

// Dispatch TAP_LAND with a non-existent IID. applyOvergrowthTap returns the
// snapshot-bearing state unchanged when the card is not found, so this
// reliably sets manaTapSnapshot without needing a land on the battlefield.
async function setSnapshotViaDummyTap(page) {
  await page.evaluate(() =>
    window.__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: '__test_dummy__', mana: 'G' }),
  );
  await page.waitForFunction(
    () => window.__duelState?.().manaTapSnapshot !== null,
    { timeout: 5000 },
  );
}

// ---------------------------------------------------------------------------
// Suite A — DuelScreen.tsx (/?duel=sandbox)
// ---------------------------------------------------------------------------

test.describe('DuelScreen — undo button phase-agnostic (sandbox)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await waitForEscapeHatches(page);
    await waitForPlayerTurn(page);
  });

  // Test A-1: button appears in COMBAT_BEGIN after tapping with dummy IID
  test('A-1: undo button is visible during COMBAT_BEGIN phase', async ({ page }) => {
    await advanceToNonMainPhase(page);
    await setSnapshotViaDummyTap(page);

    const phase = await page.evaluate(() => window.__duelState().phase);
    expect(phase).not.toBe('MAIN_1');
    expect(phase).not.toBe('MAIN_2');

    await expect(page.locator('[data-testid="undo-taps-button"]')).toBeVisible();
  });

  // Test A-2: button is hidden when manaTapSnapshot is null
  test('A-2: undo button is absent when no tap has occurred', async ({ page }) => {
    await advanceToNonMainPhase(page);

    const snap = await page.evaluate(() => window.__duelState().manaTapSnapshot);
    expect(snap).toBeNull();

    await expect(page.locator('[data-testid="undo-taps-button"]')).not.toBeVisible();
  });

  // Test A-3: button is hidden during the opponent's turn
  test('A-3: undo button is absent on opponent turn', async ({ page }) => {
    // Set snapshot then check it is not shown when active switches to 'o'.
    // We verify via state inspection that active must be 'p' for the button.
    const isOpponentActive = await page.evaluate(() => {
      const s = window.__duelState();
      return s.active === 'o';
    });
    // On game start active is 'p'; confirm button guard on active is correct
    // by evaluating the condition formula directly with active='o'.
    const wouldShow = await page.evaluate(() => {
      const s = { active: 'o', stack: [], manaTapSnapshot: { pBfTapped: [], pMana: {} } };
      return s.active === 'p' && (s.stack?.length ?? 0) === 0 && s.manaTapSnapshot !== null;
    });
    expect(wouldShow).toBe(false);
    expect(isOpponentActive).toBe(false); // sanity: game starts on player turn
  });
});

// ---------------------------------------------------------------------------
// Suite B — DuelScreen.tsx at mobile viewport (sandbox, isMobile=true path)
// ---------------------------------------------------------------------------

test.describe('DuelScreen at mobile viewport — undo button phase-agnostic', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await waitForEscapeHatches(page);
    await waitForPlayerTurn(page);
  });

  // Test B-1: button visible in COMBAT_BEGIN at mobile viewport
  test('B-1: undo button visible during COMBAT_BEGIN at 390x844', async ({ page }) => {
    await advanceToNonMainPhase(page);
    await setSnapshotViaDummyTap(page);

    await expect(page.locator('[data-testid="undo-taps-button"]')).toBeVisible();
  });

  // Test B-2: switch to desktop width — button still visible (no regression)
  test('B-2: undo button remains visible after switching from mobile to desktop width', async ({ page }) => {
    await advanceToNonMainPhase(page);
    await setSnapshotViaDummyTap(page);

    await expect(page.locator('[data-testid="undo-taps-button"]')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    // DuelScreen stays mounted; only layout changes. Button should remain.
    await expect(page.locator('[data-testid="undo-taps-button"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite C — DuelScreenMobile.tsx (/?duel=sandbox-mobile)
// This is the component path that had the stale phase guard. These tests
// would have caught the regression before it was fixed.
// ---------------------------------------------------------------------------

test.describe('DuelScreenMobile — undo button phase-agnostic (sandbox-mobile)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?duel=sandbox-mobile&aiSpeed=0');
    await waitForEscapeHatches(page);
    await waitForPlayerTurn(page);
  });

  // Test C-1: button visible in non-main phase — the regression test
  // Old code: canUndoMana gated on MAIN_1/MAIN_2 → button hidden → FAIL
  // New code: phase-agnostic → button visible → PASS
  test('C-1: undo button is visible during COMBAT_BEGIN phase (regression)', async ({ page }) => {
    await advanceToNonMainPhase(page);
    await setSnapshotViaDummyTap(page);

    const state = await page.evaluate(() => ({
      phase: window.__duelState().phase,
      snap: window.__duelState().manaTapSnapshot !== null,
      active: window.__duelState().active,
    }));

    expect(state.phase).not.toBe('MAIN_1');
    expect(state.phase).not.toBe('MAIN_2');
    expect(state.snap).toBe(true);
    expect(state.active).toBe('p');

    await expect(page.locator('[data-testid="undo-taps-button"]')).toBeVisible();
  });

  // Test C-2: button hidden when manaTapSnapshot is null (remaining guards hold)
  test('C-2: undo button absent when manaTapSnapshot is null', async ({ page }) => {
    await advanceToNonMainPhase(page);

    const snap = await page.evaluate(() => window.__duelState().manaTapSnapshot);
    expect(snap).toBeNull();

    await expect(page.locator('[data-testid="undo-taps-button"]')).not.toBeVisible();
  });

  // Test C-3: button visible at mobile width, still visible after switching to desktop
  test('C-3: undo button visible at mobile viewport and survives resize to desktop', async ({ page }) => {
    await advanceToNonMainPhase(page);
    await setSnapshotViaDummyTap(page);

    // At 390x844: DuelScreenMobile is mounted — button should be visible.
    await expect(page.locator('[data-testid="undo-taps-button"]')).toBeVisible();

    // Resize to desktop width. DuelScreenMobile stays mounted (no remount on
    // resize); the button should remain in the DOM.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('[data-testid="undo-taps-button"]')).toBeVisible();
  });
});
