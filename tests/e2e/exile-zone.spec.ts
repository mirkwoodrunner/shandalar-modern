import { test, expect, Page } from '@playwright/test';

const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 390,  height: 844 };

const STP_CARD_ID = 'swords_to_plowshares';
const TARGET_ID   = 'grizzly_bears';

const sandboxWith = (cards: string) =>
  `/?duel=sandbox&aiSpeed=0&cards=${cards}`;

async function waitForMain1(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// Puts a Grizzly Bears on p.bf then casts Swords to Plowshares targeting it.
// Uses engine escape-hatch dispatches, matching the pattern in sandbox.spec.ts.
async function playBearThenCastSTP(page: Page): Promise<string> {
  // Fund mana: 5 of each color covers GG (bears) and W (STP)
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', withManaSupport: true });
  });

  // Cast grizzly_bears onto p.bf
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const bear = s.p.hand.find((c: any) => c.id === 'grizzly_bears');
    if (!bear) throw new Error('grizzly_bears not in hand');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: bear.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  });

  await page.waitForFunction(
    () => (window as any).__duelState?.()?.p?.bf?.some((c: any) => c.id === 'grizzly_bears'),
    { timeout: 5_000 }
  );

  const bearIid: string = await page.evaluate(() =>
    (window as any).__duelState().p.bf.find((c: any) => c.id === 'grizzly_bears')?.iid
  );

  // Cast STP targeting the bear (remaining mana from withManaSupport covers W)
  await page.evaluate((tgtIid: string) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const stp = s.p.hand.find((c: any) => c.id === 'swords_to_plowshares');
    if (!stp) throw new Error('swords_to_plowshares not in hand');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: stp.iid, tgt: tgtIid, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  }, bearIid);

  await page.waitForFunction(
    () => (window as any).__duelState?.()?.stack?.length === 0,
    { timeout: 5_000 }
  );

  return bearIid;
}

// ---------------------------------------------------------------------------
test.describe('@engine-cast-flow-ui-2 @mobile Exile zone routing — desktop', () => {
  test('Swords to Plowshares moves target to exile, not graveyard', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(sandboxWith(`${STP_CARD_ID},${TARGET_ID}`));
    await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 15_000 });
    await waitForMain1(page);

    const before = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { pExile: s.p.exile.length, oExile: s.o.exile.length };
    });
    expect(before.pExile).toBe(0);
    expect(before.oExile).toBe(0);

    await playBearThenCastSTP(page);

    const after = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return {
        pGY:      s.p.gy.length,
        oGY:      s.o.gy.length,
        pExile:   s.p.exile.length,
        oExile:   s.o.exile.length,
        pExileIds: s.p.exile.map((c: any) => c.id),
      };
    });

    // The creature must be in exile
    expect(after.pExileIds).toContain(TARGET_ID);
    expect(after.pExile + after.oExile).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
test.describe('@engine-cast-flow-ui-2 @mobile Exile zone routing — mobile', () => {
  test('Swords to Plowshares moves target to exile on mobile viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(sandboxWith(`${STP_CARD_ID},${TARGET_ID}`));
    // Mobile renders DuelScreenMobile — no data-testid="duel-screen"; wait for engine.
    await page.waitForFunction(
      () => typeof (window as any).__duelState === 'function',
      { timeout: 15_000 }
    );
    await waitForMain1(page);

    const before = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { pExile: s.p.exile.length, oExile: s.o.exile.length };
    });
    expect(before.pExile).toBe(0);
    expect(before.oExile).toBe(0);

    await playBearThenCastSTP(page);

    const after = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return {
        pGY:      s.p.gy.length,
        oGY:      s.o.gy.length,
        pExile:   s.p.exile.length,
        oExile:   s.o.exile.length,
        pExileIds: s.p.exile.map((c: any) => c.id),
      };
    });

    // Same assertion as desktop — this test validates parity, not a separate code path.
    expect(after.pExileIds).toContain(TARGET_ID);
    expect(after.pExile + after.oExile).toBeGreaterThan(0);
  });
});
