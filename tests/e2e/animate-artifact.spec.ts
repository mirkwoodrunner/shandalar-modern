// tests/e2e/animate-artifact.spec.ts
//
// End-to-end tests for Animate Artifact ("Enchant artifact. As long as
// enchanted artifact isn't a creature, it's an artifact creature with power
// and toughness each equal to its mana value.") See docs/ENGINE_CONTRACT_SPEC.md
// and docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile
// (390x844, /?duel=sandbox-mobile) per the project convention, so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths are exercised.
//
// AA-E2E-01: animating a noncreature artifact shows it as a creature with
//            P/T equal to its mana value, and it can attack normally.
// AA-E2E-02: the targeting-restriction click guard rejects a non-artifact
//            click and accepts a legal artifact click.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

const ARTIFACT_IID = 'e2e-aa-artifact';
const ARTIFACT_CMC = 3;
const BEAR_IID = 'e2e-aa-bear';

function makeArtifact(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: ARTIFACT_CMC, cost: '3', power: null, toughness: null, keywords: [] as string[],
    tapped: false, summoningSick: false, attacking: false, blocking: null as string | null,
    damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[],
    controller: 'p',
    ...overrides,
  };
}

function makeBear(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
    color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [] as string[],
    tapped: false, summoningSick: false, attacking: false, blocking: null as string | null,
    damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[],
    controller: 'o',
    ...overrides,
  };
}

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// DuelScreenMobile.tsx never renders a node with data-testid="duel-screen"
// (only DuelScreen.tsx does) -- the sandbox-mobile route's outer wrapper is
// duel-screen-wrapper (see App.jsx SandboxMobileApp).
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

// Seeds MAIN_1/active='p' with Animate Artifact in hand (funded mana) and a
// noncreature artifact on the player's own battlefield. Returns the injected
// Animate Artifact card's iid.
async function setupAnimateArtifactScenario(page: Page, oBf: any[] = []): Promise<{ aaIid: string }> {
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    (window as any).__duelDispatch({
      type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['animate_artifact'], mana: { U: 1, C: 3 },
    });
  });
  await page.waitForFunction(
    () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'animate_artifact'),
    { timeout: 5000 },
  );

  await page.evaluate((art) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: { p: { ...s.p, bf: [art] } },
    });
  }, makeArtifact(ARTIFACT_IID));
  await page.waitForTimeout(100);

  if (oBf.length) {
    await page.evaluate((bears) => {
      const s = (window as any).__duelState();
      (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { o: { ...s.o, bf: bears } } });
    }, oBf);
    await page.waitForTimeout(100);
  }

  const aaIid = await page.evaluate(
    () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'animate_artifact')?.iid,
  );
  return { aaIid };
}

// Click the Animate Artifact hand card, then Cast, entering targeting mode.
// Both DuelScreen.tsx (data-testid="hand-card-<iid>") and DuelScreenMobile.tsx
// (data-testid="hand-card", static) hand cards carry data-iid={card.iid}, so
// that is the one selector that works for both render paths.
async function enterAnimateArtifactCastFlow(page: Page, aaIid: string) {
  const handCard = page.locator(`[data-iid="${aaIid}"]`).first();
  await expect(handCard).toBeVisible({ timeout: 5000 });
  await handCard.click();
  await page.waitForTimeout(200);

  const castBtn = page.locator('[data-testid="cast-button"]').first();
  await expect(castBtn).toBeVisible({ timeout: 5000 });
  await castBtn.click();
  await page.waitForTimeout(200);

  await page.waitForFunction(() => {
    const s = (window as any).__duelState();
    return s.p.hand.some((c: any) => c.id === 'animate_artifact'); // still uncommitted -- castFlow open
  }, { timeout: 5000 });
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine-card-scenarios-1 Animate Artifact UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test('AA-E2E-01: animating a noncreature artifact shows creature P/T equal to its mana value and it can attack', async ({ page }) => {
      const { aaIid } = await setupAnimateArtifactScenario(page);
      await enterAnimateArtifactCastFlow(page, aaIid);

      const tile = page.locator(`[data-iid="${ARTIFACT_IID}"]`).first();
      await expect(tile).toBeVisible({ timeout: 5000 });
      await tile.click();
      await page.waitForTimeout(300);

      const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();
      await page.waitForTimeout(300);

      // The cast should have committed: the card left hand for the stack.
      await page.waitForFunction(
        () => !(window as any).__duelState().p.hand.some((c: any) => c.id === 'animate_artifact'),
        { timeout: 5000 },
      );
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(200);

      await expect(tile).toContainText(`${ARTIFACT_CMC}/${ARTIFACT_CMC}`);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.bf.find((c: any) => c.iid === ARTIFACT_IID)?.enchantments?.some((e: any) => e.name === 'Animate Artifact')).toBe(true);

      // Declare it as an attacker and confirm combat resolves normally
      // (unblocked -- opponent has no creatures on the battlefield).
      const oLifeBefore = state.o.life;
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { phase: 'COMBAT_ATTACKERS', active: 'p', priorityWindow: false, stack: [] } });
      });
      await page.waitForTimeout(100);
      await page.evaluate((iid) => {
        (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
      }, ARTIFACT_IID);
      await page.waitForTimeout(100);

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.attackers).toContain(ARTIFACT_IID);

      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }));
        await page.waitForTimeout(100);
      }

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.o.life).toBe(oLifeBefore - ARTIFACT_CMC);
    });

    test('AA-E2E-02: targeting restriction -- a non-artifact click is rejected, a legal artifact click completes the cast', async ({ page }) => {
      const { aaIid } = await setupAnimateArtifactScenario(page, [makeBear(BEAR_IID)]);
      await enterAnimateArtifactCastFlow(page, aaIid);

      const bear = page.locator(`[data-iid="${BEAR_IID}"]`).first();
      await expect(bear).toBeVisible({ timeout: 5000 });
      await bear.click();
      await page.waitForTimeout(300);

      // Illegal click: cast prompt remains open, card still in hand.
      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.hand.some((c: any) => c.id === 'animate_artifact')).toBe(true);
      const castPromptStillOpen = page.locator('[data-testid="cast-prompt-cancel"]').first();
      await expect(castPromptStillOpen).toBeVisible({ timeout: 5000 });

      const tile = page.locator(`[data-iid="${ARTIFACT_IID}"]`).first();
      await expect(tile).toBeVisible({ timeout: 5000 });
      await tile.click();
      await page.waitForTimeout(300);

      const confirmBtn = page.locator('[data-testid="cast-prompt-confirm"]').first();
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();
      await page.waitForTimeout(300);

      await page.waitForFunction(
        () => !(window as any).__duelState().p.hand.some((c: any) => c.id === 'animate_artifact'),
        { timeout: 5000 },
      );
      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.stack.length).toBe(1);
      expect(state.stack[0].targets).toContain(ARTIFACT_IID);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
