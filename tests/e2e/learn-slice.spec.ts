// tests/e2e/learn-slice.spec.ts
// Learn Mode slice 1: puzzle runner, lesson player, and the 9 exercises
// across Unit 1.1 and Unit 1.4. Uses data-testid selectors only, per
// docs/LEARN_MODE.md and CLAUDE.md's Learn Mode boundary rules.

import { test, expect } from '@playwright/test';

test.describe('@learn-slice-1 Learn Mode slice', () => {
  test('Learn-01: unit list renders with disclaimer', async ({ page }) => {
    await page.goto('/learn.html');
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();
    await expect(page.getByTestId('learn-unit-1.4')).toBeVisible();
    await expect(page.getByTestId('learn-disclaimer')).toContainText('Not approved or endorsed by Wizards of the Coast');
  });

  test('Learn-02: tap a land, then cast a creature', async ({ page }) => {
    await page.goto('/learn.html?exercise=1.1-01');
    await page.getByTestId('card-p-bf-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');

    await page.getByTestId('continue-button').click();
    await expect(page.getByTestId('exercise-title')).toHaveText('Cast a creature');

    await page.getByTestId('card-p-bf-0').click();
    await page.getByTestId('card-p-bf-1').click();
    await page.getByTestId('card-p-hand-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');
    await expect(page.getByTestId('player-bf')).toContainText('Grizzly Bears');
  });

  test('Learn-03: wrong colors rejected, undo, then recast correctly', async ({ page }) => {
    await page.goto('/learn.html?exercise=1.1-03');
    await page.getByTestId('card-p-bf-0').click();
    await page.getByTestId('card-p-bf-2').click();
    await page.getByTestId('card-p-bf-3').click();
    await page.getByTestId('card-p-hand-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'rejected');
    await expect(page.getByTestId('feedback-text')).toContainText('1RR');

    await page.getByTestId('undo-taps').click();
    await expect(page.getByTestId('card-p-bf-0')).toHaveAttribute('data-tapped', 'false');

    await page.getByTestId('card-p-bf-0').click();
    await page.getByTestId('card-p-bf-1').click();
    await page.getByTestId('card-p-bf-2').click();
    await page.getByTestId('card-p-hand-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');
  });

  test('Learn-04: multi-select spell affordability check', async ({ page }) => {
    await page.goto('/learn.html?exercise=1.1-04');
    await page.getByTestId('ms-option-grizzly_bears').click();
    await page.getByTestId('ms-option-llanowar_elves').click();
    await page.getByTestId('ms-option-gray_ogre').click();
    await page.getByTestId('ms-check').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');
  });

  test('Learn-05: lethal attack with more attackers than blockers', async ({ page }) => {
    await page.goto('/learn.html?exercise=1.4-02');
    await page.getByTestId('card-p-bf-0').click();
    await page.getByTestId('card-p-bf-1').click();
    await page.getByTestId('card-p-bf-2').click();
    await page.getByTestId('attack-button').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');
  });

  test('Learn-06: short attack shows the best block, retry resets the puzzle', async ({ page }) => {
    await page.goto('/learn.html?exercise=1.4-02');
    await page.getByTestId('card-p-bf-0').click();
    await page.getByTestId('card-p-bf-1').click();
    await page.getByTestId('attack-button').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'fail');
    await expect(page.getByTestId('feedback-text')).toContainText('Wall of Wood blocks');
    await expect(page.getByTestId('feedback-text')).toContainText("They're at 1");

    await page.getByTestId('retry-button').click();
    await expect(page.getByTestId('card-p-bf-0')).toHaveAttribute('data-selected', 'false');
    await expect(page.getByTestId('opp-life')).toContainText('3');
  });

  test('Learn-07: summoning-sick creature cannot attack', async ({ page }) => {
    await page.goto('/learn.html?exercise=1.4-04');
    await page.getByTestId('card-p-bf-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'rejected');
    await expect(page.getByTestId('feedback-text')).toContainText("can't attack yet");
    await expect(page.getByTestId('card-p-bf-0')).toHaveAttribute('data-selected', 'false');
  });

  test('Learn-08: Shandalar entry still boots, unaffected', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Shandalar');
    await expect(page.locator('#root > *').first()).toBeVisible();
  });
});
