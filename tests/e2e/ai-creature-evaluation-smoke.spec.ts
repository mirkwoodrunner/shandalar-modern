// tests/e2e/ai-creature-evaluation-smoke.spec.ts
//
// Regression guard for the Forge CreatureEvaluator port (src/engine/AI.js
// evaluateCreatureValue / evaluateBoard). This is a shared-logic change --
// both DuelScreen.tsx and DuelScreenMobile.tsx call the same useDuelController
// -> aiDecide() -> AI.js path, so no screen-specific behavior is possible here.
// Not a new-feature test: plays an AI-vs-AI-ish duel to completion (player
// auto-passes/ends turn every step) and asserts the richer board evaluation
// doesn't crash or hang the AI's decision loop on either screen.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

// Drives the duel forward with no card-specific knowledge: dismiss mulligan,
// decline blocks, end the player's turn whenever it's available, and pass
// priority otherwise. The AI (aiSpeed=0) plays its own turns automatically via
// useDuelController -- this loop only needs to get the player out of its way.
async function playToCompletion(page: Page, maxIterations = 400): Promise<boolean> {
  for (let i = 0; i < maxIterations; i++) {
    const over = await page.evaluate(() => !!(window as any).__duelState?.()?.over).catch(() => false);
    if (over) return true;

    await dismissMulligan(page);

    const doneBlocking = page.getByTestId('done-blocking-button');
    if (await doneBlocking.isVisible().catch(() => false)) {
      await doneBlocking.click().catch(() => {});
      continue;
    }

    const endTurn = page.getByTestId('end-turn-button');
    if (await endTurn.isVisible().catch(() => false) && await endTurn.isEnabled().catch(() => false)) {
      await endTurn.click().catch(() => {});
      await page.waitForTimeout(50);
      continue;
    }

    const passPriority = page.getByTestId('pass-priority-button');
    if (await passPriority.isVisible().catch(() => false) && await passPriority.isEnabled().catch(() => false)) {
      await passPriority.click().catch(() => {});
      continue;
    }

    await page.waitForTimeout(100);
  }
  return !!(await page.evaluate(() => (window as any).__duelState?.()?.over).catch(() => false));
}

async function runSmoke(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await dismissMulligan(page);

  const terminated = await playToCompletion(page);

  expect(pageErrors, `uncaught page errors: ${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  expect(terminated).toBe(true);
}

test.describe('@engine-ai-1 Creature evaluator AI smoke -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('AI plays a full duel to completion with no console errors', async ({ page }) => {
    test.setTimeout(90_000);
    await runSmoke(page);
  });
});

test.describe('@engine-ai-1 @mobile Creature evaluator AI smoke -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('AI plays a full duel to completion with no console errors (mobile)', async ({ page }) => {
    test.setTimeout(90_000);
    await runSmoke(page);
  });
});
