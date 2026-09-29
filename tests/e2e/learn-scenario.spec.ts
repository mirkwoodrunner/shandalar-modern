// tests/e2e/learn-scenario.spec.ts
// Learn Mode scenario mode (L3): an exercise rendered on the real duel screen.
//
// This file is the mitigation named in docs/LEARN_MODE_ROADMAP.md, L3 ("Risk"):
// once Learn Mode couples to the duel UI, every duel UI change can break
// lessons. It runs at both viewports from slice one -- the mobile-chrome
// project in playwright.config.js lists this spec.
//
// Selectors are data-testid only. `bf-card-<iid>` is on both the desktop and
// the mobile battlefield card and land pip, so the same click works at either
// viewport without a branch.

import { test, expect } from '@playwright/test';

// 1.1-01: one Forest on the battlefield. allowed: ['TAP_LAND'].
// Goal: one green mana in the pool.
const TAP_ONLY = '/learn.html?scenario=1.1-01';

// 1.1-02: two Forests, Grizzly Bears in hand.
// allowed: ['TAP_LAND', 'CAST_SPELL', 'UNDO_MANA_TAPS'].
const CAST_EXERCISE = '/learn.html?scenario=1.1-02';

// 1.4-02: Grizzly Bears, Gray Ogre and Hill Giant vs one Wall of Wood, at 3
// life. allowed: ['DECLARE_ATTACKER']. Goal: OPPONENT_DEAD_THIS_TURN.
// All three attackers win; any two lose to the Wall blocking the biggest.
const LETHAL_EXERCISE = '/learn.html?scenario=1.4-02';

test.describe('@learn-scenario-1 scenario mode renders a supplied state', () => {
  test('Learn-S1: the duel screen mounts a mid-game state built by the exercise', async ({ page }) => {
    await page.goto(TAP_ONLY);

    // The real duel screen, not the bespoke Learn board.
    await expect(page.getByTestId('duel-screen').or(page.getByTestId('action-bar'))).toBeVisible();

    // The exercise's board, not a deck-derived opening hand: exactly the one
    // Forest buildPuzzleState seeded, and an empty library on both sides.
    await expect(page.getByTestId('bf-card-p-bf-0')).toBeVisible();
    await expect(page.getByTestId('bf-card-p-bf-1')).toHaveCount(0);

    // Lesson chrome is present and carries this exercise's prompt.
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();
    await expect(page.getByTestId('scenario-prompt')).toContainText('Tap the Forest');
  });

  test('Learn-S2: campaign and ante chrome are suppressed', async ({ page }) => {
    await page.goto(TAP_ONLY);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    await expect(page.getByTestId('ante-banner')).toHaveCount(0);
    await expect(page.getByTestId('ante-banner-mobile')).toHaveCount(0);
    // The campaign identity row (wordmark / ruleset / Forfeit) is gone; the
    // phase bar, which is teaching material, stays.
    await expect(page.locator('body')).not.toContainText('SHANDALAR');
    await expect(page.getByTestId('phase-bar').first()).toBeVisible();
  });

  test('Learn-S3: the lesson overlay does not cover the mobile HUD', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'mobile viewport only');
    await page.goto(CAST_EXERCISE);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    const overlay = await page.getByTestId('scenario-overlay').boundingBox();
    const bar = await page.getByTestId('action-bar').boundingBox();
    expect(overlay).not.toBeNull();
    expect(bar).not.toBeNull();
    // The overlay is top-docked; every mobile control lives at the bottom.
    expect(overlay!.y + overlay!.height).toBeLessThanOrEqual(bar!.y);

    // And it can be collapsed to uncover the board underneath.
    await page.getByTestId('scenario-collapse-toggle').click();
    await expect(page.getByTestId('scenario-prompt')).toHaveCount(0);
    await page.getByTestId('scenario-collapse-toggle').click();
    await expect(page.getByTestId('scenario-prompt')).toBeVisible();
  });
});

test.describe('@learn-scenario-2 disallowed actions are not offered', () => {
  test('Learn-S4: a tap-only exercise offers no phase advance and no undo', async ({ page }) => {
    await page.goto(TAP_ONLY);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    // allowed is ['TAP_LAND'] -- ADVANCE_PHASE is not in it, so neither the
    // Pass Priority nor the End Turn control is rendered at either viewport.
    await expect(page.getByTestId('pass-priority-button')).toHaveCount(0);
    await expect(page.getByTestId('end-turn-button')).toHaveCount(0);
    await expect(page.getByTestId('undo-taps-button')).toHaveCount(0);
  });

  test('Learn-S5: an exercise that allows undo still offers it once a land is tapped', async ({ page }) => {
    await page.goto(CAST_EXERCISE);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    // Same suppression for the phase controls...
    await expect(page.getByTestId('end-turn-button')).toHaveCount(0);

    // ...but UNDO_MANA_TAPS is allowed here, so the undo control appears as
    // soon as there is a tap to undo. That is the control proving the gate
    // reads the exercise's list rather than hiding everything in scenario mode.
    await page.getByTestId('bf-card-p-bf-0').click();
    await expect(page.getByTestId('undo-taps-button')).toBeVisible();
  });
});

test.describe('@learn-scenario-3 the state machine advances, resets and exits', () => {
  test('Learn-S6: an allowed action advances the lesson to a graded success', async ({ page }) => {
    await page.goto(TAP_ONLY);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    // Before the check there is no verdict -- playerActing, not feedback.
    await expect(page.getByTestId('scenario-feedback')).toHaveCount(0);

    await page.getByTestId('bf-card-p-bf-0').click();
    await page.getByTestId('scenario-check-button').click();

    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'success');
    // feedback is terminal until retry: the check is no longer offered.
    await expect(page.getByTestId('scenario-check-button')).toHaveCount(0);
  });

  test('Learn-S7: checking too early grades as fail, not success', async ({ page }) => {
    await page.goto(TAP_ONLY);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    await page.getByTestId('scenario-check-button').click();
    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'fail');
  });

  test('Learn-S8: the hint is revealed on request and re-hidden by a retry', async ({ page }) => {
    await page.goto(TAP_ONLY);
    await expect(page.getByTestId('scenario-hint')).toHaveCount(0);

    await page.getByTestId('scenario-hint-button').click();
    await expect(page.getByTestId('scenario-hint')).toBeVisible();

    await page.getByTestId('scenario-retry-button').click();
    await expect(page.getByTestId('scenario-hint')).toHaveCount(0);
  });

  test('Learn-S9: retry resets the board, not just the chrome', async ({ page }) => {
    await page.goto(CAST_EXERCISE);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    // Tap a land, so there is state to throw away.
    await page.getByTestId('bf-card-p-bf-0').click();
    await expect(page.getByTestId('undo-taps-button')).toBeVisible();

    await page.getByTestId('scenario-retry-button').click();

    // A fresh seed: nothing is tapped, so there is nothing to undo, and the
    // board is back to the exercise's two untapped Forests.
    await expect(page.getByTestId('undo-taps-button')).toHaveCount(0);
    await expect(page.getByTestId('bf-card-p-bf-0')).toBeVisible();
    await expect(page.getByTestId('bf-card-p-bf-1')).toBeVisible();
    await expect(page.getByTestId('scenario-feedback')).toHaveCount(0);
    await expect(page.getByTestId('scenario-prompt')).toContainText('Grizzly Bears');
  });

  test('Learn-S10: retry after a graded attempt returns to a live board', async ({ page }) => {
    await page.goto(TAP_ONLY);
    await page.getByTestId('bf-card-p-bf-0').click();
    await page.getByTestId('scenario-check-button').click();
    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'success');

    await page.getByTestId('scenario-retry-button').click();

    await expect(page.getByTestId('scenario-feedback')).toHaveCount(0);
    await expect(page.getByTestId('scenario-check-button')).toBeVisible();
    await expect(page.getByTestId('bf-card-p-bf-0')).toBeVisible();
  });

  test('Learn-S11: exit leaves the scenario and returns to the Learn unit list', async ({ page }) => {
    await page.goto(TAP_ONLY);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    await page.getByTestId('scenario-exit-button').click();

    await expect(page.getByTestId('scenario-overlay')).toHaveCount(0);
    await expect(page.getByTestId('learn-unit-1.1')).toBeVisible();
  });
});

test.describe('@learn-scenario-4 Shandalar is unaffected', () => {
  test('Learn-S12: the sandbox duel still boots with its campaign chrome intact', async ({ page }) => {
    await page.goto('/?duel=sandbox&aiSpeed=0');
    // No scenario config anywhere on this path.
    await expect(page.getByTestId('scenario-overlay')).toHaveCount(0);
    // And the controls a scenario suppresses are all still offered.
    await expect(page.getByTestId('end-turn-button').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('pass-priority-button').first()).toBeVisible();
  });

  test('Learn-S13: the existing Learn lesson player is untouched by scenario mode', async ({ page }) => {
    await page.goto('/learn.html?exercise=1.1-01');
    // The bespoke board, addressed by its own testids, with no duel screen.
    await expect(page.getByTestId('card-p-bf-0')).toBeVisible();
    await expect(page.getByTestId('scenario-overlay')).toHaveCount(0);
    await page.getByTestId('card-p-bf-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');
  });
});

test.describe('@learn-scenario-5 lethal attacks are graded by best defense', () => {
  // L3b. Until this landed, scenario mode graded with checkGoal alone -- a
  // snapshot test asking "has combat resolved lethally on this board". With
  // only DECLARE_ATTACKER allowed the board never advances past
  // COMBAT_ATTACKERS, so that question read false for a winning attack and a
  // losing one alike and Unit 1.4 could not be graded here at all. Grading now
  // asks the question resolveAttack asks: does the opponent die against every
  // legal block?

  // Clicks the card's geometric centre (Playwright's default). This used to
  // click at a fixed { x: 40, y: 110 }, which is below the bottom edge of the
  // 90px-tall mobile creature card, so it could never land at 390px whatever
  // the layout did. The centre is the stricter test: it is where a learner
  // clicks, and it is the point Learn-S17 asserts is unobstructed.
  const declareAttacker = (page: import('@playwright/test').Page, iid: string) =>
    page.getByTestId(`bf-card-${iid}`).click();

  test('Learn-S14: the winning attack is graded success', async ({ page }) => {
    await page.goto(LETHAL_EXERCISE);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();
    await expect(page.getByTestId('scenario-feedback')).toHaveCount(0);

    // All three attackers: the Wall can only stop one.
    await declareAttacker(page, 'p-bf-0');
    await declareAttacker(page, 'p-bf-1');
    await declareAttacker(page, 'p-bf-2');
    await page.getByTestId('scenario-check-button').click();

    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'success');
  });

  test('Learn-S15: an attack that loses to one block is graded fail, not success', async ({ page }) => {
    await page.goto(LETHAL_EXERCISE);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    // Two attackers. Nothing blocks on the board -- the opponent never gets a
    // turn in scenario mode -- so a snapshot check has no block to see. Best
    // defense does: the Wall stops one and they survive at 1.
    await declareAttacker(page, 'p-bf-0');
    await declareAttacker(page, 'p-bf-1');
    await page.getByTestId('scenario-check-button').click();

    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'fail');
    // The worst case is the teaching: it names the block and the life left.
    await expect(page.getByTestId('scenario-feedback')).toContainText('Wall of Wood blocks');
    await expect(page.getByTestId('scenario-feedback')).toContainText("They're at 1.");
  });

  test('Learn-S16: checking with no attackers declared says so', async ({ page }) => {
    await page.goto(LETHAL_EXERCISE);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    await page.getByTestId('scenario-check-button').click();

    await expect(page.getByTestId('scenario-feedback')).toHaveAttribute('data-outcome', 'fail');
    await expect(page.getByTestId('scenario-feedback')).toContainText('No attackers declared');
  });

  // Regression lock for the duel board height squeeze (docs/LEARN_MODE.md
  // section 8). At 1280x800 the player's battlefield half used to be 62px tall,
  // so a 134px creature was clipped and a click at its centre hit banner-you.
  // Pinned to the sizes the bug was measured at: 1280x800 desktop, 390x844
  // mobile (the mobile-chrome project's own viewport).
  test('Learn-S17: a player creature is fully visible and clickable at its centre', async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'mobile-chrome') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await page.goto(LETHAL_EXERCISE);
    await expect(page.getByTestId('scenario-overlay')).toBeVisible();

    const card = page.getByTestId('bf-card-p-bf-0');
    await expect(card).toBeVisible();
    const probe = await card.evaluate((el) => {
      const b = el.getBoundingClientRect();
      // The visible part of the card: its box intersected with every
      // ancestor that clips (the half, its scroll area, the battlefield).
      let top = b.top;
      let bottom = b.bottom;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowY !== 'visible') {
          const r = a.getBoundingClientRect();
          top = Math.max(top, r.top);
          bottom = Math.min(bottom, r.bottom);
        }
      }
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        height: b.height,
        visibleHeight: bottom - top,
        centreHitsCard: !!hit && el.contains(hit),
      };
    });
    expect(probe.visibleHeight).toBeGreaterThanOrEqual(probe.height - 0.5);
    expect(probe.centreHitsCard).toBe(true);
  });
});
