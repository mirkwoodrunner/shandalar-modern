// tests/e2e/additional-cost-sacrifice.spec.ts
//
// End-to-end tests for the general "additional cost to cast" cast-flow
// mechanism and its first consumer, Sacrifice ("As an additional cost to
// cast this spell, sacrifice a creature. Add an amount of {B} equal to the
// sacrificed creature's mana value."). See docs/ENGINE_CONTRACT_SPEC.md and
// docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile
// (390x844, /?duel=sandbox-mobile) per the project convention, so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths are exercised.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

const CREATURE_IID = 'e2e-sac-creature';
const CREATURE_CMC = 3;

function makeSacCreature() {
  return {
    iid: CREATURE_IID, id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature',
    subtype: 'Wurm', color: 'G', cmc: CREATURE_CMC, cost: '4GG',
    power: 6, toughness: 4, keywords: [] as string[], tapped: false,
    summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[],
    controller: 'p',
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

// Seeds MAIN_1/active='p' with one Sacrifice card in hand (mana per
// `bMana`), and one creature of known cmc on the player's own battlefield.
// Returns the injected Sacrifice card's iid.
async function setupSacrificeScenario(page: Page, bMana: number): Promise<{ sacIid: string }> {
  await page.evaluate((mana) => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['sacrifice'], mana: { B: mana } });
  }, bMana);
  await page.waitForFunction(
    () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'sacrifice'),
    { timeout: 5000 },
  );

  await page.evaluate(({ c }: any) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: { p: { ...s.p, bf: [c] } },
    });
  }, { c: makeSacCreature() });
  await page.waitForTimeout(200);

  const sacIid = await page.evaluate(
    () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'sacrifice')?.iid,
  );
  return { sacIid };
}

// Click the Sacrifice hand card, then Cast, entering additionalCost mode.
// Both DuelScreen.tsx (data-testid="hand-card-<iid>") and DuelScreenMobile.tsx
// (data-testid="hand-card", static) hand cards carry data-iid={card.iid], so
// that is the one selector that works for both render paths.
async function enterSacrificeCastFlow(page: Page, sacIid: string) {
  const handCard = page.locator(`[data-iid="${sacIid}"]`).first();
  await expect(handCard).toBeVisible({ timeout: 5000 });
  await handCard.click();
  await page.waitForTimeout(200);

  const castBtn = page.locator('[data-testid="cast-button"]').first();
  await expect(castBtn).toBeVisible({ timeout: 5000 });
  await castBtn.click();
  await page.waitForTimeout(200);

  await page.waitForFunction(() => {
    const s = (window as any).__duelState();
    return s.p.hand.some((c: any) => c.id === 'sacrifice'); // still uncommitted -- castFlow open
  }, { timeout: 5000 });
}

// The mobile Pass Priority button carries no data-testid (a pre-existing gap,
// out of scope here), so resolve the stack via the same direct dispatch used
// by tests/e2e/library-of-leng.spec.ts rather than depending on it. The
// additionalCost mechanism itself -- what this spec targets -- is already
// exercised via real UI clicks above; this just drains the resulting spell.
//
// Once the stack empties and priorityWindow closes, useDuelController's own
// always-on AI/priority loop (the `requestPhaseAdvance()` effect keyed on
// s.stack.length/s.priorityWindow) auto-advances the phase on its very next
// render, and ADVANCE_PHASE burns any floating mana at the phase boundary
// (Classic rule, GDD Bug B6 -- see burnMana in DuelCore.js) -- real, intended,
// pre-existing behavior, unrelated to this feature. That leaves only a
// single-render window to observe the resolved mana before it burns, so this
// polls __duelState() at the tightest interval Playwright allows (1ms) and
// captures state the instant the stack empties, racing the auto-advance
// rather than waiting past it.
async function resolveStackAndGetState(page: Page): Promise<any> {
  await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
  const handle = await page.waitForFunction(() => {
    const s = (window as any).__duelState();
    return (s.stack?.length ?? 1) === 0 ? s : null;
  }, { timeout: 5000, polling: 1 });
  return handle.jsonValue();
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string) {
  test.describe(`@engine Additional-cost Sacrifice UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForEngineReady(page);
    });

    test('Full cast: sacrificing the creature moves it to the graveyard and adds B mana equal to its cmc', async ({ page }) => {
      // Fund exactly enough mana ({B}) so the cast completes as soon as the
      // sacrifice target is chosen -- no separate mana-tapping step needed.
      const { sacIid } = await setupSacrificeScenario(page, 1);
      await enterSacrificeCastFlow(page, sacIid);

      const creature = page.locator(`[data-iid="${CREATURE_IID}"]`).first();
      await expect(creature).toBeVisible({ timeout: 5000 });
      await creature.click();
      await page.waitForTimeout(300);

      // The cast should have committed: the card left hand for the stack.
      await page.waitForFunction(
        () => !(window as any).__duelState().p.hand.some((c: any) => c.id === 'sacrifice'),
        { timeout: 5000 },
      );

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.bf.some((c: any) => c.iid === CREATURE_IID)).toBe(false);
      expect(midState.p.gy.some((c: any) => c.iid === CREATURE_IID)).toBe(true);
      expect(midState.stack.length).toBe(1);

      const state = await resolveStackAndGetState(page);
      expect(state.p.gy.some((c: any) => c.iid === CREATURE_IID)).toBe(true);
      // Spent {B} to cast (mana went 1 -> 0), then resolution added {B} x cmc.
      expect(state.p.mana.B).toBe(CREATURE_CMC);
      expect(state.log.some((l: any) => (l.text ?? '').includes('adds 3B'))).toBe(true);
    });

    test('Cancel mid-flow: choosing a sacrifice target with insufficient mana, then cancelling, reverts everything', async ({ page }) => {
      // No mana funded -- the flow will auto-advance past additionalCost into
      // the 'mana' step (canPay fails) and wait there for the Cancel click.
      const { sacIid } = await setupSacrificeScenario(page, 0);
      await enterSacrificeCastFlow(page, sacIid);

      const creature = page.locator(`[data-iid="${CREATURE_IID}"]`).first();
      await expect(creature).toBeVisible({ timeout: 5000 });
      await creature.click();
      await page.waitForTimeout(300);

      // Selection made, but CAST_SPELL has not fired -- nothing committed yet.
      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.hand.some((c: any) => c.id === 'sacrifice')).toBe(true);
      expect(midState.p.bf.some((c: any) => c.iid === CREATURE_IID)).toBe(true);
      expect(midState.p.mana.B).toBe(0);

      const cancelBtn = page.locator('[data-testid="cast-prompt-cancel"]').first();
      await expect(cancelBtn).toBeVisible({ timeout: 5000 });
      await cancelBtn.click();
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.bf.find((c: any) => c.iid === CREATURE_IID)).toBeTruthy();
      expect(state.p.bf.findIndex((c: any) => c.iid === CREATURE_IID)).toBe(0); // original position
      expect(state.p.mana.B).toBe(0); // no mana spent
      expect(state.p.hand.some((c: any) => c.id === 'sacrifice')).toBe(true); // card never left hand
      expect(state.stack.length).toBe(0);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL);
