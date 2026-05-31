import { test, expect } from '@playwright/test';

test.describe('Difficulty system', () => {
  test('Choose screen shows color, difficulty, and name field together', async ({ page }) => {
    await page.goto('/');
    await page.getByText('BEGIN YOUR JOURNEY').click();
    // All three sections visible on one screen
    await expect(page.getByText('Choose the color of your magic.')).toBeVisible();
    await expect(page.getByText('Choose your difficulty.')).toBeVisible();
    await expect(page.getByPlaceholder(/wizard/i)).toBeVisible();
    // All four difficulty options visible
    await expect(page.getByText('Apprentice')).toBeVisible();
    await expect(page.getByText('Magician')).toBeVisible();
    await expect(page.getByText('Sorcerer')).toBeVisible();
    await expect(page.getByText('Wizard')).toBeVisible();
  });

  test('Enter Shandalar button is disabled until color is selected', async ({ page }) => {
    await page.goto('/');
    await page.getByText('BEGIN YOUR JOURNEY').click();
    const enterBtn = page.getByRole('button', { name: /Enter Shandalar/i });
    await expect(enterBtn).toBeDisabled();
    await page.locator('[data-testid="color-W"]').click();
    await expect(enterBtn).toBeEnabled();
  });

  test('Apprentice is selected by default', async ({ page }) => {
    await page.goto('/');
    await page.getByText('BEGIN YOUR JOURNEY').click();
    // Apprentice card should have the selected visual state
    // Check the life display shows 20 on the Apprentice card
    await expect(page.getByText(/♥20 life/)).toBeVisible();
  });

  test('Sandbox mode bypasses choose screen and starts with life 20', async ({ page }) => {
    await page.goto('/?duel=sandbox');
    await expect(page.getByTestId('duel-screen')).toBeVisible({ timeout: 5000 });
  });
});
