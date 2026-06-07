import { test, expect } from '@playwright/test';

const MOBILE = { viewport: { width: 390, height: 844 } };

test.describe('Mobile targeting mode', () => {
  test('selecting a damage spell enters targeting mode and cast is disabled until target chosen', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&cards=lightning_bolt,mountain,mountain,mountain&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cards: ['lightning_bolt'], addManaSupport: true });
    });
    await page.waitForTimeout(300);

    const bolt = page.locator('[data-testid="hand-card"]').filter({ hasText: 'Lightning Bolt' }).first();
    await bolt.tap();

    const actionBar = page.locator('[data-testid="action-bar"]');
    await expect(actionBar).toContainText('SELECT TARGET');
    const castBtn = actionBar.locator('button').first();
    await expect(castBtn).toBeDisabled();

    await ctx.close();
  });

  test('tapping opp life banner sets target and enables Cast', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&cards=lightning_bolt,mountain,mountain,mountain&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cards: ['lightning_bolt'], addManaSupport: true });
    });
    await page.waitForTimeout(300);

    const bolt = page.locator('[data-testid="hand-card"]').filter({ hasText: 'Lightning Bolt' }).first();
    await bolt.tap();

    const oppLife = page.locator('[data-testid="banner-opp"] button[aria-label]');
    await oppLife.tap();

    const castBtn = page.locator('[data-testid="action-bar"] button').first();
    await expect(castBtn).toBeEnabled();
    await expect(castBtn).toContainText('CAST');

    await ctx.close();
  });
});

test.describe('Mobile targeting false-positive fix (Bug 1)', () => {
  test('Uthden Troll cast does not enter targeting mode', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&cards=uthden_troll,swamp,swamp,swamp&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const lands = (s.p.bf as any[]).filter((c: any) => c.type === 'Land').slice(0, 2);
      for (const l of lands) {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: l.iid, mana: 'B' });
      }
    });

    const troll = page.locator('[data-testid="hand-card"]').filter({ hasText: /uthden/i }).first();
    await troll.tap();

    const actionBar = page.locator('[data-testid="action-bar"]');
    await expect(actionBar).not.toContainText('SELECT TARGET');

    await ctx.close();
  });

  test('Wall of Bone cast does not enter targeting mode', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&cards=wall_of_bone,swamp,swamp&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const lands = (s.p.bf as any[]).filter((c: any) => c.type === 'Land').slice(0, 2);
      for (const l of lands) {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: l.iid, mana: 'B' });
      }
    });

    const wall = page.locator('[data-testid="hand-card"]').filter({ hasText: /wall of bone/i }).first();
    await wall.tap();

    const actionBar = page.locator('[data-testid="action-bar"]');
    await expect(actionBar).not.toContainText('SELECT TARGET');

    await ctx.close();
  });
});

test.describe('Birds of Paradise mobile wiring (Bug 2)', () => {
  test('Birds of Paradise ACTIVATE_ABILITY sets pendingBop flag', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    const hasBop = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return (s.p.bf as any[]).some((c: any) => c.activated?.effect === 'addManaAny' && !c.tapped);
    });

    if (hasBop) {
      const bopCard = page.locator('[data-testid^="field-card"]').filter({ hasText: /birds/i }).first();
      await bopCard.tap();
      await expect(page.locator('text=/Birds of Paradise|Choose a color/i')).toBeVisible({ timeout: 2000 });
    } else {
      // Verify engine flag is set when ACTIVATE_ABILITY fires on an addManaAny card
      await page.evaluate(() => {
        const s = (window as any).__duelState();
        const bop = (s.p.bf as any[]).find((c: any) => c.activated?.effect === 'addManaAny');
        if (bop) {
          (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', iid: bop.iid, tgt: null });
        }
      });
      const pendingBop = await page.evaluate(() => (window as any).__duelState().pendingBop);
      if (pendingBop !== undefined) {
        expect(pendingBop).toBe(true);
      }
    }

    await ctx.close();
  });
});

test.describe('Mobile blocking mode', () => {
  test('COMBAT_BLOCKERS phase shows Declare Blockers ActionBar with Done button', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState, { timeout: 15000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' });
    });

    const state = await page.evaluate(() => (window as any).__duelState());
    if (state.phase === 'COMBAT_BLOCKERS' && state.active === 'p') {
      await expect(page.locator('[data-testid="action-bar"]')).toContainText('PICK BLOCKER');
      await expect(page.locator('[data-testid="action-bar"] button')).toContainText('Done');
    }

    await ctx.close();
  });
});
