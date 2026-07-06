// tests/e2e/tokens-and-poison.spec.ts
//
// End-to-end coverage for the token-creation infrastructure and poison
// counters batch:
//   - The Hive: {5},{T} creates a 1/1 Wasp token that renders on the
//     battlefield on both desktop and mobile viewports.
//   - Poison counters: the Banner component (desktop AND mobile -- two
//     separate files, see docs/SYSTEMS.md) shows a poison indicator once
//     either player has 1+ poison counters.
//
// Sandbox escape hatches used (see docs/CLAUDE.md "Escape hatches"):
//   window.__duelDispatch(action) -- drive the engine directly
//   window.__duelState()          -- read current GameState snapshot
//   DEBUG_SET_ACTIVE { patch }    -- inject arbitrary state

import { test, expect, Page } from '@playwright/test';

const DUEL_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForDuelReady(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 15000 });
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' && typeof (window as any).__duelState === 'function',
    null,
    { timeout: 10000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(200);
  }
}

// ---------------------------------------------------------------------------
// The Hive -- token creation renders on the battlefield
// ---------------------------------------------------------------------------
for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine @mobile The Hive creates a Wasp token [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('activating The Hive creates a 1/1 Wasp token that appears on the battlefield', async ({ page }) => {
      await page.goto(DUEL_URL);
      await waitForDuelReady(page);

      const hive = {
        iid: 'hive-e2e', id: 'the_hive', name: 'The Hive', type: 'Artifact', controller: 'p',
        tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 5,
        activated: { cost: '5,T', effect: 'createWaspToken' },
      };

      await page.evaluate((hive) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1',
            active: 'p',
            p: { ...s.p, bf: [hive], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } },
          },
        });
      }, hive);
      await page.waitForTimeout(150);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hive-e2e' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      const wasp = state.p.bf.find((c: any) => c.isToken && c.tokenId === 'wasp');
      expect(wasp).toBeTruthy();
      expect(wasp.power).toBe(1);
      expect(wasp.toughness).toBe(1);

      await expect(page.locator(`[data-iid="${wasp.iid}"]`)).toBeVisible({ timeout: 3000 });
    });
  });
}

// ---------------------------------------------------------------------------
// Poison counters -- Banner display (desktop and mobile Banner are separate
// components, each edited independently; verify both render the indicator).
// ---------------------------------------------------------------------------
for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine @mobile Poison counter display [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('the opponent poison counter total renders once a poison-granting creature connects', async ({ page }) => {
      await page.goto(DUEL_URL);
      await waitForDuelReady(page);

      // No poison yet -- indicator absent.
      const before = await page.locator('[data-testid="banner-you"]').textContent();
      expect((before ?? '').toLowerCase()).not.toContain('poison');

      const viper = {
        iid: 'viper-e2e', id: 'marsh_viper', name: 'Marsh Viper', type: 'Creature', subtype: 'Snake', color: 'G',
        controller: 'o', power: 1, toughness: 2, tapped: false, summoningSick: false, attacking: false, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], keywords: [],
        triggeredAbilities: [{ id: 'marsh_viper_poison', trigger: { event: 'ON_DAMAGE_DEALT' }, condition: { type: 'selfIsDamageSourceToPlayer' }, effect: { type: 'grantPoisonCounters', amount: 2 } }],
      };

      await page.evaluate((viper) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'COMBAT_ATTACKERS',
            active: 'o',
            o: { ...s.o, bf: [viper] },
          },
        });
      }, viper);
      await page.waitForTimeout(150);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid: 'viper-e2e' });
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
      });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.poisonCounters).toBe(2);

      await expect(page.locator('[data-testid="banner-you"]')).toContainText(/poison/i);
    });
  });
}
