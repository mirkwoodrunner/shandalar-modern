// tests/e2e/upkeep-batch-a9-2.spec.js
// A9 upkeep-trigger batch 2: UI regression coverage for the two new
// pendingUpkeepChoice modals added in this batch that need a real player
// decision -- Safe Haven (optional sacrifice-to-return-exiled-cards) and
// Worms of the Earth (sacrifice-two-lands-or-take-5-damage-or-decline). See
// docs/CURRENT_SPRINT.md / docs/MECHANICS_INDEX.md for the full batch and
// tests/scenarios/upkeep-*-batch-a9-2.test.js for the engine-level coverage.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile
// (390x844, /?duel=sandbox-mobile) per the project convention, so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths (and the shared
// upkeepChoiceRegistry.tsx modals) are exercised.

import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

function makeSafeHaven(iid, overrides = {}) {
  return {
    iid, id: 'safe_haven', name: 'Safe Haven', type: 'Land', color: '',
    cmc: 0, cost: '', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], activatedAbilities: [{ id: 'safe_haven_exile', cost: { generic: 2 }, effect: 'safeHavenExile' }],
    upkeep: 'safeHavenUpkeep', exiledIids: ['e2e-sh-bear-1'], controller: 'p',
    ...overrides,
  };
}

function makeExiledBear(iid, overrides = {}) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
    color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    ...overrides,
  };
}

function makeWormsOfTheEarth(iid, overrides = {}) {
  return {
    iid, id: 'worms_of_the_earth', name: 'Worms of the Earth', type: 'Enchantment', color: 'B',
    cmc: 5, cost: '2BBB', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], landLock: true, controller: 'p',
    ...overrides,
  };
}

async function waitForEngineReady(page) {
  await page.waitForFunction(
    () => typeof window.__duelDispatch === 'function' && typeof window.__duelState === 'function',
    { timeout: 15000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

// Places `pBf` (and optionally `pExile`) directly on the player's zones, sets
// phase to UNTAP, then advances into UPKEEP -- same DEBUG_SET_ACTIVE +
// SET_PHASE_FOR_TEST + ADVANCE_PHASE pattern as upkeep-batch-a9.spec.js.
async function seedAndReachUpkeep(page, pBf, pExile = []) {
  await page.evaluate(({ bf, exile }) => {
    const s = window.__duelState();
    window.__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { p: { ...s.p, bf, exile: [...s.p.exile, ...exile] } } });
    window.__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'UNTAP', active: 'p' });
  }, { bf: pBf, exile: pExile });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__duelDispatch({ type: 'ADVANCE_PHASE' }));
  await page.waitForFunction(
    () => window.__duelState().phase === 'UPKEEP' && window.__duelState().pendingUpkeepChoice != null,
    { timeout: 5000 },
  );
}

function runSuite(viewport, label, url) {
  test.describe(`@engine @mobile Upkeep batch A9-2 UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
      await waitForEngineReady(page);
    });

    test('Safe Haven: optional-sacrifice modal renders and returns exiled cards', async ({ page }) => {
      const haven = makeSafeHaven('e2e-sh-haven-1');
      const bear = makeExiledBear('e2e-sh-bear-1');
      await seedAndReachUpkeep(page, [haven], [bear]);

      const modal = page.locator('[data-testid="safe-haven-upkeep-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      const sacBtn = page.locator('[data-testid="safe-haven-sacrifice-button"]');
      await expect(sacBtn).toBeVisible({ timeout: 5000 });
      await sacBtn.click();
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => window.__duelState());
      expect(state.p.bf.some((c) => c.iid === 'e2e-sh-haven-1')).toBe(false);
      expect(state.p.bf.some((c) => c.iid === 'e2e-sh-bear-1')).toBe(true);
      expect(state.p.exile.some((c) => c.iid === 'e2e-sh-bear-1')).toBe(false);
    });

    test('Worms of the Earth: sacrifice-two-lands-or-take-5-damage-or-decline modal renders and resolves', async ({ page }) => {
      const worms = makeWormsOfTheEarth('e2e-w-worms-1');
      await seedAndReachUpkeep(page, [worms]);

      const modal = page.locator('[data-testid="worms-of-the-earth-upkeep-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      const dmgBtn = page.locator('[data-testid="worms-take-damage-button"]');
      await expect(dmgBtn).toBeVisible({ timeout: 5000 });
      await dmgBtn.click();
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => window.__duelState());
      expect(state.p.life).toBe(15);
      expect(state.p.bf.some((c) => c.iid === 'e2e-w-worms-1')).toBe(false);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL);
