// tests/e2e/undo-tap-activate.spec.js
import { test, expect } from '@playwright/test';

test.describe('@engine UNDO_MANA_TAPS with activated abilities', () => {

  test('pump ability: cannot undo land tap after pump resolves', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.evaluate(() => window.__duelDispatch({ type: 'LOAD_SCENARIO', id: 'vampire_bats_pump' }));
    const s0 = await page.evaluate(() => window.__duelState());
    const batIid = s0.p.bf.find(c => c.id === 'vampire_bats').iid;
    const swampIid = s0.p.bf.find(c => c.id === 'swamp').iid;

    // Tap land to get B mana
    await page.evaluate((iid) => window.__duelDispatch({ type: 'TAP_LAND', who: 'p', iid }), swampIid);
    // Activate pump (+1/+0 for {B})
    await page.evaluate((iid) => window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid }), batIid);
    // Resolve the stack
    await page.evaluate(() => window.__duelDispatch({ type: 'RESOLVE_STACK' }));

    const sAfterPump = await page.evaluate(() => window.__duelState());
    // Snapshot should be null after ability resolved (committed)
    expect(sAfterPump.manaTapSnapshot).toBeNull();

    // Dispatch UNDO -- should be a no-op now
    await page.evaluate(() => window.__duelDispatch({ type: 'UNDO_MANA_TAPS' }));
    const sAfterUndo = await page.evaluate(() => window.__duelState());

    // Land should still be tapped, mana pool empty
    const swamp = sAfterUndo.p.bf.find(c => c.iid === swampIid);
    expect(swamp.tapped).toBe(true);
    const totalMana = Object.values(sAfterUndo.p.mana).reduce((a, b) => a + b, 0);
    expect(totalMana).toBe(0);
  });

  test('creature mana source included in UNDO snapshot', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.evaluate(() => window.__duelDispatch({ type: 'LOAD_SCENARIO', id: 'llanowar_elves_tap' }));
    const s0 = await page.evaluate(() => window.__duelState());
    const elvesIid = s0.p.bf.find(c => c.id === 'llanowar_elves').iid;
    const forestIid = s0.p.bf.find(c => c.id === 'forest').iid;

    // Activate Llanowar Elves first (before any land tap)
    await page.evaluate((iid) => window.__duelDispatch({ type: 'ACTIVATE_ABILITY', iid }), elvesIid);
    const sAfterElves = await page.evaluate(() => window.__duelState());
    expect(sAfterElves.manaTapSnapshot).not.toBeNull();

    // Now tap a land
    await page.evaluate((iid) => window.__duelDispatch({ type: 'TAP_LAND', who: 'p', iid }), forestIid);

    // Undo
    await page.evaluate(() => window.__duelDispatch({ type: 'UNDO_MANA_TAPS' }));
    const sAfterUndo = await page.evaluate(() => window.__duelState());

    // Both land and elves should be untapped
    const elves = sAfterUndo.p.bf.find(c => c.iid === elvesIid);
    const forest = sAfterUndo.p.bf.find(c => c.iid === forestIid);
    expect(elves.tapped).toBe(false);
    expect(forest.tapped).toBe(false);
  });

});
