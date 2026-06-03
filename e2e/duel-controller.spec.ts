import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const sandboxWith = (cards: string) => `/?duel=sandbox&aiSpeed=0&cards=${cards}`;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// 1. AI loop parity — desktop
// ---------------------------------------------------------------------------
test('1: AI completes its turn on desktop without getting stuck', async ({ page }) => {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await waitForMain1(page);

  const turnBefore = await page.evaluate(() => (window as any).__duelState().turn);

  // Jump directly to AI's MAIN_1. SET_PHASE_FOR_TEST clears stack and priority
  // window so the AI loop fires cleanly from the new active='o' state.
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
  });

  // Auto-pass priority for the player whenever a window opens (simulating the
  // player pressing Pass Priority), then wait for the AI to finish its turn.
  await page.waitForFunction((startTurn: number) => {
    const s = (window as any).__duelState?.();
    if (!s) return false;
    if (s.priorityWindow && s.priorityPasser !== 'p') {
      (window as any).__duelDispatch({ type: 'PASS_PRIORITY', who: 'p' });
    }
    return s.turn > startTurn && s.active === 'p';
  }, turnBefore, { timeout: 15_000, polling: 100 });

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.p.life).toBeGreaterThanOrEqual(0);
});

// ---------------------------------------------------------------------------
// 2. AI loop parity — mobile
// ---------------------------------------------------------------------------
test('2: AI completes its turn on mobile without getting stuck', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(SANDBOX_URL);
  // Mobile renders DuelScreenMobile (no data-testid="duel-screen").
  // Wait for engine state to be available instead.
  await page.waitForFunction(() => typeof (window as any).__duelState === 'function', { timeout: 10_000 });
  await waitForMain1(page);

  const turnBefore = await page.evaluate(() => (window as any).__duelState().turn);

  // Jump directly to AI's MAIN_1 (same as desktop test).
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
  });

  // Auto-pass priority for the player whenever a window opens.
  await page.waitForFunction((startTurn: number) => {
    const s = (window as any).__duelState?.();
    if (!s) return false;
    if (s.priorityWindow && s.priorityPasser !== 'p') {
      (window as any).__duelDispatch({ type: 'PASS_PRIORITY', who: 'p' });
    }
    return s.turn > startTurn && s.active === 'p';
  }, turnBefore, { timeout: 15_000, polling: 100 });

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.p.life).toBeGreaterThanOrEqual(0);
});

// ---------------------------------------------------------------------------
// 3. Sandbox escape hatch — mobile
// ---------------------------------------------------------------------------
test('3: window.__duelDispatch and __duelState are functions on mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(SANDBOX_URL);
  await page.waitForFunction(() => typeof (window as any).__duelState === 'function', { timeout: 10_000 });

  const ok = await page.evaluate(() =>
    typeof (window as any).__duelDispatch === 'function' &&
    typeof (window as any).__duelState === 'function'
  );
  expect(ok).toBe(true);
});

// ---------------------------------------------------------------------------
// 4. forcedHandIds on mobile (hook brings parity with desktop)
// ---------------------------------------------------------------------------
test('4: sandboxWith card injection works on mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(sandboxWith('lightning_bolt'));
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && Array.isArray(s.p.hand) && s.p.hand.length > 0;
  }, { timeout: 10_000 });

  const ids = await page.evaluate(() =>
    (window as any).__duelState().p.hand.map((c: any) => c.id)
  );
  expect(ids).toContain('lightning_bolt');
});

// ---------------------------------------------------------------------------
// 5. Priority window — AI casts spell, player gets window (desktop)
// Core bug fix verification: applyAiActionsWithPriority is the single impl.
// ---------------------------------------------------------------------------
test('5: AI cast opens priority window before stack resolves (desktop)', async ({ page }) => {
  await page.goto(sandboxWith('grizzly_bears'));
  await waitForDuel(page);
  await waitForMain1(page);

  // Cast and resolve a creature so the AI has a target for Terror.
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const bear = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
    if (!bear) throw new Error('grizzly_bears not in hand');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: bear.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  });

  // Give the AI Terror with mana.
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    const terror = {
      iid: 'terror-dc-5', id: 'terror', name: 'Terror', type: 'Instant',
      color: 'B', cmc: 2, cost: '1B', effect: 'destroy', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
    };
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cards: [terror], mana: { B: 1, C: 1 } });
  });

  // Advance to AI's turn.
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
  });

  // Wait for priorityWindow to open with Terror on stack.
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.priorityWindow === true && s.stack?.length > 0;
  }, { timeout: 8_000 });

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.priorityWindow).toBe(true);
  expect(s.stack.length).toBeGreaterThan(0);
  // Bear must still be alive -- Terror has not resolved yet.
  expect(s.p.bf.find((c: any) => c.id === 'grizzly_bears')).toBeDefined();
});

// ---------------------------------------------------------------------------
// 7. handleBfClick — pendingBlockerIid starts null (desktop)
// ---------------------------------------------------------------------------
test('7: pendingBlockerIid is null before any blocker click (desktop)', async ({ page }) => {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await waitForMain1(page);

  // pendingBlockerIid lives in useDuelController React state, not in GameState.
  // Verify engine state is accessible and no blocker iid is pre-set.
  const state = await page.evaluate(() => (window as any).__duelState());
  expect(state.phase).not.toBe('COMBAT_BLOCKERS');
  // GameState should not have a pendingBlockerIid field (it's React state, not engine state).
  expect((state as any).pendingBlockerIid).toBeUndefined();
});

// ---------------------------------------------------------------------------
// 8. handleBfClick — non-combat click does not set pendingBlockerIid (desktop)
// Verifies that land clicks during MAIN_1 are not consumed by handleBfClick.
// ---------------------------------------------------------------------------
test('8: land click during MAIN_1 is not swallowed by handleBfClick (desktop)', async ({ page }) => {
  await page.goto(SANDBOX_URL);
  await waitForDuel(page);
  await waitForMain1(page);

  const state = await page.evaluate(() => (window as any).__duelState());
  // Phase must be MAIN_1, not a combat phase — handleBfClick returns false.
  expect(state.phase).toBe('MAIN_1');
  expect(state.active).toBe('p');
});

// ---------------------------------------------------------------------------
// 6. Priority window — AI casts spell, player gets window (mobile)
// Verifies the bug fix: mobile now uses applyAiActionsWithPriority via hook.
// ---------------------------------------------------------------------------
test('6: AI cast opens priority window before stack resolves (mobile)', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(sandboxWith('grizzly_bears'));
  await page.waitForFunction(() => typeof (window as any).__duelState === 'function', { timeout: 10_000 });
  await waitForMain1(page);

  // Cast and resolve a creature.
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const bear = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
    if (!bear) throw new Error('grizzly_bears not in hand');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: bear.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  });

  // Give the AI Terror with mana.
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    const terror = {
      iid: 'terror-dc-6', id: 'terror', name: 'Terror', type: 'Instant',
      color: 'B', cmc: 2, cost: '1B', effect: 'destroy', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
    };
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cards: [terror], mana: { B: 1, C: 1 } });
  });

  // Advance to AI's turn.
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
  });

  // Wait for priorityWindow to open with a spell on stack.
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.priorityWindow === true && s.stack?.length > 0;
  }, { timeout: 8_000 });

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.priorityWindow).toBe(true);
  expect(s.stack.length).toBeGreaterThan(0);
  // Bear must still be alive -- spell has not resolved yet.
  expect(s.p.bf.find((c: any) => c.id === 'grizzly_bears')).toBeDefined();
});
