import { test, expect } from '@playwright/test';

test.describe('@engine-card-scenarios-1 Disintegrate', () => {
  const BASE = 'http://localhost:5173/?duel=sandbox&aiSpeed=0';

  async function waitForDuel(page) {
    await page.waitForFunction(() => window.__duelState?.()?.phase != null, { timeout: 10000 });
  }
  async function waitForMain1(page) {
    await page.waitForFunction(() => {
      const s = window.__duelState?.();
      return s?.phase === 'MAIN_1' && s?.active === 'p';
    }, { timeout: 20000 });
  }

  // Force cards into a player's hand and wait for them to actually land --
  // __duelDispatch/__duelState only reflect a dispatch after React commits,
  // so a bare dispatch followed by an immediate state read in the next
  // page.evaluate call can observe stale data (see forceHand in
  // batch-simple-tier-forge-1.spec.ts for the same pattern).
  async function forceHand(page, who, cardIds, mana) {
    await page.evaluate(({ w, ids, m }) => {
      window.__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: w, cardIds: ids, mana: m });
    }, { w: who, ids: cardIds, m: mana });
    await page.waitForFunction(({ w, ids }) => {
      const s = window.__duelState?.();
      return ids.every(id => s?.[w]?.hand?.some(c => c.id === id));
    }, { w: who, ids: cardIds }, { timeout: 5000 });
  }

  // Places a card directly on `who`'s battlefield via LOAD_STATE, bypassing
  // CAST_SPELL entirely. Casting a creature for 'o' requires making 'o' the
  // active player (CAST_SPELL gates sorcery-speed actions on s.active === w),
  // but flipping active triggers the live AI driver's own turn, which races
  // unpredictably with the rest of the test (see the identical comment on
  // placeOnBattlefield in batch-simple-tier-forge-1.spec.ts, the source of
  // this pattern).
  async function placeOnBattlefield(page, who, cardId) {
    await forceHand(page, who, [cardId], {});
    const iid = await page.evaluate(({ w, id }) => {
      const s = window.__duelState();
      const card = s[w].hand.find(c => c.id === id);
      const bfCard = {
        ...card, controller: w, tapped: false, summoningSick: false,
        attacking: false, blocking: null, damage: 0, counters: {},
        eotBuffs: [], enchantments: [],
      };
      const newState = {
        ...s,
        [w]: { ...s[w], hand: s[w].hand.filter(c => c.iid !== card.iid), bf: [...s[w].bf, bfCard] },
      };
      window.__duelDispatch({ type: 'LOAD_STATE', state: newState });
      return card.iid;
    }, { w: who, id: cardId });
    await page.waitForFunction(({ w, iid: cardIid }) => {
      const s = window.__duelState?.();
      return s?.[w]?.bf?.some(c => c.iid === cardIid);
    }, { w: who, iid }, { timeout: 5000 });
    return iid;
  }

  test('kills a creature with lethal X', async ({ page }) => {
    await page.goto(BASE);
    await waitForDuel(page);
    await waitForMain1(page);

    await forceHand(page, 'p', ['disintegrate'], { R: 3 });
    await placeOnBattlefield(page, 'o', 'vampire_bats');

    const s0 = await page.evaluate(() => window.__duelState());
    const disint = s0.p.hand.find(c => c.id === 'disintegrate');
    const bats = s0.o.bf.find(c => c.id === 'vampire_bats');

    await page.evaluate(({ iid, tgt }) => {
      window.__duelDispatch({ type: 'SET_X', val: 1 });
      window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt, xVal: 1 });
      window.__duelDispatch({ type: 'PASS_PRIORITY', who: 'p' });
      window.__duelDispatch({ type: 'PASS_PRIORITY', who: 'o' });
      window.__duelDispatch({ type: 'RESOLVE_STACK' });
    }, { iid: disint.iid, tgt: bats.iid });

    const s1 = await page.evaluate(() => window.__duelState());
    expect(s1.o.bf.find(c => c.id === 'vampire_bats')).toBeUndefined();
    expect(s1.o.exile?.find(c => c.id === 'vampire_bats')).toBeDefined();
    expect(s1.o.life).toBe(s0.o.life);
  });

  test('deals damage to player when targeting player', async ({ page }) => {
    await page.goto(BASE);
    await waitForDuel(page);
    await waitForMain1(page);

    // XR at X=3 costs 4 total mana (3 generic + 1 R) -- provide enough R to cover it.
    await forceHand(page, 'p', ['disintegrate'], { R: 4 });

    const s0 = await page.evaluate(() => window.__duelState());
    const disint = s0.p.hand.find(c => c.id === 'disintegrate');

    await page.evaluate(({ iid }) => {
      window.__duelDispatch({ type: 'SET_X', val: 3 });
      window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt: 'o', xVal: 3 });
      window.__duelDispatch({ type: 'PASS_PRIORITY', who: 'p' });
      window.__duelDispatch({ type: 'PASS_PRIORITY', who: 'o' });
      window.__duelDispatch({ type: 'RESOLVE_STACK' });
    }, { iid: disint.iid });

    const s1 = await page.evaluate(() => window.__duelState());
    expect(s1.o.life).toBe(s0.o.life - 3);
  });

});
