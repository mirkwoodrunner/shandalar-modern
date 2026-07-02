import { test, expect, Page } from '@playwright/test';

// Type-Changing Continuous Effects (Deferral Sweep 2): Living Lands animates a
// Forest into a 1/1 creature that's still a land, it can attack, and when
// Living Lands is destroyed the Forest reverts -- including mid-combat.
// See THIRD_PARTY_NOTICES.md for attribution and docs/SYSTEMS.md S18.9 for the
// typeEff/subtypeEff/colorEff/landTypeOverride baking contract.

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

async function forceHand(page: Page, who: 'p' | 'o', cardIds: string[], mana: Record<string, number>) {
  await page.evaluate(({ w, ids, m }) => {
    (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: w, cardIds: ids, mana: m });
  }, { w: who, ids: cardIds, m: mana });
  await page.waitForFunction(({ w, ids }) => {
    const s = (window as any).__duelState?.();
    return ids.every((id: string) => (s?.[w]?.hand as any[])?.some((c: any) => c.id === id));
  }, { w: who, ids: cardIds }, { timeout: 5_000 });
}

async function playLand(page: Page, cardId: string): Promise<string> {
  return page.evaluate((id) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s.p.hand as any[]).find((c: any) => c.id === id);
    if (!card) throw new Error(`${id} not in p hand`);
    dispatch({ type: 'PLAY_LAND', who: 'p', iid: card.iid });
    return card.iid;
  }, cardId);
}

async function castAndResolve(page: Page, cardId: string, tgt: string | null = null): Promise<string> {
  return page.evaluate(({ id, t }) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s.p.hand as any[]).find((c: any) => c.id === id);
    if (!card) throw new Error(`${id} not in p hand`);
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: t, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    return card.iid;
  }, { id: cardId, t: tgt });
}

async function isCreOnBf(page: Page, iid: string): Promise<boolean> {
  return page.evaluate((id) => {
    const s = (window as any).__duelState();
    const c = s.p.bf.find((x: any) => x.iid === id);
    const t = c?.typeEff ?? c?.type;
    return !!t?.includes('Creature');
  }, iid);
}

function batchTests() {
  test('Living Lands animates a Forest, which can attack and reverts (including mid-combat) when Living Lands is destroyed', async ({ page }) => {
    await page.goto(sandboxWith('living_lands,forest,disenchant,grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['forest', 'living_lands'], { G: 1, C: 3 });
    const forestIid = await playLand(page, 'forest');
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.p?.bf?.some((c: any) => c.iid === iid);
    }, forestIid, { timeout: 5_000 });

    // Before Living Lands: the Forest renders as a small 32x32 LandPip, not a creature card.
    const pipBox = await page.locator(`[data-iid="${forestIid}"]`).boundingBox();
    expect(pipBox?.width).toBeLessThan(40);

    await castAndResolve(page, 'living_lands');
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      const c = s?.p?.bf?.find((x: any) => x.iid === iid);
      return c?.typeEff?.includes('Creature');
    }, forestIid, { timeout: 10_000 });

    expect(await isCreOnBf(page, forestIid)).toBe(true);

    // Visually: the animated Forest now renders as a full FieldCard (96px wide), not a LandPip.
    const cardBox = await page.locator(`[data-iid="${forestIid}"]`).boundingBox();
    expect(cardBox?.width).toBeGreaterThan(60);

    // Clear summoning sickness so it can attack this turn, then declare it as an attacker.
    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { summoningSick: false } });
    }, forestIid);
    await page.evaluate((ph) => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: ph, active: 'p' });
    }, 'COMBAT_ATTACKERS');
    await page.waitForFunction(() => (window as any).__duelState?.()?.phase === 'COMBAT_ATTACKERS', { timeout: 5_000 });

    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, forestIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.attackers?.includes(iid);
    }, forestIid, { timeout: 5_000 });

    // Destroy Living Lands while the animated Forest is still marked attacking.
    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
    });
    await forceHand(page, 'p', ['disenchant'], { W: 1, C: 1 });
    const llIid = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return s.p.bf.find((c: any) => c.name === 'Living Lands').iid;
    });
    await castAndResolve(page, 'disenchant', llIid);

    // The Forest reverts: no longer a creature, no longer marked attacking, spliced out of combat.
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      const c = s?.p?.bf?.find((x: any) => x.iid === iid);
      return c && !c.typeEff?.includes('Creature');
    }, forestIid, { timeout: 10_000 });

    const finalState = await page.evaluate(() => (window as any).__duelState());
    const revertedForest = finalState.p.bf.find((c: any) => c.iid === forestIid);
    expect(revertedForest.attacking).toBe(false);
    expect(finalState.attackers).not.toContain(forestIid);

    // Visually reverted: back to a 32x32 LandPip.
    const revertedBox = await page.locator(`[data-iid="${forestIid}"]`).boundingBox();
    expect(revertedBox?.width).toBeLessThan(40);
  });
}

test.describe('@engine @mobile Deferral Sweep 2 -- type-change -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  batchTests();
});

test.describe('@engine @mobile Deferral Sweep 2 -- type-change -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  batchTests();
});
