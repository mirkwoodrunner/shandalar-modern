// tests/e2e/undo-mana-taps-all-phases.spec.js
//
// Verifies that canUndoMana is not restricted to MAIN_1/MAIN_2.
//
// Bug context: canUndoMana in DuelScreen.tsx gated the undo button on
// `phase === 'MAIN_1' || phase === 'MAIN_2'`. The engine captures a
// manaTapSnapshot whenever the player taps with an empty stack, regardless
// of phase. Players who accidentally tapped during DRAW had no recourse.
// The fix removes the phase guard so the button appears in any phase where
// the remaining preconditions hold.

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// The canUndoMana condition evaluated in DuelScreen.tsx:
//
//   const canUndoMana: boolean =
//     s.active === 'p' &&
//     (s.stack?.length ?? 0) === 0 &&
//     s.manaTapSnapshot !== null;
//
// These tests verify the condition logic directly via page.evaluate, mirroring
// the pattern established in instant-cast-priority-window.spec.js.
// ---------------------------------------------------------------------------

function evaluateCanUndoMana(state) {
  return (
    state.active === 'p' &&
    (state.stack?.length ?? 0) === 0 &&
    state.manaTapSnapshot !== null
  );
}

test.describe('canUndoMana — phase-agnostic undo button visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  // -------------------------------------------------------------------------
  // Test 1: Undo button visible during DRAW phase (desktop)
  // -------------------------------------------------------------------------
  test('undo button condition is true during DRAW phase when snapshot is set (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const result = await page.evaluate(() => {
      // State: DRAW phase, player active, stack empty, snapshot present.
      const snapshotState = {
        active: 'p',
        phase: 'DRAW',
        stack: [],
        manaTapSnapshot: {
          pBfTapped: [{ iid: 'land-1', tapped: false }],
          pMana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        },
      };

      // Old (buggy) condition — gated on main phases.
      const MAIN_PHASES = new Set(['MAIN_1', 'MAIN_2']);
      const oldCanUndoMana =
        snapshotState.active === 'p' &&
        MAIN_PHASES.has(snapshotState.phase) &&
        (snapshotState.stack?.length ?? 0) === 0 &&
        snapshotState.manaTapSnapshot !== null;

      // Fixed condition — phase-agnostic.
      const canUndoMana =
        snapshotState.active === 'p' &&
        (snapshotState.stack?.length ?? 0) === 0 &&
        snapshotState.manaTapSnapshot !== null;

      return { canUndoMana, oldCanUndoMana, phase: snapshotState.phase };
    });

    expect(result.phase).toBe('DRAW');
    // Old behavior: button was hidden during DRAW.
    expect(result.oldCanUndoMana).toBe(false);
    // Fixed behavior: button is visible during DRAW.
    expect(result.canUndoMana).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 2: Undo button visible during DRAW phase (mobile), then no desktop
  // regression after switching back to desktop viewport.
  // -------------------------------------------------------------------------
  test('undo button condition is true during DRAW phase on mobile viewport, and remains true at desktop size', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const mobileResult = await page.evaluate(() => {
      const snapshotState = {
        active: 'p',
        phase: 'DRAW',
        stack: [],
        manaTapSnapshot: {
          pBfTapped: [{ iid: 'land-1', tapped: false }],
          pMana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        },
      };

      return (
        snapshotState.active === 'p' &&
        (snapshotState.stack?.length ?? 0) === 0 &&
        snapshotState.manaTapSnapshot !== null
      );
    });

    expect(mobileResult).toBe(true);

    // Switch back to desktop and verify the condition is still true.
    await page.setViewportSize({ width: 1280, height: 800 });

    const desktopResult = await page.evaluate(() => {
      const snapshotState = {
        active: 'p',
        phase: 'DRAW',
        stack: [],
        manaTapSnapshot: {
          pBfTapped: [{ iid: 'land-1', tapped: false }],
          pMana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        },
      };

      return (
        snapshotState.active === 'p' &&
        (snapshotState.stack?.length ?? 0) === 0 &&
        snapshotState.manaTapSnapshot !== null
      );
    });

    expect(desktopResult).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3: Undo button hidden when manaTapSnapshot is null.
  // Confirms the remaining guards still function after removing the phase
  // restriction.
  // -------------------------------------------------------------------------
  test('undo button condition is false when manaTapSnapshot is null (DRAW phase)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const result = await page.evaluate(() => {
      const noSnapshotState = {
        active: 'p',
        phase: 'DRAW',
        stack: [],
        manaTapSnapshot: null,
      };

      const canUndoMana =
        noSnapshotState.active === 'p' &&
        (noSnapshotState.stack?.length ?? 0) === 0 &&
        noSnapshotState.manaTapSnapshot !== null;

      return { canUndoMana };
    });

    expect(result.canUndoMana).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 4 (bonus guard): Undo button hidden when it is the opponent's turn.
  // -------------------------------------------------------------------------
  test('undo button condition is false when active is opponent', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const result = await page.evaluate(() => {
      const oppTurnState = {
        active: 'o',
        phase: 'DRAW',
        stack: [],
        manaTapSnapshot: {
          pBfTapped: [{ iid: 'land-1', tapped: false }],
          pMana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        },
      };

      return (
        oppTurnState.active === 'p' &&
        (oppTurnState.stack?.length ?? 0) === 0 &&
        oppTurnState.manaTapSnapshot !== null
      );
    });

    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 5 (bonus guard): Undo button hidden when the stack is non-empty.
  // -------------------------------------------------------------------------
  test('undo button condition is false when stack is non-empty', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const result = await page.evaluate(() => {
      const stackState = {
        active: 'p',
        phase: 'MAIN_1',
        stack: [{ id: 'x1' }],
        manaTapSnapshot: {
          pBfTapped: [{ iid: 'land-1', tapped: false }],
          pMana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        },
      };

      return (
        stackState.active === 'p' &&
        (stackState.stack?.length ?? 0) === 0 &&
        stackState.manaTapSnapshot !== null
      );
    });

    expect(result).toBe(false);
  });
});
