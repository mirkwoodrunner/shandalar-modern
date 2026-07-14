// tests/e2e/end-turn-stack-priority-deadlock.spec.ts
//
// Regression test for a deadlock in the End Turn skip-ahead effect
// (useDuelController.ts): clicking End Turn while a priority window is open
// and the stack is non-empty (e.g. opponent responds to a spell with a
// counterspell and passes) previously got stuck on "Ending Turn..." forever,
// because the stack-non-empty guard ran before the open-priority-window
// guard. Fixed by reordering the two checks. See docs/MECHANICS_INDEX.md,
// Bug Fix: End Turn Stack-Priority Deadlock.
//
// Repro path: Pestilence cast by 'p' (stack: [pestilence]), Counterspell
// cast by 'o' targeting it (stack: [pestilence, counterspell]), 'o' passes
// (priorityPasser: 'o', window still open, stack still length 2), 'p' clicks
// End Turn.
//
// DEADLOCK-01/03: End Turn completes (does not hang) -- desktop/mobile.
// DEADLOCK-02/04: Pestilence actually ends up countered (in 'p' gy, not on
//                 stack or battlefield) once the skip finishes -- desktop/mobile.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
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

// Builds the exact deadlock precondition: stack = [pestilence, counterspell],
// priorityWindow = true, priorityPasser = 'o'.
//
// Each dispatch is awaited with a short settle delay in its own page.evaluate
// call rather than batched into one call -- the escape-hatch's __duelState()
// closure only refreshes on the next React commit, and batching several
// dispatch()+read steps into a single evaluate() can race that commit in a
// headless/unfocused page (React's scheduler falls back to real wall-clock
// timers without an active rAF loop). Reading a stale hand mid-batch made
// setup itself flaky independent of the fix under test.
async function setUpStuckStack(page: Page) {
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['pestilence'], mana: { B: 2, C: 2 } });
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['counterspell'], mana: { U: 2 } });
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    const s1 = (window as any).__duelState();
    const pest = s1.p.hand.find((c: any) => c.id === 'pestilence');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: pest.iid, tgt: null, xVal: null });
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    const s2 = (window as any).__duelState();
    const cspell = s2.o.hand.find((c: any) => c.id === 'counterspell');
    dispatch({ type: 'CAST_SPELL', who: 'o', iid: cspell.iid, tgt: null, xVal: null });
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
  });
  await page.waitForTimeout(200);

  // Sanity-check the precondition before clicking End Turn -- if this fails,
  // the repro setup itself is wrong, not the fix under test.
  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.stack.length).toBe(2);
  expect(s.priorityWindow).toBe(true);
  expect(s.priorityPasser).toBe('o');
}

async function runDeadlockDoesNotHang(page: Page) {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await dismissMulligan(page);
  await waitForMain1(page);

  await setUpStuckStack(page);

  const beforeTurn = await page.evaluate(() => (window as any).__duelState().turn);

  const endTurnBtn = page.getByTestId('end-turn-button');
  await expect(endTurnBtn).toBeEnabled();
  await endTurnBtn.click();

  await page.waitForFunction(
    (prevTurn) => {
      const s = (window as any).__duelState?.();
      return s && (s.active === 'o' || s.turn !== prevTurn);
    },
    beforeTurn,
    { timeout: 15_000 }
  );
}

async function runPestilenceActuallyCountered(page: Page) {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await dismissMulligan(page);
  await waitForMain1(page);

  await setUpStuckStack(page);

  const beforeTurn = await page.evaluate(() => (window as any).__duelState().turn);
  await page.getByTestId('end-turn-button').click();

  await page.waitForFunction(
    (prevTurn) => {
      const s = (window as any).__duelState?.();
      return s && (s.active === 'o' || s.turn !== prevTurn);
    },
    beforeTurn,
    { timeout: 15_000 }
  );

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.stack.length).toBe(0);
  expect(s.p.bf.some((c: any) => c.id === 'pestilence')).toBe(false);
  expect(s.p.gy.some((c: any) => c.id === 'pestilence')).toBe(true);
}

test.describe('@engine-phases-priority-2 @mobile End Turn stack-priority deadlock -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('DEADLOCK-01: End Turn completes when opponent responds with a counterspell and passes', async ({ page }) => {
    await runDeadlockDoesNotHang(page);
  });

  test('DEADLOCK-02: Pestilence is actually countered once the skip completes', async ({ page }) => {
    await runPestilenceActuallyCountered(page);
  });
});

test.describe('@engine-phases-priority-2 @mobile End Turn stack-priority deadlock -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('DEADLOCK-03: End Turn completes on mobile ActionBar', async ({ page }) => {
    await runDeadlockDoesNotHang(page);
  });

  test('DEADLOCK-04: Pestilence is actually countered once the skip completes (mobile)', async ({ page }) => {
    await runPestilenceActuallyCountered(page);
  });
});
