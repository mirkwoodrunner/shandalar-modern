// tests/e2e/learn-persistence.spec.ts
// Learn Mode L1: persistence, onboarding survey, and derived resume
// position. Each test starts from a fresh (isolated) browser context --
// Playwright gives one per test by default in this repo, since no
// storageState/globalSetup is configured -- so no test inherits another's
// save.

import { test, expect } from '@playwright/test';

async function answerSurvey(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('onboarding-survey')).toBeVisible();
  await page.getByTestId('survey-played-before-never').click();
  await page.getByTestId('survey-organized-no').click();
  await page.getByTestId('survey-judge-no').click();
  await page.getByTestId('survey-submit').click();
  await expect(page.getByTestId('onboarding-survey')).not.toBeVisible();
}

test.describe('@learn-persistence-1 Learn Mode persistence', () => {
  test('Learn-P1: first-load survey appears, answering lands on the unit list, reload does not re-show it', async ({ page }) => {
    await page.goto('/learn.html');
    await answerSurvey(page);
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('onboarding-survey')).not.toBeVisible();
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();
  });

  test('Learn-P2: complete exercise 1, refresh, re-entering the unit resumes at exercise 2', async ({ page }) => {
    await page.goto('/learn.html');
    await answerSurvey(page);

    await page.getByTestId('learn-unit-1.1').click();
    await expect(page.getByTestId('exercise-title')).toHaveText('Tap a land');
    await page.getByTestId('card-p-bf-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');

    // L1 stores no mid-lesson resume position (docs/LEARN_L1_SPEC.md
    // correction C4): a refresh always lands on the unit list. Re-entering
    // the same unit derives the resume position from completion records.
    await page.reload();
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();

    await page.getByTestId('learn-unit-1.1').click();
    await expect(page.getByTestId('exercise-title')).toHaveText('Cast a creature');
  });

  test('Learn-P3: reset control clears progress, next visit shows the survey again', async ({ page }) => {
    await page.goto('/learn.html');
    await answerSurvey(page);
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();

    await page.getByTestId('reset-progress-button').click();

    await page.reload();
    await expect(page.getByTestId('onboarding-survey')).toBeVisible();
  });

  test('Learn-P4: a ?exercise= deep link opens that exercise even when the derivation would pick a different one', async ({ page }) => {
    await page.goto('/learn.html');
    await answerSurvey(page);

    await page.getByTestId('learn-unit-1.1').click();
    await page.getByTestId('card-p-bf-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');

    // The derivation would now resume Unit 1.1 at exercise 2 ("Cast a
    // creature"). The deep link to exercise 1 must still win.
    await page.goto('/learn.html?exercise=1.1-01');
    await expect(page.getByTestId('exercise-title')).toHaveText('Tap a land');
  });

  test('Learn-P5: storage disabled -- the lesson player still loads and an exercise is completable, no crash', async ({ page }) => {
    await page.addInitScript(() => {
      const throwStorageError = () => {
        throw new Error('storage disabled');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: throwStorageError,
          setItem: throwStorageError,
          removeItem: throwStorageError,
          clear: throwStorageError,
          key: throwStorageError,
          length: 0,
        },
      });
    });

    const pageErrors: Error[] = [];
    page.on('pageerror', err => pageErrors.push(err));

    // A deep link bypasses the survey gate, so this exercises the lesson
    // player directly without depending on onboarding state.
    await page.goto('/learn.html?exercise=1.1-01');
    await expect(page.getByTestId('exercise-title')).toHaveText('Tap a land');
    await page.getByTestId('card-p-bf-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');

    expect(pageErrors).toEqual([]);
  });
});
