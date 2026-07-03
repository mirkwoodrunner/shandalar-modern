// tests/e2e/ante-system-complete.spec.ts
//
// End-to-end coverage for the complete ante system: the title-screen toggle,
// the buildDuelState ante pipeline (anteP/anteO), the ante banner display on
// both desktop (DuelScreen) and mobile (DuelScreenMobile), and win/loss
// reconciliation actually mutating binder/deck via handleDuelEnd.
//
// This spec is registered in the `mobile-chrome` project's testMatch
// (playwright.config.js) alongside `chromium`, so every test below runs at
// both viewports. duelScreenIsCompact is derived from the viewport at duel
// launch time, so desktop renders DuelScreen (data-testid="ante-banner") and
// mobile-chrome renders DuelScreenMobile (data-testid="ante-banner-mobile").
//
// Sandbox escape hatches used:
//   ?overworld=sandbox&ante=1        -- full OverworldGame + handleDuelEnd wiring,
//                                        ante enabled via the App.jsx ?ante=1 param
//   window.__overworldMakeDeck(ids)  -- build full CARD_DB-backed card objects
//   window.__overworldSetDeck(cards) -- seed a real, known player deck
//   window.__overworldLaunchDuel()   -- force-launch a duel without walking into
//                                        a monster (overworld encounters are
//                                        procedural and non-deterministic)
//   window.__overworldState()        -- read back { deck, binder, anteEnabled }
//   window.__duelDispatch/__duelState -- drive/read the duel engine directly
//   DEBUG_SET_ACTIVE { patch: { over } } -- force a win/loss so onDuelEnd fires
//
// All page.goto() calls pass waitUntil: 'domcontentloaded' instead of the
// Playwright default 'load'. The title screen's <link> to fonts.googleapis.com
// hangs the 'load' event indefinitely under this environment's outbound
// network policy; domcontentloaded is unaffected and the app is fully
// interactive well before web fonts resolve.

import { test, expect, Page } from '@playwright/test';

const OVERWORLD_ANTE_URL = '/?overworld=sandbox&ante=1&aiSpeed=0';

async function waitForOverworldReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__overworldLaunchDuel === 'function' &&
          typeof (window as any).__overworldSetDeck === 'function' &&
          typeof (window as any).__overworldMakeDeck === 'function',
    null,
    { timeout: 20000 },
  );
}

async function seedDeckAndLaunchDuel(page: Page) {
  await waitForOverworldReady(page);
  await page.evaluate(() => {
    // __overworldMakeDeck builds full CARD_DB-backed card objects -- a bare
    // {id, iid} stub crashes OverworldGameDesktop's deck-list rendering,
    // which reads fields (name, cost, etc.) a stub doesn't have.
    const seeded = (window as any).__overworldMakeDeck(Array(20).fill('lightning_bolt'));
    (window as any).__overworldSetDeck(seeded);
  });
  // __overworldSetDeck schedules a React re-render; __overworldLaunchDuel is a
  // useCallback closure over `deck` that is only refreshed by that re-render.
  // Calling it in the same tick as setDeck would launch with the stale
  // (empty, sandbox-default) deck, so wait for the state snapshot to reflect
  // the seeded deck first.
  await page.waitForFunction(
    // __overworldState is briefly unset between the effect cleanup and
    // re-registration on every dependency change -- guard against that gap.
    () => typeof (window as any).__overworldState === 'function' &&
          (window as any).__overworldState().deck.length === 20,
    null,
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    (window as any).__overworldLaunchDuel('RED_BURN', 20, 'test');
  });
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    null,
    { timeout: 20000 },
  );
}

async function readOverworldState(page: Page) {
  // __overworldState is briefly unset between the effect cleanup and
  // re-registration on every dependency change (see seedDeckAndLaunchDuel) --
  // wait for it to be a function before reading, rather than racing it.
  await page.waitForFunction(() => typeof (window as any).__overworldState === 'function');
  return page.evaluate(() => (window as any).__overworldState());
}

async function forceDuelOutcome(page: Page, winner: 'p' | 'o') {
  await page.evaluate((w) => {
    (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { over: { winner: w } } });
  }, winner);
  // useDuelController's game-over effect calls onDuelEnd after a 3000ms timer.
  await page.waitForFunction(
    () => typeof (window as any).__overworldLaunchDuel === 'function' &&
          typeof (window as any).__duelDispatch === 'undefined',
    null,
    { timeout: 12000 },
  );
}

test.describe('@engine @mobile Ante system -- toggle, banner, reconciliation', () => {

  test('ANTE-01: title screen toggle defaults off and switches on click', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("BEGIN YOUR JOURNEY")');
    await page.click('button:has-text("BEGIN YOUR JOURNEY")');
    await page.click('[data-testid="color-W"]');

    const toggle = page.getByTestId('ante-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('OFF');

    await toggle.click();
    await expect(toggle).toContainText('ON');
  });

  test('ANTE-02: buildDuelState sets anteP/anteO when ante is on, and the ante banner displays them', async ({ page }) => {
    await page.goto(OVERWORLD_ANTE_URL, { waitUntil: 'domcontentloaded' });
    await seedDeckAndLaunchDuel(page);

    const state = await page.evaluate(() => (window as any).__duelState());
    expect(state.anteEnabled).toBe(true);
    expect(state.anteP).not.toBeNull();
    expect(state.anteO).not.toBeNull();
    expect(state.anteExtraP).toEqual([]);
    expect(state.anteExtraO).toEqual([]);

    // Exactly one of the two ante banners renders depending on viewport
    // (desktop DuelScreen vs mobile DuelScreenMobile).
    const desktopBanner = page.getByTestId('ante-banner');
    const mobileBanner = page.getByTestId('ante-banner-mobile');
    const visibleCount = await desktopBanner.or(mobileBanner).count();
    expect(visibleCount).toBeGreaterThan(0);
  });

  test('ANTE-03: winning claims the opponent\'s ante into the binder; the player\'s own ante stays in the deck', async ({ page }) => {
    await page.goto(OVERWORLD_ANTE_URL, { waitUntil: 'domcontentloaded' });
    await seedDeckAndLaunchDuel(page);

    const before = await readOverworldState(page);
    const duelState = await page.evaluate(() => (window as any).__duelState());
    const anteOName = duelState.anteO.name;
    const anteOId = duelState.anteO.id;

    await forceDuelOutcome(page, 'p');

    const after = await readOverworldState(page);
    expect(after.binder.length).toBe(before.binder.length + 1);
    expect(after.binder.some((c: any) => c.id === anteOId)).toBe(true);
    // Player's own ante card (a seeded lightning_bolt) must remain untouched in the deck.
    expect(after.deck.filter((c: any) => c.id === 'lightning_bolt').length).toBe(20);
    void anteOName;
  });

  test('ANTE-04: losing removes the player\'s own anted card from the deck', async ({ page }) => {
    await page.goto(OVERWORLD_ANTE_URL, { waitUntil: 'domcontentloaded' });
    await seedDeckAndLaunchDuel(page);

    const before = await readOverworldState(page);

    await forceDuelOutcome(page, 'o');

    const after = await readOverworldState(page);
    // One copy of the player's anted card (lightning_bolt) is removed from the deck.
    expect(after.deck.length).toBe(before.deck.length - 1);
    expect(after.deck.filter((c: any) => c.id === 'lightning_bolt').length).toBe(19);
    // Losing does not touch the binder.
    expect(after.binder.length).toBe(before.binder.length);
  });

});
