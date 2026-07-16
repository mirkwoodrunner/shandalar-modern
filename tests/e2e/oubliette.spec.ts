// tests/e2e/oubliette.spec.ts
//
// End-to-end tests for Oubliette: "When this enchantment enters, target
// creature phases out until this enchantment leaves the battlefield. Tap
// that creature as it phases in this way." One-shot phasing built on the
// Tawnos's Coffin snapshot/exile/return machinery. See
// docs/ENGINE_CONTRACT_SPEC.md and docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm both DuelScreen.tsx and DuelScreenMobile.tsx
// render paths behave the same way. Follows the structure of
// tests/e2e/tawnos-coffin.spec.ts (the closest same-machinery example).
//
// OUB-E2E-01: phase out + return -- a creature with a counter and Oubliette
//             in hand, cast targeting the creature: it disappears from the
//             battlefield; destroying Oubliette returns it tapped with its
//             counter shown, and it is not summoning sick.
// OUB-E2E-02: targeting restriction -- clicking a non-creature permanent
//             during Oubliette's cast is illegal; a legal creature click
//             completes the cast.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

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

function makeLand(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'forest', name: 'Forest', type: 'Land', subtype: 'Forest', color: 'G',
    cmc: 0, cost: '', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], produces: ['G'] as string[],
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
  test.describe(`@engine-card-scenarios-1 Oubliette UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test('OUB-E2E-01: phase out + return -- the creature disappears from the battlefield, then reappears tapped with its counter and no summoning sickness once Oubliette is destroyed', async ({ page }) => {
      const bear = makeBear('e2e-oub-bear-1');
      const shatter = {
        iid: 'e2e-oub-shatter-1', id: 'test_shatter', name: 'Test Shatter', type: 'Instant',
        color: 'R', cmc: 1, cost: 'R', keywords: [], effect: 'destroyArtOrEnch',
      };

      await page.evaluate(({ bear, shatter }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, hand: [shatter], mana: { ...s.p.mana, B: 2, C: 1, R: 1 } },
            o: { ...s.o, bf: [bear] },
          },
        });
        (window as any).__duelDispatch({
          type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['oubliette'], mana: { B: 2, C: 1 },
        });
      }, { bear, shatter });
      await page.waitForFunction(
        () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'oubliette'),
        { timeout: 5000 },
      );
      const oubIid: string = await page.evaluate(
        () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'oubliette')?.iid,
      );

      await expect(page.locator('[data-iid="e2e-oub-bear-1"]')).toBeVisible();

      const handCard = page.locator(`[data-iid="${oubIid}"]`).first();
      await expect(handCard).toBeVisible({ timeout: 5000 });
      await handCard.click();
      await page.waitForTimeout(200);
      await page.click('[data-testid="cast-button"]');
      await page.waitForTimeout(200);

      const bearTile = page.locator('[data-iid="e2e-oub-bear-1"]').first();
      await bearTile.click();
      await page.waitForTimeout(200);
      const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
      if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(200);
      }

      await page.waitForFunction(
        () => !(window as any).__duelState().p.hand.some((c: any) => c.id === 'oubliette'),
        { timeout: 5000 },
      );
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [] } });
      });
      await page.waitForTimeout(100);

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.o.bf.some((c: any) => c.iid === 'e2e-oub-bear-1')).toBe(false);
      expect(midState.o.exile.some((c: any) => c.iid === 'e2e-oub-bear-1')).toBe(true);
      await expect(page.locator('[data-iid="e2e-oub-bear-1"]')).toHaveCount(0);

      const oubOnBf = midState.p.bf.find((c: any) => c.id === 'oubliette');
      expect(oubOnBf).toBeDefined();
      expect(oubOnBf.exiledCreatureIid).toBe('e2e-oub-bear-1');

      // Destroy Oubliette via an unrelated effect -- the leaves-the-battlefield
      // trigger fires the phase-in.
      await page.evaluate((oubIid: string) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: { phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [], p: { ...s.p, mana: { ...s.p.mana, R: 1 } } },
        });
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'e2e-oub-shatter-1', tgt: oubIid });
      }, oubOnBf.iid);
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.waitForTimeout(150);

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.p.gy.some((c: any) => c.iid === oubOnBf.iid)).toBe(true);
      const returned = finalState.o.bf.find((c: any) => c.iid === 'e2e-oub-bear-1');
      expect(returned).toBeDefined();
      expect(returned.tapped).toBe(true);
      expect(returned.counters.P1P1).toBe(1);
      expect(returned.summoningSick).toBe(false);
      await expect(page.locator('[data-iid="e2e-oub-bear-1"]')).toBeVisible();
    });

    test('OUB-E2E-02: targeting restriction -- clicking a non-creature permanent is rejected and the cast prompt stays open; clicking a legal creature completes the cast', async ({ page }) => {
      const land = makeLand('e2e-oub-land-1');
      const bear = makeBear('e2e-oub-bear-2');

      await page.evaluate(({ land, bear }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            o: { ...s.o, bf: [land, bear] },
          },
        });
        (window as any).__duelDispatch({
          type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['oubliette'], mana: { B: 2, C: 1 },
        });
      }, { land, bear });
      await page.waitForFunction(
        () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'oubliette'),
        { timeout: 5000 },
      );
      const oubIid: string = await page.evaluate(
        () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'oubliette')?.iid,
      );

      const handCard = page.locator(`[data-iid="${oubIid}"]`).first();
      await expect(handCard).toBeVisible({ timeout: 5000 });
      await handCard.click();
      await page.waitForTimeout(200);
      await page.click('[data-testid="cast-button"]');
      await page.waitForTimeout(200);

      // Illegal click: non-creature land.
      const landTile = page.locator('[data-iid="e2e-oub-land-1"]').first();
      await expect(landTile).toBeVisible({ timeout: 5000 });
      await landTile.click();
      await page.waitForTimeout(300);

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.hand.some((c: any) => c.id === 'oubliette')).toBe(true); // cast prompt still open

      // Legal click: the creature.
      const bearTile = page.locator('[data-iid="e2e-oub-bear-2"]').first();
      await expect(bearTile).toBeVisible({ timeout: 5000 });
      await bearTile.click();
      await page.waitForTimeout(200);
      const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
      if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(200);
      }

      await page.waitForFunction(
        () => !(window as any).__duelState().p.hand.some((c: any) => c.id === 'oubliette'),
        { timeout: 5000 },
      );
      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.stack.length).toBe(1);
      expect(state.stack[0].targets).toContain('e2e-oub-bear-2');
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
