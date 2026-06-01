import { test, expect, Page } from '@playwright/test';

// URL helpers
const SANDBOX_URL     = '/?duel=sandbox&aiSpeed=0';
const sandboxWith = (cards: string) => `/?duel=sandbox&aiSpeed=0&cards=${cards}`;

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
test.describe('Sandbox boot', () => {
  test('lands on duel screen without title interaction', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await expect(page.getByTestId('duel-screen')).toBeVisible();
  });

  test('phase bar is visible and starts on UNTAP or MAIN_1', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const active = page.getByTestId('phase-active');
    await expect(active).toBeVisible();
    const text = await active.textContent();
    expect(['Untap', 'Main 1']).toContain(text?.trim());
  });

  test('player hand is rendered with card testids', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const firstCard = page.locator('[data-testid^="hand-card-"]').first();
    await expect(firstCard).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
test.describe('Action bar controls', () => {
  test('Pass Priority button is present', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await expect(page.getByTestId('pass-priority-button')).toBeVisible();
  });

  test('End Turn button is present and enabled on player turn', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="phase-active"]');
      const t = el?.textContent?.trim() ?? '';
      return t === 'Main 1' || t === 'MAIN 1';
    }, { timeout: 15_000 });
    const endTurn = page.getByTestId('end-turn-button');
    await expect(endTurn).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
test.describe('window.__duelDispatch escape hatch', () => {
  test('dispatch and state are exposed in sandbox mode', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const hasDispatch = await page.evaluate(() =>
      typeof (window as any).__duelDispatch === 'function' &&
      typeof (window as any).__duelState    === 'function'
    );
    expect(hasDispatch).toBe(true);
  });

  test('state reflects life totals', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const life = await page.evaluate(() => (window as any).__duelState().p.life);
    expect(life).toBe(20);
  });
});

// ---------------------------------------------------------------------------
test.describe('?cards= injection', () => {
  async function getHandIds(page: Page): Promise<string[]> {
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.p && Array.isArray(s.p.hand);
    }, { timeout: 5_000 });
    return page.evaluate(() => (window as any).__duelState().p.hand.map((c: any) => c.id));
  }

  test('injected card is in hand regardless of decklist contents', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('grizzly_bears');
  });

  test('multiple injected cards are all in hand', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears,lightning_bolt'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('grizzly_bears');
    expect(ids).toContain('lightning_bolt');
  });

  test('colored mana lands are injected for a single card', async ({ page }) => {
    // mahamoti_djinn costs "4UU": 2 islands (colored) + 4 islands (generic, dominant=U)
    await page.goto(sandboxWith('mahamoti_djinn'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('mahamoti_djinn');
    expect(ids.filter((id: string) => id === 'island').length).toBeGreaterThanOrEqual(6);
  });

  test('multi-color injection satisfies all colored pip requirements', async ({ page }) => {
    // lightning_bolt "R":   R=1, generic=0
    // sengir_vampire "3BB": B=2, generic=3 (dominant=B -> swamp for generic)
    await page.goto(sandboxWith('lightning_bolt,sengir_vampire'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('lightning_bolt');
    expect(ids).toContain('sengir_vampire');
    expect(ids.filter((id: string) => id === 'swamp').length).toBeGreaterThanOrEqual(2);
    expect(ids.filter((id: string) => id === 'mountain').length).toBeGreaterThanOrEqual(1);
  });

  test('hand size exceeds 7 when many cards are injected', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears,lightning_bolt,sengir_vampire,serra_angel'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('grizzly_bears');
    expect(ids).toContain('lightning_bolt');
    expect(ids).toContain('sengir_vampire');
    expect(ids).toContain('serra_angel');
    expect(ids.length).toBeGreaterThan(7);
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by stack scenario tests
// ---------------------------------------------------------------------------

// Wait for the duel to be in MAIN_1 on the player's turn
async function waitForMain1(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// Tap all untapped lands the player controls (up to count) and return actual tapped count
async function tapAllLands(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const lands = (s.p.bf as any[]).filter((c: any) => !c.tapped && c.type === 'Land');
    for (const land of lands) {
      const mana = land.produces?.[0] ?? 'C';
      dispatch({ type: 'TAP_LAND', who: 'p', iid: land.iid, mana });
    }
    return lands.length;
  });
}

// ---------------------------------------------------------------------------

test.describe('Universal stack priority', () => {
  test('7A: Sorcery lands on stack, does not resolve immediately', async ({ page }) => {
    // lightning_bolt is an instant, use a sorcery. fireball works.
    await page.goto(sandboxWith('fireball'));
    await waitForDuel(page);
    await waitForMain1(page);
    await tapAllLands(page);

    // Cast fireball (sorcery-speed damage spell)
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const card = (s.p.hand as any[]).find((c: any) => c.id === 'fireball');
      if (!card) throw new Error('fireball not in hand');
      dispatch({ type: 'SET_X', val: 1 });
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: 'o', xVal: 1 });
    });

    const afterCast = await page.evaluate(() => (window as any).__duelState());
    expect(afterCast.stack.length).toBe(1);
    expect(afterCast.stack[0].card.type).toMatch(/Sorcery/i);
    // Opponent life should be unchanged -- spell has not resolved
    expect(afterCast.o.life).toBe(afterCast.ruleset.startingLife ?? 20);
  });

  test('7B: Creature lands on stack, does not ETB until resolved', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);
    await tapAllLands(page);

    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const card = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
      if (!card) throw new Error('grizzly_bears not in hand');
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: null, xVal: 1 });
    });

    const afterCast = await page.evaluate(() => (window as any).__duelState());
    expect(afterCast.stack.length).toBe(1);
    // Creature must NOT be on the battlefield yet
    const onBf = afterCast.p.bf.find((c: any) => c.id === 'grizzly_bears');
    expect(onBf).toBeUndefined();

    // Resolve: pass priority for both players to trigger RESOLVE_STACK
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({ type: 'PASS_PRIORITY', who: 'p' });
      dispatch({ type: 'PASS_PRIORITY', who: 'o' });
      dispatch({ type: 'RESOLVE_STACK' });
    });

    const afterResolve = await page.evaluate(() => (window as any).__duelState());
    expect(afterResolve.stack.length).toBe(0);
    const onBfAfter = afterResolve.p.bf.find((c: any) => c.id === 'grizzly_bears');
    expect(onBfAfter).toBeDefined();
  });

  test('7C: Priority window opens after every cast', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);
    await tapAllLands(page);

    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const card = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
      if (!card) throw new Error('grizzly_bears not in hand');
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: null, xVal: 1 });
    });

    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s.priorityWindow).toBe(true);
  });

  test('7D: Instant can be cast in response to a sorcery on stack', async ({ page }) => {
    await page.goto(sandboxWith('fireball,lightning_bolt'));
    await waitForDuel(page);
    await waitForMain1(page);
    await tapAllLands(page);

    // Cast sorcery first
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const sorcery = (s.p.hand as any[]).find((c: any) => c.id === 'fireball');
      if (!sorcery) throw new Error('fireball not in hand');
      dispatch({ type: 'SET_X', val: 1 });
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: sorcery.iid, tgt: 'o', xVal: 1 });
    });

    const mid = await page.evaluate(() => (window as any).__duelState());
    expect(mid.stack.length).toBe(1);
    expect(mid.priorityWindow).toBe(true);

    // Now cast the instant in response
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const inst = (s.p.hand as any[]).find((c: any) => c.id === 'lightning_bolt');
      if (!inst) throw new Error('lightning_bolt not in hand');
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: inst.iid, tgt: 'o', xVal: 1 });
    });

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.stack.length).toBe(2);
    expect(after.stack[1].card.type).toMatch(/Instant/i);
  });

  test('7E: Cannot cast sorcery in response to a spell on stack', async ({ page }) => {
    await page.goto(sandboxWith('fireball,fireball'));
    await waitForDuel(page);
    await waitForMain1(page);
    await tapAllLands(page);

    // Cast first sorcery
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const first = (s.p.hand as any[]).find((c: any) => c.id === 'fireball');
      if (!first) throw new Error('fireball not in hand');
      dispatch({ type: 'SET_X', val: 1 });
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: first.iid, tgt: 'o', xVal: 1 });
    });

    // Attempt to cast second sorcery while first is on stack
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const second = (s.p.hand as any[]).find((c: any) => c.id === 'fireball');
      if (!second) return; // only one fireball injected, skip
      dispatch({ type: 'SET_X', val: 1 });
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: second.iid, tgt: 'o', xVal: 1 });
    });

    const after = await page.evaluate(() => (window as any).__duelState());
    // Stack must still have exactly 1 item (second cast was blocked by sorcery-speed guard)
    expect(after.stack.length).toBe(1);
  });

  test('7F: Mobile -- StackDisplay renders when stack is non-empty', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);
    await tapAllLands(page);

    await page.evaluate(() => {
      const s = (window as any).__duelState();
      const dispatch = (window as any).__duelDispatch;
      const card = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
      if (!card) throw new Error('grizzly_bears not in hand');
      dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: null, xVal: 1 });
    });

    await expect(page.locator('[data-testid="stack-display"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="stack-top-card"]')).toBeVisible();
  });
});
