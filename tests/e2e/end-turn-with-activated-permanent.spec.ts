// tests/e2e/end-turn-with-activated-permanent.spec.ts
//
// Regression: End Turn could stall indefinitely whenever any permanent with a
// non-mana activated ability was on either battlefield (e.g. Pestilence).
// usePhaseAdvance.ts correctly opens a priority window in that case, but the
// "AI priority window effect" in useDuelController.ts had no fallback dispatch
// when aiDecide() returned null or [] (normal -- the AI often has nothing
// worth doing). 'o' never explicitly passed priority, so PASS_PRIORITY could
// never see a second pass, the window never closed, and both manual play and
// the End Turn skip-loop hung forever. Shared-hook logic (useDuelController.ts)
// -- not mobile-specific -- so this reproduces identically on desktop and
// mobile.
//
// aiDecide()'s real phase planners (planMain/planEnd/planInstantResponse/
// passPlan in AI.js) each append their own explicit PASS_PRIORITY fallback
// action, so they never actually return null/[] in ordinary play -- confirmed
// by tracing live state through this exact Pestilence scenario. The null/[]
// case this fix guards against is a genuine but narrow condition (verified via
// the route-patch below, which reproduces the historical live repro exactly:
// a stall in MAIN_1 with priorityWindow:true, priorityPasser:'p' forever). To
// exercise that branch deterministically -- rather than relying on incidental
// planner behavior that could change independently of this fix -- this test
// intercepts the served AI.js module and injects a one-shot short-circuit so
// aiDecide() returns [] for exactly the priority-window decision under test.
// Nothing else about AI.js is modified; every other call path (mulligan,
// normal turn play) runs the real, unpatched aiDecide().
//
// Uses the sandbox URL and window.__duelDispatch / window.__duelState escape
// hatches, the same pattern as tests/e2e/end-turn-skip-ahead.spec.ts and
// tests/e2e/combat-blockers-priority.spec.ts (DEBUG_SET_ACTIVE + patch to
// inject a deterministic battlefield state).
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports; this
// file is also explicitly listed in playwright.config.js's mobile-chrome
// testMatch allowlist so both describe blocks execute under that project too.
//
// END-TURN-PERM-01: With Pestilence (non-mana activated-ability permanent) on
//                   the player's battlefield during Main 1, and aiDecide()
//                   forced to return [] for that one priority-window decision
//                   (the documented "AI has nothing worth doing" case),
//                   clicking End Turn still advances the phase indicator past
//                   Main 1 and the turn eventually passes to the opponent,
//                   instead of stalling forever.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

// Intercepts the served AI.js module and inserts a one-shot short-circuit at
// the top of aiDecide(): when window.__forceEmptyAiDecide is true, it returns
// [] immediately (consumed once, then cleared) instead of running the real
// planner. Must be registered before page.goto() so it catches the initial
// module load. Every other export (getAIPlan, selectPlayableCards,
// buildTapActions, AI_PROFILES) and every other aiDecide() call (mulligan,
// normal AI turns) is untouched.
async function installAiDecidePatch(page: Page) {
  await page.route('**/src/engine/AI.js*', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const marker = 'export function aiDecide(state) {';
    if (body.includes(marker)) {
      body = body.replace(
        marker,
        `${marker}\n  if (globalThis.__forceEmptyAiDecide) { globalThis.__forceEmptyAiDecide = false; return []; }`,
      );
    }
    await route.fulfill({ response, body, headers: response.headers() });
  });
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

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// Injects Pestilence (2BB Enchantment, activated:{cost:"B",effect:"pestilence"} --
// a non-mana activated ability) onto the player's battlefield during their own
// Main 1, matching the real repro exactly.
async function injectPestilenceScenario(page: Page) {
  const pest = {
    iid: 'e2e-pest-p', id: 'pestilence', name: 'Pestilence', type: 'Enchantment',
    color: 'B', cmc: 4, cost: '2BB', keywords: [], tapped: false,
    summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [],
    activated: { cost: 'B', effect: 'pestilence' },
    controller: 'p',
  };

  await page.evaluate(({ pest }: any) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'MAIN_1',
        active: 'p',
        priorityWindow: false,
        stack: [],
        p: { ...s.p, bf: [...s.p.bf, pest] },
      },
    });
  }, { pest });

  await page.waitForTimeout(100);
}

async function runEndTurnWithActivatedPermanent(page: Page) {
  await installAiDecidePatch(page);
  await page.goto(SANDBOX_URL);
  await waitForEngineReady(page);
  await waitForMain1(page);
  await injectPestilenceScenario(page);

  const beforeTurn = await page.evaluate(() => (window as any).__duelState().turn);

  await expect(page.getByTestId('phase-active')).toHaveText('Main 1');

  // Arm the one-shot short-circuit so the AI priority window effect's aiDecide()
  // call -- triggered by End Turn opening a window over Pestilence -- returns []
  // exactly like the documented "AI has nothing worth doing" case.
  await page.evaluate(() => { (globalThis as any).__forceEmptyAiDecide = true; });

  const endTurnBtn = page.getByTestId('end-turn-button');
  await expect(endTurnBtn).toBeEnabled();
  await endTurnBtn.click();

  // Phase indicator must move off Main 1 -- this is the assertion that fails
  // against the pre-fix code, where the priority window never closes and the
  // engine stalls in MAIN_1 forever.
  await expect(page.getByTestId('phase-active')).not.toHaveText('Main 1', { timeout: 15_000 });

  // The turn must eventually complete and pass to the opponent.
  await page.waitForFunction(
    (prevTurn) => {
      const s = (window as any).__duelState?.();
      return s && (s.active === 'o' || s.turn !== prevTurn);
    },
    beforeTurn,
    { timeout: 15_000 },
  );
}

// ---------------------------------------------------------------------------
// Desktop suite (1280x800)
// ---------------------------------------------------------------------------

test.describe('@engine @mobile End Turn with non-mana activated-ability permanent -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('END-TURN-PERM-01: End Turn does not stall with Pestilence in play (desktop)', async ({ page }) => {
    await runEndTurnWithActivatedPermanent(page);
  });
});

// ---------------------------------------------------------------------------
// Mobile suite (390x844)
// ---------------------------------------------------------------------------

test.describe('@engine @mobile End Turn with non-mana activated-ability permanent -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('END-TURN-PERM-01: End Turn does not stall with Pestilence in play (mobile)', async ({ page }) => {
    await runEndTurnWithActivatedPermanent(page);
  });
});
