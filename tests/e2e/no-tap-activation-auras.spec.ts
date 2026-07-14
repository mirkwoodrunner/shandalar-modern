// tests/e2e/no-tap-activation-auras.spec.ts
//
// End-to-end tests for tap centralization Phase 2: Artifact Possession,
// Haunting Wind, and Powerleech, all of which watch for the new
// ON_ABILITY_ACTIVATED_NO_TAP event in addition to Phase 1's ON_TAP. See
// docs/ENGINE_CONTRACT_SPEC.md S7.6 and docs/MECHANICS_INDEX.md.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm both DuelScreen.tsx and DuelScreenMobile.tsx
// render paths behave the same way.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

function makeArtifact(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 1, cost: '1', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'o',
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
  test.describe(`@engine-core-mechanics-1 No-tap-activation Auras UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test('Artifact Possession: activating the enchanted artifact\'s non-tap-cost mana ability deals 2 damage and updates life', async ({ page }) => {
      // The addMana ACTIVATE_ABILITY branch hardcodes its effect to player 'p'
      // regardless of `who` (a pre-existing, out-of-scope convention -- see
      // ACTIVATE_ABILITY comments in DuelCore.js) -- exactly what happens for
      // every real UI-driven activation, since a human player can only ever
      // activate their own permanents. The enchanted mana rock is the
      // player's own artifact here for that reason.
      const rock = makeArtifact('ap-rock-1', {
        controller: 'p', activated: { cost: '', effect: 'addMana', mana: 'C' },
      });
      const possession = {
        iid: 'ap-aura-1', id: 'artifact_possession', name: 'Artifact Possession', type: 'Enchantment', subtype: 'Aura',
        color: 'B', cmc: 3, cost: '2B', keywords: [], tapped: false, damage: 0, counters: {},
        eotBuffs: [], enchantments: [], controller: 'p', enchantedArtifactIid: 'ap-rock-1',
        triggeredAbilities: [
          { id: 'artifact_possession_tap', trigger: { event: 'ON_TAP' }, condition: { type: 'enchantedHostTapped' }, effect: { type: 'artifactPossessionDamage' } },
          { id: 'artifact_possession_no_tap_activation', trigger: { event: 'ON_ABILITY_ACTIVATED_NO_TAP' }, condition: { type: 'enchantedHostTapped' }, effect: { type: 'artifactPossessionDamage' } },
        ],
      };

      await page.evaluate(({ possession, rock }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [possession, rock], life: 20 },
          },
        });
      }, { possession, rock });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ap-rock-1' });
      });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.life).toBe(18);
      expect(state.log.some((e: any) => (e.text ?? '').includes('Artifact Possession deals 2 damage'))).toBe(true);
      await expect(page.locator('[data-iid="player-p"]')).toContainText('18');
    });

    test('Haunting Wind: tapping any artifact on the battlefield deals 1 damage to its controller', async ({ page }) => {
      const art = makeArtifact('hw-art-1', { controller: 'o' });
      const haunting = {
        iid: 'hw-ench-1', id: 'haunting_wind', name: 'Haunting Wind', type: 'Enchantment',
        color: 'B', cmc: 4, cost: '3B', keywords: [], tapped: false, damage: 0, counters: {},
        eotBuffs: [], enchantments: [], controller: 'p',
        triggeredAbilities: [
          { id: 'haunting_wind_tap', trigger: { event: 'ON_TAP' }, condition: { type: 'affectedPermanentIsArtifact' }, effect: { type: 'hauntingWindDamage' } },
          { id: 'haunting_wind_no_tap_activation', trigger: { event: 'ON_ABILITY_ACTIVATED_NO_TAP' }, condition: { type: 'affectedPermanentIsArtifact' }, effect: { type: 'hauntingWindDamage' } },
        ],
      };

      await page.evaluate(({ haunting, art }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [haunting], life: 20 },
            o: { ...s.o, bf: [art], life: 20 },
          },
        });
      }, { haunting, art });
      await page.waitForTimeout(50);

      // The artifact's own {T} ability -- a real dispatch through the generic
      // ACTIVATE_ABILITY tap-cost choke point (tapPermanent), same as any
      // other artifact's {T} ability, regardless of which player controls it.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'o', iid: 'hw-art-1' });
      });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.o.life).toBe(19);
      expect(state.log.some((e: any) => (e.text ?? '').includes('Haunting Wind deals 1 damage'))).toBe(true);
      await expect(page.locator('[data-iid="player-o"]')).toContainText('19');
    });

    test("Powerleech: an opponent's artifact tapping gains the caster 1 life, but the caster's own artifact does not", async ({ page }) => {
      const oppArt = makeArtifact('pl-opp-art-1', { controller: 'o' });
      const ownArt = makeArtifact('pl-own-art-1', { controller: 'p' });
      const powerleech = {
        iid: 'pl-ench-1', id: 'powerleech', name: 'Powerleech', type: 'Enchantment',
        color: 'G', cmc: 2, cost: 'GG', keywords: [], tapped: false, damage: 0, counters: {},
        eotBuffs: [], enchantments: [], controller: 'p',
        triggeredAbilities: [
          { id: 'powerleech_tap', trigger: { event: 'ON_TAP' }, condition: { type: 'affectedPermanentIsOpponentArtifact' }, effect: { type: 'powerleechLifeGain' } },
          { id: 'powerleech_no_tap_activation', trigger: { event: 'ON_ABILITY_ACTIVATED_NO_TAP' }, condition: { type: 'affectedPermanentIsOpponentArtifact' }, effect: { type: 'powerleechLifeGain' } },
        ],
      };

      await page.evaluate(({ powerleech, oppArt, ownArt }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [powerleech, ownArt], life: 20 },
            o: { ...s.o, bf: [oppArt], life: 20 },
          },
        });
      }, { powerleech, oppArt, ownArt });
      await page.waitForTimeout(50);

      // The AI's ('o') own artifact taps -- Powerleech's controller ('p') gains 1 life.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'o', iid: 'pl-opp-art-1' });
      });
      await page.waitForTimeout(150);

      let state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.life).toBe(21);
      await expect(page.locator('[data-iid="player-p"]')).toContainText('21');

      // The caster's own artifact tapping does not trigger Powerleech (opponent-only).
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pl-own-art-1' });
      });
      await page.waitForTimeout(150);

      state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.life).toBe(21);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
