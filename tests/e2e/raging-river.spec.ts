// tests/e2e/raging-river.spec.ts
//
// End-to-end tests for Raging River (combat pile division and side selection).
// Tests: pile division UI, side selection UI, block restriction enforcement, cleanup.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0&cards=raging_river,raging_river';
// DuelScreenMobile is only mounted at this dedicated route -- ?duel=sandbox at a
// narrow viewport still renders the desktop DuelScreen (isMobile only controls
// its internal panel guards, not which top-level screen component is used).
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0&cards=raging_river,raging_river';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// DuelScreenMobile.tsx never renders a node with data-testid="duel-screen" (only
// DuelScreen.tsx does); the sandbox-mobile route's outer wrapper is
// duel-screen-wrapper (see App.jsx SandboxMobileApp).
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

// Forces a Raging River attack via direct state injection (DEBUG_SET_ACTIVE), the
// same deterministic pattern used by other combat e2e specs (see
// batch1a-desert-landwalk.spec.ts). `riverWho` controls Raging River and attacks;
// the other player is the defender who must divide their non-flying creatures.
// Dispatching ADVANCE_PHASE from COMBAT_ATTACKERS with s.attackers populated fires
// the real ON_ATTACKS_DECLARED trigger through the actual reducer -- this is not a
// synthetic/faked pendingRiverDivide, it is produced by the same code path real
// play uses.
async function triggerRagingRiverAttack(page: Page, riverWho: 'p' | 'o'): Promise<{ defenderWho: 'p' | 'o'; atkIid: string; defIid: string }> {
  const defenderWho: 'p' | 'o' = riverWho === 'p' ? 'o' : 'p';
  const atkIid = `e2e-river-atk-${riverWho}`;
  const riverIid = `e2e-river-enchant-${riverWho}`;
  const defIid = `e2e-river-def-${defenderWho}`;

  await page.evaluate(({ riverWho, defenderWho, atkIid, riverIid, defIid }) => {
    const s = (window as any).__duelState();
    const attacker = {
      iid: atkIid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
      color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [], tapped: false,
      summoningSick: false, attacking: true, blocking: null, damage: 0, counters: {},
      eotBuffs: [], enchantments: [], controller: riverWho,
    };
    const river = {
      iid: riverIid, id: 'raging_river', name: 'Raging River', type: 'Enchantment', color: 'R',
      cmc: 2, cost: 'RR', keywords: [], tapped: false, controller: riverWho,
      triggeredAbilities: [{ id: 'raging_river_attack', trigger: { event: 'ON_ATTACKS_DECLARED', scope: 'controller' }, effect: { type: 'ragingRiverDivide' } }],
    };
    const defender = {
      iid: defIid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
      color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [], tapped: false,
      summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
      eotBuffs: [], enchantments: [], controller: defenderWho,
    };

    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'COMBAT_ATTACKERS',
        active: riverWho,
        attackers: [atkIid],
        blockers: {},
        priorityWindow: false,
        stack: [],
        [riverWho]: { ...s[riverWho], bf: [attacker, river] },
        [defenderWho]: { ...s[defenderWho], bf: [defender] },
      },
    });
    (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' });
  }, { riverWho, defenderWho, atkIid, riverIid, defIid });

  return { defenderWho, atkIid, defIid };
}

test.describe('@engine Raging River', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('RR-UI-01: AI attacks with Raging River — human sees divide panel, confirming does not hang the phase', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await dismissMulligan(page);
    await waitForMain1(page);

    // AI ('o') controls Raging River and attacks -> human ('p') is the defender.
    const { defIid } = await triggerRagingRiverAttack(page, 'o');

    const budgetHit = await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s?.pendingRiverDivide?.defender === 'p';
    }, { timeout: 5_000 }).then(() => false).catch(() => true);
    expect(budgetHit, 'pendingRiverDivide.defender never became "p" -- turn budget exhausted without triggering the human-defends scenario').toBe(false);

    const dividePanel = page.getByTestId('river-divide-panel');
    await expect(dividePanel).toBeVisible({ timeout: 5_000 });

    // Panel content must reflect the human's (s.p.bf) creatures, not the AI's.
    await expect(page.getByTestId(`river-toggle-${defIid}`)).toBeVisible();
    expect(await page.locator('[data-testid^="river-toggle-"]').count()).toBe(1);

    await page.getByTestId('river-divide-confirm').click();

    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return !s?.pendingRiverDivide;
    }, { timeout: 5_000 });

    // No deadlock: pendingRiverSides (chooser 'o', auto-resolved by the AI loop)
    // must also clear and the phase must move past COMBAT_AFTER_ATTACKERS.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return !!s && !s.pendingRiverDivide && !s.pendingRiverSides &&
        s.phase !== 'COMBAT_ATTACKERS' && s.phase !== 'COMBAT_AFTER_ATTACKERS';
    }, { timeout: 10_000 });
  });

  test('RR-UI-02: human attacks with Raging River — AI divides its own creatures automatically, no panel shown to human', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await dismissMulligan(page);
    await waitForMain1(page);

    // Human ('p') controls Raging River and attacks -> AI ('o') is the defender.
    await triggerRagingRiverAttack(page, 'p');

    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s?.pendingRiverDivide?.defender === 'o';
    }, { timeout: 5_000 });

    // Poll briefly: the divide panel must never appear for the human while the
    // AI's own defender-divide is pending.
    const dividePanel = page.getByTestId('river-divide-panel');
    let sawPanel = false;
    for (let i = 0; i < 10; i++) {
      if (await dividePanel.isVisible().catch(() => false)) { sawPanel = true; break; }
      const stillPending = await page.evaluate(() => !!(window as any).__duelState?.()?.pendingRiverDivide).catch(() => false);
      if (!stillPending) break;
      await page.waitForTimeout(100);
    }
    expect(sawPanel, 'river-divide-panel must not render while the AI is dividing its own creatures').toBe(false);

    // pendingRiverDivide must clear on its own via useDuelController's AI loop.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return !s?.pendingRiverDivide;
    }, { timeout: 5_000 });

    // The human's own attacker-side choice (chooser 'p') should now be shown.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s?.pendingRiverSides?.chooser === 'p';
    }, { timeout: 5_000 });
    await expect(page.getByTestId('river-sides-panel')).toBeVisible({ timeout: 5_000 });
  });

  test('RR-UI-04: duel completes without river-related errors (smoke test)', async ({ page }) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await dismissMulligan(page);

    // Run for several turns to potentially trigger river mechanics. 400 iterations
    // / 90s timeout matches the budget other "play a real duel to completion" smoke
    // tests use (see ai-banding-smoke.spec.ts) -- this loop declares no attackers of
    // its own, so completion depends entirely on the AI's own combat decisions.
    for (let i = 0; i < 400; i++) {
      const over = await page.evaluate(() => !!(window as any).__duelState?.()?.over).catch(() => false);
      if (over) break;

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
        await page.waitForTimeout(50);
      }

      await page.waitForTimeout(100);
    }

    // Excludes scryfallArt network-fetch noise (this sandboxed test environment has
    // no route to scryfall.com, and "Fetch failed for \"Raging River\"" is expected,
    // unrelated card-art noise that would otherwise false-positive-match on "River").
    const riverErrors = consoleErrors.filter(e =>
      (e.includes('river') || e.includes('River')) && !e.includes('scryfallArt') && !e.includes('Fetch failed')
    );
    expect(riverErrors, 'river-related console errors').toEqual([]);
    expect(await page.evaluate(() => !!(window as any).__duelState?.()?.over)).toBe(true);
  });
});

test.describe('@engine @mobile Raging River — mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('RR-UI-03: river divide panel — mobile viewport parity', async ({ page }) => {
    await page.goto(SANDBOX_MOBILE_URL);
    await waitForDuelMobile(page);
    await dismissMulligan(page);
    await waitForMain1(page);

    const { defIid } = await triggerRagingRiverAttack(page, 'o');

    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s?.pendingRiverDivide?.defender === 'p';
    }, { timeout: 5_000 });

    const dividePanel = page.getByTestId('river-divide-panel');
    await expect(dividePanel).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId(`river-toggle-${defIid}`)).toBeVisible();
    expect(await page.locator('[data-testid^="river-toggle-"]').count()).toBe(1);

    await page.getByTestId('river-divide-confirm').click();

    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return !s?.pendingRiverDivide;
    }, { timeout: 5_000 });
  });
});
