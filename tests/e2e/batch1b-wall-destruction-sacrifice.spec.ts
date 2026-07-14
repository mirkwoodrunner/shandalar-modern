import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const sandboxWith = (cards: string) => `${SANDBOX_URL}&cards=${cards}`;

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT  = { width: 390,  height: 844 };

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// Cast a card from a given player's hand and resolve the stack. Returns the iid.
async function castAndResolve(page: Page, cardId: string, who: 'p' | 'o' = 'p'): Promise<string> {
  const iid = await page.evaluate(({ id, w }) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s[w].hand as any[]).find((c: any) => c.id === id);
    if (!card) throw new Error(`${id} not in ${w} hand`);
    dispatch({ type: 'CAST_SPELL', who: w, iid: card.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    return card.iid;
  }, { id: cardId, w: who });
  await page.waitForFunction(({ id, w }) => {
    const s = (window as any).__duelState?.();
    return (s?.[w]?.bf as any[])?.some((c: any) => c.id === id);
  }, { id: cardId, w: who }, { timeout: 10_000 });
  return iid;
}

// Activate an ability, pass priorities, resolve the stack.
async function activateAndResolve(page: Page, iid: string, tgt: string | null) {
  await page.evaluate(({ sourceIid, tgtArg }) => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: sourceIid, tgt: tgtArg });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  }, { sourceIid: iid, tgtArg: tgt });
}

// ---------------------------------------------------------------------------
// Test suite shared across viewports
// ---------------------------------------------------------------------------

function batch1bTests() {
  // ── 1. Goblin Digging Team destroys a Wall ─────────────────────────────────
  test('1A: Goblin Digging Team sacrifices itself and destroys target Wall', async ({ page }) => {
    await page.goto(sandboxWith('goblin_digging_team'));
    await waitForDuel(page);
    await waitForMain1(page);

    // Give player GDT with R mana to cast it.
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['goblin_digging_team'], mana: { R: 1 } });
    });
    const gdtIid = await castAndResolve(page, 'goblin_digging_team');

    // Remove GDT summoning sickness.
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { summoningSick: false } });
    }, gdtIid);

    // Put Wall of Stone on opponent's side (0/8 Wall, rarity U, no STUB).
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['wall_of_stone'], mana: { R: 3 } });
    });
    const wallIid = await castAndResolve(page, 'wall_of_stone', 'o');

    // Activate GDT (cost T,sac) targeting the Wall.
    await activateAndResolve(page, gdtIid, wallIid);

    const s = await page.evaluate(() => (window as any).__duelState());

    // GDT must be in player's graveyard (sacrificed as cost).
    expect(s.p.gy.some((c: any) => c.id === 'goblin_digging_team')).toBe(true);
    expect(s.p.bf.some((c: any) => c.id === 'goblin_digging_team')).toBe(false);

    // Wall must be in opponent's graveyard (destroyed by effect).
    expect(s.o.gy.some((c: any) => c.id === 'wall_of_stone')).toBe(true);
    expect(s.o.bf.some((c: any) => c.id === 'wall_of_stone')).toBe(false);
  });

  // ── 2. Goblin Digging Team sacrificed even when target fizzles ────────────
  test('1B: Goblin Digging Team is sacrificed (cost paid) even when ability fizzles', async ({ page }) => {
    await page.goto(sandboxWith('goblin_digging_team'));
    await waitForDuel(page);
    await waitForMain1(page);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['goblin_digging_team'], mana: { R: 1 } });
    });
    const gdtIid = await castAndResolve(page, 'goblin_digging_team');
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { summoningSick: false } });
    }, gdtIid);

    // No Wall on battlefield. Activate with null target (no legal Wall to select).
    await activateAndResolve(page, gdtIid, null);

    const s = await page.evaluate(() => (window as any).__duelState());

    // GDT must still be in graveyard: sacrifice is a cost paid before effect resolves.
    expect(s.p.gy.some((c: any) => c.id === 'goblin_digging_team')).toBe(true);
    expect(s.p.bf.some((c: any) => c.id === 'goblin_digging_team')).toBe(false);

    // Log must contain a fizzle message.
    const fizzleLog = (s.log as any[]).some((entry: any) =>
      entry.text && entry.text.toLowerCase().includes('fizzles')
    );
    expect(fizzleLog).toBe(true);
  });

  // ── 3. Scavenger Folk pays G, sacrifices, destroys artifact ───────────────
  test('1C: Scavenger Folk deducts G mana, sacrifices itself, destroys target artifact', async ({ page }) => {
    await page.goto(sandboxWith('scavenger_folk'));
    await waitForDuel(page);
    await waitForMain1(page);

    // Give player SF with G mana already in pool to pay its cast cost and ability cost.
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['scavenger_folk'], mana: { G: 3 } });
    });
    const sfIid = await castAndResolve(page, 'scavenger_folk');
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { summoningSick: false } });
    }, sfIid);

    // Put Mox Sapphire (pure artifact) on opponent's side.
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['mox_sapphire'], mana: {} });
    });
    const moxIid = await castAndResolve(page, 'mox_sapphire', 'o');

    // Record G mana before activation.
    const manaBefore = await page.evaluate(() => {
      return (window as any).__duelState().p.mana.G ?? 0;
    });

    // Activate SF (cost G,T,sac) targeting the Mox.
    await activateAndResolve(page, sfIid, moxIid);

    const s = await page.evaluate(() => (window as any).__duelState());

    // G mana must be deducted by 1.
    expect(s.p.mana.G ?? 0).toBe(manaBefore - 1);

    // SF must be in player's graveyard.
    expect(s.p.gy.some((c: any) => c.id === 'scavenger_folk')).toBe(true);
    expect(s.p.bf.some((c: any) => c.id === 'scavenger_folk')).toBe(false);

    // Mox Sapphire must be in opponent's graveyard.
    expect(s.o.gy.some((c: any) => c.id === 'mox_sapphire')).toBe(true);
    expect(s.o.bf.some((c: any) => c.id === 'mox_sapphire')).toBe(false);
  });

  // ── 4. D'Avenant Archer pings attacker / fizzles on non-combatant ─────────
  test("1D: D'Avenant Archer deals 1 damage to attacker; fizzles on non-combatant", async ({ page }) => {
    await page.goto(sandboxWith('davenant_archer'));
    await waitForDuel(page);
    await waitForMain1(page);

    // Give player Archer and a creature to serve as the attacker target.
    await page.evaluate(() => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['davenant_archer', 'grizzly_bears'], mana: { W: 3, G: 2 } });
    });
    const archerIid = await castAndResolve(page, 'davenant_archer');
    const bearsIid  = await castAndResolve(page, 'grizzly_bears');

    // Remove summoning sickness from both.
    await page.evaluate(({ a, b }) => {
      const dispatch = (window as any).__duelDispatch;
      dispatch({ type: 'DEBUG_PATCH_CARD', iid: a, patch: { summoningSick: false } });
      dispatch({ type: 'DEBUG_PATCH_CARD', iid: b, patch: { summoningSick: false } });
    }, { a: archerIid, b: bearsIid });

    // Move to combat; declare Bears as attacker.
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
    });
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, bearsIid);

    // Verify Bears are attacking.
    const isAttacking = await page.evaluate((iid) => {
      return ((window as any).__duelState().attackers || []).includes(iid);
    }, bearsIid);
    expect(isAttacking).toBe(true);

    // Activate Archer targeting the attacking Bears.
    await activateAndResolve(page, archerIid, bearsIid);

    const s1 = await page.evaluate(() => (window as any).__duelState());
    const bears1 = s1.p.bf.find((c: any) => c.iid === bearsIid);
    expect(bears1?.damage).toBe(1);

    // Reset to MAIN_1; Bears are no longer attacking.
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    });

    // Untap Archer for a second activation attempt.
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { tapped: false } });
    }, archerIid);

    // Activate Archer targeting Bears (now a non-combatant) -- expect fizzle.
    await activateAndResolve(page, archerIid, bearsIid);

    const s2 = await page.evaluate(() => (window as any).__duelState());
    const bears2 = s2.p.bf.find((c: any) => c.iid === bearsIid);
    // Damage must not increase beyond the 1 from the first activation.
    expect(bears2?.damage ?? 0).toBe(1);

    const fizzleLog = (s2.log as any[]).some((entry: any) =>
      entry.text && entry.text.toLowerCase().includes('fizzles')
    );
    expect(fizzleLog).toBe(true);
  });

  // ── 5. Desktop/mobile parity -- state comparison after GDT activation ─────
  test('1E: GDT activation produces identical state on both viewports', async ({ page }) => {
    await page.goto(sandboxWith('goblin_digging_team'));
    await waitForDuel(page);
    await waitForMain1(page);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['goblin_digging_team'], mana: { R: 1 } });
    });
    const gdtIid = await castAndResolve(page, 'goblin_digging_team');
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { summoningSick: false } });
    }, gdtIid);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['wall_of_stone'], mana: { R: 3 } });
    });
    const wallIid = await castAndResolve(page, 'wall_of_stone', 'o');

    await activateAndResolve(page, gdtIid, wallIid);

    const s = await page.evaluate(() => (window as any).__duelState());

    // Assert both players' graveyard state (viewport-agnostic state check).
    expect(s.p.gy.some((c: any) => c.id === 'goblin_digging_team')).toBe(true);
    expect(s.o.gy.some((c: any) => c.id === 'wall_of_stone')).toBe(true);
    expect(s.p.bf.some((c: any) => c.id === 'goblin_digging_team')).toBe(false);
    expect(s.o.bf.some((c: any) => c.id === 'wall_of_stone')).toBe(false);
  });
}

// ---------------------------------------------------------------------------
// Desktop suite
// ---------------------------------------------------------------------------
test.describe('@engine-tier-simple-1 @mobile Batch 1B Wall/Sacrifice -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  batch1bTests();
});

// ---------------------------------------------------------------------------
// Mobile suite (same logic -- verifies mobile/desktop parity)
// ---------------------------------------------------------------------------
test.describe('@engine-tier-simple-1 @mobile Batch 1B Wall/Sacrifice -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  batch1bTests();
});
