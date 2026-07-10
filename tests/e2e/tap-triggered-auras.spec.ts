// tests/e2e/tap-triggered-auras.spec.ts
//
// End-to-end tests for the three Kudzu-style ON_TAP-triggered Auras unstubbed
// alongside tap centralization Phase 1: Blight, Psychic Venom, and Relic Bind.
// See docs/ENGINE_CONTRACT_SPEC.md S7.5 and docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm both DuelScreen.tsx and DuelScreenMobile.tsx
// render paths behave the same way.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

function makeLand(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'forest', name: 'Forest', type: 'Land', subtype: 'Forest', color: '',
    cmc: 0, cost: '', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], produces: ['G'], controller: 'o',
    ...overrides,
  };
}

function makeArtifact(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 1, cost: '1', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'o',
    // A harmless {T} ability with no other effect -- gives this artifact a real,
    // dispatchable tap path through the engine's generic ACTIVATE_ABILITY
    // tap-cost choke point (tapPermanent), the same site every other artifact's
    // {T} ability routes through.
    activated: { cost: 'T', effect: 'stub' },
    ...overrides,
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

function runSuite(viewport: { width: number; height: number }, label: string) {
  test.describe(`@engine Tap-triggered Auras UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test('Blight: tapping the enchanted land destroys it and logs the destruction', async ({ page }) => {
      const land = makeLand('blight-land-1', { controller: 'o' });
      const blight = {
        iid: 'blight-aura-1', id: 'blight', name: 'Blight', type: 'Enchantment', subtype: 'Aura',
        color: 'B', cmc: 2, cost: 'BB', keywords: [], tapped: false, damage: 0, counters: {},
        eotBuffs: [], enchantments: [], controller: 'p', enchantedLandIid: 'blight-land-1',
        triggeredAbilities: [{ id: 'blight_tap_destroy', trigger: { event: 'ON_TAP' }, condition: { type: 'enchantedHostTapped' }, effect: { type: 'blightDestroyHost' } }],
      };

      await page.evaluate(({ blight, land }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [blight] },
            o: { ...s.o, bf: [land] },
          },
        });
      }, { blight, land });
      await page.waitForTimeout(50);

      await expect(page.locator('[data-iid="blight-land-1"]')).toBeVisible();

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'o', iid: 'blight-land-1' });
      });
      await page.waitForTimeout(150);

      await expect(page.locator('[data-iid="blight-land-1"]')).not.toBeVisible();
      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.o.gy.some((c: any) => c.iid === 'blight-land-1')).toBe(true);
      expect(state.log.some((e: any) => (e.text ?? '').includes('Blight destroys the enchanted land'))).toBe(true);
    });

    test("Psychic Venom: tapping the enchanted land deals 2 damage to the land's controller", async ({ page }) => {
      const land = makeLand('pv-land-1', { controller: 'o' });
      const venom = {
        iid: 'pv-aura-1', id: 'psychic_venom', name: 'Psychic Venom', type: 'Enchantment', subtype: 'Aura',
        color: 'U', cmc: 2, cost: '1U', keywords: [], tapped: false, damage: 0, counters: {},
        eotBuffs: [], enchantments: [], controller: 'p', enchantedLandIid: 'pv-land-1',
        triggeredAbilities: [{ id: 'psychic_venom_tap_damage', trigger: { event: 'ON_TAP' }, condition: { type: 'enchantedHostTapped' }, effect: { type: 'psychicVenomDamage' } }],
      };

      await page.evaluate(({ venom, land }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [venom] },
            o: { ...s.o, bf: [land], life: 20 },
          },
        });
      }, { venom, land });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'o', iid: 'pv-land-1' });
      });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.o.life).toBe(18);
      expect(state.log.some((e: any) => (e.text ?? '').includes('Psychic Venom deals 2 damage'))).toBe(true);
    });

    test("Relic Bind: tapping the enchanted opponent's artifact opens a modal, resolving it does not leave the phase stuck", async ({ page }) => {
      const art = makeArtifact('rb-art-1', { controller: 'o' });
      const relic = {
        iid: 'rb-aura-1', id: 'relic_bind', name: 'Relic Bind', type: 'Enchantment', subtype: 'Aura',
        color: 'U', cmc: 3, cost: '2U', keywords: [], tapped: false, damage: 0, counters: {},
        eotBuffs: [], enchantments: [], controller: 'p', enchantedArtifactIid: 'rb-art-1',
        triggeredAbilities: [{
          id: 'relic_bind_tap_modal', trigger: { event: 'ON_TAP' }, condition: { type: 'enchantedHostTapped' },
          requiresChoice: true,
          effect: { options: [{ id: 'damage', label: 'Deal 1 damage to target player.', effect: { type: 'relicBindDamage' } }, { id: 'lifegain', label: 'Target player gains 1 life.', effect: { type: 'relicBindLifegain' } }] },
        }],
      };

      await page.evaluate(({ relic, art }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [relic], life: 20 },
            o: { ...s.o, bf: [art], life: 20 },
          },
        });
      }, { relic, art });
      await page.waitForTimeout(50);

      // Have the AI ('o') activate the artifact's own {T} ability -- taps it
      // through the real ACTIVATE_ABILITY -> tapPermanent choke point, which
      // fires the ON_TAP trigger synchronously as part of paying the cost.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'o', iid: 'rb-art-1' });
      });
      await page.waitForTimeout(150);

      const modal = page.locator('[data-testid="choice-modal"]');
      await expect(modal).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="choice-option-damage"]')).toBeVisible();
      await expect(page.locator('[data-testid="choice-option-lifegain"]')).toBeVisible();

      await page.locator('[data-testid="choice-option-damage"]').click();
      await page.waitForTimeout(150);

      await expect(modal).not.toBeVisible();
      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.pendingChoice).toBeFalsy();
      expect(state.o.life).toBe(19);
      expect(state.phase).toBe('MAIN_1');
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
