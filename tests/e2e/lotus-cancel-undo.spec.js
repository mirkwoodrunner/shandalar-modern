import { test, expect } from '@playwright/test';

async function waitForSandbox(page) {
  await page.waitForFunction(() => window.__duelState && window.__duelDispatch, { timeout: 10000 });
}

async function waitForPlayerTurn(page) {
  await page.waitForFunction(
    () => window.__duelState?.().active === 'p' && window.__duelState?.().phase === 'MAIN_1',
    { timeout: 10000 }
  );
}

async function forceLotusToHand(page) {
  await page.evaluate(() =>
    window.__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cards: ['Black Lotus'] })
  );
  await page.waitForFunction(
    () => window.__duelState().p.hand.some(c => c.name === 'Black Lotus'),
    { timeout: 5000 }
  );
}

async function playLotusToField(page) {
  const lotusIid = await page.evaluate(
    () => window.__duelState().p.hand.find(c => c.name === 'Black Lotus')?.iid
  );
  await page.evaluate((iid) =>
    window.__duelDispatch({ type: 'PLAY_LAND', who: 'p', iid })
  , lotusIid);
  await page.waitForFunction(
    () => window.__duelState().p.bf.some(c => c.name === 'Black Lotus'),
    { timeout: 5000 }
  );
  return lotusIid;
}

// Suite A -- Desktop (DuelScreen.tsx)
test.describe('@engine @mobile Black Lotus -- Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await waitForSandbox(page);
    await waitForPlayerTurn(page);
    await forceLotusToHand(page);
    await playLotusToField(page);
  });

  test('T1: Cancel leaves Lotus on battlefield untapped', async ({ page }) => {
    const lotusIid = await page.evaluate(
      () => window.__duelState().p.bf.find(c => c.name === 'Black Lotus')?.iid
    );

    await page.evaluate((iid) =>
      window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid, tgt: null, chosenColor: null })
    , lotusIid);

    await page.waitForFunction(() => window.__duelState().pendingLotus === true, { timeout: 3000 });

    const onBf = await page.evaluate(
      () => window.__duelState().p.bf.some(c => c.name === 'Black Lotus')
    );
    expect(onBf).toBe(true);

    await page.evaluate(() => window.__duelDispatch({ type: 'CANCEL_LOTUS' }));

    await page.waitForFunction(() => window.__duelState().pendingLotus === false, { timeout: 3000 });

    const state = await page.evaluate(() => window.__duelState());

    const lotus = state.p.bf.find(c => c.name === 'Black Lotus');
    expect(lotus).toBeDefined();
    expect(lotus.tapped).toBe(false);
    expect(state.p.gy.some(c => c.name === 'Black Lotus')).toBe(false);
    const totalMana = Object.values(state.p.mana).reduce((a, b) => a + b, 0);
    expect(totalMana).toBe(0);
  });

  test('T3: manaTapSnapshot set after tapping Lotus (enables undo)', async ({ page }) => {
    const lotusIid = await page.evaluate(
      () => window.__duelState().p.bf.find(c => c.name === 'Black Lotus')?.iid
    );
    await page.evaluate((iid) =>
      window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid, tgt: null, chosenColor: null })
    , lotusIid);
    await page.waitForFunction(() => window.__duelState().pendingLotus === true, { timeout: 3000 });

    const snap = await page.evaluate(() => window.__duelState().manaTapSnapshot);
    expect(snap).not.toBeNull();
  });

  test('T4: Confirming color sacrifices Lotus and adds mana, snapshot cleared', async ({ page }) => {
    const lotusIid = await page.evaluate(
      () => window.__duelState().p.bf.find(c => c.name === 'Black Lotus')?.iid
    );
    await page.evaluate((iid) =>
      window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid, tgt: null, chosenColor: null })
    , lotusIid);
    await page.waitForFunction(() => window.__duelState().pendingLotus === true, { timeout: 3000 });

    await page.evaluate(() => window.__duelDispatch({ type: 'CHOOSE_LOTUS_COLOR', color: 'R' }));
    await page.waitForFunction(() => window.__duelState().pendingLotus === false, { timeout: 3000 });

    const state = await page.evaluate(() => window.__duelState());
    expect(state.p.mana.R).toBe(3);
    expect(state.p.gy.some(c => c.name === 'Black Lotus')).toBe(true);
    expect(state.p.bf.some(c => c.name === 'Black Lotus')).toBe(false);
    expect(state.manaTapSnapshot).toBeNull();
  });

  test('T5: UNDO_MANA_TAPS is blocked while pendingLotus is true', async ({ page }) => {
    const lotusIid = await page.evaluate(
      () => window.__duelState().p.bf.find(c => c.name === 'Black Lotus')?.iid
    );
    await page.evaluate((iid) =>
      window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid, tgt: null, chosenColor: null })
    , lotusIid);
    await page.waitForFunction(() => window.__duelState().pendingLotus === true, { timeout: 3000 });

    await page.evaluate(() => window.__duelDispatch({ type: 'UNDO_MANA_TAPS' }));

    const state = await page.evaluate(() => window.__duelState());
    expect(state.pendingLotus).toBe(true);
    const lotus = state.p.bf.find(c => c.name === 'Black Lotus');
    expect(lotus).toBeDefined();
    expect(lotus.tapped).toBe(true);
  });
});

// Suite B -- Mobile (DuelScreenMobile.tsx)
test.describe('@engine @mobile Black Lotus -- Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await waitForSandbox(page);
    await waitForPlayerTurn(page);
    await forceLotusToHand(page);
    await playLotusToField(page);
  });

  test('M1: Cancel leaves Lotus on battlefield untapped (mobile)', async ({ page }) => {
    const lotusIid = await page.evaluate(
      () => window.__duelState().p.bf.find(c => c.name === 'Black Lotus')?.iid
    );
    await page.evaluate((iid) =>
      window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid, tgt: null, chosenColor: null })
    , lotusIid);
    await page.waitForFunction(() => window.__duelState().pendingLotus === true, { timeout: 3000 });
    await page.evaluate(() => window.__duelDispatch({ type: 'CANCEL_LOTUS' }));
    await page.waitForFunction(() => window.__duelState().pendingLotus === false, { timeout: 3000 });

    const state = await page.evaluate(() => window.__duelState());
    const lotus = state.p.bf.find(c => c.name === 'Black Lotus');
    expect(lotus).toBeDefined();
    expect(lotus.tapped).toBe(false);
    expect(state.p.gy.some(c => c.name === 'Black Lotus')).toBe(false);
  });

  test('M2: Snapshot cleared after confirm on mobile viewport', async ({ page }) => {
    const lotusIid = await page.evaluate(
      () => window.__duelState().p.bf.find(c => c.name === 'Black Lotus')?.iid
    );
    await page.evaluate((iid) =>
      window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid, tgt: null, chosenColor: null })
    , lotusIid);
    await page.waitForFunction(() => window.__duelState().pendingLotus === true, { timeout: 3000 });
    await page.evaluate(() => window.__duelDispatch({ type: 'CHOOSE_LOTUS_COLOR', color: 'G' }));
    await page.waitForFunction(() => window.__duelState().pendingLotus === false, { timeout: 3000 });

    const snap = await page.evaluate(() => window.__duelState().manaTapSnapshot);
    expect(snap).toBeNull();
  });
});
