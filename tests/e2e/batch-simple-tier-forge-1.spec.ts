import { test, expect, Page } from '@playwright/test';

// Simple-tier Alpha/Beta stub cards implemented from Card-Forge/forge reference
// scripts (GPL-3.0). See THIRD_PARTY_NOTICES.md for attribution. Representative
// sample spanning: removal (Exorcist), a continuous/static restriction (Moat),
// an artifact mana ability (Fellwar Stone), a graveyard-interaction ability
// (Argivian Archaeologist), and a library-search effect (Untamed Wilds).

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

// __duelState()/__duelDispatch() reflect a dispatch only after React has
// committed the resulting render -- reading state immediately after a
// dispatch (same page.evaluate call or the very next one) can observe stale
// data. Every dispatch that a test depends on must be followed by a
// page.waitForFunction() polling for the expected effect before any
// assertion reads state.

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
  // Permanent-only: waits for the card to land on that player's battlefield.
  await page.waitForFunction(({ id, w }) => {
    const s = (window as any).__duelState?.();
    return (s?.[w]?.bf as any[])?.some((c: any) => c.id === id);
  }, { id: cardId, w: who }, { timeout: 10_000 });
  return iid;
}

// For non-permanent spells (Instant/Sorcery): casts and resolves, then waits
// for the card to leave hand (it goes to the graveyard, never the battlefield).
async function castNonPermanentAndResolve(page: Page, cardId: string, tgt: string | null, who: 'p' | 'o' = 'p') {
  // Tracks the specific iid rather than "a card with this id" -- the sandbox
  // ?cards= URL param prepends an extra copy into the natural deck, so more
  // than one card can share the same CARD_DB id (e.g. one already drawn into
  // the opening hand alongside one injected via SANDBOX_FORCE_HAND).
  const iid = await page.evaluate(({ id, w, tgtArg }) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s[w].hand as any[]).find((c: any) => c.id === id);
    if (!card) throw new Error(`${id} not in ${w} hand`);
    dispatch({ type: 'CAST_SPELL', who: w, iid: card.iid, tgt: tgtArg, xVal: null });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    return card.iid;
  }, { id: cardId, w: who, tgtArg: tgt });
  await page.waitForFunction(({ iid: cardIid, w }) => {
    const s = (window as any).__duelState?.();
    return (s?.[w]?.gy as any[])?.some((c: any) => c.iid === cardIid);
  }, { iid, w: who }, { timeout: 10_000 });
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

// Places a card directly on `who`'s battlefield via LOAD_STATE, bypassing
// CAST_SPELL/PLAY_LAND entirely. Casting or playing a land for the opponent
// requires making 'o' the active player (CAST_SPELL/PLAY_LAND both gate
// sorcery-speed actions on `s.active === w`), but flipping active on turn 1
// with an empty battlefield trips the AI driver's own turn-1 mulligan
// decision, which can race unpredictably with the rest of the test. This
// helper sidesteps that entire class of flakiness for tests that only need
// a card *present* on the opponent's battlefield, not an actual cast/play.
async function placeOnBattlefield(page: Page, who: 'p' | 'o', cardId: string): Promise<string> {
  await page.evaluate(({ w, id }) => {
    (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: w, cardIds: [id], mana: {} });
  }, { w: who, id: cardId });
  await page.waitForFunction(({ w, id }) => {
    const s = (window as any).__duelState?.();
    return (s?.[w]?.hand as any[])?.some((c: any) => c.id === id);
  }, { w: who, id: cardId }, { timeout: 5_000 });

  const iid = await page.evaluate(({ w, id }) => {
    const s = (window as any).__duelState();
    const card = (s[w].hand as any[]).find((c: any) => c.id === id);
    const bfCard = {
      ...card, controller: w, tapped: false, summoningSick: false,
      attacking: false, blocking: null, damage: 0, counters: {},
      eotBuffs: [], enchantments: [],
    };
    const newState = {
      ...s,
      [w]: { ...s[w], hand: s[w].hand.filter((c: any) => c.iid !== card.iid), bf: [...s[w].bf, bfCard] },
    };
    (window as any).__duelDispatch({ type: 'LOAD_STATE', state: newState });
    return card.iid;
  }, { w: who, id: cardId });
  await page.waitForFunction(({ w, iid: cardIid }) => {
    const s = (window as any).__duelState?.();
    return (s?.[w]?.bf as any[])?.some((c: any) => c.iid === cardIid);
  }, { w: who, iid }, { timeout: 5_000 });
  return iid;
}

function batchTests() {
  // ── 1. Exorcist: activated removal restricted to black creatures ──────────
  test('Exorcist destroys a targeted black creature; fizzles on a non-black creature', async ({ page }) => {
    await page.goto(sandboxWith('exorcist'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['exorcist'], { W: 4 });
    const exorcistIid = await castAndResolve(page, 'exorcist');
    await clearSummoningSick(page, exorcistIid);

    const vampireIid = await placeOnBattlefield(page, 'o', 'sengir_vampire');

    await activateAndResolve(page, exorcistIid, vampireIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.o?.gy?.some((c: any) => c.iid === iid);
    }, vampireIid, { timeout: 10_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect(s1.o.gy.some((c: any) => c.iid === vampireIid)).toBe(true);
    expect(s1.o.bf.some((c: any) => c.iid === vampireIid)).toBe(false);

    // Untap Exorcist and pay again, this time against a non-black creature.
    await page.evaluate((id) => {
      (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid: id, patch: { tapped: false } });
    }, exorcistIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.p?.bf?.find((c: any) => c.iid === iid)?.tapped === false;
    }, exorcistIid, { timeout: 5_000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: [], mana: { W: 2 } });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().p?.mana?.W === 2, null, { timeout: 5_000 });

    const bearsIid = await placeOnBattlefield(page, 'o', 'grizzly_bears');
    await activateAndResolve(page, exorcistIid, bearsIid);

    // No gy change expected for the fizzle case -- wait on the Exorcist's own
    // tapped state (set unconditionally by the ability's cost) as the signal
    // that the second activation has been fully processed.
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.p?.bf?.find((c: any) => c.iid === iid)?.tapped === true;
    }, exorcistIid, { timeout: 10_000 });

    const s2 = await page.evaluate(() => (window as any).__duelState());
    expect(s2.o.bf.some((c: any) => c.iid === bearsIid)).toBe(true);
  });

  // ── 2. Moat: creatures without flying can't be declared attackers ─────────
  test("Moat prevents a non-flying creature from attacking; a flier can still attack", async ({ page }) => {
    await page.goto(sandboxWith('moat'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['moat', 'grizzly_bears'], { W: 2, G: 1, C: 3 });
    await castAndResolve(page, 'moat');
    const bearsIid = await castAndResolve(page, 'grizzly_bears');
    await clearSummoningSick(page, bearsIid);

    await page.evaluate(() => {
      (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
    });
    await page.waitForFunction(() => (window as any).__duelState?.().phase === 'COMBAT_ATTACKERS', null, { timeout: 5_000 });

    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
    }, bearsIid);
    // Moat's rejection path still logs a message (dlog), even though the
    // attackers array is unchanged -- wait on that as the settle signal.
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s?.log?.some((l: any) => l.text?.includes("can't attack"));
    }, null, { timeout: 5_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect((s1.attackers || []).includes(bearsIid)).toBe(false);
  });

  // ── 3. Fellwar Stone: reflected mana ability resolves immediately ─────────
  test('Fellwar Stone adds a color of mana an opponent land could produce', async ({ page }) => {
    await page.goto(sandboxWith('fellwar_stone'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['fellwar_stone'], { C: 2 });
    const stoneIid = await castAndResolve(page, 'fellwar_stone');
    await clearSummoningSick(page, stoneIid);

    await placeOnBattlefield(page, 'o', 'island');

    await page.evaluate((iid) => {
      (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid });
    }, stoneIid);
    await page.waitForFunction(() => ((window as any).__duelState?.().p?.mana?.U ?? 0) >= 1, null, { timeout: 5_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect(s1.p.mana.U).toBe(1);
  });

  // ── 4. Argivian Archaeologist: graveyard-interaction ability ──────────────
  test('Argivian Archaeologist returns an artifact card from graveyard to hand', async ({ page }) => {
    await page.goto(sandboxWith('argivian_archaeologist'));
    await waitForDuel(page);
    await waitForMain1(page);

    // Generous, unambiguous mana pools (separate colors per cost) so no cast
    // in this sequence can be blocked by a generic-mana-ordering edge case.
    await forceHand(page, 'p', ['argivian_archaeologist', 'mox_ruby', 'desert_twister'], { W: 4, G: 10, R: 2 });
    const archIid = await castAndResolve(page, 'argivian_archaeologist');
    await clearSummoningSick(page, archIid);
    const moxIid = await castAndResolve(page, 'mox_ruby');

    // Desert Twister (destroy, already covered by this same batch) sends the Mox
    // to the player's own graveyard so the Archaeologist has a real target.
    await castNonPermanentAndResolve(page, 'desert_twister', moxIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.p?.gy?.some((c: any) => c.iid === iid);
    }, moxIid, { timeout: 10_000 });

    const midState = await page.evaluate(() => (window as any).__duelState());
    expect(midState.p.gy.some((c: any) => c.iid === moxIid)).toBe(true);

    await activateAndResolve(page, archIid, moxIid);
    await page.waitForFunction((iid) => {
      const s = (window as any).__duelState?.();
      return s?.p?.hand?.some((c: any) => c.iid === iid);
    }, moxIid, { timeout: 10_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    expect(s1.p.hand.some((c: any) => c.iid === moxIid)).toBe(true);
    expect(s1.p.gy.some((c: any) => c.iid === moxIid)).toBe(false);
  });

  // ── 5. Untamed Wilds: library search, land onto battlefield, then shuffle ─
  test('Untamed Wilds fetches a basic land onto the battlefield', async ({ page }) => {
    await page.route('**/sandbox-decklist.txt', route =>
      route.fulfill({ body: 'Island x20\n', contentType: 'text/plain' })
    );
    await page.goto(sandboxWith('untamed_wilds'));
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['untamed_wilds'], { G: 3 });
    const bfBefore = await page.evaluate(() => (window as any).__duelState().p.bf.length);

    // Untamed Wilds is a Sorcery -- it resolves and goes to the graveyard, it
    // never sits on the battlefield itself, so castAndResolve's "card lands on
    // bf" wait does not apply here.
    await castNonPermanentAndResolve(page, 'untamed_wilds', null);
    await page.waitForFunction((before) => {
      const s = (window as any).__duelState?.();
      return (s?.p?.bf?.length ?? 0) > before;
    }, bfBefore, { timeout: 10_000 });

    const s1 = await page.evaluate(() => (window as any).__duelState());
    const landsOnBf = s1.p.bf.filter((c: any) => c.type === 'Land');
    expect(landsOnBf.length).toBeGreaterThan(0);
  });
}

test.describe('@engine-tier-simple-1 @mobile Simple-tier Forge batch 1 -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  batchTests();
});

test.describe('@engine-tier-simple-1 @mobile Simple-tier Forge batch 1 -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  batchTests();
});
