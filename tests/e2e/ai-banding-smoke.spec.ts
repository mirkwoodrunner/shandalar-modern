// tests/e2e/ai-banding-smoke.spec.ts
//
// Smoke test for AI banding heuristics (CR 702.22, phase 2 of 3): confirms
// the AI ('o'), driven through the real useDuelController loop (not a direct
// AI.js/DuelCore call), actually forms a band during COMBAT_ATTACKERS when
// its declared attacker set contains a high-aggression, high-value-gap
// banding-eligible pair, and that the rest of the duel plays out to
// completion with no console errors -- the same "does this crash" smoke
// coverage as tests/e2e/ai-creature-evaluation-smoke.spec.ts, scoped to the
// new banding code path.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

function makeCreature(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
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
    controller: 'o',
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

async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

// Drives the duel forward with no card-specific knowledge, same loop as
// ai-creature-evaluation-smoke.spec.ts: dismiss mulligan, decline blocks, end
// the player's turn whenever it's available, pass priority otherwise.
async function playToCompletion(page: Page, maxIterations = 400): Promise<boolean> {
  for (let i = 0; i < maxIterations; i++) {
    const over = await page.evaluate(() => !!(window as any).__duelState?.()?.over).catch(() => false);
    if (over) return true;

    await dismissMulligan(page);

    const doneBlocking = page.getByTestId('done-blocking-button');
    if (await doneBlocking.isVisible().catch(() => false)) {
      await doneBlocking.click().catch(() => {});
      continue;
    }

    const endTurn = page.getByTestId('end-turn-button');
    if (await endTurn.isVisible().catch(() => false) && await endTurn.isEnabled().catch(() => false)) {
      await endTurn.click().catch(() => {});
      await page.waitForTimeout(50);
      continue;
    }

    const passPriority = page.getByTestId('pass-priority-button');
    if (await passPriority.isVisible().catch(() => false) && await passPriority.isEnabled().catch(() => false)) {
      await passPriority.click().catch(() => {});
      continue;
    }

    await page.waitForTimeout(100);
  }
  return !!(await page.evaluate(() => (window as any).__duelState?.()?.over).catch(() => false));
}

// Gives the AI a value-gap banding pair to attack with: a cheap banding
// creature and an expensive non-banding one, with no opposing blockers so
// both are declared regardless of aggression sub-branch, and aggression
// forced to KARAG (1.0, above the 0.8 band-formation gate) via oppArch.
async function bandingAttackScenario(page: Page) {
  const cheap = makeCreature('ai-band-cheap', {
    name: 'Mesa Pegasus', keywords: ['BANDING'], power: 1, toughness: 1, controller: 'o',
  });
  const pricey = makeCreature('ai-band-pricey', {
    name: 'Craw Wurm', keywords: [], power: 8, toughness: 8, controller: 'o',
  });

  await page.evaluate(({ cheap, pricey }: any) => {
    const s = (window as any).__duelState();
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'COMBAT_ATTACKERS',
        active: 'o',
        attackers: [],
        blockers: {},
        priorityWindow: false,
        stack: [],
        oppArch: { id: 'KARAG', profileId: 'KARAG' },
        o: { ...s.o, bf: [cheap, pricey] },
        p: { ...s.p, bf: [] },
      },
    });
  }, { cheap, pricey });

  return { cheapIid: cheap.iid, priceyIid: pricey.iid };
}

async function runBandingSmoke(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto(SANDBOX_URL);
  await waitForEngineReady(page);

  const { cheapIid, priceyIid } = await bandingAttackScenario(page);

  // Give the real AI driver (useDuelController's main loop) room to run
  // planAttack -> aiDecide -> FORM_BAND before inspecting the result.
  await page.waitForFunction(
    ({ cheapIid, priceyIid }: any) => {
      const s = (window as any).__duelState();
      const c = s.o.bf.find((x: any) => x.iid === cheapIid);
      const pr = s.o.bf.find((x: any) => x.iid === priceyIid);
      return !!(c && pr && c.bandId && c.bandId === pr.bandId);
    },
    { cheapIid, priceyIid },
    { timeout: 10_000 },
  );

  const midCombat = await page.evaluate(() => (window as any).__duelState());
  const cheap = midCombat.o.bf.find((x: any) => x.iid === cheapIid);
  const pricey = midCombat.o.bf.find((x: any) => x.iid === priceyIid);
  expect(cheap.bandId).toBeTruthy();
  expect(cheap.bandId).toBe(pricey.bandId);

  const terminated = await playToCompletion(page);

  expect(pageErrors, `uncaught page errors: ${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  expect(terminated).toBe(true);
}

test.describe('@engine-ai-1 AI banding smoke -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('AI forms a band via the real driver and plays the duel to completion with no console errors', async ({ page }) => {
    test.setTimeout(90_000);
    await runBandingSmoke(page);
  });
});

test.describe('@engine-ai-1 @mobile AI banding smoke -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('AI forms a band via the real driver and plays the duel to completion with no console errors (mobile)', async ({ page }) => {
    test.setTimeout(90_000);
    await runBandingSmoke(page);
  });
});
