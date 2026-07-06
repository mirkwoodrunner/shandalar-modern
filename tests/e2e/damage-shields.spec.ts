// tests/e2e/damage-shields.spec.ts
//
// End-to-end coverage for Circle of Protection / Eye for an Eye / Greater
// Realm of Preservation (turnState.damageShields): activating a CoP opens the
// generalized TutorModal picker (same precedent as Darkpact's
// pendingAnteExchange); choosing a source prevents that exact source's next
// damage this turn. Eye for an Eye's redirect is covered separately.
//
// Sandbox escape hatches used (see docs/CLAUDE.md "Escape hatches"):
//   window.__duelDispatch(action) -- drive the engine directly
//   window.__duelState()          -- read current GameState snapshot

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

function makeCircleOfProtectionBlack(iid: string) {
  return {
    iid, id: 'circle_of_protection_black', name: 'Circle of Protection: Black', type: 'Enchantment',
    color: 'W', cmc: 2, cost: '1W', controller: 'p', tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    activated: { cost: '1', effect: 'chooseDamageShieldSource' },
    damageShieldColors: ['B'], damageShieldMode: 'prevent',
  };
}

function makeBlackCreature(iid: string, name: string) {
  return {
    iid, id: 'sengir_vampire', name, type: 'Creature', subtype: 'Vampire', color: 'B',
    power: 4, toughness: 4, controller: 'o', tapped: false, summoningSick: false,
    attacking: true, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
  };
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine @mobile Circle of Protection: Black damage shield [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('activating it opens the TutorModal picker; choosing the attacker prevents its next damage', async ({ page }) => {
      await page.goto(DUEL_URL);
      await waitForDuelReady(page);

      const cop = makeCircleOfProtectionBlack('cop-e2e');
      const vampire = makeBlackCreature('vamp-e2e', 'Sengir Vampire');

      await page.evaluate(({ cop, vampire }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1',
            active: 'p',
            p: { ...s.p, life: 20, bf: [cop], mana: { ...s.p.mana, W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } },
            o: { ...s.o, bf: [vampire] },
          },
        });
      }, { cop, vampire });
      await page.waitForTimeout(150);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cop-e2e' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="tutor-modal"]')).toBeVisible({ timeout: 3000 });
      await page.locator('[data-testid="tutor-card-sengir_vampire"]').click();
      await expect(page.locator('[data-testid="tutor-confirm"]')).toBeVisible();
      await page.locator('[data-testid="tutor-confirm"]').click();
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="tutor-modal"]')).toHaveCount(0);
      const armed = await page.evaluate(() => (window as any).__duelState().turnState.damageShields.p);
      expect(armed).toHaveLength(1);
      expect(armed[0].chosenSourceIid).toBe('vamp-e2e');

      // Drive Sengir Vampire's unblocked combat damage through the real
      // reducer (COMBAT_AFTER_BLOCKERS -> COMBAT_DAMAGE via ADVANCE_PHASE) --
      // its damage should be fully prevented and the shield consumed.
      await page.evaluate(() => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: { phase: 'COMBAT_AFTER_BLOCKERS', active: 'o', attackers: ['vamp-e2e'], priorityWindow: false, stack: [] },
        });
      });
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }));
      await page.waitForTimeout(150);

      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        return { pLife: s.p.life, shields: s.turnState.damageShields.p };
      });
      expect(result.pLife).toBe(20); // fully prevented
      expect(result.shields).toEqual([]); // one-time -- consumed
    });
  });
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine @mobile Eye for an Eye redirect [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('casting it opens the picker with mode "redirect" and an unrestricted pool', async ({ page }) => {
      await page.goto(DUEL_URL);
      await waitForDuelReady(page);

      const efe = { iid: 'efe-e2e', id: 'eye_for_an_eye', name: 'Eye for an Eye', type: 'Instant', color: 'W', cmc: 2, cost: 'WW', effect: 'chooseDamageShieldSource', damageShieldMode: 'redirect' };
      const dragon = { iid: 'dragon-e2e', id: 'shivan_dragon', name: 'Shivan Dragon', type: 'Creature', subtype: 'Dragon', color: 'R', power: 5, toughness: 5, controller: 'o', tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };

      await page.evaluate(({ efe, dragon }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1',
            active: 'p',
            p: { ...s.p, hand: [efe], mana: { ...s.p.mana, W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 } },
            o: { ...s.o, bf: [dragon] },
          },
        });
      }, { efe, dragon });
      await page.waitForTimeout(150);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'efe-e2e' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="tutor-modal"]')).toBeVisible({ timeout: 3000 });
      await page.locator('[data-testid="tutor-card-shivan_dragon"]').click();
      await page.locator('[data-testid="tutor-confirm"]').click();
      await page.waitForTimeout(150);

      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        return { shields: s.turnState.damageShields.p, gy: s.p.gy.map((c: any) => c.iid) };
      });
      expect(result.shields).toEqual([
        { chosenSourceIid: 'dragon-e2e', chosenSourceController: 'o', mode: 'redirect', shieldSourceIid: 'efe-e2e', shieldSourceName: 'Eye for an Eye' },
      ]);
      expect(result.gy).toContain('efe-e2e');
    });
  });
}
