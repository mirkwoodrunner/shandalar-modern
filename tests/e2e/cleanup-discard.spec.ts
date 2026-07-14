// tests/e2e/cleanup-discard.spec.ts
// CleanupDiscardModal: the human player's cleanup-step hand-limit discard
// picker. See docs/SYSTEMS.md Section 29 and docs/MECHANICS_INDEX.md.
// Modeled on tests/e2e/tutor-modal.spec.ts's confirm-button-gating pattern
// and tests/e2e/discard-centralization.spec.ts's state-seeding via
// DEBUG_SET_ACTIVE.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForDuelMobile(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 10_000 });
}

async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

async function openCleanupDiscardModal(page: Page, count = 2, total = 9) {
  await page.evaluate(({ count, total }) => {
    const s = (window as any).__duelState();
    const hand = Array.from({ length: total }, (_, i) => ({
      iid: `cd-c${i}`, id: 'lightning_bolt', name: `Cleanup Card ${i}`, type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, damage: 0, counters: {},
      eotBuffs: [], enchantments: [], controller: 'p',
    }));
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'END', active: 'p', priorityWindow: false, stack: [],
        p: { ...s.p, hand }, ruleset: { ...s.ruleset, maxHandSize: total - count },
      },
    });
  }, { count, total });
  await page.waitForFunction(({ total }) => (window as any).__duelState?.().p.hand.length === total, { total }, { timeout: 5_000 });
  await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' })); // END -> CLEANUP
  await page.waitForSelector('[data-testid="cleanup-discard-modal"]', { timeout: 5_000 });
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine-core-mechanics-1 CleanupDiscardModal [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await dismissMulligan(page);
      await waitForMain1(page);
    });

    test('confirm button disabled before any selection', async ({ page }) => {
      await openCleanupDiscardModal(page, 2, 9);
      await expect(page.locator('[data-testid="cleanup-discard-confirm"]')).toBeDisabled();
    });

    test('confirm button stays disabled with fewer than the required selection', async ({ page }) => {
      await openCleanupDiscardModal(page, 2, 9);
      await page.locator('[data-testid="cleanup-discard-card-cd-c0"]').click();
      await expect(page.locator('[data-testid="cleanup-discard-confirm"]')).toBeDisabled();
    });

    test('confirm button enables once exactly the required count is selected', async ({ page }) => {
      await openCleanupDiscardModal(page, 2, 9);
      await page.locator('[data-testid="cleanup-discard-card-cd-c0"]').click();
      await page.locator('[data-testid="cleanup-discard-card-cd-c1"]').click();
      await expect(page.locator('[data-testid="cleanup-discard-confirm"]')).toBeEnabled();
    });

    test('clicking a selected card again deselects it', async ({ page }) => {
      await openCleanupDiscardModal(page, 2, 9);
      const card0 = page.locator('[data-testid="cleanup-discard-card-cd-c0"]');
      await card0.click();
      await card0.click();
      await page.locator('[data-testid="cleanup-discard-card-cd-c1"]').click();
      await expect(page.locator('[data-testid="cleanup-discard-confirm"]')).toBeDisabled();
    });

    test('clicking beyond the required count is a no-op (does not replace an existing selection)', async ({ page }) => {
      await openCleanupDiscardModal(page, 2, 9);
      await page.locator('[data-testid="cleanup-discard-card-cd-c0"]').click();
      await page.locator('[data-testid="cleanup-discard-card-cd-c1"]').click();
      await page.locator('[data-testid="cleanup-discard-card-cd-c2"]').click(); // 3rd click, over cap

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.pendingCleanupDiscard).toEqual({ controller: 'p', count: 2 });
      await expect(page.locator('[data-testid="cleanup-discard-confirm"]')).toBeEnabled();
    });

    test('confirming discards exactly the selected cards and closes the modal', async ({ page }) => {
      await openCleanupDiscardModal(page, 2, 9);
      await page.locator('[data-testid="cleanup-discard-card-cd-c3"]').click();
      await page.locator('[data-testid="cleanup-discard-card-cd-c5"]').click();
      await page.locator('[data-testid="cleanup-discard-confirm"]').click();

      await expect(page.locator('[data-testid="cleanup-discard-modal"]')).not.toBeVisible();
      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.hand.length).toBe(7);
      expect(state.p.gy.map((c: any) => c.iid).sort()).toEqual(['cd-c3', 'cd-c5']);
      expect(state.pendingCleanupDiscard).toBeFalsy();
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
