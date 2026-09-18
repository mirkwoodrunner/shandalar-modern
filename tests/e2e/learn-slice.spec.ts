// tests/e2e/learn-slice.spec.ts
// Learn Mode: puzzle runner, lesson player, and the Tier 1 exercise tree
// across Units 1.1 to 1.4. Uses data-testid selectors only, per
// docs/LEARN_MODE.md and CLAUDE.md's Learn Mode boundary rules.

import { test, expect } from '@playwright/test';

test.describe('@learn-slice-1 Learn Mode slice', () => {
  test('Learn-01: unit list renders with disclaimer', async ({ page }) => {
    await page.goto('/learn.html');
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();
    await expect(page.getByTestId('learn-unit-1.4')).toBeVisible();
    await expect(page.getByTestId('learn-disclaimer')).toContainText('Not approved/endorsed by Wizards');
  });

  // L2c release gate. The fan content notice, the tutorial framing, and the
  // early-and-incomplete statement are all release conditions, so they are
  // asserted rather than trusted to survive a refactor.
  test('Learn-10: fan content notice and release framing are present', async ({ page }) => {
    await page.goto('/learn.html');

    const notice = page.getByTestId('learn-disclaimer');
    await expect(notice).toContainText('unofficial Fan Content permitted under the Fan Content Policy');
    await expect(notice).toContainText('Not approved/endorsed by Wizards');
    await expect(notice).toContainText('Portions of the materials used are property of Wizards of the Coast');

    // Framed as a tutorial, explicitly not as a place to play.
    await expect(page.getByTestId('learn-tagline')).toContainText('not a place to play games');
    // Framed as early and incomplete.
    await expect(page.getByTestId('learn-early-access')).toContainText('Early and incomplete');
    // Free, which the Fan Content Policy and Scryfall's terms both depend on.
    await expect(page.getByTestId('learn-no-money')).toContainText('no ads and nothing to buy');
  });

  // L2b exit criterion: a first-time player can reach every Tier 1 unit. The
  // whole tree is listed and each unit's first exercise opens.
  test('Learn-09: every Tier 1 unit is listed and entered from the unit list', async ({ page }) => {
    await page.goto('/learn.html');
    for (const unit of ['1.1', '1.2', '1.3', '1.4']) {
      await expect(page.getByTestId(`learn-unit-${unit}`)).toBeVisible();
    }
    for (const [unit, title] of [
      ['1.1', 'Tap a land'],
      ['1.2', 'A black creature'],
      ['1.3', 'Fresh arrivals'],
      ['1.4', 'Fly over'],
    ] as const) {
      await page.goto(`/learn.html?exercise=${unit}-01`);
      await expect(page.getByTestId('exercise-title')).toHaveText(title);
    }
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
    await page.goto('/learn.html?exercise=1.3-01');
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
