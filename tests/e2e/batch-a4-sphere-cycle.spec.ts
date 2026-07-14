// tests/e2e/batch-a4-sphere-cycle.spec.ts
// engine @mobile
// Playwright e2e for Batch A4: Sphere Lifegain Cycle
// Dual-viewport: 1280x800 desktop and 390x844 mobile.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const sandboxWith = (cards: string) => `${SANDBOX_URL}&cards=${cards}`;

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT  = { width: 390,  height: 844 };

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// Injects Crystal Rod onto the player's battlefield with mana to pay, and sets up
// a blue spell on the opponent's side about to be cast so we can trigger the rod.
async function injectCrystalRodAndCastBlue(page: Page) {
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    // Give player Crystal Rod on battlefield and mana to pay the trigger.
    dispatch({
      type: 'SANDBOX_FORCE_HAND',
      who: 'p',
      cardIds: ['crystal_rod'],
      mana: { C: 2 },
    });
  });

  // Cast crystal rod from hand
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    const s = (window as any).__duelState();
    const rod = (s.p.hand as any[]).find((c: any) => c.id === 'crystal_rod');
    if (!rod) throw new Error('crystal_rod not in hand');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: rod.iid });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  });

  // Wait for crystal rod to be on battlefield
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return (s?.p?.bf as any[])?.some((c: any) => c.id === 'crystal_rod');
  }, { timeout: 10_000 });

  // Give opponent a blue spell to cast
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({
      type: 'SANDBOX_FORCE_HAND',
      who: 'o',
      cardIds: ['air_elemental'],
      mana: { U: 5, C: 5 },
    });
    // Give player some mana to afford the trigger
    dispatch({
      type: 'SANDBOX_FORCE_HAND',
      who: 'p',
      mana: { C: 3 },
    });
  });

  // Set active to 'o' for MAIN_1 so opponent can cast
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
  });

  // Opponent casts blue spell -> Crystal Rod should fire
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    const s = (window as any).__duelState();
    const spell = (s.o.hand as any[]).find((c: any) => c.id === 'air_elemental');
    if (!spell) throw new Error('air_elemental not in opponent hand');
    dispatch({ type: 'CAST_SPELL', who: 'o', iid: spell.iid });
  });
}

function sphereTests() {

  // A4-E01: Modal renders with correct card name when Crystal Rod triggers.
  test('A4-E01: sphere trigger modal renders with crystal rod name', async ({ page }) => {
    await page.goto(sandboxWith('crystal_rod'));
    await waitForDuel(page);
    await waitForMain1(page);

    await injectCrystalRodAndCastBlue(page);

    // pendingSphereTrigger.controller should be 'p' -> modal should appear
    await page.waitForSelector('[data-testid="sphere-trigger-modal"]', { timeout: 8_000 });

    const modalText = await page.textContent('[data-testid="sphere-trigger-modal"]');
    expect(modalText).toContain('Crystal Rod');
  });

  // A4-E02: Clicking Pay increases life by 1 and decreases mana by 1.
  test('A4-E02: clicking Pay grants 1 life and deducts 1 mana', async ({ page }) => {
    await page.goto(sandboxWith('crystal_rod'));
    await waitForDuel(page);
    await waitForMain1(page);

    await injectCrystalRodAndCastBlue(page);
    await page.waitForSelector('[data-testid="sphere-trigger-modal"]', { timeout: 8_000 });

    const lifeBefore = await page.evaluate(() => (window as any).__duelState().p.life);
    const manaBefore = await page.evaluate(() => {
      const m = (window as any).__duelState().p.mana;
      return Object.values(m).reduce((a: number, v: any) => a + v, 0);
    });

    await page.click('[data-testid="sphere-pay-button"]');

    await page.waitForFunction(() => !(window as any).__duelState().pendingSphereTrigger, { timeout: 5_000 });

    const lifeAfter = await page.evaluate(() => (window as any).__duelState().p.life);
    const manaAfter = await page.evaluate(() => {
      const m = (window as any).__duelState().p.mana;
      return Object.values(m).reduce((a: number, v: any) => a + v, 0);
    });

    expect(lifeAfter).toBe(lifeBefore + 1);
    expect(manaAfter).toBe(manaBefore - 1);
  });

  // A4-E03: Clicking Decline leaves life and mana unchanged.
  test('A4-E03: clicking Decline leaves life and mana unchanged', async ({ page }) => {
    await page.goto(sandboxWith('crystal_rod'));
    await waitForDuel(page);
    await waitForMain1(page);

    await injectCrystalRodAndCastBlue(page);
    await page.waitForSelector('[data-testid="sphere-trigger-modal"]', { timeout: 8_000 });

    const lifeBefore = await page.evaluate(() => (window as any).__duelState().p.life);
    const manaBefore = await page.evaluate(() => {
      const m = (window as any).__duelState().p.mana;
      return Object.values(m).reduce((a: number, v: any) => a + v, 0);
    });

    await page.click('[data-testid="sphere-decline-button"]');

    await page.waitForFunction(() => !(window as any).__duelState().pendingSphereTrigger, { timeout: 5_000 });

    const lifeAfter = await page.evaluate(() => (window as any).__duelState().p.life);
    const manaAfter = await page.evaluate(() => {
      const m = (window as any).__duelState().p.mana;
      return Object.values(m).reduce((a: number, v: any) => a + v, 0);
    });

    expect(lifeAfter).toBe(lifeBefore);
    expect(manaAfter).toBe(manaBefore);
  });

  // A4-E04: When controller is 'o', AI resolves automatically with no modal shown.
  test('A4-E04: AI auto-resolves sphere trigger without showing modal to human', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await waitForMain1(page);

    // Put Crystal Rod on opponent's battlefield so the AI owns it.
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'o',
        cardIds: ['crystal_rod'],
        mana: { C: 5 },
      });
    });

    // Manually place rod on opponent's battlefield via cast+resolve
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      // Set phase to o's MAIN_1 so o can cast
      dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
      const s = (window as any).__duelState();
      const rod = (s.o.hand as any[]).find((c: any) => c.id === 'crystal_rod');
      if (rod) {
        dispatch({ type: 'CAST_SPELL', who: 'o', iid: rod.iid });
        dispatch({ type: 'PASS_PRIORITY', who: 'p' });
        dispatch({ type: 'PASS_PRIORITY', who: 'o' });
        dispatch({ type: 'RESOLVE_STACK' });
      }
    });

    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return (s?.o?.bf as any[])?.some((c: any) => c.id === 'crystal_rod');
    }, { timeout: 10_000 });

    // Player casts a blue spell -> opponent's Crystal Rod triggers (controller='o')
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'p',
        cardIds: ['air_elemental'],
        mana: { U: 5, C: 5 },
      });
      dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    });

    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      const s = (window as any).__duelState();
      const spell = (s.p.hand as any[]).find((c: any) => c.id === 'air_elemental');
      if (spell) dispatch({ type: 'CAST_SPELL', who: 'p', iid: spell.iid });
    });

    // AI should auto-resolve; modal should never appear for the human player
    // Wait a moment for AI auto-resolve to fire
    await page.waitForFunction(() => !(window as any).__duelState().pendingSphereTrigger, { timeout: 8_000 });

    // Modal must not be present
    const modalVisible = await page.isVisible('[data-testid="sphere-trigger-modal"]');
    expect(modalVisible).toBe(false);
  });

}

// ---------------------------------------------------------------------------
// Desktop suite
// ---------------------------------------------------------------------------
test.describe('@engine-card-scenarios-1 @mobile Batch A4 Sphere Cycle -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  sphereTests();
});

// ---------------------------------------------------------------------------
// Mobile suite
// ---------------------------------------------------------------------------
test.describe('@engine-card-scenarios-1 @mobile Batch A4 Sphere Cycle -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  sphereTests();
});
