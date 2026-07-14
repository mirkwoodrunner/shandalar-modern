// tests/e2e/cyclopean-tomb.spec.ts
//
// End-to-end tests for Cyclopean Tomb: activating it during upkeep to mire a
// land (which becomes a functional Swamp), the "activate only during your
// upkeep" restriction, the graveyard-persistence log message, and the
// emblem's automatic, no-interaction-required upkeep cleanup once the Tomb is
// gone.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm both DuelScreen.tsx and DuelScreenMobile.tsx
// render paths behave the same way.
//
// CT-E2E-01: activating the Tomb during upkeep mires an opponent's land,
//            and that land taps for B mana afterward (the functional
//            consequence of the "is a Swamp" status).
// CT-E2E-02: attempting to activate outside of upkeep is blocked -- no mana
//            spent, no tap, nothing added to the stack.
// CT-E2E-03: the Tomb is destroyed and put into the graveyard -- the log
//            shows the persistence message.
// CT-E2E-04: advancing through subsequent upkeeps clears the land's Swamp
//            status automatically via the emblem's trigger, with no user
//            interaction beyond passing through phases.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

function makeTomb(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'cyclopean_tomb', name: 'Cyclopean Tomb', type: 'Artifact', color: '',
    cmc: 4, cost: '4', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
    effect: null,
    activated: { cost: '2,T', effect: 'cyclopeanTombMireCounter', myUpkeepOnly: true },
    triggeredAbilities: [{
      id: 'cyclopean_tomb_to_gy',
      trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' },
      condition: { type: 'destinationIsGY' },
      effect: { type: 'createCyclopeanTombEmblem' },
    }],
    ...overrides,
  };
}

function makeLand(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'island', name: 'Island', type: 'Land', subtype: 'Basic Island', color: '',
    cmc: 0, cost: '', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], produces: ['U'], controller: 'o',
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

// DuelScreen.tsx's right sidebar (which mounts DuelLog, the actual scrolling
// game-log text) is desktop-only (`{!isMobile && (...)}`). The mobile layout's
// "Info / Log" drawer toggle -- despite the name -- only shows mana pools and
// ruleset flags, not log entries; there is no DOM element on mobile that ever
// surfaces log text for this sandbox route, so the log-message assertion is
// desktop-only. The underlying mechanism (emblem created, Tomb in graveyard)
// is already verified via engine state on both viewports.

function runSuite(viewport: { width: number; height: number }, label: string, isMobile: boolean) {
  test.describe(`@engine-card-scenarios-1 Cyclopean Tomb UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test("CT-E2E-01: activating the Tomb during upkeep mires a land, which then taps for B mana", async ({ page }) => {
      const tomb = makeTomb('ct-tomb-1');
      const land = makeLand('ct-land-1', { controller: 'o' });

      await page.evaluate(({ tomb, land }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'UPKEEP', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [tomb], mana: { ...s.p.mana, C: 2 } },
            o: { ...s.o, bf: [land] },
          },
        });
      }, { tomb, land });
      await page.waitForTimeout(50);

      await expect(page.locator('[data-iid="ct-tomb-1"]')).toBeVisible();
      await expect(page.locator('[data-iid="ct-land-1"]')).toBeVisible();

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ct-tomb-1', tgt: 'ct-land-1' });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.waitForTimeout(100);

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.o.bf.find((c: any) => c.iid === 'ct-land-1').counters.MIRE).toBe(1);
      expect(midState.p.bf.find((c: any) => c.iid === 'ct-tomb-1').tapped).toBe(true);

      // Functional consequence: the mired land now taps for B, not its
      // printed U -- confirms the visible Swamp status is real, not cosmetic.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'o', iid: 'ct-land-1' });
      });
      await page.waitForTimeout(100);

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.o.mana.B).toBe(1);
      await expect(page.locator('[data-iid="ct-land-1"]')).toBeVisible();
    });

    test('CT-E2E-02: attempting to activate outside of upkeep is blocked', async ({ page }) => {
      const tomb = makeTomb('ct-tomb-2');
      const land = makeLand('ct-land-2', { controller: 'o' });

      await page.evaluate(({ tomb, land }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [tomb], mana: { ...s.p.mana, C: 2 } },
            o: { ...s.o, bf: [land] },
          },
        });
      }, { tomb, land });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ct-tomb-2', tgt: 'ct-land-2' });
      });
      await page.waitForTimeout(100);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.stack.length).toBe(0);
      expect(state.p.mana.C).toBe(2);
      expect(state.p.bf.find((c: any) => c.iid === 'ct-tomb-2').tapped).toBe(false);
      expect(state.o.bf.find((c: any) => c.iid === 'ct-land-2').counters?.MIRE ?? 0).toBe(0);
    });

    test('CT-E2E-03: the Tomb is destroyed and put into the graveyard -- the log shows the persistence message', async ({ page }) => {
      const tomb = makeTomb('ct-tomb-3', { mireLandIids: ['ct-land-3'] });
      const shatter = {
        iid: 'ct-shatter', id: 'test_shatter', name: 'Test Shatter', type: 'Instant',
        color: 'R', cmc: 1, cost: 'R', keywords: [], effect: 'destroyArtifact',
      };

      await page.evaluate(({ tomb, shatter }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [tomb], hand: [shatter], mana: { ...s.p.mana, R: 1 } },
          },
        });
      }, { tomb, shatter });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'ct-shatter', tgt: 'ct-tomb-3' });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.gy.some((c: any) => c.iid === 'ct-tomb-3')).toBe(true);
      expect(state.p.emblems.length).toBe(1);
      expect(state.log.some((e: any) => (e.text ?? '').includes('Cyclopean Tomb is put into a graveyard'))).toBe(true);

      // The scrolling game-log sidebar (DuelLog) is desktop-only in this
      // sandbox route -- see the comment above. Confirm the log text is
      // actually visible there; on mobile, the state-level check above is
      // the full extent of what's observable for this assertion.
      if (!isMobile) {
        await expect(page.getByText(/Cyclopean Tomb is put into a graveyard/)).toBeVisible({ timeout: 5000 });
      }
    });

    test("CT-E2E-04: advancing through subsequent upkeeps clears the land's Swamp status automatically, with no user interaction beyond passing through phases", async ({ page }) => {
      const land = makeLand('ct-land-4', { controller: 'o', counters: { MIRE: 1 } });
      const emblem = {
        id: 'ct-emblem-4', source: 'cyclopean_tomb', name: 'Cyclopean Tomb (emblem)',
        controller: 'p', duration: 'permanent',
        mireLandIids: ['ct-land-4'], mireRemovedIids: [],
        triggeredAbilities: [{
          id: 'cyclopean_tomb_emblem_upkeep',
          trigger: { event: 'ON_UPKEEP_START', scope: 'controller' },
          effect: { type: 'cyclopeanTombRemoveMire' },
        }],
      };

      await page.evaluate(({ land, emblem }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'UNTAP', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, emblems: [emblem] },
            o: { ...s.o, bf: [land] },
          },
        });
      }, { land, emblem });
      await page.waitForTimeout(50);

      const before = await page.evaluate(() => (window as any).__duelState());
      expect(before.o.bf.find((c: any) => c.iid === 'ct-land-4').counters.MIRE).toBe(1);

      // Nothing but passing through the phase pointer -- no ACTIVATE_ABILITY,
      // no manual counter removal.
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); }); // UNTAP -> UPKEEP
      await page.waitForTimeout(150);

      const after = await page.evaluate(() => (window as any).__duelState());
      expect(after.phase).toBe('UPKEEP');
      expect(after.o.bf.find((c: any) => c.iid === 'ct-land-4').counters.MIRE).toBe(0);
      expect(after.p.emblems[0].mireRemovedIids).toEqual(['ct-land-4']);
      // The permanent-duration emblem itself persists (it's not a permanent).
      expect(after.p.emblems.length).toBe(1);
      await expect(page.locator('[data-iid="ct-land-4"]')).toBeVisible();
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', false);
runSuite({ width: 390, height: 844 }, 'mobile', true);
