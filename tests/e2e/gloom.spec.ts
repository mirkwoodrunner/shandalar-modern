// tests/e2e/gloom.spec.ts
//
// End-to-end coverage for Gloom's cost tax: "White spells cost {3} more to
// cast. Activated abilities of white enchantments cost {3} more to
// activate." Confirms the shortfall-then-success pattern is visible through
// the real castFlow UI (cast-prompt-need / cast-prompt-confirm), and that the
// printed card's own cost field is never mutated -- only the actual mana
// requirement/deduction reflects the tax. See docs/ENGINE_CONTRACT_SPEC.md.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile
// (390x844, /?duel=sandbox-mobile) per the project convention, so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths are exercised.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

function makeGloom(iid: string) {
  return {
    iid, id: 'gloom', name: 'Gloom', type: 'Enchantment', color: 'B', cmc: 3, cost: '2B',
    keywords: [] as string[], tapped: false, damage: 0, counters: {}, eotBuffs: [] as any[],
    enchantments: [] as any[], controller: 'o',
  };
}

function makeWhiteEnchAbility(iid: string) {
  return {
    iid, id: 'test_white_ench_ability', name: 'Test White Enchantment', type: 'Enchantment',
    color: 'W', cmc: 2, cost: '1W', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
    activated: { cost: '1W', effect: 'pumpPower' },
  };
}

function makeTargetCreature(iid: string) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
    color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [] as string[],
    tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
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

function runSuite(viewport: { width: number; height: number }, label: string, url: string) {
  test.describe(`@engine-card-scenarios-1 Gloom cost tax UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForEngineReady(page);
    });

    test('Spell tax: a white spell is blocked at the printed cost and succeeds once the taxed amount is funded, with the printed cost field unchanged throughout', async ({ page }) => {
      await page.evaluate(({ gloom }: any) => {
        (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: { o: { ...s.o, bf: [gloom] } },
        });
        // Healing Salve ("W"): printed cost is exactly covered, taxed cost ("W3" ->
        // W:1, generic:3) is not.
        (window as any).__duelDispatch({
          type: 'SANDBOX_FORCE_HAND',
          who: 'p',
          cardIds: ['healing_salve'],
          mana: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 },
        });
      }, { gloom: makeGloom('gloom-1') });
      await page.waitForFunction(
        () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'healing_salve'),
        { timeout: 5000 },
      );

      const iid: string = await page.evaluate(
        () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'healing_salve')?.iid,
      );

      const handCard = page.locator(`[data-iid="${iid}"]`).first();
      await expect(handCard).toBeVisible({ timeout: 5000 });
      await handCard.click();
      await page.waitForSelector('[data-testid="cast-button"]', { timeout: 5000 });
      await page.click('[data-testid="cast-button"]');

      // Printed-cost-sufficient mana is not enough -- castFlow parks in 'mana'
      // mode and the Banner shows the NEED indicator (shortfall in the UI).
      await expect(page.locator('[data-testid="cast-prompt-need"]')).toBeVisible({ timeout: 5000 });
      let state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.hand.find((c: any) => c.iid === iid)?.cost).toBe('W'); // printed cost untouched
      expect(state.stack.length).toBe(0);

      // Fund the taxed amount ({W}{3}) -- the auto-advance effect fires the cast.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { C: 3 } });
      });
      await page.waitForFunction(
        () => (window as any).__duelState().stack.length === 1,
        { timeout: 5000 },
      );

      state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.hand.some((c: any) => c.iid === iid)).toBe(false);
      expect(state.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }); // taxed amount fully spent
      expect(state.stack[0].card.cost).toBe('W'); // printed cost still unchanged on the stack item
    });

    test('Activated-ability tax: a white enchantment\'s ability is blocked at the printed cost and succeeds once the taxed amount is funded, with the printed cost field unchanged throughout', async ({ page }) => {
      const ench = makeWhiteEnchAbility('ench-1');
      const creature = makeTargetCreature('cre-1');

      await page.evaluate(({ gloom, ench, creature }: any) => {
        (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            p: { ...s.p, bf: [ench, creature], mana: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } },
            o: { ...s.o, bf: [gloom] },
          },
        });
      }, { gloom: makeGloom('gloom-1'), ench, creature });
      await page.waitForTimeout(150);

      // Desktop dispatches beginActivateFlow immediately on clicking a battlefield
      // permanent with a plain `activated` ability. Mobile instead selects the
      // permanent and reveals a separate "Activate" button (DuelScreenMobile.tsx's
      // hasNonManaActivation branch) that must be clicked first.
      const enchCard = page.locator('[data-iid="ench-1"]').first();
      await expect(enchCard).toBeVisible({ timeout: 5000 });
      await enchCard.click();
      await page.waitForTimeout(150);
      const activateBtn = page.getByRole('button', { name: /Activate/ });
      if (await activateBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await activateBtn.click();
        await page.waitForTimeout(150);
      }

      // pumpPower requires a target -- click the friendly creature, then confirm.
      const creCard = page.locator('[data-iid="cre-1"]').first();
      await expect(creCard).toBeVisible({ timeout: 5000 });
      await creCard.click();
      await page.waitForSelector('[data-testid="cast-prompt-confirm"]', { timeout: 5000 });
      await page.click('[data-testid="cast-prompt-confirm"]');

      // Printed-cost-sufficient mana ({1}{W}) is not enough for the taxed
      // ({1}{W}{3}) cost -- castFlow parks in 'mana' mode with the NEED indicator.
      await expect(page.locator('[data-testid="cast-prompt-need"]')).toBeVisible({ timeout: 5000 });
      let state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.bf.find((c: any) => c.iid === 'ench-1')?.cost).toBe('1W'); // printed cost untouched
      expect(state.stack.length).toBe(0);

      // Fund the taxed amount -- {1}{W} printed + {3} tax = {W} + 4 generic.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { C: 4 } });
      });
      await page.waitForFunction(
        () => (window as any).__duelState().stack.length === 1,
        { timeout: 5000 },
      );

      state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }); // taxed amount fully spent
      expect(state.p.bf.find((c: any) => c.iid === 'ench-1')?.cost).toBe('1W'); // printed cost still unchanged
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL);
