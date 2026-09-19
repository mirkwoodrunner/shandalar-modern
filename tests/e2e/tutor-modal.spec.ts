// e2e/tutor-modal.spec.ts
import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

// The sandbox boots with the mulligan modal open; the board underneath it is
// not interactive until it is dismissed. Same pattern as the 49 specs that
// already handle this.
async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

// Opens the TutorModal deterministically through the sandbox escape hatch.
//
// The previous setup clicked the first card in hand and hoped it was Demonic
// Tutor. It was not: `?cards=` prepends basic lands alongside the named card,
// so the first hand slot is a land, and on a desktop viewport that locator
// resolved to a card outside the viewport. Injecting the card and casting it
// through the reducer removes both guesses. These tests are about the modal's
// own behaviour, not about how a card gets cast.
async function openTutorModal(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
  await dismissMulligan(page);
  await page.waitForFunction(
    () => (window as any).__duelState?.().active === 'p'
       && (window as any).__duelState?.().phase === 'MAIN_1',
    { timeout: 10_000 },
  );

  // `cardIds` instantiates from CARD_DB; `cards` would append the raw string.
  await page.evaluate(() => {
    (window as any).__duelDispatch({
      type: 'SANDBOX_FORCE_HAND',
      who: 'p',
      cardIds: ['demonic_tutor'],
      withManaSupport: true,
    });
  });
  // window.__duelState() is a render-time snapshot (useDuelController.ts), so a
  // read issued immediately after a dispatch still sees the pre-dispatch state.
  // Wait for the injected card to appear rather than reading straight through.
  // See docs/TEST_AUDIT_LOG.md 2026-09-18, Finding 3, cause 3.
  await page.waitForFunction(
    () => (window as any).__duelState().p.hand.some((c: any) => c?.id === 'demonic_tutor'),
    { timeout: 5_000 },
  );
  const iid = await page.evaluate(
    () => (window as any).__duelState().p.hand.find((c: any) => c?.id === 'demonic_tutor')?.iid,
  );
  if (!iid) throw new Error('demonic_tutor was not injected into hand');

  // Sprint 7: every non-land spell goes on the stack, so the tutor's effect --
  // and therefore the modal -- only appears once the stack resolves.
  await page.evaluate((i) => {
    (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: i, tgt: null });
  }, iid);
  await page.waitForFunction(() => (window as any).__duelState().stack?.length > 0, { timeout: 5_000 });
  await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
  await page.waitForSelector('[data-testid="tutor-modal"]', { timeout: 5_000 });
}

test.describe('@engine-cast-flow-ui-5 @mobile TutorModal confirmation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await openTutorModal(page);
  });

  test('confirm button absent before selection', async ({ page }) => {
    await expect(page.locator('[data-testid="tutor-confirm"]')).not.toBeVisible();
  });

  test('clicking a valid card shows confirm button', async ({ page }) => {
    const firstCard = page.locator('[data-testid^="tutor-card-"]').first();
    await firstCard.click();
    await expect(page.locator('[data-testid="tutor-confirm"]')).toBeVisible();
  });

  test('clicking same card twice deselects (confirm disappears)', async ({ page }) => {
    const firstCard = page.locator('[data-testid^="tutor-card-"]').first();
    await firstCard.click();
    await firstCard.click();
    await expect(page.locator('[data-testid="tutor-confirm"]')).not.toBeVisible();
  });

  test('clicking a different card switches selection', async ({ page }) => {
    const cards = page.locator('[data-testid^="tutor-card-"]');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await expect(page.locator('[data-testid="tutor-confirm"]')).toBeVisible();
  });

  test('decline button still works', async ({ page }) => {
    await page.locator('[data-testid="tutor-decline"]').click();
    await expect(page.locator('[data-testid="tutor-modal"]')).not.toBeVisible();
  });

});

test.describe('@engine-cast-flow-ui-5 @mobile TutorModal — mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('confirm button visible after selection on mobile', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await openTutorModal(page);
    const firstCard = page.locator('[data-testid^="tutor-card-"]').first();
    await firstCard.click();
    await expect(page.locator('[data-testid="tutor-confirm"]')).toBeVisible();
  });
});
