// tests/e2e/legendary-creatures-batch-5-rampage.spec.js
// Legendary Creatures Batch 5: UI regression coverage for the one new
// pendingUpkeepChoice modal added in this batch -- Gabriel Angelfire's
// flying/first strike/trample/rampage 3 upkeep choice. See
// docs/CURRENT_SPRINT.md / docs/MECHANICS_INDEX.md for the full batch and
// tests/scenarios/legendary-creatures-batch-5-rampage.test.js for the
// engine-level coverage (Rampage combat math, Chromium's upkeep tax,
// Gabriel's AI-side auto-grant, legend rule sanity check).
//
// Chromium/Marhault Elsdragon/Hunding Gjornersen and the Rampage combat math
// itself are engine-only (no new UI surface -- Rampage resolves inline in
// advPhase(), the same generic-scan idiom as MUST_ATTACK) and are already
// covered by the Vitest scenario file; Playwright coverage here is scoped
// to Gabriel Angelfire's modal, the one part of this batch with a UI
// surface, per the same "engine-only cases don't need a Playwright pass"
// convention documented in legendary-creatures-batch-4.spec.js.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile
// (390x844, /?duel=sandbox-mobile) per the same convention as
// tests/e2e/upkeep-batch-a9.spec.js, so both DuelScreen.tsx and
// DuelScreenMobile.tsx render paths (and the shared upkeepChoiceRegistry.tsx
// modal) are exercised.

import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

function makeGabrielAngelfire(iid, overrides = {}) {
  return {
    iid, id: 'gabriel_angelfire', name: 'Gabriel Angelfire', type: 'Legendary Creature', subtype: 'Angel',
    color: 'GW', cmc: 7, cost: '3GGWW', power: 4, toughness: 4, keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
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

// Same DEBUG_SET_ACTIVE + SET_PHASE_FOR_TEST + ADVANCE_PHASE pattern as
// tests/e2e/upkeep-batch-a9.spec.js's seedAndReachUpkeep.
async function seedAndReachUpkeep(page, pBf) {
  await page.evaluate((bf) => {
    const s = window.__duelState();
    window.__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { p: { ...s.p, bf } } });
    window.__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'UNTAP', active: 'p' });
  }, pBf);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__duelDispatch({ type: 'ADVANCE_PHASE' }));
  await page.waitForFunction(
    () => window.__duelState().phase === 'UPKEEP' && window.__duelState().pendingUpkeepChoice != null,
    { timeout: 5000 },
  );
}

function runSuite(viewport, label, url) {
  test.describe(`@engine @mobile Legendary Creatures Batch 5 -- Gabriel Angelfire upkeep UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
      await waitForEngineReady(page);
    });

    test('Gabriel Angelfire: upkeep modal renders and each of the 4 options resolves correctly', async ({ page }) => {
      // Branch 1: flying.
      await seedAndReachUpkeep(page, [makeGabrielAngelfire('e2e-ga-1')]);
      const modal1 = page.locator('[data-testid="gabriel-angelfire-upkeep-modal"]');
      await expect(modal1).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid="gabriel-angelfire-option-flying"]').click();
      await page.waitForTimeout(200);
      let state = await page.evaluate(() => window.__duelState());
      expect(state.p.bf.find((c) => c.iid === 'e2e-ga-1').eotBuffs).toEqual([{ keywords: ['FLYING'] }]);

      // Branch 2: first strike.
      await seedAndReachUpkeep(page, [makeGabrielAngelfire('e2e-ga-2')]);
      const modal2 = page.locator('[data-testid="gabriel-angelfire-upkeep-modal"]');
      await expect(modal2).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid="gabriel-angelfire-option-first_strike"]').click();
      await page.waitForTimeout(200);
      state = await page.evaluate(() => window.__duelState());
      expect(state.p.bf.find((c) => c.iid === 'e2e-ga-2').eotBuffs).toEqual([{ keywords: ['FIRST_STRIKE'] }]);

      // Branch 3: trample.
      await seedAndReachUpkeep(page, [makeGabrielAngelfire('e2e-ga-3')]);
      const modal3 = page.locator('[data-testid="gabriel-angelfire-upkeep-modal"]');
      await expect(modal3).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid="gabriel-angelfire-option-trample"]').click();
      await page.waitForTimeout(200);
      state = await page.evaluate(() => window.__duelState());
      expect(state.p.bf.find((c) => c.iid === 'e2e-ga-3').eotBuffs).toEqual([{ keywords: ['TRAMPLE'] }]);

      // Branch 4: rampage 3.
      await seedAndReachUpkeep(page, [makeGabrielAngelfire('e2e-ga-4')]);
      const modal4 = page.locator('[data-testid="gabriel-angelfire-upkeep-modal"]');
      await expect(modal4).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid="gabriel-angelfire-option-rampage_3"]').click();
      await page.waitForTimeout(200);
      state = await page.evaluate(() => window.__duelState());
      expect(state.p.bf.find((c) => c.iid === 'e2e-ga-4').eotBuffs).toEqual([{ keywords: ['RAMPAGE'], rampageBonus: 3 }]);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL);
