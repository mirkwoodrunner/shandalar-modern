import { test, expect } from '@playwright/test';

async function waitForSandbox(page) {
  await page.waitForFunction(() => window.__duelState && window.__duelDispatch, { timeout: 10000 });
}

// The sandbox boots with the mulligan modal open; it must be dismissed before
// the duel reaches MAIN_1 or every wait below times out underneath it.
// Same pattern as the 49 specs that already handle this.
async function dismissMulligan(page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

async function waitForPlayerTurn(page) {
  await page.waitForFunction(
    () => window.__duelState?.().active === 'p' && window.__duelState?.().phase === 'MAIN_1',
    { timeout: 10000 }
  );
}

// SANDBOX_FORCE_HAND's `cards` parameter takes full card OBJECTS and appends
// them to the hand with no validation (DuelCore.js, case 'SANDBOX_FORCE_HAND').
// This used to pass the string 'Black Lotus', so a raw string was appended and
// no Black Lotus instance was ever created. The wait below then passed only
// when the sandbox shuffle happened to deal a real Lotus into the opening hand,
// which is why this suite was intermittent rather than always red.
// `cardIds` is the parameter that instantiates from CARD_DB.
//
// OBSERVATION (not fixed here -- DuelCore.js is a protected file): the `cards`
// branch appends action.cards verbatim, so a malformed call silently corrupts
// the hand with a non-card entry instead of being rejected. Several other e2e
// specs pass id strings to `cards` the same way.
async function forceLotusToHand(page) {
  await page.evaluate(() =>
    window.__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cardIds: ['black_lotus'] })
  );
  await page.waitForFunction(
    () => window.__duelState().p.hand.some(c => c?.name === 'Black Lotus'),
    { timeout: 5000 }
  );
}

// Black Lotus is an Artifact, not a land. PLAY_LAND is refused for it (and
// refused silently -- nothing reaches the log), so this used to hang on the
// battlefield wait. Since Sprint 7 every non-land spell goes through the stack,
// so a zero-cost artifact is CAST_SPELL then RESOLVE_STACK.
async function playLotusToField(page) {
  const lotusIid = await page.evaluate(
    () => window.__duelState().p.hand.find(c => c?.name === 'Black Lotus')?.iid
  );
  await page.evaluate((iid) =>
    window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt: null })
  , lotusIid);
  await page.waitForFunction(
    () => window.__duelState().stack?.length > 0,
    { timeout: 5000 }
  );
  await page.evaluate(() => window.__duelDispatch({ type: 'RESOLVE_STACK' }));
  await page.waitForFunction(
    () => window.__duelState().p.bf.some(c => c?.name === 'Black Lotus'),
    { timeout: 5000 }
  );
  return lotusIid;
}

// Suite A -- Desktop (DuelScreen.tsx)
test.describe('@engine-cast-flow-ui-2 @mobile Black Lotus -- Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await waitForSandbox(page);
    await dismissMulligan(page);
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
      () => window.__duelState().p.bf.some(c => c?.name === 'Black Lotus')
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
test.describe('@engine-cast-flow-ui-2 @mobile Black Lotus -- Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await waitForSandbox(page);
    await dismissMulligan(page);
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
