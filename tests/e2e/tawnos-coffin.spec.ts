// tests/e2e/tawnos-coffin.spec.ts
//
// End-to-end tests for Tawnos's Coffin: exiling a creature (with a counter),
// then returning it -- once via the artifact being destroyed (leaves the
// battlefield), and once via the controller choosing to untap it (becomes
// untapped). See docs/ENGINE_CONTRACT_SPEC.md S7.12 and docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm both DuelScreen.tsx and DuelScreenMobile.tsx
// render paths behave the same way. Follows the dispatch-driven structure of
// tests/e2e/cyclopean-tomb.spec.ts (a recent same-category example).
//
// TC-E2E-01: exile + destroy + return -- the creature disappears from the
//            battlefield into exile, then reappears tapped with its counter
//            restored once the Coffin is destroyed.
// TC-E2E-02: exile + untap + return -- same, but the return is triggered by
//            the controller choosing "UNTAP" during their own untap step
//            instead of the Coffin leaving the battlefield.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

function makeCoffin(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'tawnos_coffin', name: "Tawnos's Coffin", type: 'Artifact', color: '',
    cmc: 4, cost: '4', power: null, toughness: null, keywords: [] as string[],
    tapped: false, damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[],
    controller: 'p', optionalUntap: true, optionalUntapAlways: true,
    activated: { cost: '3,T', effect: 'tawnosCoffinExile' },
    triggeredAbilities: [{
      id: 'tawnos_coffin_leaves_bf',
      trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' },
      effect: { type: 'tawnosCoffinReturn' },
    }],
    ...overrides,
  };
}

function makeBear(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
    color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [] as string[],
    tapped: false, summoningSick: false, attacking: false, blocking: null as string | null,
    damage: 0, counters: { P1P1: 1 }, eotBuffs: [] as any[], enchantments: [] as any[],
    controller: 'o',
    ...overrides,
  };
}

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForDuelMobile(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 10_000 });
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

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine-card-scenarios-2 Tawnos's Coffin UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test("TC-E2E-01: exile + destroy + return -- the creature disappears into exile, then reappears tapped with its counter once the Coffin is destroyed", async ({ page }) => {
      const coffin = makeCoffin('e2e-coffin-1');
      const bear = makeBear('e2e-bear-1');
      const shatter = {
        iid: 'e2e-shatter-1', id: 'test_shatter', name: 'Test Shatter', type: 'Instant',
        color: 'R', cmc: 1, cost: 'R', keywords: [], effect: 'destroyArtifact',
      };

      await page.evaluate(({ coffin, bear, shatter }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [coffin], hand: [shatter], mana: { ...s.p.mana, C: 3, R: 1 } },
            o: { ...s.o, bf: [bear] },
          },
        });
      }, { coffin, bear, shatter });
      await page.waitForTimeout(50);

      await expect(page.locator('[data-iid="e2e-coffin-1"]')).toBeVisible();
      await expect(page.locator('[data-iid="e2e-bear-1"]')).toBeVisible();

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'e2e-coffin-1', tgt: 'e2e-bear-1' });
      });
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      // Re-anchor phase/priority immediately (no idle wait in between) -- once
      // the stack empties, the live app's own priority-pass loop will otherwise
      // auto-advance through phases (and burn mana pools) before the next
      // dispatch below runs, unlike a pure-reducer test with no render loop.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [] } });
      });
      await page.waitForTimeout(100);

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.o.bf.some((c: any) => c.iid === 'e2e-bear-1')).toBe(false);
      expect(midState.o.exile.some((c: any) => c.iid === 'e2e-bear-1')).toBe(true);
      expect(midState.p.bf.find((c: any) => c.iid === 'e2e-coffin-1').exiledCreatureIid).toBe('e2e-bear-1');
      await expect(page.locator('[data-iid="e2e-bear-1"]')).toHaveCount(0);

      // Destroy the Coffin via an unrelated effect -- the leaves-the-battlefield
      // trigger. Re-anchor phase/priority/mana in the same step as the cast
      // dispatch for the same reason as above.
      await page.evaluate(() => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: { phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [], p: { ...s.p, mana: { ...s.p.mana, R: 1 } } },
        });
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'e2e-shatter-1', tgt: 'e2e-coffin-1' });
      });
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.waitForTimeout(150);

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.p.gy.some((c: any) => c.iid === 'e2e-coffin-1')).toBe(true);
      const returned = finalState.o.bf.find((c: any) => c.iid === 'e2e-bear-1');
      expect(returned).toBeDefined();
      expect(returned.tapped).toBe(true);
      expect(returned.counters.P1P1).toBe(1);
      await expect(page.locator('[data-iid="e2e-bear-1"]')).toBeVisible();
    });

    test('TC-E2E-02: exile + untap + return -- the controller chooses to let the Coffin untap during their own untap step, returning the creature', async ({ page }) => {
      const coffin = makeCoffin('e2e-coffin-2');
      const bear = makeBear('e2e-bear-2', { controller: 'p' });

      await page.evaluate(({ coffin, bear }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [coffin, bear], mana: { ...s.p.mana, C: 3 } },
          },
        });
      }, { coffin, bear });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'e2e-coffin-2', tgt: 'e2e-bear-2' });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.waitForTimeout(100);

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.bf.some((c: any) => c.iid === 'e2e-bear-2')).toBe(false);
      expect(midState.p.exile.some((c: any) => c.iid === 'e2e-bear-2')).toBe(true);
      await expect(page.locator('[data-iid="e2e-bear-2"]')).toHaveCount(0);

      // Advance to p's own untap step (CLEANUP as 'o' -> ADVANCE_PHASE lands
      // on UNTAP with active flipped to 'p', matching the project's phase
      // sequence convention -- see upkeep-choice-registry.test.js).
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { phase: 'CLEANUP', active: 'o', priorityWindow: false, stack: [] } });
      });
      await page.waitForTimeout(50);
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); });
      await page.waitForTimeout(100);

      const untapState = await page.evaluate(() => (window as any).__duelState());
      expect(untapState.active).toBe('p');
      expect(untapState.pendingUpkeepChoice?.handlerKey).toBe('optionalUntap');
      expect(untapState.pendingUpkeepChoice?.iid).toBe('e2e-coffin-2');
      expect(untapState.p.bf.find((c: any) => c.iid === 'e2e-coffin-2').tapped).toBe(true);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });
      });
      await page.waitForTimeout(100);

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.p.bf.find((c: any) => c.iid === 'e2e-coffin-2').tapped).toBe(false);
      const returned = finalState.p.bf.find((c: any) => c.iid === 'e2e-bear-2');
      expect(returned).toBeDefined();
      expect(returned.tapped).toBe(true);
      expect(returned.counters.P1P1).toBe(1);
      await expect(page.locator('[data-iid="e2e-bear-2"]')).toBeVisible();
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
