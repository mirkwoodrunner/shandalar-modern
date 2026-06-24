import { test, expect } from '@playwright/test';

test.describe('@engine Disintegrate', () => {

  test('kills a creature with lethal X', async ({ page }) => {
    await page.goto('http://localhost:5173');
    const s0 = await page.evaluate(() => window.__duelState());

    const disint = s0?.p?.hand?.find(c => c.id === 'disintegrate');
    const bats = s0?.o?.bf?.find(c => c.id === 'vampire_bats');
    if (!disint || !bats) {
      test.skip('Scenario does not have required cards');
      return;
    }

    await page.evaluate(({ iid, tgt }) => {
      window.__duelDispatch({ type: 'SET_X', val: 1 });
      window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt, xVal: 1 });
      window.__duelDispatch({ type: 'RESOLVE_STACK' });
    }, { iid: disint.iid, tgt: bats.iid });

    const s1 = await page.evaluate(() => window.__duelState());

    const stillOnBf = s1.o.bf.find(c => c.id === 'vampire_bats');
    expect(stillOnBf).toBeUndefined();

    const inExile = s1.o.exile?.find(c => c.id === 'vampire_bats');
    expect(inExile).toBeDefined();

    expect(s1.o.life).toBe(s0.o.life);
  });

  test('deals damage to player when targeting player', async ({ page }) => {
    await page.goto('http://localhost:5173');
    const s0 = await page.evaluate(() => window.__duelState());
    const disint = s0?.p?.hand?.find(c => c.id === 'disintegrate');
    if (!disint) { test.skip('No Disintegrate in hand'); return; }

    await page.evaluate(({ iid }) => {
      window.__duelDispatch({ type: 'SET_X', val: 3 });
      window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt: 'o', xVal: 3 });
      window.__duelDispatch({ type: 'RESOLVE_STACK' });
    }, { iid: disint.iid });

    const s1 = await page.evaluate(() => window.__duelState());
    expect(s1.o.life).toBe(s0.o.life - 3);
  });

});
