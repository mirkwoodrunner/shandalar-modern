// tests/e2e/gemini-removal-smoke.spec.ts
//
// Regression guard for the full removal of the Gemini LLM opponent integration.
// Confirms the title-screen toggle, the desktop/mobile "thinking" indicators,
// and any Gemini-tagged console chatter are gone, and that the CSS class
// rename in styles.module.css (.geminiThinking -> .centerInfoBanner) did not
// break the unrelated ante-stakes banner that used to share the class.
//
// Sandbox escape hatches used (see tests/e2e/ante-system-complete.spec.ts for
// the full ante-launch pattern this borrows from):
//   ?duel=sandbox&aiSpeed=0           -- boots straight into a duel
//   ?overworld=sandbox&ante=1&aiSpeed=0 -- full OverworldGame + ante enabled
//   window.__overworldMakeDeck/__overworldSetDeck/__overworldLaunchDuel/__overworldState
//   window.__duelDispatch/__duelState

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const OVERWORLD_ANTE_URL = '/?overworld=sandbox&ante=1&aiSpeed=0';

async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

async function playAFewTurns(page: Page, iterations = 40) {
  for (let i = 0; i < iterations; i++) {
    const over = await page.evaluate(() => !!(window as any).__duelState?.()?.over).catch(() => false);
    if (over) return;

    await dismissMulligan(page);

    const doneBlocking = page.getByTestId('done-blocking-button');
    if (await doneBlocking.isVisible().catch(() => false)) {
      await doneBlocking.click().catch(() => {});
      continue;
    }

    const endTurn = page.getByTestId('end-turn-button');
    if (await endTurn.isVisible().catch(() => false) && await endTurn.isEnabled().catch(() => false)) {
      await endTurn.click().catch(() => {});
      await page.waitForTimeout(50);
      continue;
    }

    const passPriority = page.getByTestId('pass-priority-button');
    if (await passPriority.isVisible().catch(() => false) && await passPriority.isEnabled().catch(() => false)) {
      await passPriority.click().catch(() => {});
      continue;
    }

    await page.waitForTimeout(100);
  }
}

async function waitForOverworldReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__overworldLaunchDuel === 'function' &&
          typeof (window as any).__overworldSetDeck === 'function' &&
          typeof (window as any).__overworldMakeDeck === 'function',
    null,
    { timeout: 20000 },
  );
}

async function seedDeckAndLaunchAnteDuel(page: Page) {
  await waitForOverworldReady(page);
  await page.evaluate(() => {
    const seeded = (window as any).__overworldMakeDeck(Array(20).fill('lightning_bolt'));
    (window as any).__overworldSetDeck(seeded);
  });
  await page.waitForFunction(
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

function runSmoke() {
  test('no gemini-toggle on the title screen intro step', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("BEGIN YOUR JOURNEY")');
    await expect(page.getByTestId('gemini-toggle')).toHaveCount(0);
  });

  test('no gemini thinking indicator or console mentions during a duel', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await page.goto(SANDBOX_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
    await dismissMulligan(page);

    await playAFewTurns(page);

    await expect(page.locator('.gemini-thinking')).toHaveCount(0);
    await expect(page.locator('[class*="geminiThinking"]')).toHaveCount(0);

    const geminiMentions = consoleMessages.filter(m => m.toLowerCase().includes('gemini'));
    expect(geminiMentions).toEqual([]);
  });

  test('ante banner still renders with visible text after the CSS class rename', async ({ page }) => {
    await page.goto(OVERWORLD_ANTE_URL, { waitUntil: 'domcontentloaded' });
    await seedDeckAndLaunchAnteDuel(page);

    const desktopBanner = page.getByTestId('ante-banner');
    const mobileBanner = page.getByTestId('ante-banner-mobile');
    const visibleBanner = desktopBanner.or(mobileBanner);

    await expect(visibleBanner).toBeVisible();
    const text = await visibleBanner.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(0);
  });
}

test.describe('@engine-batch-stubs-1 @mobile Gemini removal smoke -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  runSmoke();
});

test.describe('@engine-batch-stubs-1 @mobile Gemini removal smoke -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  runSmoke();

  test('mobile ante banner specifically renders via ante-banner-mobile testid', async ({ page }) => {
    await page.goto(OVERWORLD_ANTE_URL, { waitUntil: 'domcontentloaded' });
    await seedDeckAndLaunchAnteDuel(page);

    const mobileBanner = page.getByTestId('ante-banner-mobile');
    await expect(mobileBanner).toBeVisible();
    const text = await mobileBanner.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
