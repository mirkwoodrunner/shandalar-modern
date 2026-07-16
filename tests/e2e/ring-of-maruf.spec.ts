// tests/e2e/ring-of-maruf.spec.ts
//
// End-to-end tests for Ring of Ma'ruf ("{5}, {T}, Exile this artifact: The next
// time you would draw a card this turn, instead put a card you own from outside
// the game into your hand."). "Outside the game" is the binder snapshot
// (p.binderIds); the pick UI reuses TutorModal. See docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths are exercised.
//
// RM-E2E-01: activate Ring, trigger a draw -- the binder TutorModal appears,
//            choosing a card puts it in hand and closes the modal.
// RM-E2E-02: empty binder -- no modal; the draw fizzles to a normal top-card draw.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

const RING_IID = 'e2e-ring-1';
const BINDER_IDS = ['lightning_bolt', 'grizzly_bears', 'air_elemental'];

function makeRing() {
  return {
    iid: RING_IID,
    id: 'ring_of_maruf',
    name: "Ring of Ma'rûf",
    type: 'Artifact',
    color: '',
    cmc: 5,
    cost: '5',
    keywords: [] as string[],
    rarity: 'R',
    text: '{5}, {T}, Exile this artifact: The next time you would draw a card this turn, instead put a card you own from outside the game into your hand.',
    activated: { cost: '5,T,exile', effect: 'marufCharge' },
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null as string | null,
    damage: 0,
    counters: {},
    eotBuffs: [] as any[],
    enchantments: [] as any[],
    controller: 'p',
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

// Seeds the battlefield with the Ring, the given binder, and 5 colorless mana,
// parked in UPKEEP so a single ADVANCE_PHASE later triggers the draw step.
async function setupRingScenario(page: Page, binderIds: string[]): Promise<void> {
  await page.evaluate(([ring, binder]) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'UPKEEP',
        active: 'p',
        // Turn 1 skips the active player's draw step (drawOnFirstTurn); park on
        // turn 2 so the ADVANCE_PHASE into DRAW actually performs a draw.
        turn: 2,
        p: {
          ...s.p,
          bf: [ring],
          binderIds: binder,
          mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 },
        },
        o: { ...s.o, bf: [] },
        stack: [],
        priorityWindow: false,
        priorityPasser: null,
      },
    });
  }, [makeRing(), binderIds] as const);
  await page.waitForTimeout(200);
}

// Activates the Ring (exile-self cost), resolves the charge off the stack, and
// clears the priority window so ADVANCE_PHASE can run the draw step.
async function activateRingAndDraw(page: Page): Promise<void> {
  await page.evaluate((ringIid) => {
    (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: ringIid });
  }, RING_IID);
  await page.waitForTimeout(200);
  await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { priorityWindow: false, priorityPasser: null, stack: [] } });
    (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' });
  });
  await page.waitForTimeout(300);
}

function runSuite(
  viewport: { width: number; height: number },
  label: string,
  url: string,
  waitForScreen: (page: Page) => Promise<void>,
) {
  test.describe(`@engine-card-scenarios-2 Ring of Maruf [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test('RM-E2E-01: activating the Ring and drawing opens the binder pick; the chosen card lands in hand', async ({ page }) => {
      await setupRingScenario(page, BINDER_IDS);
      await activateRingAndDraw(page);

      // The Ring exiled itself and the draw was replaced by the binder pick.
      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.exile.some((c: any) => c.id === 'ring_of_maruf')).toBe(true);
      expect(midState.pendingMarufPicks?.length).toBe(1);
      const handBefore = midState.p.hand.length;

      // TutorModal shows the binder cards.
      await expect(page.getByTestId('tutor-modal')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('tutor-card-lightning_bolt')).toBeVisible();
      await expect(page.getByTestId('tutor-card-grizzly_bears')).toBeVisible();

      // Choose Lightning Bolt.
      await page.getByTestId('tutor-card-lightning_bolt').click();
      await page.getByTestId('tutor-confirm').click();
      await page.waitForTimeout(300);

      await expect(page.getByTestId('tutor-modal')).toBeHidden({ timeout: 5000 });
      const afterState = await page.evaluate(() => (window as any).__duelState());
      expect(afterState.pendingMarufPicks?.length ?? 0).toBe(0);
      expect(afterState.p.hand.length).toBe(handBefore + 1);
      expect(afterState.p.hand.some((c: any) => c.id === 'lightning_bolt')).toBe(true);
      // One occurrence removed from the binder snapshot.
      expect(afterState.p.binderIds).toEqual(['grizzly_bears', 'air_elemental']);
    });

    test('RM-E2E-02: empty binder -- no modal appears and a normal card is drawn instead', async ({ page }) => {
      await setupRingScenario(page, []);

      const before = await page.evaluate(() => (window as any).__duelState());
      const handBefore = before.p.hand.length;
      const libBefore = before.p.lib.length;

      await activateRingAndDraw(page);

      const after = await page.evaluate(() => (window as any).__duelState());
      expect(after.pendingMarufPicks?.length ?? 0).toBe(0);
      await expect(page.getByTestId('tutor-modal')).toBeHidden();
      // Fizzle: charge consumed, normal top-card draw proceeded.
      expect(after.p.hand.length).toBe(handBefore + 1);
      expect(after.p.lib.length).toBe(libBefore - 1);
      expect(after.p.marufCharges).toBe(0);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
