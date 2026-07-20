// tests/e2e/upkeep-batch-a9.spec.js
// A9 upkeep-trigger batch: UI regression coverage for the three new
// pendingUpkeepChoice modals added in this batch -- Curse Artifact
// (sacrifice-or-damage), Serendib Djinn (land pick), Rohgahh of Kher Keep
// (pay-or-control-transfer). See docs/CURRENT_SPRINT.md /
// docs/MECHANICS_INDEX.md for the full batch and
// tests/scenarios/upkeep-*-batch-a9.test.js for the engine-level coverage.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile
// (390x844, /?duel=sandbox-mobile) per the project convention, so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths (and the shared
// upkeepChoiceRegistry.tsx modals) are exercised.

import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

function makeCurseArtifactHost(iid, overrides = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 2, cost: '2', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [{ name: 'Curse Artifact' }], controller: 'p',
    ...overrides,
  };
}

function makeSerendibDjinn(iid, overrides = {}) {
  return {
    iid, id: 'serendib_djinn', name: 'Serendib Djinn', type: 'Creature', subtype: 'Djinn',
    color: 'U', cmc: 4, cost: '2UU', power: 5, toughness: 6, keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [],
    upkeep: 'serendibDjinnUpkeep', sacrificeIfNoLands: true, controller: 'p',
    ...overrides,
  };
}

function makeIsland(iid, overrides = {}) {
  return {
    iid, id: 'island', name: 'Island', type: 'Land', subtype: 'Island', color: '',
    cmc: 0, cost: '', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], produces: ['U'], controller: 'p',
    ...overrides,
  };
}

function makeRohgahh(iid, overrides = {}) {
  return {
    iid, id: 'rohgahh_of_kher_keep', name: 'Rohgahh of Kher Keep', type: 'Legendary Creature', subtype: 'Kobold',
    color: 'BR', cmc: 6, cost: '2BBRR', power: 5, toughness: 5, keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [],
    upkeep: 'rohgahhUpkeep', anthemNamed: { cardName: 'Kobolds of Kher Keep', power: 2, toughness: 2 },
    controller: 'p',
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

// Places `pBf` directly on the player's battlefield, sets phase to UNTAP,
// then advances into UPKEEP -- the same DEBUG_SET_ACTIVE + SET_PHASE_FOR_TEST
// + ADVANCE_PHASE pattern used by animate-artifact.spec.ts, extended here
// with an explicit ADVANCE_PHASE dispatch since the upkeep-choice queuing
// itself is what's under test, not the phase-advance button/UI.
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
  test.describe(`@engine @mobile Upkeep batch A9 UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
      await waitForEngineReady(page);
    });

    test('Curse Artifact: sacrifice-or-damage modal renders and resolves both ways', async ({ page }) => {
      // Branch 1: sacrifice the enchanted artifact.
      const art1 = makeCurseArtifactHost('e2e-ca-art-1');
      await seedAndReachUpkeep(page, [art1]);

      const modal = page.locator('[data-testid="curse-artifact-upkeep-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      const sacBtn = page.locator('[data-testid="curse-artifact-sacrifice-button"]');
      await expect(sacBtn).toBeVisible({ timeout: 5000 });
      await sacBtn.click();
      await page.waitForTimeout(200);

      const stateAfterSac = await page.evaluate(() => window.__duelState());
      expect(stateAfterSac.p.bf.some((c) => c.iid === 'e2e-ca-art-1')).toBe(false);
      expect(stateAfterSac.p.life).toBe(20);

      // Branch 2: take the damage instead, on a fresh instance.
      const art2 = makeCurseArtifactHost('e2e-ca-art-2');
      await seedAndReachUpkeep(page, [art2]);

      const modal2 = page.locator('[data-testid="curse-artifact-upkeep-modal"]');
      await expect(modal2).toBeVisible({ timeout: 5000 });

      const dmgBtn = page.locator('[data-testid="curse-artifact-damage-button"]');
      await expect(dmgBtn).toBeVisible({ timeout: 5000 });
      await dmgBtn.click();
      await page.waitForTimeout(200);

      const stateAfterDmg = await page.evaluate(() => window.__duelState());
      expect(stateAfterDmg.p.bf.some((c) => c.iid === 'e2e-ca-art-2')).toBe(true);
      expect(stateAfterDmg.p.life).toBe(18);
    });

    test('Serendib Djinn: land-pick modal renders and resolves', async ({ page }) => {
      const djinn = makeSerendibDjinn('e2e-sd-djinn-1');
      const island = makeIsland('e2e-sd-island-1');
      await seedAndReachUpkeep(page, [djinn, island]);

      const modal = page.locator('[data-testid="land-picker-upkeep-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      const landOption = page.locator('[data-testid="land-picker-option-e2e-sd-island-1"]');
      await expect(landOption).toBeVisible({ timeout: 5000 });
      await landOption.click();
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => window.__duelState());
      expect(state.p.bf.some((c) => c.iid === 'e2e-sd-island-1')).toBe(false);
      expect(state.p.life).toBe(17); // sacrificed an Island -- 3 damage
    });

    test('Rohgahh of Kher Keep: pay-or-not modal renders and resolves, including the control-transfer visual when declined', async ({ page }) => {
      const rohgahh = makeRohgahh('e2e-rk-rohgahh-1');
      await seedAndReachUpkeep(page, [rohgahh]);

      const modal = page.locator('[data-testid="rohgahh-upkeep-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      const declineBtn = page.locator('[data-testid="rohgahh-decline-button"]');
      await expect(declineBtn).toBeVisible({ timeout: 5000 });
      await declineBtn.click();
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => window.__duelState());
      // Control transferred to the opponent -- no longer on p's battlefield...
      expect(state.p.bf.some((c) => c.iid === 'e2e-rk-rohgahh-1')).toBe(false);
      // ...and now visible (tapped) on o's battlefield.
      const transferred = state.o.bf.find((c) => c.iid === 'e2e-rk-rohgahh-1');
      expect(transferred).toBeTruthy();
      expect(transferred.tapped).toBe(true);

      // Visual confirmation: the transferred creature's tile now renders
      // under the opponent's battlefield zone.
      const oppTile = page.locator('[data-iid="e2e-rk-rohgahh-1"]');
      await expect(oppTile.first()).toBeVisible({ timeout: 5000 });
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL);
