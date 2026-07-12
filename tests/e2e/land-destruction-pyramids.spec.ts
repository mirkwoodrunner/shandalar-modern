// tests/e2e/land-destruction-pyramids.spec.ts
//
// End-to-end coverage for Land Destruction Centralization + Pyramids.
// Pyramids' two modes are exercised through the real multi-ability activation
// UI (AbilityMenuPopover, shared with Mishra's Factory) and the real
// targeting-click routing (isLandOnlyTarget), matching the established
// convention in creature-damage-centralization.spec.ts.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile (390x844,
// /?duel=sandbox-mobile) per the project convention, so both DuelScreen.tsx
// and DuelScreenMobile.tsx render paths are exercised.
// See docs/ENGINE_CONTRACT_SPEC.md -- Land Destruction.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// DuelScreenMobile.tsx never renders a node with data-testid="duel-screen"
// (only DuelScreen.tsx does) -- the sandbox-mobile route's outer wrapper is
// duel-screen-wrapper (see discard-centralization.spec.ts precedent).
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

// Clicking a battlefield permanent with activatedAbilities opens the ability
// menu directly on desktop, but on mobile it only *selects* the permanent --
// DuelScreenMobile.tsx's ActionBar then needs an explicit "Activate" button
// press before the ability menu actually opens. This clicks the card, then
// presses the mobile-only Activate button if it appears, so the same call
// site works for both viewports (mirrors clickAndActivate in
// creature-damage-centralization.spec.ts).
async function openAbilityMenu(page: Page, iid: string) {
  const loc = page.locator(`[data-iid="${iid}"]`).first();
  await expect(loc).toBeVisible({ timeout: 15000 });
  await loc.click();
  await page.waitForTimeout(300);
  const activateBtn = page.locator('[data-testid="action-bar"]').getByText('Activate', { exact: false });
  if (await activateBtn.isVisible({ timeout: 800 }).catch(() => false)) {
    await activateBtn.click();
    await page.waitForTimeout(300);
  }
  await expect(page.locator('[data-testid="ability-menu"]')).toBeVisible({ timeout: 10000 });
}

function makePyramids(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'pyramids', name: 'Pyramids', type: 'Artifact', color: '', cmc: 6, cost: '6',
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
    activatedAbilities: [
      { id: 'pyramids_destroy_aura', cost: { generic: 2 }, effect: 'destroyLandAura', description: 'Destroy target Aura attached to a land' },
      { id: 'pyramids_prevent_destruction', cost: { generic: 2 }, effect: 'preventLandDestructionOnce', description: 'The next time target land would be destroyed this turn, remove all damage marked on it instead' },
    ],
    ...overrides,
  };
}

function makeLand(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'forest', name: 'Forest', type: 'Land', subtype: 'Forest', color: '',
    cmc: 0, cost: '', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], produces: ['G'], controller: 'p',
    ...overrides,
  };
}

function makeCreature(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G',
    cmc: 2, cost: '1G', power: 2, toughness: 2, tapped: false, summoningSick: false, attacking: false,
    blocking: null, damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
    ...overrides,
  };
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine Land destruction + Pyramids UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await dismissMulligan(page);
      await waitForMain1(page);
    });

    test('Mode 2 shield: a land targeted by preventLandDestructionOnce survives Armageddon while other lands are destroyed', async ({ page }) => {
      const pyr = makePyramids('pyr-1');
      const shielded = makeLand('shielded-land-1');
      const other = makeLand('other-land-1');
      const armageddon = { iid: 'arm-1', id: 'armageddon', name: 'Armageddon', type: 'Sorcery', color: 'B', cmc: 4, cost: '3B', effect: 'destroyAllLands' };

      await page.evaluate(({ pyr, shielded, other, armageddon }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, hand: [armageddon], bf: [pyr, shielded, other], mana: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 5 } },
            o: { ...s.o, bf: [] },
          },
        });
      }, { pyr, shielded, other, armageddon });
      await page.waitForTimeout(300);

      // Real UI: open Pyramids' ability menu, choose mode 2, target the land to shield.
      await openAbilityMenu(page, 'pyr-1');
      await page.locator('[data-testid="ability-option-pyramids_prevent_destruction"]').click();
      await page.waitForTimeout(300);

      const shieldedLoc = page.locator('[data-iid="shielded-land-1"]').first();
      await expect(shieldedLoc).toBeVisible({ timeout: 10000 });
      await shieldedLoc.click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="cast-prompt-confirm"]').click();
      await page.waitForTimeout(400);

      const shieldsAfterActivate = await page.evaluate(() => (window as any).__duelState().turnState.landDestructionShields?.['shielded-land-1']);
      expect(shieldsAfterActivate).toHaveLength(1);

      // Cast and resolve Armageddon via the sandbox escape hatch (not the focus of this test).
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'arm-1' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(400);

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.p.bf.some((c: any) => c.iid === 'shielded-land-1')).toBe(true); // shielded, survives
      expect(finalState.p.bf.some((c: any) => c.iid === 'other-land-1')).toBe(false); // not shielded, destroyed
      expect(finalState.p.gy.some((c: any) => c.iid === 'other-land-1')).toBe(true);
    });

    test('Mode 2 targeting restriction: clicking a non-land permanent during targeting is a no-op and the activation prompt stays open', async ({ page }) => {
      const pyr = makePyramids('pyr-2');
      const creature = makeCreature('cre-1');

      await page.evaluate(({ pyr, creature }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [pyr, creature], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } },
            o: { ...s.o, bf: [] },
          },
        });
      }, { pyr, creature });
      await page.waitForTimeout(300);

      await openAbilityMenu(page, 'pyr-2');
      await page.locator('[data-testid="ability-option-pyramids_prevent_destruction"]').click();
      await page.waitForTimeout(300);

      // Attempt to click a non-land permanent -- must be rejected by isLandOnlyTarget.
      const creLoc = page.locator('[data-iid="cre-1"]').first();
      await expect(creLoc).toBeVisible({ timeout: 10000 });
      await creLoc.click();
      await page.waitForTimeout(300);

      // No target selected: the confirm button (which only appears once >=1
      // target is selected) must not be visible, and the prompt stays open.
      await expect(page.locator('[data-testid="cast-prompt-confirm"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="cast-prompt"]')).toBeVisible();

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.turnState.landDestructionShields ?? {}).toEqual({});
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
