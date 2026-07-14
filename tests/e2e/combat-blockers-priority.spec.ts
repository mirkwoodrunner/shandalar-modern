// tests/e2e/combat-blockers-priority.spec.ts
//
// Regression: AI attacker was auto-advancing out of COMBAT_BLOCKERS before the
// human could declare blockers (useDuelController.ts AI driver effect missing
// guard for s.phase === 'COMBAT_BLOCKERS').
//
// BLOCK-E2E-01: Phase stays at COMBAT_BLOCKERS (does not auto-advance) when
//               the AI is the active/attacking player and a human blocker exists.
// BLOCK-E2E-02: Human can declare a blocker via the two-click UI flow while
//               in COMBAT_BLOCKERS (handleBfClick end-to-end).
// BLOCK-E2E-03: Negative control -- no available human blockers, phase still
//               waits in COMBAT_BLOCKERS rather than auto-advancing (confirms
//               the fix doesn't over-gate the normal no-blocker path).
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm the shared useDuelController fix reaches both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForEngineReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    { timeout: 15000 },
  );
  // Dismiss mulligan if present.
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

// Inject a COMBAT_BLOCKERS scenario: AI ('o') has an attacking creature, player
// ('p') has an untapped blocker. Returns the iids of the injected creatures.
async function injectBlockersScenario(page: Page): Promise<{ attIid: string; blIid: string }> {
  const attIid = 'e2e-att-o';
  const blIid  = 'e2e-bl-p';

  const attacker = {
    iid: attIid, id: 'grizzly_bears', name: 'War Mammoth', type: 'Creature',
    subtype: 'Elephant', color: 'G', cmc: 5, cost: '4G',
    power: 3, toughness: 3, keywords: [], tapped: false,
    summoningSick: false, attacking: true, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'o',
  };
  const blocker = {
    iid: blIid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
    subtype: 'Bear', color: 'G', cmc: 2, cost: '1G',
    power: 2, toughness: 2, keywords: [], tapped: false,
    summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
  };

  await page.evaluate(({ att, bl, aIid }: any) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'COMBAT_BLOCKERS',
        active: 'o',
        attackers: [aIid],
        blockers: {},
        priorityWindow: false,
        stack: [],
        o: { ...s.o, bf: [att] },
        p: { ...s.p, bf: [bl] },
      },
    });
  }, { att: attacker, bl: blocker, aIid: attIid });

  // Allow a React re-render cycle.
  await page.waitForTimeout(100);
  return { attIid, blIid };
}

// Inject the same scenario but with no human creatures (zero valid blockers).
async function injectNoBlockerScenario(page: Page): Promise<{ attIid: string }> {
  const attIid = 'e2e-att-o-nb';

  const attacker = {
    iid: attIid, id: 'grizzly_bears', name: 'War Mammoth', type: 'Creature',
    subtype: 'Elephant', color: 'G', cmc: 5, cost: '4G',
    power: 3, toughness: 3, keywords: [], tapped: false,
    summoningSick: false, attacking: true, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'o',
  };

  await page.evaluate(({ att, aIid }: any) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'COMBAT_BLOCKERS',
        active: 'o',
        attackers: [aIid],
        blockers: {},
        priorityWindow: false,
        stack: [],
        o: { ...s.o, bf: [att] },
        p: { ...s.p, bf: [] },
      },
    });
  }, { att: attacker, aIid: attIid });

  await page.waitForTimeout(100);
  return { attIid };
}

// ---------------------------------------------------------------------------
// Desktop suite (1280x800)
// ---------------------------------------------------------------------------

test.describe('@engine-phases-priority-1 @mobile Combat blockers priority window [desktop]', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForEngineReady(page);
  });

  // BLOCK-E2E-01: Phase must not auto-advance while human has a potential blocker.
  test('BLOCK-E2E-01: COMBAT_BLOCKERS phase stays open for human when AI is attacker', async ({ page }) => {
    await injectBlockersScenario(page);

    // Verify state was injected.
    const initial = await page.evaluate(() => (window as any).__duelState());
    expect(initial.phase).toBe('COMBAT_BLOCKERS');
    expect(initial.active).toBe('o');

    // Wait well past aiSpeed=0 to confirm the phase is NOT auto-advancing.
    await page.waitForTimeout(600);

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.phase, 'phase must remain COMBAT_BLOCKERS; AI driver must not auto-advance').toBe('COMBAT_BLOCKERS');
    expect(after.active, 'active must remain o (AI is attacker)').toBe('o');
  });

  // BLOCK-E2E-02: Human can declare a blocker via the two-click handleBfClick flow.
  test('BLOCK-E2E-02: human can declare a blocker via two-click UI flow', async ({ page }) => {
    const { attIid, blIid } = await injectBlockersScenario(page);

    // Verify starting state.
    const before = await page.evaluate(() => (window as any).__duelState());
    expect(before.phase).toBe('COMBAT_BLOCKERS');
    expect(Object.keys(before.blockers)).toHaveLength(0);

    // First click: select player's creature as the pending blocker.
    const pCreature = page.locator(`[data-iid="${blIid}"]`).first();
    await expect(pCreature).toBeVisible({ timeout: 5000 });
    await pCreature.click();
    await page.waitForTimeout(150);

    // Second click: click the AI's attacking creature to declare the block.
    const oAttacker = page.locator(`[data-iid="${attIid}"]`).first();
    await expect(oAttacker).toBeVisible({ timeout: 5000 });
    await oAttacker.click();
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.blockers[blIid], 'blockers map must contain the declared block').toBe(attIid);
  });

  // BLOCK-E2E-03: Negative control -- no available blockers, phase still waits.
  test('BLOCK-E2E-03: no available blockers -- phase still waits, not auto-advanced', async ({ page }) => {
    await injectNoBlockerScenario(page);

    const initial = await page.evaluate(() => (window as any).__duelState());
    expect(initial.phase).toBe('COMBAT_BLOCKERS');

    // Even with no blockers, the AI driver guard must not auto-advance.
    await page.waitForTimeout(600);

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.phase, 'phase must remain COMBAT_BLOCKERS even with no human blockers').toBe('COMBAT_BLOCKERS');
  });
});

// ---------------------------------------------------------------------------
// Mobile suite (390x844) -- DuelScreenMobile.tsx render path
// ---------------------------------------------------------------------------

test.describe('@engine-phases-priority-1 @mobile Combat blockers priority window [mobile]', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForEngineReady(page);
  });

  test('BLOCK-E2E-01: COMBAT_BLOCKERS phase stays open for human when AI is attacker', async ({ page }) => {
    await injectBlockersScenario(page);

    const initial = await page.evaluate(() => (window as any).__duelState());
    expect(initial.phase).toBe('COMBAT_BLOCKERS');
    expect(initial.active).toBe('o');

    await page.waitForTimeout(600);

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.phase, 'phase must remain COMBAT_BLOCKERS; AI driver must not auto-advance').toBe('COMBAT_BLOCKERS');
    expect(after.active, 'active must remain o (AI is attacker)').toBe('o');
  });

  test('BLOCK-E2E-02: human can declare a blocker via two-click UI flow', async ({ page }) => {
    const { attIid, blIid } = await injectBlockersScenario(page);

    const before = await page.evaluate(() => (window as any).__duelState());
    expect(before.phase).toBe('COMBAT_BLOCKERS');
    expect(Object.keys(before.blockers)).toHaveLength(0);

    // On mobile the battlefield uses the same data-iid attribute (FieldCard component).
    const pCreature = page.locator(`[data-iid="${blIid}"]`).first();
    await expect(pCreature).toBeVisible({ timeout: 5000 });
    await pCreature.click();
    await page.waitForTimeout(150);

    const oAttacker = page.locator(`[data-iid="${attIid}"]`).first();
    await expect(oAttacker).toBeVisible({ timeout: 5000 });
    await oAttacker.click();
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.blockers[blIid], 'blockers map must contain the declared block').toBe(attIid);
  });

  test('BLOCK-E2E-03: no available blockers -- phase still waits, not auto-advanced', async ({ page }) => {
    await injectNoBlockerScenario(page);

    const initial = await page.evaluate(() => (window as any).__duelState());
    expect(initial.phase).toBe('COMBAT_BLOCKERS');

    await page.waitForTimeout(600);

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.phase, 'phase must remain COMBAT_BLOCKERS even with no human blockers').toBe('COMBAT_BLOCKERS');
  });
});
