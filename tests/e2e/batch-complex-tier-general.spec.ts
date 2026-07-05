import { test, expect, Page } from '@playwright/test';

// Complex-tier stub cards implemented from Card-Forge/forge reference scripts
// (GPL-3.0), sub-batches C1-C4. See THIRD_PARTY_NOTICES.md for attribution.
// Representative sample spanning: a C1 X-cost activated ability (Banshee), a
// C3 static continuous effect visibly modifying board state (Rabid Wombat's
// per-Aura P/T bonus), and a C4 trigger firing off combat damage (El-Hajjâj).
//
// Circle of Protection cycle (White/Blue/Black/Red/Green/Artifacts): all 6
// were deferred in C1 (their "prevent damage from a source of the chosen
// color/type" mechanic needs a source-color-matching prevention hook that
// doesn't exist -- the existing damageShield/combatDamageShield prevention
// fields are flat-amount or source-identity-scoped, not source-color-scoped).
// Since none of the 6 were implemented, no CoP-cycle test exists here; see the
// batch completion summary for the full deferred list and reasons.

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

async function castAndResolve(page: Page, cardId: string, tgt: string | null = null, who: 'p' | 'o' = 'p'): Promise<string> {
  const iid = await page.evaluate(({ id, w, t }) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s[w].hand as any[]).find((c: any) => c.id === id);
    if (!card) throw new Error(`${id} not in ${w} hand`);
    dispatch({ type: 'CAST_SPELL', who: w, iid: card.iid, tgt: t, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    return card.iid;
  }, { id: cardId, w: who, t: tgt });
  await page.waitForFunction(({ id, w }) => {
    const s = (window as any).__duelState?.();
    return (s?.[w]?.bf as any[])?.some((c: any) => c.id === id);
  }, { id: cardId, w: who }, { timeout: 10_000 });
  return iid;
}

async function activateAndResolve(page: Page, iid: string, tgt: string | null, xVal: number | null = null) {
  await page.evaluate(({ sourceIid, tgtArg, x }) => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: sourceIid, tgt: tgtArg, xVal: x });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  }, { sourceIid: iid, tgtArg: tgt, x: xVal });
}

async function forceHand(page: Page, who: 'p' | 'o', cardIds: string[], mana: Record<string, number>) {
  await page.evaluate(({ w, ids, m }) => {
    (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: w, cardIds: ids, mana: m });
  }, { w: who, ids: cardIds, m: mana });
  if (cardIds.length) {
    await page.waitForFunction(({ w, ids }) => {
      const s = (window as any).__duelState?.();
      return ids.every((id: string) => (s?.[w]?.hand as any[])?.some((c: any) => c.id === id));
    }, { w: who, ids: cardIds }, { timeout: 5_000 });
  }
}

async function clearSummoningSick(page: Page, iid: string) {
  await page.evaluate((id) => {
    (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid: id, patch: { summoningSick: false } });
  }, iid);
}

function batchTests() {
  // ── C1. Banshee: X-cost activated ability, splits damage between target and controller ──
  test('Banshee deals half X damage to the opponent and half X (rounded up) to its own controller', async ({ page }) => {
    await page.goto(sandboxWith('banshee'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['banshee'], { B: 4, C: 4 });
    const bansheeIid = await castAndResolve(page, 'banshee');
    await clearSummoningSick(page, bansheeIid);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: [], mana: { C: 4 } });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().p?.mana?.C === 4, null, { timeout: 5_000 });

    const before = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { pLife: s.p.life, oLife: s.o.life };
    });

    await activateAndResolve(page, bansheeIid, 'o', 4);
    await page.waitForFunction((expectedOLife) => {
      const s = (window as any).__duelState?.();
      return s?.o?.life === expectedOLife;
    }, before.oLife - 2, { timeout: 10_000 });

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.o.life).toBe(before.oLife - 2); // floor(4/2)
    expect(after.p.life).toBe(before.pLife - 2); // ceil(4/2)
  });

  // ── C3. Rabid Wombat: gets +2/+2 for each Aura attached ─────────────────────
  // Rabid Wombat's own P/T bonus is computed by layers.js's collectEffects (CR
  // 613 layer 7c), not stored on the raw card object -- window.__duelState()
  // exposes the raw bf entry, whose .power/.toughness fields never reflect
  // continuous effects (same caveat already documented in
  // batch-moderate-tier-forge-2.spec.ts's Orcish Oriflamme test). Verified
  // indirectly here via unblocked combat damage instead of reading .power.
  test('Rabid Wombat visibly deals +2/+2-boosted combat damage once an Aura is attached', async ({ page }) => {
    await page.goto(sandboxWith('rabid_wombat,unholy_strength'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['rabid_wombat', 'unholy_strength'], { G: 2, B: 1, C: 3 });
    const wombatIid = await castAndResolve(page, 'rabid_wombat');
    await clearSummoningSick(page, wombatIid);
    await castAndResolve(page, 'unholy_strength', wombatIid);

    const before = await page.evaluate(() => (window as any).__duelState().o.life);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().phase === 'COMBAT_ATTACKERS', null, { timeout: 5_000 });

    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, wombatIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return (s?.attackers || []).includes(iid);
    }, wombatIid, { timeout: 5_000 });

    // Full combat sub-phase cycle: ATTACKERS -> AFTER_ATTACKERS -> BLOCKERS ->
    // AFTER_BLOCKERS -> DAMAGE (resolveCombat runs on entering DAMAGE).
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); });
    }

    // Base 0/1 + Rabid Wombat's own +2/+2 (1 Aura) + Unholy Strength's own +2/+1 = 4 power.
    await page.waitForFunction((expectedLife) => {
      const s = (window as any).__duelState?.();
      return s?.o?.life === expectedLife;
    }, before - 4, { timeout: 10_000 });

    const after = await page.evaluate(() => (window as any).__duelState().o.life);
    expect(after).toBe(before - 4);
  });

  // ── C4. El-Hajjâj: whenever this creature deals damage, its controller gains that much life ──
  test("El-Hajjâj dealing unblocked combat damage triggers a matching life gain", async ({ page }) => {
    await page.goto(sandboxWith('el_hajjaj'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['el_hajjaj'], { B: 3, C: 3 });
    const elHajjajIid = await castAndResolve(page, 'el_hajjaj');
    await clearSummoningSick(page, elHajjajIid);

    const before = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { pLife: s.p.life, oLife: s.o.life };
    });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().phase === 'COMBAT_ATTACKERS', null, { timeout: 5_000 });

    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, elHajjajIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return (s?.attackers || []).includes(iid);
    }, elHajjajIid, { timeout: 5_000 });

    // Full combat sub-phase cycle: ATTACKERS -> AFTER_ATTACKERS -> BLOCKERS ->
    // AFTER_BLOCKERS -> DAMAGE (resolveCombat runs on entering DAMAGE, which
    // emits ON_DAMAGE_DEALT and drains the trigger queue).
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); });
    }

    await page.waitForFunction((expectedOLife) => {
      const s = (window as any).__duelState?.();
      return s?.o?.life === expectedOLife;
    }, before.oLife - 1, { timeout: 10_000 });

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.o.life).toBe(before.oLife - 1);
    expect(after.p.life).toBe(before.pLife + 1); // El-Hajjâj's controller gains life equal to damage dealt
  });
}

test.describe('@engine @mobile Complex-tier Forge batch (C1-C4) -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  batchTests();
});

test.describe('@engine @mobile Complex-tier Forge batch (C1-C4) -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  batchTests();
});
