// tests/e2e/banding-core.spec.ts
//
// End-to-end tests for the banding core subsystem (CR 702.22): the
// band-formation panel that appears during attack declaration, and the
// generic ChoiceModal correctly presenting a 702.22j/k damage-division
// choice. Also confirms an ordinary, zero-banding-creature combat produces
// no new UI at all (no band panel, no extra choice prompt).
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per
// the project convention, to confirm both DuelScreen.tsx and
// DuelScreenMobile.tsx render paths behave the same way.
//
// BAND-E2E-01: Band-formation panel appears for declared banding attackers;
//              forming a band sets a shared bandId, and the resulting
//              702.22k damage-division choice renders via ChoiceModal and
//              resolves correctly.
// BAND-E2E-02: A combat with zero banding creatures anywhere shows no band
//              panel and no extra choice prompt -- unchanged from before
//              this feature.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

function makeCreature(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
    keywords: [] as string[],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null as string | null,
    damage: 0,
    counters: {},
    eotBuffs: [] as any[],
    enchantments: [] as any[],
    controller: 'o',
    ...overrides,
  };
}

async function waitForEngineReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    { timeout: 15000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

// Runs a scenario where the human ('p') attacks with a band of two banding
// creatures; a single opposing blocker blocks one of them, so the 702.22k
// choice (dividing the blocker's damage among the whole band) is what queues
// -- that choice has controller: 'p', so it's the one that actually renders
// through ChoiceModal for a human to interact with.
async function bandFormationScenario(page: Page) {
  const a = makeCreature('band-a', {
    name: 'Mesa Pegasus', keywords: ['BANDING'], power: 2, toughness: 2,
    controller: 'p', attacking: true, tapped: true,
  });
  const b = makeCreature('band-b', {
    name: 'Benalish Hero', keywords: ['BANDING'], power: 2, toughness: 2,
    controller: 'p', attacking: true, tapped: true,
  });
  const x = makeCreature('band-x', {
    name: 'Blocker', keywords: [], power: 1, toughness: 5, controller: 'o',
  });

  await page.evaluate(({ a, b, x }: any) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'COMBAT_ATTACKERS',
        active: 'p',
        attackers: [a.iid, b.iid],
        blockers: {},
        priorityWindow: false,
        stack: [],
        p: { ...s.p, bf: [a, b] },
        o: { ...s.o, bf: [x] },
      },
    });
  }, { a, b, x });

  await page.waitForTimeout(100);
  return { aIid: a.iid, bIid: b.iid, xIid: x.iid };
}

// Ordinary double block, zero banding creatures anywhere.
async function noBandingScenario(page: Page) {
  const a = makeCreature('nb-a', { controller: 'p', attacking: true, tapped: true, power: 4, toughness: 4 });
  const x = makeCreature('nb-x', { controller: 'o', power: 1, toughness: 1 });
  const y = makeCreature('nb-y', { controller: 'o', power: 1, toughness: 1 });

  await page.evaluate(({ a, x, y }: any) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'COMBAT_ATTACKERS',
        active: 'p',
        attackers: [a.iid],
        blockers: {},
        priorityWindow: false,
        stack: [],
        p: { ...s.p, bf: [a] },
        o: { ...s.o, bf: [x, y] },
      },
    });
  }, { a, x, y });

  await page.waitForTimeout(100);
  return { aIid: a.iid, xIid: x.iid, yIid: y.iid };
}

function runSuite(viewport: { width: number; height: number }, label: string) {
  test.describe(`@engine-banding-ante-1 Banding core UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test('BAND-E2E-01: band formation panel forms a band and the resulting choice resolves', async ({ page }) => {
      const { aIid, bIid, xIid } = await bandFormationScenario(page);

      // Panel appears because declared attackers include banding creatures.
      const panel = page.locator('[data-testid="band-formation-panel"]');
      await expect(panel).toBeVisible({ timeout: 5000 });

      await page.locator(`[data-testid="band-toggle-${aIid}"]`).click();
      await page.locator(`[data-testid="band-toggle-${bIid}"]`).click();
      await page.locator('[data-testid="form-band-button"]').click();
      await page.waitForTimeout(100);

      const afterForm = await page.evaluate(() => (window as any).__duelState());
      const ca = afterForm.p.bf.find((c: any) => c.iid === aIid);
      const cb = afterForm.p.bf.find((c: any) => c.iid === bIid);
      expect(ca.bandId).toBeTruthy();
      expect(ca.bandId).toBe(cb.bandId);

      // Advance to COMBAT_BLOCKERS, declare the block (x blocks a only), then
      // advance into combat damage -- 702.22h propagation plus the band size
      // (2) queues the 702.22k choice.
      await page.evaluate(({ aIid, xIid }: any) => {
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
        (window as any).__duelDispatch({ type: 'DECLARE_BLOCKER', attId: aIid, blId: xIid });
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses
      }, { aIid, xIid });
      await page.waitForTimeout(150);

      const midCombat = await page.evaluate(() => (window as any).__duelState());
      expect(midCombat.pendingChoice?.kind).toBe('bandBlockerDamageOrder');

      const choiceModal = page.locator('[data-testid="choice-modal"]');
      await expect(choiceModal).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid^="choice-option-"]').first().click();
      await page.waitForTimeout(150);

      const final = await page.evaluate(() => (window as any).__duelState());
      expect(final.pendingChoice).toBeFalsy();
      expect(final.attackers).toHaveLength(0); // combat fully resolved
    });

    test('BAND-E2E-02: zero banding creatures -- no band panel, no extra choice prompt', async ({ page }) => {
      const { aIid, xIid, yIid } = await noBandingScenario(page);

      // No banding creatures declared -- the panel must never mount.
      await expect(page.locator('[data-testid="band-formation-panel"]')).toHaveCount(0);

      await page.evaluate(({ aIid, xIid, yIid }: any) => {
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
        (window as any).__duelDispatch({ type: 'DECLARE_BLOCKER', attId: aIid, blId: xIid });
        (window as any).__duelDispatch({ type: 'DECLARE_BLOCKER', attId: aIid, blId: yIid });
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
      }, { aIid, xIid, yIid });
      await page.waitForTimeout(150);

      const after = await page.evaluate(() => (window as any).__duelState());
      expect(after.pendingChoice).toBeFalsy();
      expect(after.attackers).toHaveLength(0); // combat resolved automatically, same as before this feature

      await expect(page.locator('[data-testid="band-formation-panel"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="choice-modal"]')).toHaveCount(0);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
