// tests/e2e/learn-card-art.spec.ts
// Learn Mode (L4b-2): LearnCard.tsx wires src/utils/useCardArt.js into the legacy
// (non-scenario) exercise board. This sandboxed test environment has no route to
// scryfall.com (see tests/e2e/raging-river.spec.ts), so the failure/fallback path is
// tested by mocking a failing response.
//
// The success path is tested by pre-seeding useCardArt's own persistent cache
// (localStorage key 'art-cache:v1', see src/utils/scryfallArt.js) rather than mocking
// a fulfilling network response. React 18 StrictMode double-invokes effects in dev
// (the mode `npm run dev` -- and this Playwright suite -- runs under): the resulting
// duplicate fetchOldestArt call hits its own in-flight dedupe and resolves to null
// before the real fetch returns, so a live-mocked success response races and is lost.
// A pre-seeded cache entry is resolved synchronously from useCardArt's useState
// initializer (peekCachedArt), before any effect runs, so it sidesteps that race
// entirely -- and it is exactly the code path a returning visitor hits for real.
//
// Exercise 1.1-02 ("Cast a creature") gives a stable, direct-URL board: two Forests
// (card-p-bf-0, card-p-bf-1) and Grizzly Bears in hand (card-p-hand-0). Assertions use
// the hand card, since it is the only card on this board with a unique name.

import { test, expect, type Page } from '@playwright/test';

const CAST_EXERCISE = '/learn.html?exercise=1.1-02';
const MOCK_ART_URL = 'https://cards.scryfall.io/art_crop/mock-test.jpg';
const ART_CACHE_KEY = 'art-cache:v1';

// Seeds useCardArt's persistent cache before any page script runs, so its
// useState initializer (peekCachedArt) resolves synchronously on mount.
async function seedArtCache(page: Page, cardName: string, url: string | null, artist: string | null) {
  await page.addInitScript(
    ([key, name, u, a]) => {
      const raw = window.localStorage.getItem(key as string);
      const existing = raw ? JSON.parse(raw) : {};
      existing[`${name}|any`] = { url: u, artist: a, resolvedAt: new Date().toISOString() };
      window.localStorage.setItem(key as string, JSON.stringify(existing));
    },
    [ART_CACHE_KEY, cardName, url, artist]
  );
}

async function mockArtFailure(page: Page) {
  await page.route('https://api.scryfall.com/cards/named**', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

test.describe('@learn-card-art-1 LearnCard art and attribution', () => {
  test('Learn-CA1: art renders when the fetch resolves', async ({ page }) => {
    await seedArtCache(page, 'Grizzly Bears', MOCK_ART_URL, 'Test Artist');
    await page.goto(CAST_EXERCISE);

    const hand = page.getByTestId('card-p-hand-0');
    await expect(hand.locator('img.learn-card-art')).toHaveAttribute('src', MOCK_ART_URL);

    // Text stays primary: nothing that renders today became hidden.
    await expect(hand).toContainText('Grizzly Bears');
    await expect(hand).toContainText('Creature');
    await expect(hand).toContainText('2/2');
  });

  test('Learn-CA2: text-only fallback renders cleanly when the fetch fails', async ({ page }) => {
    await mockArtFailure(page);
    await page.goto(CAST_EXERCISE);

    const hand = page.getByTestId('card-p-hand-0');
    // Give the failed fetch a moment to settle before asserting its absence.
    await page.waitForTimeout(300);
    await expect(hand.locator('img.learn-card-art')).toHaveCount(0);
    await expect(hand.locator('.learn-card-artist')).toHaveCount(0);

    // The rest of the card still renders exactly as it does without art.
    await expect(hand).toContainText('Grizzly Bears');
    await expect(hand).toContainText('Creature');
    await expect(hand).toContainText('2/2');
  });

  test('Learn-CA3: artist credit renders only when present', async ({ page }) => {
    await seedArtCache(page, 'Grizzly Bears', MOCK_ART_URL, 'Test Artist');
    await page.goto(CAST_EXERCISE);

    const hand = page.getByTestId('card-p-hand-0');
    await expect(hand.locator('img.learn-card-art')).toHaveAttribute('src', MOCK_ART_URL);
    await expect(hand.locator('.learn-card-artist')).toHaveText('Art: Test Artist');
  });

  test('Learn-CA4: no artist credit line when the art has none', async ({ page }) => {
    await seedArtCache(page, 'Grizzly Bears', MOCK_ART_URL, null);
    await page.goto(CAST_EXERCISE);

    const hand = page.getByTestId('card-p-hand-0');
    await expect(hand.locator('img.learn-card-art')).toHaveAttribute('src', MOCK_ART_URL);
    await expect(hand.locator('.learn-card-artist')).toHaveCount(0);
  });

  // Grading is real clicks on real elements -- an art strip that shifts a card's
  // layout is a grading regression, not just cosmetic. Runs the same exercise flow
  // Learn-02 covers, with art present, to confirm click targets are unaffected.
  test('Learn-CA5: click targets still work with art rendered', async ({ page }) => {
    await seedArtCache(page, 'Grizzly Bears', MOCK_ART_URL, 'Test Artist');
    await page.goto(CAST_EXERCISE);

    await expect(page.getByTestId('card-p-hand-0').locator('img.learn-card-art')).toHaveAttribute(
      'src',
      MOCK_ART_URL
    );

    await page.getByTestId('card-p-bf-0').click();
    await page.getByTestId('card-p-bf-1').click();
    await page.getByTestId('card-p-hand-0').click();
    await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-result', 'success');
  });
});
