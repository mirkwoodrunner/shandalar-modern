// tests/e2e/discard-centralization.spec.ts
//
// End-to-end regression tests for discard centralization Phase 1. The
// choke point (discardCard, DISCARD_REPLACEMENTS, ON_DISCARD) is a pure
// refactor plus inert new infrastructure -- these tests confirm the UI looks
// and behaves exactly as before the refactor for two representative discard
// paths: the CLEANUP hand-size rule and an effect-driven discard (Mind
// Twist's discardX). See docs/ENGINE_CONTRACT_SPEC.md S7.7 and
// docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile (390x844,
// /?duel=sandbox-mobile) per the project convention, so both DuelScreen.tsx
// and DuelScreenMobile.tsx render paths are exercised.

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

// Reads the graveyard count as rendered in the player's own banner, working
// for both the desktop ZoneCount (button: glyph/count/label spans) and
// mobile ZoneChip (glyph span + count/label spans in a zoneStack div) DOM
// shapes -- in both, the count span is the label span's previous sibling.
async function readGraveyardCountFromUI(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const banner = document.querySelector('[data-testid="banner-you"]');
    if (!banner) return null;
    const all = Array.from(banner.querySelectorAll('*'));
    const labelEl = all.find(
      (el) => el.children.length === 0 && (el.textContent?.trim() === 'Graveyard' || el.textContent?.trim() === 'GY')
    );
    if (!labelEl) return null;
    const countEl = labelEl.previousElementSibling;
    return countEl ? parseInt(countEl.textContent || '', 10) : null;
  });
}

function makeHandCard(iid: string, name: string) {
  return {
    iid, id: 'lightning_bolt', name, type: 'Instant', color: 'R', cmc: 1, cost: 'R',
    keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
  };
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine Discard centralization Phase 1 UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await dismissMulligan(page);
      await waitForMain1(page);
    });

    test('Cleanup hand-size discard: player picks cards via CleanupDiscardModal, excess cards move from hand to the graveyard', async ({ page }) => {
      // As of the cleanup-step player-choice feature (docs/SYSTEMS.md Section
      // 29), the human player no longer auto-discards at CLEANUP -- they pick
      // via CleanupDiscardModal. See tests/scenarios/cleanup-discard.test.js
      // for the engine-level coverage and tests/e2e/cleanup-discard.spec.ts
      // for deeper modal-interaction coverage; this test keeps its original
      // "excess cards move from hand to the graveyard, visible in the banner"
      // scope, now driven through the modal instead of an automatic discard.
      const gyCountBefore = await readGraveyardCountFromUI(page);
      expect(gyCountBefore).not.toBeNull();

      // Seed the player's hand to 9 known cards and jump to END (still the
      // player's own turn) so ADVANCE_PHASE drives the real CLEANUP handler.
      await page.evaluate(() => {
        const s = (window as any).__duelState();
        const hand = Array.from({ length: 9 }, (_, i) => ({
          iid: `cleanup-c${i}`, id: 'lightning_bolt', name: `Cleanup Card ${i}`, type: 'Instant',
          color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, damage: 0, counters: {},
          eotBuffs: [], enchantments: [], controller: 'p',
        }));
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          // The sandbox's own ruleset config (App.jsx) omits maxHandSize (a
          // pre-existing gap unrelated to this migration -- out of scope to
          // fix here, see CLAUDE.md's "zero UI edits" constraint for this
          // phase); pin it explicitly so CLEANUP's hand-size rule has
          // something to compare against.
          patch: { phase: 'END', active: 'p', priorityWindow: false, stack: [], p: { ...s.p, hand }, ruleset: { ...s.ruleset, maxHandSize: 7 } },
        });
      });
      await page.waitForFunction(() => (window as any).__duelState?.().p.hand.length === 9, { timeout: 5_000 });

      await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' })); // END -> CLEANUP

      await page.waitForSelector('[data-testid="cleanup-discard-modal"]', { timeout: 5_000 });
      await page.locator('[data-testid="cleanup-discard-card-cleanup-c8"]').click();
      await page.locator('[data-testid="cleanup-discard-card-cleanup-c7"]').click();
      await page.locator('[data-testid="cleanup-discard-confirm"]').click();

      await page.waitForFunction(() => (window as any).__duelState?.().p.hand.length === 7, { timeout: 5_000 });
      await page.waitForTimeout(150); // let React flush the banner re-render

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.hand.length).toBe(7);
      expect(state.p.gy.some((c: any) => c.iid === 'cleanup-c8')).toBe(true);
      expect(state.p.gy.some((c: any) => c.iid === 'cleanup-c7')).toBe(true);

      const gyCountAfter = await readGraveyardCountFromUI(page);
      expect(gyCountAfter).toBe((gyCountBefore ?? 0) + 2);
    });

    test('Effect discard: Mind Twist (discardX) drops the opponent hand count and logs the discard', async ({ page }) => {
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['mind_twist'] });
      });
      await page.waitForFunction(
        () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'mind_twist'),
        { timeout: 5_000 }
      );

      await page.evaluate(() => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: { p: { ...s.p, mana: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 2 } } },
        });
      });

      const oppHandBefore = await page.evaluate(() => (window as any).__duelState().o.hand.length);
      expect(oppHandBefore).toBeGreaterThanOrEqual(2);

      const twistIid = await page.evaluate(
        () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'mind_twist')?.iid
      );
      expect(twistIid).toBeTruthy();

      await page.evaluate((iid) => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, xVal: 2 });
      }, twistIid);
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));

      await page.waitForFunction(
        (before) => (window as any).__duelState().o.hand.length === before - 2,
        oppHandBefore,
        { timeout: 5_000 }
      );

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.o.hand.length).toBe(oppHandBefore - 2);
      expect(state.log.some((e: any) => (e.text ?? '').startsWith('o discards '))).toBe(true);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
