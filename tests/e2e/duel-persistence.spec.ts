// tests/e2e/duel-persistence.spec.ts
//
// Duel state persistence suite -- verifies autosave, crash-recovery, and
// clear-on-exit flows. The resume-prompt UI was removed (LOAD_STATE is an
// unreconciled state swap, unsafe for mid-stack/mid-priority saves), so
// PERSIST-01/02/03 (resume modal) are removed.
//
// Covers:
//   PERSIST-04: Completing a duel (forfeit/game-over) clears localStorage.
//   PERSIST-05: Fresh context with no prior save -- duel mounts normally.
//   PERSIST-06: Malformed localStorage value does not throw or block mount,
//               is auto-cleared, and the duel starts fresh.
//   PERSIST-07: A stale mid-stack save does not trigger any resume UI;
//               the new game starts fresh and overwrites the stale save.
//
// Each test runs at both desktop (1280x800, /?duel=sandbox) and
// mobile (390x844, /?duel=sandbox) -- uses shared __duelDispatch/__duelState
// escape hatches (registered by useDuelController in sandbox mode).
//
// Sandbox escape hatches used:
//   window.__duelDispatch(action)  -- drive the engine from page.evaluate
//   window.__duelState()           -- read current GameState snapshot
//   DEBUG_SET_ACTIVE { patch }     -- inject arbitrary state into the engine

import { test, expect, Page } from '@playwright/test';

const DESKTOP_URL = '/?duel=sandbox&aiSpeed=0';
const MOBILE_URL  = '/?duel=sandbox&aiSpeed=0';
const STORAGE_KEY = 'shandalar:duel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForDuelReady(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    null,
    { timeout: 10000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

async function patchAndWaitForSave(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: p });
  }, patch);
  await page.waitForTimeout(400);
}

// Build a minimal valid duel state shape that satisfies isValidDuelState(),
// with a non-empty stack to represent a mid-stack save.
function makeMidStackSave() {
  return {
    phase: 'MAIN_1',
    active: 'p',
    turn: 1,
    landsPlayed: 0,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack: [{ id: 'stale-item', card: { name: 'Lava Axe', effect: 'damage5' }, caster: 'p', targets: [], xVal: 1 }],
    over: null,
    selCard: null,
    selTgt: null,
    xVal: 1,
    log: [],
    ruleset: { startingLife: 20, startingHandSize: 7, drawOnFirstTurn: false, londonMulligan: false, deathtouch: true },
    oppArch: { id: 'KARAG', profileId: 'KARAG' },
    castleMod: null,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    turnState: { damageLog: [] },
    triggerQueue: [],
    pendingChoice: null,
    fogActive: false,
    anteEnabled: false,
    anteP: null,
    anteO: null,
    p: { life: 20, lib: [], hand: [], bf: [], gy: [], exile: [], mana: { W:0, U:0, B:0, R:0, G:0, C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0 },
    o: { life: 20, lib: [], hand: [], bf: [], gy: [], exile: [], mana: { W:0, U:0, B:0, R:0, G:0, C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0 },
  };
}

// ---------------------------------------------------------------------------
// DESKTOP (1280x800) -- DuelScreen.tsx
// ---------------------------------------------------------------------------

test.describe('@persistence @mobile Duel persistence [desktop]', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('PERSIST-04: forfeiting clears the saved duel from localStorage', async ({ page }) => {
    await page.goto(DESKTOP_URL);
    await waitForDuelReady(page);

    // usePersistence will have saved the initial state by now; confirm.
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(before, 'save should exist before forfeit').not.toBeNull();

    // Click Forfeit -- handleDuelEndWithClear calls clearDuel() then navigates.
    await page.getByRole('button', { name: 'Forfeit' }).click();
    await page.waitForURL('http://localhost:5173/', { timeout: 5000 });

    const after = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(after, 'localStorage should be cleared after forfeit').toBeNull();
  });

  test('PERSIST-05: fresh context -- duel mounts normally with no save present', async ({ page }) => {
    await page.goto(DESKTOP_URL);
    const saved = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(saved, 'localStorage should be empty in a fresh context').toBeNull();

    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);
  });

  test('PERSIST-06: malformed localStorage value is cleared and duel mounts normally', async ({ page }) => {
    await page.goto('about:blank');
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ garbage: true }));
    }, STORAGE_KEY);

    await page.goto(DESKTOP_URL);
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    // No resume modal exists; the duel screen must be interactive.
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);

    // loadDuel()'s shape-validation auto-clear must have removed the invalid save.
    const remaining = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(remaining, 'invalid save should be auto-cleared from localStorage').toBeNull();

    // Duel must be in a valid, interactive state (escape hatch available).
    await page.waitForFunction(
      () => typeof (window as any).__duelState === 'function',
      null,
      { timeout: 10000 },
    );
    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s, 'duel state must be accessible after malformed save').toBeTruthy();
  });

  test('PERSIST-07: stale mid-stack save does not resume; new game starts fresh', async ({ page }) => {
    // Inject a valid-shaped but mid-stack save directly into localStorage BEFORE the app loads.
    await page.goto('about:blank');
    await page.evaluate(({ key, save }: any) => {
      localStorage.setItem(key, JSON.stringify(save));
    }, { key: STORAGE_KEY, save: makeMidStackSave() });

    // Load the sandbox -- the stale save should be silently ignored (no resume UI).
    await page.goto(DESKTOP_URL);
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    // No resume modal -- there is none.
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);

    // The new game must start fresh (stack is empty, not the stale stack).
    await page.waitForFunction(
      () => typeof (window as any).__duelState === 'function',
      null,
      { timeout: 10000 },
    );
    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s.stack, 'new game must start with an empty stack, not the stale mid-stack save').toHaveLength(0);

    // Wait for autosave to run; it must overwrite the stale save with the fresh game state.
    await page.waitForTimeout(400);
    const savedRaw = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
    expect(savedRaw, 'autosave should have written the fresh game state').not.toBeNull();
    const savedState = JSON.parse(savedRaw!);
    expect(Array.isArray(savedState.stack) && savedState.stack.length === 0,
      'autosaved state should reflect fresh game (empty stack, not stale save)').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MOBILE (390x844) -- DuelScreen at mobile viewport  (?duel=sandbox)
// ---------------------------------------------------------------------------

test.describe('@persistence @mobile Duel persistence [mobile]', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('PERSIST-04: game over clears the saved duel from localStorage', async ({ page }) => {
    await page.goto(MOBILE_URL);
    await waitForDuelReady(page);

    await page.waitForTimeout(300);
    const before = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(before, 'save should exist before game over').not.toBeNull();

    // Trigger game over via DEBUG_SET_ACTIVE -- useDuelController fires onDuelEnd after 3000ms.
    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: { over: { winner: 'p' } },
      });
    });

    await page.waitForURL('http://localhost:5173/', { timeout: 5000 });

    const after = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(after, 'localStorage should be cleared after game over').toBeNull();
  });

  test('PERSIST-05: fresh context -- duel mounts normally with no save present', async ({ page }) => {
    await page.goto(MOBILE_URL);
    const saved = await page.evaluate(() => localStorage.getItem('shandalar:duel'));
    expect(saved, 'localStorage should be empty in a fresh context').toBeNull();

    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });
    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);
  });

  test('PERSIST-06: malformed localStorage value is cleared and duel mounts normally', async ({ page }) => {
    await page.goto('about:blank');
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ garbage: true }));
    }, STORAGE_KEY);

    await page.goto(MOBILE_URL);
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);

    const remaining = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(remaining, 'invalid save should be auto-cleared from localStorage').toBeNull();

    await page.waitForFunction(
      () => typeof (window as any).__duelState === 'function',
      null,
      { timeout: 10000 },
    );
    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s, 'duel state must be accessible after malformed save').toBeTruthy();
  });

  test('PERSIST-07: stale mid-stack save does not resume; new game starts fresh', async ({ page }) => {
    await page.goto('about:blank');
    await page.evaluate(({ key, save }: any) => {
      localStorage.setItem(key, JSON.stringify(save));
    }, { key: STORAGE_KEY, save: makeMidStackSave() });

    await page.goto(MOBILE_URL);
    await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 20000 });

    await expect(page.locator('[data-testid="resume-duel-modal"]')).toHaveCount(0);

    await page.waitForFunction(
      () => typeof (window as any).__duelState === 'function',
      null,
      { timeout: 10000 },
    );
    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s.stack, 'new game must start with an empty stack').toHaveLength(0);

    await page.waitForTimeout(400);
    const savedRaw = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
    expect(savedRaw, 'autosave should have written the fresh game state').not.toBeNull();
    const savedState = JSON.parse(savedRaw!);
    expect(Array.isArray(savedState.stack) && savedState.stack.length === 0,
      'autosaved state should reflect fresh game').toBe(true);
  });
});
