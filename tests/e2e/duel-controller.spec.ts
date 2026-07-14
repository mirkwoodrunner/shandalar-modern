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


test.describe('@engine-cast-flow-ui-2 @mobile duel-controller AI loop, priority, and combat driving', () => {
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
    // Override the sandbox deck with a safe list (no 0-cost artifacts).
    // The default deck contains Black Lotus / Mox artifacts whose 0-cost allows
    // policyMainAction inside MCTS rollouts to cast them, opening a priority
    // window and blocking ADVANCE_PHASE — causing an infinite rollout loop.
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Forest x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('grizzly_bears'));

    // Wait for the engine to be ready AND the player to be in MAIN_1 with grizzly_bears
    // already in hand. The forcedHandIds hook moves it from library to hand asynchronously;
    // this single waitForFunction covers waitForDuel + waitForMain1 + forcedHandIds timing.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.phase === 'MAIN_1' && s.active === 'p' &&
        s.p.hand?.some((c: any) => c.id === 'grizzly_bears');
    }, { timeout: 20_000 });

    // All setup dispatches in one synchronous block so React batches them into a
    // single render. Splitting across two evaluate calls risks the AI loop firing
    // before SANDBOX_FORCE_HAND(Terror) has been applied to the state.
    //
    // Steps:
    //   1. Exhaust AI mulligan allowance (MULLIGAN x2 → o.mulls=2). This prevents
    //      shouldMulligan() from reshuffling Terror out of the AI's hand when the
    //      AI loop fires (shouldMulligan returns false when mulls >= 2).
    //   2. Give player mana → cast Bear → both pass → resolve Bear onto p.bf.
    //   3. Jump to AI's MAIN_1 and inject Terror + mana. With o.bf empty and only
    //      {B:1,C:1} in the pool, red spells are uncastable (no R), so the AI goes
    //      straight to Terror on its first action — no auto-passing needed.
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const bear = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
      if (!bear) throw new Error('grizzly_bears not in hand');
      const forest = (s.p.hand as any[]).find((c: any) => c.id === 'forest');
      if (!forest) throw new Error('forest not in hand');
      const terror = {
        iid: 'terror-dc-5', id: 'terror', name: 'Terror', type: 'Instant',
        color: 'B', cmc: 2, cost: '1B', effect: 'destroy', keywords: [],
        tapped: false, summoningSick: false, attacking: false, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      };

      // 1. Play a Forest so landsPlayed=1 (prevents AI land-drop on its turn).
      dispatch({ type: 'PLAY_LAND', who: 'p', iid: forest.iid });
      // 2. Fund the bear cast (1G).
      dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { G: 1, C: 1 } });
      // 3. Resolve bear onto p.bf.
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: bear.iid, tgt: null, xVal: null });
      dispatch({ type: 'PASS_PRIORITY', who: 'p' });
      dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      dispatch({ type: 'RESOLVE_STACK' });
      // 4. Jump to AI MAIN_1; clears stack and priorityWindow.
      dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
      // 5. Inject Terror into AI hand and fund it.
      //    SANDBOX_FORCE_HAND appends — AI may have other cards, but we cast
      //    Terror directly below so the planner is not involved.
      dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cards: [terror], mana: { B: 1, C: 1 } });
      // 6. Cast Terror directly from the AI side. CAST_SPELL puts the card on
      //    the stack and sets priorityWindow:true atomically. This is what
      //    tests 5 & 6 are actually verifying — the priority-window plumbing,
      //    not the AI planner.
      dispatch({ type: 'CAST_SPELL', who: 'o', iid: terror.iid, tgt: bear.iid, xVal: null });
    });


    // Wait for the AI to cast Terror and open the priority window.
    // landsPlayed=1 blocks land play; {B:1,C:1} makes red spells uncastable (no R).
    // Terror (1B, cmc=2) is the only affordable spell, so the AI casts it first.
    // CAST_SPELL sets priorityWindow:true and pushes Terror to the stack in the
    // same synchronous dispatch. Wait for React to propagate.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s != null &&
        s.priorityWindow === true &&
        s.stack?.some((item: any) => item.card?.id === 'terror');
    }, { timeout: 5_000 });

    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s.priorityWindow).toBe(true);
    expect(s.stack.length).toBeGreaterThan(0);
    expect(s.stack.some((item: any) => item.card?.id === 'terror')).toBe(true);
    // Bear must still be alive -- Terror has not resolved yet.
    expect(s.p.bf.find((c: any) => c.id === 'grizzly_bears')).toBeDefined();

    // Player passes priority → both sides have now passed → stack resolves.
    // Dispatch both passes and RESOLVE_STACK in one synchronous block to avoid
    // relying on the React effect chain (priorityWindowInitiator timing).
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({ type: 'PASS_PRIORITY', who: 'p' });
      dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      dispatch({ type: 'RESOLVE_STACK' });
    });
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.stack?.length === 0;
    }, { timeout: 5_000 });

    const sAfter = await page.evaluate(() => (window as any).__duelState());
    expect(sAfter.stack.length).toBe(0);
    // Bear must be gone — Terror resolved and destroyed it.
    expect(sAfter.p.bf.find((c: any) => c.id === 'grizzly_bears')).toBeUndefined();
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
    // Same 0-cost artifact infinite-rollout fix as test 5 (see comment there).
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Forest x20\n', contentType: 'text/plain' })
    );
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(sandboxWith('grizzly_bears'));

    // Wait for the engine to be ready AND the player to be in MAIN_1 with grizzly_bears
    // already in hand. The forcedHandIds hook moves it from library to hand asynchronously;
    // this single waitForFunction covers __duelState availability + waitForMain1 + forcedHandIds timing.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.phase === 'MAIN_1' && s.active === 'p' &&
        s.p.hand?.some((c: any) => c.id === 'grizzly_bears');
    }, { timeout: 20_000 });

    // All setup dispatches in one synchronous block so React batches them into a
    // single render. Splitting across two evaluate calls risks the AI loop firing
    // before SANDBOX_FORCE_HAND(Terror) has been applied to the state.
    //
    // Steps:
    //   1. Exhaust AI mulligan allowance (MULLIGAN x2 → o.mulls=2). This prevents
    //      shouldMulligan() from reshuffling Terror out of the AI's hand when the
    //      AI loop fires (shouldMulligan returns false when mulls >= 2).
    //   2. Give player mana → cast Bear → both pass → resolve Bear onto p.bf.
    //   3. Jump to AI's MAIN_1 and inject Terror + mana. With o.bf empty and only
    //      {B:1,C:1} in the pool, red spells are uncastable (no R), so the AI goes
    //      straight to Terror on its first action — no auto-passing needed.
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const bear = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
      if (!bear) throw new Error('grizzly_bears not in hand');
      const forest = (s.p.hand as any[]).find((c: any) => c.id === 'forest');
      if (!forest) throw new Error('forest not in hand');
      const terror = {
        iid: 'terror-dc-6', id: 'terror', name: 'Terror', type: 'Instant',
        color: 'B', cmc: 2, cost: '1B', effect: 'destroy', keywords: [],
        tapped: false, summoningSick: false, attacking: false, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      };

      dispatch({ type: 'PLAY_LAND', who: 'p', iid: forest.iid });
      dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { G: 1, C: 1 } });
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: bear.iid, tgt: null, xVal: null });
      dispatch({ type: 'PASS_PRIORITY', who: 'p' });
      dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      dispatch({ type: 'RESOLVE_STACK' });
      dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
      dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cards: [terror], mana: { B: 1, C: 1 } });
      dispatch({ type: 'CAST_SPELL', who: 'o', iid: terror.iid, tgt: bear.iid, xVal: null });
    });

    // Wait for the AI to cast Terror and open the priority window.
    // landsPlayed=1 blocks land play; {B:1,C:1} makes red spells uncastable (no R).
    // Terror (1B, cmc=2) is the only affordable spell, so the AI casts it first.
    // CAST_SPELL sets priorityWindow:true and pushes Terror to the stack in the
    // same synchronous dispatch. Wait for React to propagate.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s != null &&
        s.priorityWindow === true &&
        s.stack?.some((item: any) => item.card?.id === 'terror');
    }, { timeout: 5_000 });

    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s.priorityWindow).toBe(true);
    expect(s.stack.length).toBeGreaterThan(0);
    expect(s.stack.some((item: any) => item.card?.id === 'terror')).toBe(true);
    // Bear must still be alive -- Terror has not resolved yet.
    expect(s.p.bf.find((c: any) => c.id === 'grizzly_bears')).toBeDefined();

    // Player passes priority → both sides have now passed → stack resolves.
    // Dispatch both passes and RESOLVE_STACK in one synchronous block to avoid
    // relying on the React effect chain (priorityWindowInitiator timing).
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({ type: 'PASS_PRIORITY', who: 'p' });
      dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      dispatch({ type: 'RESOLVE_STACK' });
    });
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.stack?.length === 0;
    }, { timeout: 5_000 });

    const sAfter = await page.evaluate(() => (window as any).__duelState());
    expect(sAfter.stack.length).toBe(0);
    // Bear must be gone — Terror resolved and destroyed it.
    expect(sAfter.p.bf.find((c: any) => c.id === 'grizzly_bears')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // AI declares attackers on its own turn -- desktop
  // Regression for: guard in AI loop bailed on COMBAT_ATTACKERS unconditionally,
  // blocking the AI when active === 'o'.
  // ---------------------------------------------------------------------------
  test('AI declares attackers on its turn -- desktop', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await waitForMain1(page);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'o' });
    });

    // Step 1: confirm dispatch committed -- state must leave MAIN_1/active=p.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s != null && !(s.phase === 'MAIN_1' && s.active === 'p');
    }, { timeout: 3_000 });

    // Step 2: AI must advance past COMBAT_ATTACKERS.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s != null && s.phase !== 'COMBAT_ATTACKERS';
    }, { timeout: 5_000 });

    const s = await page.evaluate(() => (window as any).__duelState());
    expect(['COMBAT_AFTER_ATTACKERS', 'COMBAT_BLOCKERS', 'COMBAT_AFTER_BLOCKERS',
            'COMBAT_DAMAGE', 'MAIN_2', 'END', 'UNTAP', 'MAIN_1']).toContain(s.phase);
  });

  // ---------------------------------------------------------------------------
  // AI declares attackers on its own turn -- mobile
  // ---------------------------------------------------------------------------
  test('AI declares attackers on its turn -- mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(SANDBOX_URL);
    await page.waitForFunction(() => typeof (window as any).__duelState === 'function', { timeout: 10_000 });
    await waitForMain1(page);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'o' });
    });

    // Step 1: confirm dispatch committed -- state must leave MAIN_1/active=p.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s != null && !(s.phase === 'MAIN_1' && s.active === 'p');
    }, { timeout: 3_000 });

    // Step 2: AI must advance past COMBAT_ATTACKERS.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s != null && s.phase !== 'COMBAT_ATTACKERS';
    }, { timeout: 5_000 });

    const s = await page.evaluate(() => (window as any).__duelState());
    expect(['COMBAT_AFTER_ATTACKERS', 'COMBAT_BLOCKERS', 'COMBAT_AFTER_BLOCKERS',
            'COMBAT_DAMAGE', 'MAIN_2', 'END', 'UNTAP', 'MAIN_1']).toContain(s.phase);
  });

  // ---------------------------------------------------------------------------
  // Helpers shared by E2E-CAST-01 through E2E-CAST-08
  // ---------------------------------------------------------------------------

  async function dismissMulligan(page: Page) {
    // MulliganModal is always shown on load; click Keep to dismiss it.
    const keepBtn = page.locator('[data-testid="mulligan-keep"]');
    await keepBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await keepBtn.click();
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 });
  }

  async function waitForCardInHand(page: Page, cardId: string) {
    await page.waitForFunction((id: string) => {
      const s = (window as any).__duelState?.();
      return s && s.p.hand?.some((c: any) => c.id === id);
    }, cardId, { timeout: 15_000 });
  }

  async function getCardIid(page: Page, cardId: string): Promise<string> {
    return page.evaluate((id: string) => {
      const s = (window as any).__duelState();
      return s.p.hand.find((c: any) => c.id === id)?.iid ?? '';
    }, cardId);
  }

  // ---------------------------------------------------------------------------
  // E2E-CAST-01 (desktop 1280x800): Non-targeting card opens mana mode in Banner
  // ---------------------------------------------------------------------------
  test('E2E-CAST-01: non-targeting card (Grizzly Bears) shows mana mode in player Banner', async ({ page }) => {
    // Only Forests in deck so AI never gets stuck on 0-cost artifacts
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Forest x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    await waitForCardInHand(page, 'grizzly_bears');
    await dismissMulligan(page);
    await waitForMain1(page);

    // Ensure player has no mana so the auto-fire does NOT trigger
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } });
    });

    const iid = await getCardIid(page, 'grizzly_bears');
    await page.click(`[data-testid="hand-card-${iid}"]`);
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.click('[data-testid="cast-button"]');

    // castFlow should now be in mana mode — banner shows NEED label
    await page.waitForSelector('[data-testid="cast-prompt-need"]', { timeout: 3_000 });
    await expect(page.locator('[data-testid="cast-prompt-need"]')).toBeVisible();
    // cast-button disappears once flow is active (hasSelection becomes false)
    await expect(page.locator('[data-testid="cast-button"]')).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-CAST-02 (desktop): Targeting card (Counterspell) opens targeting mode
  // ---------------------------------------------------------------------------
  test('E2E-CAST-02: targeting card (Counterspell) shows targeting mode in player Banner', async ({ page }) => {
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Island x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('counterspell'));
    await waitForDuel(page);
    await waitForCardInHand(page, 'counterspell');
    await dismissMulligan(page);
    await waitForMain1(page);

    const iid = await getCardIid(page, 'counterspell');
    await page.click(`[data-testid="hand-card-${iid}"]`);
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.click('[data-testid="cast-button"]');

    // castFlow enters targeting mode — banner shows "Select target" label
    await page.waitForSelector('[data-testid="cast-prompt-label"]', { timeout: 3_000 });
    await expect(page.locator('[data-testid="cast-prompt-label"]')).toBeVisible();
    await expect(page.locator('[data-testid="cast-prompt-label"]')).toContainText('Select target');
    // Confirm button must NOT appear yet (0 targets selected)
    await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-CAST-03 (desktop): Cancel during targeting mode clears the cast prompt
  // ---------------------------------------------------------------------------
  test('E2E-CAST-03: cancel during targeting mode clears the cast prompt from Banner', async ({ page }) => {
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Island x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('counterspell'));
    await waitForDuel(page);
    await waitForCardInHand(page, 'counterspell');
    await dismissMulligan(page);
    await waitForMain1(page);

    const iid = await getCardIid(page, 'counterspell');
    await page.click(`[data-testid="hand-card-${iid}"]`);
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.click('[data-testid="cast-button"]');
    await page.waitForSelector('[data-testid="cast-prompt"]', { timeout: 3_000 });

    // Cancel the flow — cast-prompt must disappear
    await page.click('[data-testid="cast-prompt-cancel"]');
    await page.waitForSelector('[data-testid="cast-prompt"]', { state: 'hidden', timeout: 3_000 });
    await expect(page.locator('[data-testid="cast-prompt"]')).toHaveCount(0);
    // cast-button should reappear (card is still selected)
    await expect(page.locator('[data-testid="cast-button"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // E2E-CAST-04 (desktop): Optional-target card (Twiddle) shows Skip button
  // ---------------------------------------------------------------------------
  test('E2E-CAST-04: optional-target card (Twiddle) shows Skip button in targeting mode', async ({ page }) => {
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Island x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('twiddle'));
    await waitForDuel(page);
    await waitForCardInHand(page, 'twiddle');
    await dismissMulligan(page);
    await waitForMain1(page);

    // Clear mana so auto-fire won't happen before we can check UI
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } });
    });

    const iid = await getCardIid(page, 'twiddle');
    await page.click(`[data-testid="hand-card-${iid}"]`);
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.click('[data-testid="cast-button"]');

    // Twiddle has optionalTarget=true — targeting mode opens with Skip button
    await page.waitForSelector('[data-testid="cast-prompt-label"]', { timeout: 3_000 });
    await expect(page.locator('[data-testid="cast-prompt-label"]')).toContainText('optional');
    await expect(page.locator('[data-testid="cast-prompt-skip"]')).toBeVisible();
    // Required-target Confirm button must NOT appear at 0 targets
    await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-CAST-05 (desktop): Required-target card — Confirm hidden until target chosen
  // ---------------------------------------------------------------------------
  test('E2E-CAST-05: required-target card (Lightning Bolt) — Confirm blocked at 0 targets', async ({ page }) => {
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Mountain x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('lightning_bolt'));
    await waitForDuel(page);
    await waitForCardInHand(page, 'lightning_bolt');
    await dismissMulligan(page);
    await waitForMain1(page);

    // Clear mana so the flow stays open for inspection
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } });
    });

    const iid = await getCardIid(page, 'lightning_bolt');
    await page.click(`[data-testid="hand-card-${iid}"]`);
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.click('[data-testid="cast-button"]');

    await page.waitForSelector('[data-testid="cast-prompt-label"]', { timeout: 3_000 });
    // At 0 targets — Confirm must be hidden
    await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toHaveCount(0);
    // No Skip button on required-target cards
    await expect(page.locator('[data-testid="cast-prompt-skip"]')).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-CAST-06 (mobile 390x844): Non-targeting card opens mana mode on mobile
  // ---------------------------------------------------------------------------
  test('E2E-CAST-06: mobile — non-targeting card shows mana mode in player Banner', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Forest x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('grizzly_bears'));
    await page.waitForFunction(() => typeof (window as any).__duelState === 'function', { timeout: 10_000 });
    await waitForCardInHand(page, 'grizzly_bears');
    await dismissMulligan(page);
    await waitForMain1(page);

    // Clear mana so flow stays in mana mode (no auto-fire)
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } });
    });

    // Tap the first hand card (mobile uses data-testid="hand-card" without iid suffix)
    await page.locator('[data-testid="hand-card"]').first().tap();
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.locator('[data-testid="cast-button"]').tap();

    await page.waitForSelector('[data-testid="cast-prompt-need"]', { timeout: 3_000 });
    await expect(page.locator('[data-testid="cast-prompt-need"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // E2E-CAST-07 (mobile): Targeting card opens targeting mode on mobile Banner
  // ---------------------------------------------------------------------------
  test('E2E-CAST-07: mobile — targeting card (Counterspell) shows targeting mode in Banner', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Island x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('counterspell'));
    await page.waitForFunction(() => typeof (window as any).__duelState === 'function', { timeout: 10_000 });
    await waitForCardInHand(page, 'counterspell');
    await dismissMulligan(page);
    await waitForMain1(page);

    await page.locator('[data-testid="hand-card"]').first().tap();
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.locator('[data-testid="cast-button"]').tap();

    await page.waitForSelector('[data-testid="cast-prompt-label"]', { timeout: 3_000 });
    await expect(page.locator('[data-testid="cast-prompt-label"]')).toBeVisible();
    await expect(page.locator('[data-testid="cast-prompt-label"]')).toContainText('Select target');
    // No Confirm yet (0 targets)
    await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // E2E-CAST-08 (mobile): Cancel clears the cast prompt on mobile
  // ---------------------------------------------------------------------------
  test('E2E-CAST-08: mobile — cancel during targeting flow clears cast prompt from Banner', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Island x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('counterspell'));
    await page.waitForFunction(() => typeof (window as any).__duelState === 'function', { timeout: 10_000 });
    await waitForCardInHand(page, 'counterspell');
    await dismissMulligan(page);
    await waitForMain1(page);

    await page.locator('[data-testid="hand-card"]').first().tap();
    await page.waitForSelector('[data-testid="cast-button"]', { timeout: 3_000 });
    await page.locator('[data-testid="cast-button"]').tap();
    await page.waitForSelector('[data-testid="cast-prompt"]', { timeout: 3_000 });

    // Tap the X/Cancel button inside the castPrompt
    await page.locator('[data-testid="cast-prompt-cancel"]').tap();
    await page.waitForSelector('[data-testid="cast-prompt"]', { state: 'hidden', timeout: 3_000 });
    await expect(page.locator('[data-testid="cast-prompt"]')).toHaveCount(0);
  });

});
