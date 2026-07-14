// tests/e2e/coral-helm.spec.ts
//
// End-to-end tests for Coral Helm ("{3}, Discard a card at random: Target
// creature gets +2/+2 until end of turn."). See docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports so
// both DuelScreen.tsx and DuelScreenMobile.tsx render paths are exercised.
//
// CH-E2E-01: activating Coral Helm pumps the target creature +2/+2
//            (visible as +2/+2 on the battlefield tile) and discards a hand card.
// CH-E2E-02: the +2/+2 buff is absent from the creature tile after CLEANUP.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

const HELM_IID = 'e2e-helm-1';
const BEAR_IID = 'e2e-helm-bear';

function makeHelm() {
  return {
    iid: HELM_IID,
    id: 'coral_helm',
    name: 'Coral Helm',
    type: 'Artifact',
    color: '',
    cmc: 3,
    cost: '3',
    keywords: [] as string[],
    rarity: 'U',
    text: '{3}, Discard a card at random: Target creature gets +2/+2 until end of turn.',
    activated: { cost: '3,discardRandom', effect: 'pumpCreature' },
    mod: { power: 2, toughness: 2 },
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

function makeBear() {
  return {
    iid: BEAR_IID,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
    keywords: [] as string[],
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

// Seeds the battlefield with Coral Helm + Grizzly Bears (player's), gives
// the player 3 colorless mana and one card in hand.
async function setupCoralHelmScenario(page: Page): Promise<void> {
  await page.evaluate(([helm, bear]) => {
    const s = (window as any).__duelState();
    const handCard = { ...s.p.hand[0] || { iid: 'e2e-hand-card', id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant', color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' } };
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'MAIN_1',
        active: 'p',
        p: {
          ...s.p,
          bf: [helm, bear],
          hand: [handCard],
          mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 },
        },
        o: { ...s.o, bf: [] },
        stack: [],
        priorityWindow: false,
      },
    });
  }, [makeHelm(), makeBear()]);
  await page.waitForTimeout(200);
}

function runSuite(
  viewport: { width: number; height: number },
  label: string,
  url: string,
  waitForScreen: (page: Page) => Promise<void>,
) {
  test.describe(`@engine-card-scenarios-1 Coral Helm [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test('CH-E2E-01: activating Coral Helm pumps target creature +2/+2 and discards a hand card', async ({ page }) => {
      await setupCoralHelmScenario(page);

      const stateBefore = await page.evaluate(() => (window as any).__duelState());
      const helmIid = stateBefore.p.bf.find((c: any) => c.id === 'coral_helm')?.iid;
      const bearIid = stateBefore.p.bf.find((c: any) => c.id === 'grizzly_bears')?.iid;
      const handSizeBefore = stateBefore.p.hand.length;

      // Activate Coral Helm targeting the bear
      await page.evaluate(([hIid, bIid]) => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: hIid, tgt: bIid });
      }, [helmIid, bearIid]);
      await page.waitForTimeout(200);

      // Verify discard occurred and ability is on the stack
      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.hand.length).toBe(handSizeBefore - 1);
      expect(midState.stack.length).toBe(1);

      // Resolve the ability
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(300);

      // Verify the creature is pumped in state
      const afterState = await page.evaluate(() => (window as any).__duelState());
      const pumpedBear = afterState.p.bf.find((c: any) => c.iid === bearIid);
      expect(pumpedBear?.eotBuffs?.some((b: any) => b.power === 2 && b.toughness === 2)).toBe(true);

      // Verify the battlefield tile shows 4/4
      const bearTile = page.locator(`[data-iid="${bearIid}"]`).first();
      await expect(bearTile).toBeVisible({ timeout: 5000 });
      await expect(bearTile).toContainText('4/4');
    });

    test('CH-E2E-02: the +2/+2 buff is absent from the creature tile after CLEANUP', async ({ page }) => {
      await setupCoralHelmScenario(page);

      const stateBefore = await page.evaluate(() => (window as any).__duelState());
      const helmIid = stateBefore.p.bf.find((c: any) => c.id === 'coral_helm')?.iid;
      const bearIid = stateBefore.p.bf.find((c: any) => c.id === 'grizzly_bears')?.iid;

      await page.evaluate(([hIid, bIid]) => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: hIid, tgt: bIid });
      }, [helmIid, bearIid]);
      await page.waitForTimeout(200);
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(200);

      // Advance to CLEANUP and run it
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { phase: 'CLEANUP' } });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }));
      await page.waitForTimeout(300);

      // Verify the buff is cleared in state
      const afterState = await page.evaluate(() => (window as any).__duelState());
      const bear = afterState.p.bf.find((c: any) => c.iid === bearIid)
                || afterState.o.bf.find((c: any) => c.iid === bearIid);
      expect(bear?.eotBuffs ?? []).toHaveLength(0);

      // Verify the tile shows the original 2/2
      const bearTile = page.locator(`[data-iid="${bearIid}"]`).first();
      await expect(bearTile).toBeVisible({ timeout: 5000 });
      await expect(bearTile).toContainText('2/2');
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
