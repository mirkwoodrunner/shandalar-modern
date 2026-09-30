// tests/e2e/learn-blocking.spec.ts
// Learn Mode L5 slice 1: player-side blocking in scenario mode. The opponent
// is the active player with attackers already declared; the learner declares
// blocks with the duel screen's existing two-click flow (your creature, then
// the attacker) and presses Check.
//
// Runs at both viewports -- playwright.config.js lists this spec under
// mobile-chrome. Selectors are data-testid only; `bf-card-<iid>` exists on
// both the desktop and the mobile battlefield card.
//
// Scenario mode has no __duelState hatch, so the board is read through the
// graded feedback: its summary names every block that was on the board.

import { test, expect, type Page } from '@playwright/test';

const url = (id: string) => `/learn.html?scenario=${id}`;

async function open(page: Page, id: string) {
  await page.goto(url(id));
  await expect(page.getByTestId('scenario-overlay')).toBeVisible();
  await expect(page.getByTestId('bf-card-o-bf-0')).toBeVisible();
}

async function block(page: Page, blocker: string, attacker: string) {
  await page.getByTestId(`bf-card-${blocker}`).click();
  await page.getByTestId(`bf-card-${attacker}`).click();
}

async function check(page: Page) {
  await page.getByTestId('scenario-check-button').click();
  await expect(page.getByTestId('scenario-feedback')).toBeVisible();
}

test.describe('@learn-blocking-1 correct blocks grade success', () => {
  const CASES: [string, string, [string, string][]][] = [
    ['2.1-01', 'choose-a-blocker: Giant Spider blocks Wind Drake', [['p-bf-1', 'o-bf-0']]],
    ['2.1-02', 'chump-block: Storm Crow blocks Air Elemental', [['p-bf-0', 'o-bf-0']]],
    ['2.1-03', 'double-block: Bears and Crow block Hill Giant', [['p-bf-0', 'o-bf-0'], ['p-bf-1', 'o-bf-0']]],
    ['2.1-04', 'trade-or-take: Bears trade with Goblin Piker', [['p-bf-0', 'o-bf-0']]],
  ];
  for (const [id, label, blocks] of CASES) {
    test(`Learn-B1 ${id} ${label}`, async ({ page }) => {
      await open(page, id);
      for (const [bl, at] of blocks) await block(page, bl, at);
      await check(page);
      await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'success');
    });
  }
});

test.describe('@learn-blocking-2 wrong answers grade fail with the teaching message', () => {
  test('Learn-B2: the wrong blocker fails and says what happened', async ({ page }) => {
    await open(page, '2.1-01');
    await block(page, 'p-bf-0', 'o-bf-0');
    await check(page);
    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'fail');
    await expect(page.getByTestId('scenario-feedback')).toContainText('Storm Crow blocks Wind Drake.');
    await expect(page.getByTestId('scenario-feedback')).toContainText('Storm Crow dies');
  });

  test('Learn-B3: chump-block with no blocks is graded, and fails', async ({ page }) => {
    await open(page, '2.1-02');
    await check(page);
    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'fail');
    await expect(page.getByTestId('scenario-feedback')).toContainText('Nothing blocks.');
    await expect(page.getByTestId('scenario-feedback')).toContainText('You lose');
  });
});

test.describe('@learn-blocking-3 the two-click flow on a real board', () => {
  test('Learn-B4: clicking a declared pair again removes the block', async ({ page }) => {
    await open(page, '2.1-03');
    await block(page, 'p-bf-0', 'o-bf-0');
    await block(page, 'p-bf-1', 'o-bf-0');
    // Take the Crow's block back.
    await block(page, 'p-bf-1', 'o-bf-0');
    await check(page);
    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'fail');
    await expect(page.getByTestId('scenario-feedback')).toContainText('Grizzly Bears blocks Hill Giant.');
    await expect(page.getByTestId('scenario-feedback')).not.toContainText('Storm Crow blocks');
  });

  test('Learn-B5: toggling a block off and on leaves the right blocks on the board', async ({ page }) => {
    await open(page, '2.1-03');
    await block(page, 'p-bf-0', 'o-bf-0');
    await block(page, 'p-bf-1', 'o-bf-0');
    await block(page, 'p-bf-1', 'o-bf-0');
    await block(page, 'p-bf-1', 'o-bf-0');
    await check(page);
    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'success');
  });

  test('Learn-B6: Done Blocking and phase controls are not offered', async ({ page }) => {
    await open(page, '2.1-03');
    await expect(page.getByTestId('done-blocking-button')).toHaveCount(0);
    await expect(page.getByTestId('pass-priority-button')).toHaveCount(0);
    await expect(page.getByTestId('end-turn-button')).toHaveCount(0);
  });
});

test.describe('@learn-blocking-4 Unit 2.1 stays unlisted', () => {
  test('Learn-B7: the unit list does not show Unit 2.1', async ({ page }) => {
    await page.goto('/learn.html');
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();
    await expect(page.getByTestId('learn-unit-2.1')).toHaveCount(0);
  });
});
