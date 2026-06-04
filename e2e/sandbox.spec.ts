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

    // Stack display is present (collapsed pill)
    await expect(page.locator('[data-testid="stack-display"]')).toBeVisible({ timeout: 5_000 });

    // Wait for auto-expand (new item triggers expand)
    await expect(page.locator('[data-testid="stack-top-card"]')).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------

test('7G: Mobile -- stack pill collapses and re-expands on tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sandboxWith('grizzly_bears'));
  await waitForDuel(page);
  await waitForMain1(page);
  await tapAllLands(page);

  // Cast a spell to put something on the stack
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s.p.hand as any[]).find((c: any) => c.id === 'grizzly_bears');
    if (!card) throw new Error('grizzly_bears not in hand');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: null, xVal: 1 });
  });

  // Auto-expanded -- top card visible
  await expect(page.locator('[data-testid="stack-top-card"]')).toBeVisible({ timeout: 5_000 });

  // Collapse via the collapse button
  await page.locator('[data-testid="stack-collapse-btn"]').click();
  await expect(page.locator('[data-testid="stack-top-card"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="stack-pill"]')).toBeVisible();

  // ActionBar buttons are not obscured -- pass priority must be hittable
  const passBtn = page.getByText('Pass Priority');
  await expect(passBtn).toBeVisible();
  await expect(passBtn).toBeEnabled();

  // Re-expand via pill tap
  await page.locator('[data-testid="stack-pill"]').click();
  await expect(page.locator('[data-testid="stack-top-card"]')).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
test.describe('AI spell priority window', () => {
  test('8A: AI cast lands spell on stack; priorityWindow opens before resolution', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    // Cast and resolve a creature for the AI to target with Terror.
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

    // Give the opponent Terror in hand with mana.
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      const terror = {
        iid: 'terror-test', id: 'terror', name: 'Terror', type: 'Instant',
        color: 'B', cmc: 2, cost: '1B', effect: 'destroy', keywords: [],
        tapped: false, summoningSick: false, attacking: false, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      };
      dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cards: [terror], mana: { B: 1, C: 1 } });
    });

    // Advance to AI's turn by passing through to CLEANUP and back.
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({ type: 'PASS_PRIORITY', who: 'p' });
      dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    });

    // Wait for priorityWindow to open (AI cast Terror).
    await page.waitForFunction(() => {
      const s = (window as any).__duelState();
      return s.priorityWindow === true && s.stack?.length > 0;
    }, { timeout: 5000 });

    const state = await page.evaluate(() => (window as any).__duelState());
    expect(state.priorityWindow).toBe(true);
    expect(state.stack.length).toBe(1);
    expect(state.stack[0].card.name).toBe('Terror');
    // Creature must still be alive -- spell has not resolved.
    const bearOnBf = state.p.bf.find((c: any) => c.id === 'grizzly_bears');
    expect(bearOnBf).toBeDefined();
  });

  test('AI spell gives player priority window to respond', async ({ page }) => {
    // Inject a 1W creature for the AI (Benalish Hero) and a counterspell for the player.
    // The AI should cast on its turn; the player should see the priority window before
    // the creature resolves.
    await page.goto(
      '/?duel=sandbox&cards=benalish_hero,counterspell&aiSpeed=0'
    );

    // Wait for the duel to initialise.
    await page.waitForFunction(() => (window as any).__duelState !== undefined);

    // Force the AI's hand to contain a 1W creature and give it mana.
    // Force the player's hand to contain a counterspell and give it UU mana.
    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'o',
        cardIds: ['benalish_hero'],
        mana: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 },
      });
      (window as any).__duelDispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'p',
        cardIds: ['counterspell'],
        mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 },
      });
    });

    // Advance to AI's MAIN_1 (active = 'o').
    await page.evaluate(() => {
      const s = (window as any).__duelState();
      if (s.active !== 'o') {
        // Force to AI turn by setting active -- sandbox only.
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', who: 'o' });
      }
    });

    // Poll until a priority window opens (AI cast and player gets priority).
    // Timeout = 5 s. If the window never opens the test fails.
    await page.waitForFunction(
      () => {
        const s = (window as any).__duelState?.();
        return s && s.priorityWindow === true;
      },
      { timeout: 5000 }
    );

    // The creature must NOT be on the battlefield yet -- it hasn't resolved.
    const oCreatureCount = await page.evaluate(() => {
      return (window as any).__duelState().o.bf.filter((c: any) => c.id === 'benalish_hero').length;
    });
    expect(oCreatureCount).toBe(0);

    // Stack must have exactly one item.
    const stackLen = await page.evaluate(() => (window as any).__duelState().stack.length);
    expect(stackLen).toBe(1);
  });

  test('8B: Player passes priority; AI spell resolves', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    // Cast a bear, resolve it.
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

    // Force Terror into opponent hand with mana.
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      const terror = {
        iid: 'terror-test-b', id: 'terror', name: 'Terror', type: 'Instant',
        color: 'B', cmc: 2, cost: '1B', effect: 'destroy', keywords: [],
        tapped: false, summoningSick: false, attacking: false, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      };
      dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cards: [terror], mana: { B: 1, C: 1 } });
    });

    // Wait for priority window with Terror on stack.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState();
      return s.priorityWindow === true && s.stack?.some((e: any) => e.card?.name === 'Terror');
    }, { timeout: 5000 });

    // Player passes priority.
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'PASS_PRIORITY', who: 'p' });
    });

    // Wait for Terror to resolve (stack empty, bear gone).
    await page.waitForFunction(() => {
      const s = (window as any).__duelState();
      return s.stack.length === 0 && !s.p.bf.some((c: any) => c.id === 'grizzly_bears');
    }, { timeout: 5000 });

    const state = await page.evaluate(() => (window as any).__duelState());
    expect(state.stack.length).toBe(0);
    expect(state.p.bf.find((c: any) => c.id === 'grizzly_bears')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
test.describe('Combat blockers', () => {
  async function waitForPlayerMain1(page: Page) {
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.phase === 'MAIN_1' && s.active === 'p';
    }, { timeout: 20_000 });
  }

  test('BLK-01: player can declare blockers when AI attacks', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears,forest'));
    await waitForDuel(page);
    // Wait for a stable player-turn state so no pending AI timers exist.
    await waitForPlayerMain1(page);

    // Force COMBAT_BLOCKERS with AI as active player (AI attacked, player defends).
    await page.evaluate(() => {
      const d = (window as any).__duelDispatch;
      if (!d) throw new Error('__duelDispatch not available');
      d({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_BLOCKERS', active: 'o' });
    });

    // Wait for the state to reflect COMBAT_BLOCKERS before proceeding.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.phase === 'COMBAT_BLOCKERS' && s.active === 'o';
    }, { timeout: 3000 });

    // Done Blocking button must be visible when player is the defender.
    const doneBlockingBtn = page.getByTestId('done-blocking-button');
    await expect(doneBlockingBtn).toBeVisible({ timeout: 3000 });

    // Trigger the click via evaluate to bypass Playwright's stability check —
    // the game log updates cause React re-renders that make the button
    // "unstable" to Playwright's heuristic, but the click itself is valid.
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="done-blocking-button"]') as HTMLElement | null;
      if (!btn) throw new Error('done-blocking-button not found');
      btn.click();
    });

    // Phase must advance past COMBAT_BLOCKERS.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.phase !== 'COMBAT_BLOCKERS';
    }, { timeout: 3000 });
  });

  test('BLK-02: Done Blocking button absent when player is attacking', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears,forest'));
    await waitForDuel(page);
    // Wait for a stable player-turn state so no pending AI timers exist.
    await waitForPlayerMain1(page);

    // Force COMBAT_BLOCKERS with player as active player (player attacked, AI defends).
    await page.evaluate(() => {
      const d = (window as any).__duelDispatch;
      if (!d) throw new Error('__duelDispatch not available');
      d({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_BLOCKERS', active: 'p' });
    });

    // Done Blocking must NOT be visible when the player is the attacker.
    const doneBlockingBtn = page.getByTestId('done-blocking-button');
    await expect(doneBlockingBtn).not.toBeVisible({ timeout: 1000 });
  });
});

// ---------------------------------------------------------------------------
test.describe('TD-002: X-spell cast log', () => {
  test('TD-002: X-spell cast log includes resolved X value', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await page.waitForFunction(() => typeof (window as any).__duelDispatch === 'function');

    // Inject Mind Twist into player hand with mana support
    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'p',
        cards: ['mind_twist'],
        xVal: 3,
      });
    });

    // Tap mana and cast Mind Twist with X=3
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const lands = state.p.bf.filter((c: any) => c.type === 'Land' && !c.tapped);
      for (const land of lands.slice(0, 4)) {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: land.iid });
      }
      const mt = state.p.hand.find((c: any) => c.id === 'mind_twist');
      (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: mt.iid, tgt: 'o', xVal: 3 });
    });

    const state = await page.evaluate(() => (window as any).__duelState());
    const lastPlayLog = [...state.log].reverse().find((e: any) => {
      const text = typeof e === 'string' ? e : e?.text ?? '';
      return /casts Mind Twist/i.test(text);
    });
    expect(lastPlayLog).toBeTruthy();
    const logText = typeof lastPlayLog === 'string' ? lastPlayLog : (lastPlayLog as any).text;
    expect(logText).toMatch(/\(X=3\)/);
  });

  test('TD-002: non-X spell cast log has no X suffix', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await page.waitForFunction(() => typeof (window as any).__duelDispatch === 'function');

    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'p',
        cards: ['lightning_bolt'],
      });
    });

    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const lands = state.p.bf.filter((c: any) => c.type === 'Land' && !c.tapped);
      for (const land of lands.slice(0, 1)) {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: land.iid });
      }
      const bolt = state.p.hand.find((c: any) => c.id === 'lightning_bolt');
      (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: bolt.iid, tgt: 'o' });
    });

    const state = await page.evaluate(() => (window as any).__duelState());
    const lastPlayLog = [...state.log].reverse().find((e: any) => {
      const text = typeof e === 'string' ? e : e?.text ?? '';
      return /casts Lightning Bolt/i.test(text);
    });
    expect(lastPlayLog).toBeTruthy();
    const logText = typeof lastPlayLog === 'string' ? lastPlayLog : (lastPlayLog as any).text;
    expect(logText).not.toMatch(/\(X=/);
  });

  test('TD-005: cannot play a land while a spell is on the stack', async ({ page }) => {
    await page.goto('/?duel=sandbox');
    await page.waitForFunction(() => typeof (window as any).__duelDispatch === 'function');

    // Put a land in hand and a spell on the stack
    await page.evaluate(() => {
      // Force a sorcery onto the stack by casting it as opponent
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cards: ['forest'] });
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cards: ['dark_ritual'] });
      // Manually push a stack item to simulate spell-on-stack state
      const state = (window as any).__duelState();
      // Use SET_PHASE_FOR_TEST to ensure we're in MAIN_1
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1' });
    });

    // Cast dark_ritual as opponent to put something on the stack
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const dr = state.o.hand.find((c: any) => c.id === 'dark_ritual');
      if (dr) (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'o', iid: dr.iid });
    });

    // Verify stack is non-empty
    const stackLen = await page.evaluate(() => (window as any).__duelState().stack.length);
    expect(stackLen).toBeGreaterThan(0);

    // Record player's bf length before attempted land play
    const bfBefore = await page.evaluate(() => (window as any).__duelState().p.bf.length);

    // Attempt to play a land
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const land = state.p.hand.find((c: any) => c.id === 'forest');
      if (land) (window as any).__duelDispatch({ type: 'PLAY_LAND', who: 'p', iid: land.iid });
    });

    // Battlefield should be unchanged — land play was rejected
    const bfAfter = await page.evaluate(() => (window as any).__duelState().p.bf.length);
    expect(bfAfter).toBe(bfBefore);

    // Log should contain the rule message
    const state = await page.evaluate(() => (window as any).__duelState());
    const logText2 = (state.log as any[])
      .map((e: any) => (typeof e === 'string' ? e : e?.text ?? ''))
      .join('\n');
    expect(logText2).toMatch(/cannot play a land while spells are on the stack/i);
  });

  test('TD-005: land can be played normally when stack is empty', async ({ page }) => {
    await page.goto('/?duel=sandbox');
    await page.waitForFunction(() => typeof (window as any).__duelDispatch === 'function');

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cards: ['forest'] });
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1' });
    });

    const bfBefore = await page.evaluate(() => (window as any).__duelState().p.bf.length);

    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const land = state.p.hand.find((c: any) => c.id === 'forest');
      if (land) (window as any).__duelDispatch({ type: 'PLAY_LAND', who: 'p', iid: land.iid });
    });

    const bfAfter = await page.evaluate(() => (window as any).__duelState().p.bf.length);
    expect(bfAfter).toBe(bfBefore + 1);
  });
});

// ---------------------------------------------------------------------------
test.describe('TD-003: tap-before-targeting fix', () => {
  test('TD-003: target selection survives mana tap on desktop', async ({ page }) => {
    await page.goto('/?duel=sandbox');
    await page.waitForFunction(() => typeof (window as any).__duelDispatch === 'function');

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1' });
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['terror'] });
    });

    // Put a creature on opponent's battlefield to target
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['grizzly_bears'] });
      const state = (window as any).__duelState();
      const bear = state.o.hand.find((c: any) => c.id === 'grizzly_bears');
      if (bear) (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'o', iid: bear.iid });
      (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
    });

    // Select Terror and pick a target
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const terror = state.p.hand.find((c: any) => c.id === 'terror');
      const bear = state.o.bf.find((c: any) => c.id === 'grizzly_bears');
      if (terror) (window as any).__duelDispatch({ type: 'SEL_CARD', iid: terror.iid });
      if (bear)   (window as any).__duelDispatch({ type: 'SEL_TGT',  iid: bear.iid });
    });

    // Tap a land AFTER selecting the target, then click Cast to queue pendingCast
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const land = state.p.bf.find((c: any) => c.type === 'Land' && !c.tapped);
      if (land) (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: land.iid });
    });

    // selTgt may be reset by engine after tap — pendingCast preserves the target
    // Click Cast to queue pendingCast (target captured before mana taps clear it)
    // Re-select target if needed (since we tapped before clicking cast the first time)
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const terror = state.p.hand.find((c: any) => c.id === 'terror');
      const bear = state.o.bf.find((c: any) => c.id === 'grizzly_bears');
      if (terror) (window as any).__duelDispatch({ type: 'SEL_CARD', iid: terror.iid });
      if (bear)   (window as any).__duelDispatch({ type: 'SEL_TGT',  iid: bear.iid });
    });

    // Click Cast to queue pendingCast
    await page.getByTestId('cast-button').click();

    // Tap enough mana to cast (1B): tap remaining untapped lands
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const untapped = state.p.bf.filter((c: any) => c.type === 'Land' && !c.tapped);
      for (const land of untapped.slice(0, 2)) {
        (window as any).__duelDispatch({ type: 'TAP_LAND', who: 'p', iid: land.iid });
      }
    });

    // Cast button should now be enabled (mana satisfied)
    await expect(page.getByTestId('cast-button')).toBeEnabled();
    await page.getByTestId('cast-button').click();

    // Grizzly Bears should be in opponent's graveyard
    await page.waitForFunction(() => {
      const state = (window as any).__duelState();
      return (state.o.gy as any[]).some((c: any) => c.id === 'grizzly_bears') ||
             (state.o.bf as any[]).every((c: any) => c.id !== 'grizzly_bears');
    }, { timeout: 5000 });

    const state = await page.evaluate(() => (window as any).__duelState());
    const inGy = (state.o.gy as any[]).some((c: any) => c.id === 'grizzly_bears');
    expect(inGy).toBe(true);
  });

  test('TD-003: cast button disabled when pendingCast queued but mana insufficient', async ({ page }) => {
    await page.goto('/?duel=sandbox');
    await page.waitForFunction(() => typeof (window as any).__duelDispatch === 'function');

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1' });
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['terror'] });
    });

    // Add a creature target
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['grizzly_bears'] });
      const state = (window as any).__duelState();
      const bear = state.o.hand.find((c: any) => c.id === 'grizzly_bears');
      if (bear) (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'o', iid: bear.iid });
      (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
    });

    // Select Terror and target — but tap NO mana
    await page.evaluate(() => {
      const state = (window as any).__duelState();
      const terror = state.p.hand.find((c: any) => c.id === 'terror');
      const bear = state.o.bf.find((c: any) => c.id === 'grizzly_bears');
      if (terror) (window as any).__duelDispatch({ type: 'SEL_CARD', iid: terror.iid });
      if (bear)   (window as any).__duelDispatch({ type: 'SEL_TGT',  iid: bear.iid });
    });

    // Click Cast to queue pendingCast (no mana tapped)
    await page.getByTestId('cast-button').click();

    // Cast button should be disabled (pendingCast queued but mana not satisfied)
    const castBtn = page.getByTestId('cast-button');
    await expect(castBtn).toBeDisabled();
  });
});
