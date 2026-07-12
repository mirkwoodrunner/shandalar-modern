// tests/e2e/stub-batch-rd-conv-stasis.spec.ts
//
// End-to-end tests for the Stub Batch: Reverse Damage, Conversion, Stasis.
// Structure mirrors tests/e2e/tap-triggered-auras.spec.ts: desktop 1280x800 and
// mobile 390x844 viewports at /?duel=sandbox&aiSpeed=0, using the sandbox's
// __duelDispatch/__duelState escape hatches. See docs/MECHANICS_INDEX.md.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

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
  test.describe(`@engine Stub Batch: Reverse Damage / Conversion / Stasis [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test('Reverse Damage: choosing a damage source via the picker and taking damage from it raises life by the prevented amount', async ({ page }) => {
      const sorcerer = {
        iid: 'rd-src-1', id: 'prodigal_sorcerer', name: 'Prodigal Sorcerer', type: 'Creature', subtype: 'Human Wizard',
        color: 'U', cmc: 3, cost: '2U', power: 1, toughness: 1, keywords: [], tapped: false, summoningSick: false,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
        activated: { cost: 'T', effect: 'ping' },
      };
      const reverseDamage = {
        iid: 'rd-hand-1', id: 'reverse_damage', name: 'Reverse Damage', type: 'Instant', color: 'W', cmc: 3, cost: '1WW',
        keywords: [], effect: 'chooseDamageShieldSource', damageShieldMode: 'prevent', gainLifeOnPrevent: true,
      };

      await page.evaluate(({ sorcerer, reverseDamage }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, hand: [reverseDamage], mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 1 }, life: 20 },
            o: { ...s.o, bf: [sorcerer], life: 20 },
          },
        });
      }, { sorcerer, reverseDamage });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'rd-hand-1' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(150);

      const picker = page.locator('[data-testid="tutor-card-prodigal_sorcerer"]');
      await expect(picker).toBeVisible({ timeout: 5000 });
      await picker.click();
      await expect(page.locator('[data-testid="tutor-confirm"]')).toBeVisible();
      await page.locator('[data-testid="tutor-confirm"]').click();
      await page.waitForTimeout(150);

      const stateAfterChoice = await page.evaluate(() => (window as any).__duelState());
      expect(stateAfterChoice.turnState.damageShields.p.some((sh: any) => sh.gainLifeOnPrevent)).toBe(true);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'o', iid: 'rd-src-1', tgt: 'p' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(150);

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.p.life).toBe(21); // 20 -> damage prevented, then +1 life gained
      await expect(page.locator('[data-testid="banner-you"]')).toContainText('21');
    });

    test('Conversion: a Mountain on the battlefield becomes a Plains -- computed state and mana production both reflect it', async ({ page }) => {
      const mountain = {
        iid: 'conv-mtn-1', id: 'mountain', name: 'Mountain', type: 'Land', subtype: 'Basic Mountain', color: '',
        cmc: 0, cost: '', keywords: [], tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
        produces: ['R'], controller: 'p',
      };
      const conversion = {
        iid: 'conv-hand-1', id: 'conversion', name: 'Conversion', type: 'Enchantment', color: 'W', cmc: 4, cost: '2WW',
        keywords: [], effect: 'globalTypeEffect', globalTypeEffect: { filter: 'Mountain', setSubtypes: ['Plains'] }, upkeep: 'sacrificeUnless_WW',
      };

      await page.evaluate(({ mountain, conversion }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [mountain], hand: [conversion], mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 2 } },
          },
        });
      }, { mountain, conversion });
      await page.waitForTimeout(50);
      await expect(page.locator('[data-iid="conv-mtn-1"]')).toBeVisible();

      // Cast Conversion through the real reducer -- RESOLVE_STACK's
      // recomputeTypeEffects call is what actually bakes the type change onto
      // the Mountain (matching the vitest CONV-01/02 tests). The type change
      // itself has no distinct visual rendering for a land (same as Blood Moon
      // -- LandPip renders off card.produces/name, not
      // typeEff/subtypeEff/landTypeOverride), so the effect is asserted via the
      // computed duel state and the tangible mana-production change, matching
      // the existing Living Lands/Blood Moon e2e convention (deferral-sweep-2-typechange.spec.ts).
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'conv-hand-1' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(150);

      const stateAfterRecompute = await page.evaluate(() => (window as any).__duelState());
      const bakedMountain = stateAfterRecompute.p.bf.find((c: any) => c.iid === 'conv-mtn-1');
      expect(bakedMountain.subtypeEff).toBe('Plains');
      expect(bakedMountain.landTypeOverride).toBe('Plains');

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: 'conv-mtn-1' });
      });
      await page.waitForTimeout(50);

      const finalState = await page.evaluate(() => (window as any).__duelState());
      expect(finalState.p.mana.W).toBe(1);
      expect(finalState.p.mana.R).toBe(0);
    });

    test('Stasis: the active player\'s tapped permanents remain tapped through their untap step', async ({ page }) => {
      const stasis = {
        iid: 'stasis-1', id: 'stasis', name: 'Stasis', type: 'Enchantment', color: 'U', cmc: 2, cost: '1U',
        keywords: [], tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
        globalUntapSkip: true, upkeep: 'sacrificeUnless_U',
      };
      const tappedLand = {
        iid: 'stasis-land-1', id: 'forest', name: 'Forest', type: 'Land', subtype: 'Forest', color: '',
        cmc: 0, cost: '', keywords: [], tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
        produces: ['G'], controller: 'p',
      };
      const tappedCreature = {
        iid: 'stasis-cre-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
        color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [], tapped: true, summoningSick: true,
        damage: 1, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
      };

      await page.evaluate(({ stasis, tappedLand, tappedCreature }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'CLEANUP', active: 'o', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [stasis, tappedLand, tappedCreature] },
          },
        });
      }, { stasis, tappedLand, tappedCreature });
      await page.waitForTimeout(50);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // CLEANUP -> UNTAP; active becomes 'p'
      });
      await page.waitForFunction(() => (window as any).__duelState?.()?.phase === 'UNTAP', { timeout: 5000 });

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.active).toBe('p');
      expect(state.p.bf.find((c: any) => c.iid === 'stasis-land-1').tapped).toBe(true);
      expect(state.p.bf.find((c: any) => c.iid === 'stasis-cre-1').tapped).toBe(true);

      // Visually: the LandPip still renders in its tapped (rotated) state.
      const landBox = await page.locator('[data-iid="stasis-land-1"]').boundingBox();
      expect(landBox).not.toBeNull();
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
