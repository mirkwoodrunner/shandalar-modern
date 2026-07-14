// e2e/tutor-modal.spec.ts
import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0&cards=demonic_tutor';

test.describe('@engine-cast-flow-ui-5 @mobile TutorModal confirmation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(SANDBOX_URL);
    // Cast Demonic Tutor to open the modal
    // Wait for the sandbox to load
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10000 });
    // The modal may already be open if demonic_tutor triggers automatically;
    // otherwise, find it in hand and cast it
    const modalVisible = await page.locator('[data-testid="tutor-modal"]').isVisible().catch(() => false);
    if (!modalVisible) {
      // Find the demonic tutor card in hand and cast it
      const tutorCard = page.locator('[data-testid^="hand-card-"]').first();
      await tutorCard.click();
      const castBtn = page.locator('[data-testid="cast-button"]');
      if (await castBtn.isVisible()) await castBtn.click();
      // Pass priority if needed
      const passBtn = page.locator('[data-testid="pass-priority-button"]');
      if (await passBtn.isVisible()) await passBtn.click();
      await page.waitForSelector('[data-testid="tutor-modal"]', { timeout: 5000 });
    }
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
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10000 });
    const modalVisible = await page.locator('[data-testid="tutor-modal"]').isVisible().catch(() => false);
    if (!modalVisible) {
      const tutorCard = page.locator('[data-testid^="hand-card-"]').first();
      await tutorCard.click();
      const castBtn = page.locator('[data-testid="cast-button"]');
      if (await castBtn.isVisible()) await castBtn.click();
      const passBtn = page.locator('[data-testid="pass-priority-button"]');
      if (await passBtn.isVisible()) await passBtn.click();
      await page.waitForSelector('[data-testid="tutor-modal"]', { timeout: 5000 });
    }
    const firstCard = page.locator('[data-testid^="tutor-card-"]').first();
    await firstCard.click();
    await expect(page.locator('[data-testid="tutor-confirm"]')).toBeVisible();
  });
});
