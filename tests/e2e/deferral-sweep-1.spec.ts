import { test, expect, Page } from '@playwright/test';

// Trigger-Event Expansion + Damage Source Infrastructure (Deferral Sweep 1).
// Covers one ON_SPELL_CAST card visibly triggering (Citanul Druid), one
// ON_PERMANENT_LEAVES_BF card (Dingus Egg damage on land death), and Veteran
// Bodyguard redirecting combat damage. See THIRD_PARTY_NOTICES.md for
// attribution and docs/SYSTEMS.md Sections 17.3.5-17.3.8 / 17.9 for the
// underlying engine contracts.
//
// These three scenarios all require the OPPONENT ('o') to cast a spell, play a
// land, or declare an attacker -- something no other spec in this suite does
// mid-script. Manually dispatching CAST_SPELL/PLAY_LAND/DECLARE_ATTACKER as 'o'
// races the AI main loop in useDuelController.ts (it reacts to s.active
// changing and calls aiDecide() on its own timer). Rather than fight that, each
// test forces the opponent's hand/mana BEFORE handing over the active turn,
// then lets the AI driver act naturally and polls for the resulting state.

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
  if (cardIds.length) {
    await page.waitForFunction(({ w, ids }) => {
      const s = (window as any).__duelState?.();
      return ids.every((id: string) => (s?.[w]?.hand as any[])?.some((c: any) => c.id === id));
    }, { w: who, ids: cardIds }, { timeout: 5_000 });
  }
}

// Player-side only: the AI drives its own casts (see file header).
async function castAndResolve(page: Page, cardId: string, tgt: string | null = null): Promise<string> {
  const iid = await page.evaluate(({ id, t }) => {
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
  return iid;
}

async function clearSummoningSick(page: Page, iid: string) {
  await page.evaluate((id) => {
    (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid: id, patch: { summoningSick: false } });
  }, iid);
}

// Sorcery-speed CAST_SPELL/PLAY_LAND require the caster to be the active player.
// Switches active player (and optionally phase) while clearing stack/priorityWindow.
async function setActive(page: Page, active: 'p' | 'o', phase: string = 'MAIN_1') {
  await page.evaluate(({ a, ph }) => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: ph, active: a });
  }, { a: active, ph: phase });
  await page.waitForFunction(({ a, ph }) => {
    const s = (window as any).__duelState?.();
    return s?.active === a && s?.phase === ph;
  }, { a: active, ph: phase }, { timeout: 5_000 });
}

function batchTests() {
  // ── ON_SPELL_CAST: Citanul Druid gets a +1/+1 counter when an opponent casts an artifact spell ──
  test('Citanul Druid gets a +1/+1 counter when an opponent casts an artifact spell', async ({ page }) => {
    await page.goto(sandboxWith('citanul_druid,millstone'));
    await waitForDuel(page);
    await waitForMain1(page);

    const druidIid = await castAndResolve(page, 'citanul_druid');

    await forceHand(page, 'o', ['millstone'], { C: 2 });
    await setActive(page, 'o'); // AI casts millstone -- the only card in its hand

    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      const druid = s?.p?.bf?.find((c: any) => c.iid === iid);
      return druid?.counters?.P1P1 === 1;
    }, druidIid, { timeout: 20_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect(s1.p.bf.find((c: any) => c.iid === druidIid).counters.P1P1).toBe(1);
  });

  // ── ON_PERMANENT_LEAVES_BF: Dingus Egg deals 2 damage when a land dies ──
  test('Dingus Egg deals 2 damage to a land\'s controller when that land is destroyed', async ({ page }) => {
    await page.goto(sandboxWith('dingus_egg,stone_rain,mountain'));
    await waitForDuel(page);
    await waitForMain1(page);

    await castAndResolve(page, 'dingus_egg');

    await forceHand(page, 'o', ['mountain'], {});
    await setActive(page, 'o'); // AI plays the land -- the only card in its hand
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s?.o?.bf?.some((c: any) => c.id === 'mountain');
    }, null, { timeout: 20_000 });
    const landIid = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return s.o.bf.find((c: any) => c.id === 'mountain').iid;
    });

    const before = await page.evaluate(() => (window as any).__duelState().o.life);

    // Stone Rain is a Sorcery -- switch back so p is the active player to cast it.
    await setActive(page, 'p');
    await forceHand(page, 'p', ['stone_rain'], { R: 3, C: 3 });
    await castAndResolve(page, 'stone_rain', landIid);

    await page.waitForFunction((expectedLife) => {
      const s = (window as any).__duelState?.();
      return s?.o?.life === expectedLife;
    }, before - 2, { timeout: 10_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect(s1.o.life).toBe(before - 2);
    expect(s1.o.bf.some((c: any) => c.iid === landIid)).toBe(false);
    expect(s1.o.gy.some((c: any) => c.iid === landIid)).toBe(true);
  });

  // ── damageRedirect: Veteran Bodyguard redirects unblocked combat damage ──
  test('Veteran Bodyguard redirects unblocked combat damage away from its controller', async ({ page }) => {
    await page.goto(sandboxWith('veteran_bodyguard,grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    const bodyguardIid = await castAndResolve(page, 'veteran_bodyguard');
    await clearSummoningSick(page, bodyguardIid);

    await forceHand(page, 'o', ['grizzly_bears'], { G: 1, C: 1 });
    await setActive(page, 'o'); // AI casts Grizzly Bears -- the only card in its hand
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s?.o?.bf?.some((c: any) => c.id === 'grizzly_bears');
    }, null, { timeout: 20_000 });
    const bearsIid = await page.evaluate(() => {
      const s = (window as any).__duelState();
      return s.o.bf.find((c: any) => c.id === 'grizzly_bears').iid;
    });
    await clearSummoningSick(page, bearsIid);

    const before = await page.evaluate(() => (window as any).__duelState().p.life);

    // Force straight into COMBAT_ATTACKERS on o's turn; the AI driver declares
    // its own attackers there (Grizzly Bears is the only creature it controls)
    // and then drives the rest of the combat sequence (including auto-advancing
    // through the phases) on its own -- see the AI main loop's `!hasCast`
    // auto-`requestPhaseAdvance()` branch in useDuelController.ts.
    await setActive(page, 'o', 'COMBAT_ATTACKERS');

    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.p?.bf?.find((c: any) => c.iid === iid)?.damage === 2;
    }, bodyguardIid, { timeout: 20_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect(s1.p.life).toBe(before); // damage redirected away from the player
    expect(s1.p.bf.find((c: any) => c.iid === bodyguardIid).damage).toBe(2);
  });
}

test.describe('@engine-batch-stubs-1 @mobile Deferral Sweep 1 -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  batchTests();
});

test.describe('@engine-batch-stubs-1 @mobile Deferral Sweep 1 -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  batchTests();
});
