import { test, expect } from '@playwright/test';

// Ali from Cairo life floor -- desktop/mobile parity suite.
//
// Covers:
//   ALI-01: lethal damage is clamped to 1 when Ali is on the battlefield; duel continues.
//   ALI-02: without Ali, lethal damage kills the player normally.
//
// Each test runs at both desktop (1280x800) and mobile (390x844).
//
// Sandbox escape hatches used:
//   window.__duelDispatch(action) -- drive the engine from page.evaluate
//   window.__duelState()          -- read GameState snapshot
//   DEBUG_SET_ACTIVE { patch }    -- inject arbitrary state
//   SET_PHASE_FOR_TEST            -- advance to a phase with stack/priorityWindow cleared

const DUEL_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForDuelReady(page: any) {
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

async function runCombatWithAli(page: any, withAli: boolean) {
  await page.evaluate(({ includeAli }: { includeAli: boolean }) => {
    const s = (window as any).__duelState();

    const bigAttacker = {
      iid: 'att-test-1',
      id: 'grizzly_bears',
      name: 'Grizzly Bears',
      type: 'Creature',
      subtype: 'Bear',
      color: 'G',
      cmc: 2,
      cost: '1G',
      power: 10,
      toughness: 10,
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: true,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'o',
    };

    const aliCard = {
      iid: 'ali-test-1',
      id: 'ali_from_cairo',
      name: 'Ali from Cairo',
      type: 'Creature',
      subtype: 'Human',
      color: 'R',
      cmc: 4,
      cost: '2RR',
      power: 0,
      toughness: 1,
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'p',
      lifeFloor: 1,
    };

    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'COMBAT_AFTER_BLOCKERS',
        active: 'o',
        priorityWindow: false,
        stack: [],
        priorityPasser: null,
        p: { ...s.p, life: 3, bf: includeAli ? [aliCard] : [] },
        o: { ...s.o, bf: [bigAttacker] },
        attackers: ['att-test-1'],
        blockers: {},
      },
    });
  }, { includeAli: withAli });

  await page.waitForTimeout(100);

  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' });
  });

  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// DESKTOP (1280x800)
// ---------------------------------------------------------------------------
test.describe('@engine-card-scenarios-1 Life floor — Ali from Cairo [desktop]', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('ALI-01: lethal damage is floored at 1 when Ali is on battlefield', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await runCombatWithAli(page, true);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { life: s.p.life as number, over: s.over };
    });

    expect(result.life, 'player life should be clamped to 1').toBe(1);
    expect(result.over, 'duel should not be over').toBeNull();
  });

  test('ALI-02: lethal damage kills player normally when Ali is absent', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await runCombatWithAli(page, false);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { life: s.p.life as number, over: s.over };
    });

    expect(result.life, 'player life should drop below 0').toBeLessThan(1);
    expect(result.over, 'duel should be over').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MOBILE (390x844)
// ---------------------------------------------------------------------------
test.describe('@engine-card-scenarios-1 Life floor — Ali from Cairo [mobile]', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ALI-01: lethal damage is floored at 1 when Ali is on battlefield', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await runCombatWithAli(page, true);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { life: s.p.life as number, over: s.over };
    });

    expect(result.life, 'player life should be clamped to 1').toBe(1);
    expect(result.over, 'duel should not be over').toBeNull();
  });

  test('ALI-02: lethal damage kills player normally when Ali is absent', async ({ page }) => {
    await page.goto(DUEL_URL);
    await waitForDuelReady(page);
    await runCombatWithAli(page, false);

    const result = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { life: s.p.life as number, over: s.over };
    });

    expect(result.life, 'player life should drop below 0').toBeLessThan(1);
    expect(result.over, 'duel should be over').not.toBeNull();
  });
});
