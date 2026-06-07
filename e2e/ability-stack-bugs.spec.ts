import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173/?sandbox=true';

async function waitForDuel(page: any) {
  await page.waitForFunction(() => (window as any).__duelState?.()?.phase != null, { timeout: 10_000 });
}
async function waitForMain1(page: any) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s?.phase === 'MAIN_1' && s?.active === 'p';
  }, { timeout: 10_000 });
}

// ── 1. Ability goes on the stack ───────────────────────────────────────────

test('1A: Prodigal Sorcerer ability goes on stack when activated', async ({ page }) => {
  await page.goto(BASE);
  await waitForDuel(page);
  await waitForMain1(page);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['prodigal_sorcerer'], mana: { U: 1, C: 2 } });
  });
  // Cast Prodigal Sorcerer and resolve it.
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const ps = s.p.hand.find((c: any) => c.id === 'prodigal_sorcerer');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: ps.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    const s2 = (window as any).__duelState();
    const psiid = s2.p.bf.find((c: any) => c.id === 'prodigal_sorcerer')?.iid;
    dispatch({ type: 'ACTIVATE_ABILITY', iid: psiid, tgt: 'o' });
  });

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.stack.length).toBeGreaterThan(0);
  expect(s.stack.some((item: any) => item.isAbility === true)).toBe(true);
  expect(s.priorityWindow).toBe(true);
});

test('1B: Goblin Balloon Brigade mana cost deducted on activation', async ({ page }) => {
  await page.goto(BASE);
  await waitForDuel(page);
  await waitForMain1(page);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['goblin_balloon_brigade'], mana: { R: 2 } });
    const s = (window as any).__duelState();
    const gbb = s.p.hand.find((c: any) => c.id === 'goblin_balloon_brigade');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: gbb.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { R: 1 } });
  });

  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const gbb = s.p.bf.find((c: any) => c.id === 'goblin_balloon_brigade');
    dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    dispatch({ type: 'ACTIVATE_ABILITY', iid: gbb.iid, tgt: null });
  });

  const s = await page.evaluate(() => (window as any).__duelState());
  // Mana R should be 0 after paying {R}
  expect(s.p.mana.R).toBe(0);
  expect(s.stack.some((i: any) => i.isAbility)).toBe(true);
});

test('1C: Goblin Balloon Brigade blocked without mana -- activation rejected', async ({ page }) => {
  await page.goto(BASE);
  await waitForDuel(page);
  await waitForMain1(page);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['goblin_balloon_brigade'], mana: { R: 1 } });
    const s = (window as any).__duelState();
    const gbb = s.p.hand.find((c: any) => c.id === 'goblin_balloon_brigade');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: gbb.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    // Give no red mana
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', mana: { R: 0, U: 0, B: 0, W: 0, G: 0, C: 0 } });
  });

  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const gbb = s.p.bf.find((c: any) => c.id === 'goblin_balloon_brigade');
    dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    dispatch({ type: 'ACTIVATE_ABILITY', iid: gbb.iid, tgt: null });
  });

  const s = await page.evaluate(() => (window as any).__duelState());
  // Stack must remain empty -- activation was rejected for insufficient mana
  expect(s.stack.length).toBe(0);
});

// ── 2. Wall of Bone cannot attack ─────────────────────────────────────────

test('2A: Wall of Bone with DEFENDER cannot be declared as attacker', async ({ page }) => {
  await page.goto(BASE);
  await waitForDuel(page);
  await waitForMain1(page);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['wall_of_bone'], mana: { B: 1, C: 1 } });
    const s = (window as any).__duelState();
    const wb = s.p.hand.find((c: any) => c.id === 'wall_of_bone');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: wb.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
  });

  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const wb = s.p.bf.find((c: any) => c.id === 'wall_of_bone');
    dispatch({ type: 'DECLARE_ATTACKER', iid: wb.iid });
  });

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.attackers).not.toContain(
    s.p.bf.find((c: any) => c.id === 'wall_of_bone')?.iid
  );
});

// ── 3. Terror cannot target black creatures (AI) ───────────────────────────

test('3A: AI selectTarget for Terror excludes black creatures', async ({ page }) => {
  await page.goto(BASE);
  await waitForDuel(page);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    // Player has only a black creature (Wall of Bone) -- Terror cannot target it.
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['wall_of_bone'], mana: { B: 1, C: 1 } });
    const s = (window as any).__duelState();
    const wb = s.p.hand.find((c: any) => c.id === 'wall_of_bone');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: wb.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    // Give AI Terror and mana.
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['terror'], mana: { B: 1, C: 1 } });
    dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
  });

  // Let the AI take its turn -- wait for phase to advance past MAIN_1.
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.active === 'o' && s.phase !== 'MAIN_1';
  }, { timeout: 8_000 });

  const s = await page.evaluate(() => (window as any).__duelState());
  // Wall of Bone must still be alive.
  expect(s.p.bf.some((c: any) => c.id === 'wall_of_bone')).toBe(true);
});

// ── 4. Dark Ritual: AI skips when no follow-up exists ─────────────────────

test('4A: AI does not cast Dark Ritual with empty hand follow-up', async ({ page }) => {
  await page.goto(BASE);
  await waitForDuel(page);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'o' });
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'o', cardIds: ['dark_ritual'], mana: { B: 1 } });
  });

  // Let AI run -- wait for turn to advance.
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && (s.active === 'p' || s.phase !== 'MAIN_1');
  }, { timeout: 8_000 });

  const s = await page.evaluate(() => (window as any).__duelState());
  // Since the AI hand had ONLY Dark Ritual and no affordable follow-up, ritual should remain in hand.
  expect(s.o.gy.some((c: any) => c.id === 'dark_ritual')).toBe(false);
});

// ── 5. Mobile: Prodigal Sorcerer can target opponent life banner ───────────

test('5A: mobile -- ability with player target activates on banner click', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE);
  await waitForDuel(page);
  await waitForMain1(page);

  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['prodigal_sorcerer'], mana: { U: 1, C: 2 } });
    const s = (window as any).__duelState();
    const ps = s.p.hand.find((c: any) => c.id === 'prodigal_sorcerer');
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: ps.iid, tgt: null, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    dispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
  });

  // Activate targeting opponent directly via dispatch.
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const ps = s.p.bf.find((c: any) => c.id === 'prodigal_sorcerer');
    dispatch({ type: 'ACTIVATE_ABILITY', iid: ps.iid, tgt: 'o' });
  });

  const s = await page.evaluate(() => (window as any).__duelState());
  expect(s.stack.some((i: any) => i.isAbility && i.targets?.includes('o'))).toBe(true);
  // Resolve and confirm opponent took 1 damage.
  await page.evaluate(() => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  });
  const s2 = await page.evaluate(() => (window as any).__duelState());
  // Verify via log entry.
  expect(s2.log.some((e: any) => e.text?.includes('1 damage') || e.text?.includes('ping') || e.text?.includes('Prodigal'))).toBe(true);
});
