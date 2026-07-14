import { test, expect, Page } from '@playwright/test';

// Moderate-tier Alpha/Beta stub cards implemented from Card-Forge/forge reference
// scripts (GPL-3.0). See THIRD_PARTY_NOTICES.md for attribution. Representative
// sample spanning: an M1 activated ability (Brothers of Fire), an M2 keyword
// creature in combat (Thunder Spirit -- flying, first strike), an M3 static
// effect visibly modifying board state (Orcish Oriflamme), and an M4 trigger
// firing (Onulet -- dies, gain 2 life).

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

async function activateAndResolve(page: Page, iid: string, tgt: string | null) {
  await page.evaluate(({ sourceIid, tgtArg }) => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: sourceIid, tgt: tgtArg });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
  }, { sourceIid: iid, tgtArg: tgt });
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
  // ── M1. Brothers of Fire: activated ability deals 1 damage to any target and 1 to controller ──
  test('Brothers of Fire deals 1 damage to the opponent and 1 damage to its own controller', async ({ page }) => {
    await page.goto(sandboxWith('brothers_of_fire'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['brothers_of_fire'], { R: 2, C: 3 });
    const bofIid = await castAndResolve(page, 'brothers_of_fire');
    await clearSummoningSick(page, bofIid);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: [], mana: { R: 2, C: 1 } });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().p?.mana?.R === 2, null, { timeout: 5_000 });

    const before = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return { pLife: s.p.life, oLife: s.o.life };
    });

    await activateAndResolve(page, bofIid, 'o');
    await page.waitForFunction((expectedOLife) => {
      const s = (window as any).__duelState?.();
      return s?.o?.life === expectedOLife;
    }, before.oLife - 1, { timeout: 10_000 });

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.o.life).toBe(before.oLife - 1);
    expect(after.p.life).toBe(before.pLife - 1);
  });

  // ── M2. Thunder Spirit: flying + first strike keyword creature in combat ──
  test('Thunder Spirit deals first-strike combat damage as an unblocked attacker', async ({ page }) => {
    await page.goto(sandboxWith('thunder_spirit'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['thunder_spirit'], { W: 3 });
    const spiritIid = await castAndResolve(page, 'thunder_spirit');
    await clearSummoningSick(page, spiritIid);

    const before = await page.evaluate(() => (window as any).__duelState().o.life);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().phase === 'COMBAT_ATTACKERS', null, { timeout: 5_000 });

    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, spiritIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return (s?.attackers || []).includes(iid);
    }, spiritIid, { timeout: 5_000 });

    // Full combat sub-phase cycle: ATTACKERS -> AFTER_ATTACKERS -> BLOCKERS ->
    // AFTER_BLOCKERS -> DAMAGE (resolveCombat runs on entering DAMAGE).
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); });
    }

    await page.waitForFunction((expectedLife) => {
      const s = (window as any).__duelState?.();
      return s?.o?.life === expectedLife;
    }, before - 2, { timeout: 10_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect(s1.o.life).toBe(before - 2);
    const spirit = s1.p.bf.find((c: any) => c.iid === spiritIid);
    expect(spirit.keywords).toContain('FLYING');
    expect(spirit.keywords).toContain('FIRST_STRIKE');
  });

  // ── M3. Orcish Oriflamme: attacking creatures you control get +1/+0 ────────
  test('Orcish Oriflamme visibly pumps an attacking creature +1/+0', async ({ page }) => {
    await page.goto(sandboxWith('orcish_oriflamme,grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['orcish_oriflamme', 'grizzly_bears'], { R: 3, G: 1, C: 4 });
    await castAndResolve(page, 'orcish_oriflamme');
    const bearsIid = await castAndResolve(page, 'grizzly_bears');
    await clearSummoningSick(page, bearsIid);

    // Not attacking: base power (2).
    const s0 = await page.evaluate(() => (window as any).__duelState());
    const bearsBefore = s0.p.bf.find((c: any) => c.iid === bearsIid);
    expect(bearsBefore.power).toBe(2);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().phase === 'COMBAT_ATTACKERS', null, { timeout: 5_000 });

    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, bearsIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return (s?.attackers || []).includes(iid);
    }, bearsIid, { timeout: 5_000 });

    // computeCharacteristics-based power (via getPow) is what combat/UI read;
    // exposed on window.__duelState() as the raw card object, so recompute via
    // the exported getPow through a dispatched no-op read is unnecessary --
    // the log line from combat resolution is the settle signal for the pump
    // having applied, checked indirectly via life loss below.
    const oBefore = await page.evaluate(() => (window as any).__duelState().o.life);
    // Full combat sub-phase cycle: ATTACKERS -> AFTER_ATTACKERS -> BLOCKERS ->
    // AFTER_BLOCKERS -> DAMAGE (resolveCombat runs on entering DAMAGE).
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); });
    }
    await page.waitForFunction((expectedLife) => {
      const s = (window as any).__duelState?.();
      return s?.o?.life === expectedLife;
    }, oBefore - 3, { timeout: 10_000 }); // 2 base + 1 from Orcish Oriflamme
  });

  // ── M4. Onulet: dies trigger gains its controller 2 life ───────────────────
  test('Onulet dying triggers a 2-life gain for its controller', async ({ page }) => {
    await page.goto(sandboxWith('onulet'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['onulet'], { C: 3 });
    const onuletIid = await castAndResolve(page, 'onulet');
    await clearSummoningSick(page, onuletIid);

    const before = await page.evaluate(() => (window as any).__duelState().p.life);

    // Lethal damage via DEBUG_PATCH_CARD, then declare it as an attacker (an
    // undeclared attacker set makes ADVANCE_PHASE skip the whole combat phase
    // sequence straight to MAIN_2, bypassing resolveCombat's checkDeath call)
    // and advance through combat so the SBE pass picks up the lethal damage.
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { damage: 2 } });
    }, onuletIid);
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
    });
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, onuletIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return (s?.attackers || []).includes(iid);
    }, onuletIid, { timeout: 5_000 });
    // Full combat sub-phase cycle: ATTACKERS -> AFTER_ATTACKERS -> BLOCKERS ->
    // AFTER_BLOCKERS -> DAMAGE. resolveCombat (entered at DAMAGE) calls checkDeath.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); });
    }

    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return !s?.p?.bf?.some((c: any) => c.iid === iid);
    }, onuletIid, { timeout: 10_000 });

    const after = await page.evaluate(() => (window as any).__duelState());
    expect(after.p.gy.some((c: any) => c.iid === onuletIid)).toBe(true);
    expect(after.p.life).toBe(before + 2);
  });
}

test.describe('@engine-tier-moderate-1 @mobile Moderate-tier Forge batch 2 -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  batchTests();
});

test.describe('@engine-tier-moderate-1 @mobile Moderate-tier Forge batch 2 -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  batchTests();
});
