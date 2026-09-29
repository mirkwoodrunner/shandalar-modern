// tests/e2e/duel-board-height.spec.ts
// Regression lock: the duel board's height budget must leave room for the
// player's own creatures.
//
// Before the fix, the desktop duel stacked both life banners (88px each) in the
// center column and the opponent's battlefield half could never shrink, so at
// 1280x800 the player's half was 38px tall. A 134px creature was clipped to its
// label and a click at its centre hit banner-you. Desktop banners now live in a
// left rail and both halves shrink in proportion. See docs/MECHANICS_INDEX.md.
//
// Runs at both viewports: chromium is pinned to 1280x800 (the size the bug was
// measured at), mobile-chrome is 390x844 and loads the compact duel screen the
// campaign uses at that width.

import { test, expect, type Page } from '@playwright/test';

async function seedBoard(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    { timeout: 15000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
  }

  await page.evaluate(() => {
    const d = (window as any).__duelDispatch;
    d({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    d({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['grizzly_bears', 'forest', 'forest'] });
    d({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['wall_of_wood', 'forest'] });
  });
  await page.waitForFunction(() => {
    const s = (window as any).__duelState();
    return s.p.hand.some((c: any) => c.id === 'grizzly_bears') &&
           s.o.hand.some((c: any) => c.id === 'wall_of_wood');
  }, null, { timeout: 5000 });

  // One creature and two lands for the player, one creature and a land for
  // the opponent: both halves have a land row and a creature row to fit.
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const moveToBf = (who: 'p' | 'o', ids: string[]) => {
      const hand = [...s[who].hand];
      const moved: any[] = [];
      for (const id of ids) {
        const i = hand.findIndex((c: any) => c.id === id);
        if (i >= 0) moved.push(...hand.splice(i, 1));
      }
      return { ...s[who], hand, bf: [...s[who].bf, ...moved] };
    };
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        p: moveToBf('p', ['grizzly_bears', 'forest', 'forest']),
        o: moveToBf('o', ['wall_of_wood', 'forest']),
      },
    });
  });
  await page.waitForFunction(
    () => (window as any).__duelState().p.bf.some((c: any) => c.id === 'grizzly_bears'),
    null, { timeout: 5000 },
  );
  return page.evaluate(
    () => (window as any).__duelState().p.bf.find((c: any) => c.id === 'grizzly_bears').iid as string,
  );
}

test.describe('@engine @mobile Duel board height budget', () => {
  test('a player creature is fully visible and clickable at its centre (sandbox duel)', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile-chrome';
    if (!isMobile) await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(isMobile ? '/?duel=sandbox-mobile&aiSpeed=0' : '/?duel=sandbox&aiSpeed=0');

    const iid = await seedBoard(page);
    const card = page.getByTestId(`bf-card-${iid}`);
    await expect(card).toBeVisible();
    // The mobile battlefield is a scroll area; bring the card into it the way
    // a player would before measuring.
    await card.scrollIntoViewIfNeeded();

    const probe = await card.evaluate((el) => {
      const b = el.getBoundingClientRect();
      // The visible part of the card: its box intersected with every ancestor
      // that clips (the half, its scroll area, the battlefield).
      let top = b.top;
      let bottom = b.bottom;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowY !== 'visible') {
          const r = a.getBoundingClientRect();
          top = Math.max(top, r.top);
          bottom = Math.min(bottom, r.bottom);
        }
      }
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        height: b.height,
        visibleHeight: bottom - top,
        centreHitsCard: !!hit && el.contains(hit),
      };
    });
    expect(probe.visibleHeight).toBeGreaterThanOrEqual(probe.height - 0.5);
    expect(probe.centreHitsCard).toBe(true);
  });
});
