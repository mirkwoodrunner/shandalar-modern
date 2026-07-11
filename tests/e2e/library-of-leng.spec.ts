// tests/e2e/library-of-leng.spec.ts
//
// End-to-end regression tests for Library of Leng Phase 2: no maximum hand
// size, and the discardToLibraryChoice UI for an effect discard. Tests run
// at both desktop (1280x800, /?duel=sandbox) and mobile (390x844,
// /?duel=sandbox-mobile) per the project convention, so both DuelScreen.tsx
// and DuelScreenMobile.tsx render paths are exercised. See
// docs/ENGINE_CONTRACT_SPEC.md S7.7 and docs/MECHANICS_INDEX.md.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// DuelScreenMobile.tsx never renders a node with data-testid="duel-screen"
// (only DuelScreen.tsx does) -- the sandbox-mobile route's outer wrapper is
// duel-screen-wrapper (see App.jsx SandboxMobileApp / raging-river.spec.ts).
async function waitForDuelMobile(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 10_000 });
}

async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// data-testid on desktop is `hand-card-<iid>` (one per card); on mobile it's
// the literal `hand-card` repeated per card, distinguished by data-iid. The
// "hand-card" prefix match counts hand cards in the UI on both.
async function handCardCountInUI(page: Page): Promise<number> {
  return page.locator('[data-testid^="hand-card"]').count();
}

function makeLengPermanent(iid: string) {
  return {
    iid, id: 'library_of_leng', name: 'Library of Leng', type: 'Artifact', color: '',
    cmc: 1, cost: '1', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
  };
}

function makeJalumTome(iid: string) {
  return {
    iid, id: 'jalum_tome', name: 'Jalum Tome', type: 'Artifact', subtype: 'Book', color: '',
    cmc: 3, cost: '3', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
    activated: { cost: '2,T', effect: 'drawThenDiscardOwn' },
  };
}

function makeLibCard(iid: string, name: string) {
  return {
    iid, id: 'lightning_bolt', name, type: 'Instant', color: 'R', cmc: 1, cost: 'R',
    keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
  };
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine Library of Leng Phase 2 UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await dismissMulligan(page);
      await waitForMain1(page);
    });

    test('No max hand size: Leng on the battlefield with 9 cards survives cleanup untouched', async ({ page }) => {
      const leng = makeLengPermanent('leng-1');
      const hand = Array.from({ length: 9 }, (_, i) => ({
        iid: `nomax-c${i}`, id: 'lightning_bolt', name: `Nomax Card ${i}`, type: 'Instant',
        color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, damage: 0, counters: {},
        eotBuffs: [], enchantments: [], controller: 'p',
      }));

      await page.evaluate(({ leng, hand }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'END', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [leng], hand },
            ruleset: { ...s.ruleset, maxHandSize: 7 },
          },
        });
      }, { leng, hand });
      await page.waitForFunction(() => (window as any).__duelState?.().p.hand.length === 9, { timeout: 5_000 });

      await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' })); // END -> CLEANUP
      await page.waitForFunction(() => (window as any).__duelState?.().phase === 'CLEANUP', { timeout: 5_000 });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.hand.length).toBe(9);
      expect(state.p.gy.length).toBe(0);
      expect(state.pendingChoice).toBeFalsy();
      await expect(page.locator('[data-testid="choice-modal"]')).not.toBeVisible();

      const uiCount = await handCardCountInUI(page);
      expect(uiCount).toBe(9);
    });

    test('Replacement choice UI: Jalum Tome discard with Leng offers graveyard/library, choosing library puts it on top', async ({ page }) => {
      const leng = makeLengPermanent('leng-2');
      const tome = makeJalumTome('tome-1');
      const libCard = makeLibCard('leng-lib-1', 'Leng Lib Card');

      await page.evaluate(({ leng, tome, libCard }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [leng, tome], lib: [libCard], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } },
          },
        });
      }, { leng, tome, libCard });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tome-1' });
      });
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(150);

      const modal = page.locator('[data-testid="choice-modal"]');
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[data-testid="choice-option-graveyard"]')).toBeVisible();
      await expect(page.locator('[data-testid="choice-option-library"]')).toBeVisible();

      await page.locator('[data-testid="choice-option-library"]').click();
      await page.waitForTimeout(150);

      await expect(modal).not.toBeVisible();
      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.pendingChoice).toBeFalsy();
      expect(state.p.lib[0]?.iid).toBe('leng-lib-1');
      expect(state.p.gy.some((c: any) => c.iid === 'leng-lib-1')).toBe(false);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
