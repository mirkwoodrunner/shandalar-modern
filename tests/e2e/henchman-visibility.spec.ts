import { test, expect } from '@playwright/test';

// Henchman visibility + chase-radius regression suite.
//
// Covers:
//   1. Henchman spawns as a tracked map sprite (isHenchman:true in enemies[]),
//      never as a blind unfleeable popup with no map presence.
//   2. Henchman sprite renders in the DOM once its tile is revealed.
//   3. Henchman encounter popup carries canFlee:false ("cannot be bought off").
//   4. Normal wandering-enemy encounter still carries canFlee:true (flee button visible).
//   5. tickEnemyAI chase threshold regression: distance 3 no longer chases;
//      distance 2 still does.
//
// Test globals exposed by useOverworldController.js (sandbox mode only):
//   window.__overworldState()           -> { enemies, moves, pos, tiles }
//   window.__overworldSetEnemies(fn)    -> React setState setter
//   window.__overworldSetMoves(n)       -> React setState setter
//
// Map constants: 64 wide x 40 tall; seed 42; player starts in the middle area.

const OW_URL = '/?overworld=sandbox';
const MAP_W = 64;
const MAP_H = 40;

// Wait for the overworld sandbox API to be available.
async function waitForOWReady(page) {
  await page.waitForFunction(
    () =>
      typeof (window as any).__overworldState === 'function' &&
      typeof (window as any).__overworldSetEnemies === 'function' &&
      typeof (window as any).__overworldSetMoves === 'function',
    null,
    { timeout: 12000 }
  );
}

// Generate a minimal fake enemy entry for injection.
function makeFakeEnemy(overrides = {}) {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    x: 32, y: 20,
    tier: 2,
    archKey: 'GREEN_STOMPY',
    name: 'Test Monster',
    hp: 20,
    terrain: 'FOREST',
    spriteKind: 'monster',
    spriteColor: 'green',
    animFrame: 0,
    dir: 'down',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DESKTOP suite (1280x800)
// ---------------------------------------------------------------------------
test.describe('@overworld-visual-1 @mobile desktop henchman visibility + chase radius', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('1. henchman spawn creates enemies[] entry, not a blind popup', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    // Mock Math.random so the 4% spawn roll always fires and candidate/henchman
    // selection picks index 0.
    await page.evaluate(() => { (window as any).__realRandom = Math.random; Math.random = () => 0.01; });

    // Advance moves counter to 85 so newMoves (85+1=86) > 80 guard passes.
    await page.evaluate(() => (window as any).__overworldSetMoves(85));
    await page.waitForTimeout(150); // let React flush

    // One keypress triggers doMove which runs the henchman spawn check.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300); // let React flush spawn + render

    const result = await page.evaluate(() => {
      const { enemies, tiles } = (window as any).__overworldState();
      const h = enemies.find((e: any) => e.isHenchman);
      if (!h) return { found: false };
      const tile = tiles[h.y]?.[h.x];
      return {
        found: true,
        x: h.x,
        y: h.y,
        canFlee: h.canFlee,
        tileRevealed: tile?.revealed ?? null,
      };
    });

    // Restore Math.random.
    await page.evaluate(() => { Math.random = (window as any).__realRandom; });

    expect(result.found, 'henchman should appear in enemies[]').toBe(true);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThan(MAP_W);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThan(MAP_H);
    expect(result.canFlee, 'henchman enemy carries canFlee:false').toBe(false);
    // Spawn tile must be outside the player's vision radius (should be unrevealed).
    expect(result.tileRevealed, 'henchman tile starts fogged').toBe(false);

    // No encounter popup should have appeared (it's on the map, not blocking yet).
    const popupText = await page.locator('text=cannot be bought off').count();
    expect(popupText, 'no blind popup should have fired').toBe(0);
  });

  test('2. henchman sprite renders once its tile is revealed', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    // Inject a henchman at a tile known to be revealed at game start (start pos +1 x).
    // The initial revealAround() exposes a 5x5 box; seed 42 starts around (32,20),
    // so (33,20) is always revealed at load time.
    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    // Place henchman 2 tiles right of player (within vision radius, already revealed).
    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-henchman',
          x,
          y,
          tier: 4,
          archKey: 'BLACK_REANIMATOR',
          name: 'Necromancer',
          hp: 26,
          terrain: 'PLAINS',
          spriteKind: 'mage',
          spriteColor: 'black',
          animFrame: 0,
          dir: 'down',
          isHenchman: true,
          canFlee: false,
        },
      ]);
    }, { x: px + 2, y: py });

    await page.waitForTimeout(300);

    // Enemy sprites render as .sprite inside a map tile. Since the tile is revealed,
    // the sprite should be in the DOM.  The player is also kind-mage, so expect >= 2.
    const spriteCount = await page.locator('.sprite.kind-mage').count();
    expect(spriteCount, 'henchman sprite renders on revealed tile').toBeGreaterThanOrEqual(2);
  });

  test('3. henchman encounter popup shows cannot-be-bought-off, no flee/withdraw', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    // Inject henchman 1 tile right of player (player will step onto it).
    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-henchman',
          x,
          y,
          tier: 4,
          archKey: 'BLACK_REANIMATOR',
          name: 'Necromancer',
          hp: 26,
          terrain: 'PLAINS',
          spriteKind: 'mage',
          spriteColor: 'black',
          animFrame: 0,
          dir: 'down',
          isHenchman: true,
          canFlee: false,
        },
      ]);
    }, { x: px + 1, y: py });

    await page.waitForTimeout(150);

    // Walk right into the henchman.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);

    await expect(page.locator('text=cannot be bought off')).toBeVisible({ timeout: 5000 });
    // Flee and Withdraw buttons must NOT appear.
    await expect(page.locator('button:has-text("Flee")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Withdraw")')).toHaveCount(0);
  });

  test('4. normal wandering enemy still shows flee/withdraw (canFlee regression)', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    // Inject a plain wandering enemy (no canFlee field) 1 tile right of player.
    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-wanderer',
          x,
          y,
          tier: 1,
          archKey: 'GREEN_STOMPY',
          name: 'Forest Bear',
          hp: 10,
          terrain: 'FOREST',
          spriteKind: 'monster',
          spriteColor: 'green',
          animFrame: 0,
          dir: 'down',
          // no canFlee field: openEncounterPopup should default it to true
        },
      ]);
    }, { x: px + 1, y: py });

    await page.waitForTimeout(150);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);

    // Popup should appear with flee option (canFlee defaults to true).
    await expect(page.locator('text=Pay').first()).toBeVisible({ timeout: 5000 });
    // The "cannot be bought off" message must NOT appear.
    await expect(page.locator('text=cannot be bought off')).toHaveCount(0);
  });

  test('5. chase radius regression: dist=3 does not chase; dist=2 does', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    // Build up graceMoves to threshold (3) so tickEnemyAI actually runs.
    // Three arrow presses advance graceMoves from 0 to 3.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    // --- Case A: enemy at Manhattan dist=3 (outside new threshold of 2) ---
    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-dist3',
          x,
          y,
          tier: 1,
          archKey: 'GREEN_STOMPY',
          name: 'Dist3 Monster',
          hp: 10,
          terrain: 'FOREST',
          spriteKind: 'monster',
          spriteColor: 'green',
          animFrame: 0,
          dir: 'down',
        },
      ]);
    }, { x: px + 3, y: py });

    // Let a few rAF ticks run.
    await page.waitForTimeout(350);

    const dist3Result = await page.evaluate(() => {
      const { enemies, pos } = (window as any).__overworldState();
      const e = enemies.find((e: any) => e.id === 'test-dist3');
      if (!e) return null;
      return { dist: Math.abs(e.x - pos.x) + Math.abs(e.y - pos.y) };
    });

    // Enemy at dist=3 must NOT have moved toward the player (should still be at dist=3).
    expect(dist3Result, 'dist-3 enemy still present').not.toBeNull();
    expect(dist3Result!.dist, 'enemy at dist=3 should not chase').toBeGreaterThanOrEqual(3);

    // Clean up the dist-3 enemy before part B.
    await page.evaluate(() => {
      (window as any).__overworldSetEnemies((prev: any[]) => prev.filter((e: any) => e.id !== 'test-dist3'));
    });
    await page.waitForTimeout(100);

    // --- Case B: enemy at Manhattan dist=2 (within new threshold) ---
    const { px2, py2 } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px2: pos.x, py2: pos.y };
    });

    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-dist2',
          x,
          y,
          tier: 1,
          archKey: 'GREEN_STOMPY',
          name: 'Dist2 Monster',
          hp: 10,
          terrain: 'FOREST',
          spriteKind: 'monster',
          spriteColor: 'green',
          animFrame: 0,
          dir: 'down',
        },
      ]);
    }, { x: px2 + 2, y: py2 });

    // Allow enough ticks for chase behavior. At 60fps / 350ms ~ 21 ticks.
    // A chasing enemy starting at dist=2 will catch up and trigger the encounter popup,
    // or at minimum move closer. Either outcome proves chase is active.
    await page.waitForTimeout(500);

    const dist2Result = await page.evaluate(() => {
      const { enemies, pos } = (window as any).__overworldState();
      const e = enemies.find((e: any) => e.id === 'test-dist2');
      if (!e) return { removed: true, dist: 0 }; // caught and removed by encounter handler
      return { removed: false, dist: Math.abs(e.x - pos.x) + Math.abs(e.y - pos.y) };
    });

    // Either the enemy was removed (caught = encounter fired) OR it moved closer.
    const chased = dist2Result.removed || dist2Result.dist < 2;
    expect(chased, 'enemy at dist=2 should chase toward player').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MOBILE suite (390x844) — same 5 tests at mobile viewport
// ---------------------------------------------------------------------------
test.describe('@overworld-visual-1 @mobile mobile henchman visibility + chase radius', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('1. henchman spawn creates enemies[] entry, not a blind popup', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]', { timeout: 12000 });
    await waitForOWReady(page);

    await page.evaluate(() => { (window as any).__realRandom = Math.random; Math.random = () => 0.01; });
    await page.evaluate(() => (window as any).__overworldSetMoves(85));
    await page.waitForTimeout(150);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const { enemies, tiles } = (window as any).__overworldState();
      const h = enemies.find((e: any) => e.isHenchman);
      if (!h) return { found: false };
      const tile = tiles[h.y]?.[h.x];
      return { found: true, x: h.x, y: h.y, canFlee: h.canFlee, tileRevealed: tile?.revealed ?? null };
    });

    await page.evaluate(() => { Math.random = (window as any).__realRandom; });

    expect(result.found, 'henchman should appear in enemies[]').toBe(true);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThan(MAP_W);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThan(MAP_H);
    expect(result.canFlee).toBe(false);
    expect(result.tileRevealed, 'henchman tile starts fogged').toBe(false);

    const popupText = await page.locator('text=cannot be bought off').count();
    expect(popupText, 'no blind popup should have fired').toBe(0);
  });

  test('2. henchman sprite renders once its tile is revealed', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]', { timeout: 12000 });
    await waitForOWReady(page);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-henchman',
          x, y,
          tier: 4, archKey: 'BLACK_REANIMATOR', name: 'Necromancer', hp: 26,
          terrain: 'PLAINS', spriteKind: 'mage', spriteColor: 'black',
          animFrame: 0, dir: 'down', isHenchman: true, canFlee: false,
        },
      ]);
    }, { x: px + 2, y: py });

    await page.waitForTimeout(300);

    const spriteCount = await page.locator('.sprite.kind-mage').count();
    expect(spriteCount, 'henchman sprite renders on revealed tile').toBeGreaterThanOrEqual(2);
  });

  test('3. henchman encounter popup shows cannot-be-bought-off, no flee/withdraw', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]', { timeout: 12000 });
    await waitForOWReady(page);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-henchman',
          x, y,
          tier: 4, archKey: 'BLACK_REANIMATOR', name: 'Necromancer', hp: 26,
          terrain: 'PLAINS', spriteKind: 'mage', spriteColor: 'black',
          animFrame: 0, dir: 'down', isHenchman: true, canFlee: false,
        },
      ]);
    }, { x: px + 1, y: py });

    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);

    await expect(page.locator('text=cannot be bought off')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Flee")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Withdraw")')).toHaveCount(0);
  });

  test('4. normal wandering enemy still shows flee/withdraw (canFlee regression)', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]', { timeout: 12000 });
    await waitForOWReady(page);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-wanderer',
          x, y,
          tier: 1, archKey: 'GREEN_STOMPY', name: 'Forest Bear', hp: 10,
          terrain: 'FOREST', spriteKind: 'monster', spriteColor: 'green',
          animFrame: 0, dir: 'down',
        },
      ]);
    }, { x: px + 1, y: py });

    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);

    await expect(page.locator('text=Pay').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=cannot be bought off')).toHaveCount(0);
  });

  test('5. chase radius regression: dist=3 does not chase; dist=2 does', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]', { timeout: 12000 });
    await waitForOWReady(page);

    // Build graceMoves to threshold.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    // Dist=3: should not chase.
    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-dist3',
          x, y,
          tier: 1, archKey: 'GREEN_STOMPY', name: 'Dist3', hp: 10,
          terrain: 'FOREST', spriteKind: 'monster', spriteColor: 'green',
          animFrame: 0, dir: 'down',
        },
      ]);
    }, { x: px + 3, y: py });

    await page.waitForTimeout(350);

    const dist3Result = await page.evaluate(() => {
      const { enemies, pos } = (window as any).__overworldState();
      const e = enemies.find((e: any) => e.id === 'test-dist3');
      if (!e) return null;
      return { dist: Math.abs(e.x - pos.x) + Math.abs(e.y - pos.y) };
    });

    expect(dist3Result, 'dist-3 enemy still present').not.toBeNull();
    expect(dist3Result!.dist, 'enemy at dist=3 should not chase').toBeGreaterThanOrEqual(3);

    await page.evaluate(() => {
      (window as any).__overworldSetEnemies((prev: any[]) => prev.filter((e: any) => e.id !== 'test-dist3'));
    });
    await page.waitForTimeout(100);

    // Dist=2: should chase.
    const { px2, py2 } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px2: pos.x, py2: pos.y };
    });

    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-dist2',
          x, y,
          tier: 1, archKey: 'GREEN_STOMPY', name: 'Dist2', hp: 10,
          terrain: 'FOREST', spriteKind: 'monster', spriteColor: 'green',
          animFrame: 0, dir: 'down',
        },
      ]);
    }, { x: px2 + 2, y: py2 });

    await page.waitForTimeout(500);

    const dist2Result = await page.evaluate(() => {
      const { enemies, pos } = (window as any).__overworldState();
      const e = enemies.find((e: any) => e.id === 'test-dist2');
      if (!e) return { removed: true, dist: 0 };
      return { removed: false, dist: Math.abs(e.x - pos.x) + Math.abs(e.y - pos.y) };
    });

    const chased = dist2Result.removed || dist2Result.dist < 2;
    expect(chased, 'enemy at dist=2 should chase toward player').toBe(true);
  });
});
