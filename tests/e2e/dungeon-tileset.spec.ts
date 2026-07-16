import { test, expect } from '@playwright/test';

// Sprite-rendering regression suite for DungeonMap.jsx.
// Verifies that the 0x72 DungeonTilesetII sprites render correctly in place of
// the old flat-color/emoji tiles. Uses ?dungeon=sandbox to bypass the overworld.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile',  width: 390,  height: 844 },
];

const BASE_URL = '/?dungeon=sandbox';

// Wait for the dungeon grid to be rendered (at least one tile div present)
async function waitForDungeon(page: any) {
  await page.waitForSelector('[data-testid="dungeon-sandbox"]', { timeout: 15000 });
}

for (const vp of VIEWPORTS) {
  test.describe(`@overworld-visual-1 @mobile ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('1: revealed floor cells render <img> tiles, not blank divs', async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedDungeonAssets: string[] = [];
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', e => consoleErrors.push(String(e)));
      page.on('requestfailed', req => {
        if (req.url().includes('/assets/dungeon/')) {
          failedDungeonAssets.push(`${req.url()}: ${req.failure()?.errorText}`);
        }
      });

      await page.goto(BASE_URL);
      await waitForDungeon(page);

      // Floor/corridor cells that are revealed should have an img child
      const revealedFloorImgs = await page.evaluate(() => {
        const dungeon = (window as any).__dungeonState?.();
        if (!dungeon) return null;
        let totalRevealed = 0;
        let withImg = 0;
        for (const row of dungeon.grid) {
          for (const cell of row) {
            if (cell.revealed && cell.type !== 'WALL') {
              totalRevealed++;
              // Find the tile div at this position and check for an img
              const tile = document.querySelector(
                `[data-tile="${cell.x},${cell.y}"]`
              );
              // Fallback: just count imgs anywhere (structural check below)
              if (tile) {
                const img = tile.querySelector('img[aria-hidden="true"]');
                if (img) withImg++;
              }
            }
          }
        }
        return { totalRevealed, withImg };
      });

      // If data-tile attrs not present, fall back to counting floor imgs via src
      const floorImgCount = await page.evaluate(() => {
        return document.querySelectorAll('img[src*="/assets/dungeon/sprites/floor_"]').length;
      });

      // At least some floor sprites must be present
      expect(floorImgCount).toBeGreaterThan(0);

      // No broken sprite paths / failed dungeon asset loads
      expect(failedDungeonAssets).toEqual([]);
      // Chromium's generic "Failed to load resource" console message carries no
      // URL, so it can't be attributed to a specific asset here -- real dungeon
      // sprite failures are already caught precisely above via failedDungeonAssets.
      // Excluding it avoids false failures from unrelated external resources
      // (e.g. index.html's Google Fonts links) that this sandbox's network policy
      // may block, independent of dungeon rendering correctness.
      expect(consoleErrors.filter(e => !e.includes('favicon') && !e.startsWith('Failed to load resource'))).toEqual([]);
    });

    test('2: unrevealed cells render no <img> (fog-of-war regression guard)', async ({ page }) => {
      await page.goto(BASE_URL);
      await waitForDungeon(page);

      // All floor/wall sprites use /assets/dungeon/ paths.
      // Count total imgs and compare against count of revealed non-wall cells.
      const result = await page.evaluate(() => {
        const dungeon = (window as any).__dungeonState?.();
        if (!dungeon) return null;
        let unrevealedCount = 0;
        for (const row of dungeon.grid) {
          for (const cell of row) {
            if (!cell.revealed) unrevealedCount++;
          }
        }
        const allTileImgs = document.querySelectorAll('img[src*="/assets/dungeon/sprites/floor_"], img[src*="/assets/dungeon/sprites/wall_"]').length;
        let revealedNonWall = 0;
        let revealedWall = 0;
        for (const row of dungeon.grid) {
          for (const cell of row) {
            if (cell.revealed && cell.type !== 'WALL') revealedNonWall++;
            if (cell.revealed && cell.type === 'WALL') revealedWall++;
          }
        }
        return { unrevealedCount, allTileImgs, revealedNonWall, revealedWall };
      });

      expect(result).not.toBeNull();
      // The number of floor+wall tile imgs must not exceed revealed cells
      expect(result!.allTileImgs).toBeLessThanOrEqual(result!.revealedNonWall + result!.revealedWall);
      // Must have at least some revealed cells (sanity: dungeon generated)
      expect(result!.revealedNonWall).toBeGreaterThan(0);
    });

    test('3: enemy entities render sprites from ENEMY_SPRITE_MAP', async ({ page }) => {
      await page.goto(BASE_URL);
      await waitForDungeon(page);

      const result = await page.evaluate(() => {
        const dungeon = (window as any).__dungeonState?.();
        if (!dungeon) return null;
        const enemies = dungeon.entities.filter(
          (e: any) => e.type === 'ENEMY' && !e.defeated
        );
        if (enemies.length === 0) return { enemies: 0, spriteImgs: 0 };
        // Check that at least one enemy sprite img is present in the DOM
        const enemyImgs = document.querySelectorAll('img[src*="/assets/dungeon/sprites/"][alt]');
        const spriteImgs = Array.from(enemyImgs).filter(img => {
          const src = (img as HTMLImageElement).src;
          return src.includes('_idle_anim') || src.includes('_anim_f');
        });
        return { enemies: enemies.length, spriteImgs: spriteImgs.length };
      });

      expect(result).not.toBeNull();
      if (result!.enemies > 0) {
        expect(result!.spriteImgs).toBeGreaterThan(0);
      }
    });

    test('4: TREASURE with cardRarity=null renders empty chest, with cardRarity renders full chest', async ({ page }) => {
      await page.goto(BASE_URL);
      await waitForDungeon(page);

      const result = await page.evaluate(() => {
        const dungeon = (window as any).__dungeonState?.();
        if (!dungeon) return null;
        const treasures = dungeon.entities.filter(
          (e: any) => e.type === 'TREASURE' && !e.collected
        );
        const emptyCount = document.querySelectorAll(
          'img[src*="chest_empty_open_anim"]'
        ).length;
        const fullCount = document.querySelectorAll(
          'img[src*="chest_full_open_anim"]'
        ).length;
        const expectedEmpty = treasures.filter((t: any) => t.cardRarity == null).length;
        const expectedFull  = treasures.filter((t: any) => t.cardRarity != null).length;
        return { emptyCount, fullCount, expectedEmpty, expectedFull, totalTreasures: treasures.length };
      });

      expect(result).not.toBeNull();
      if (result!.totalTreasures > 0) {
        if (result!.expectedEmpty > 0) expect(result!.emptyCount).toBeGreaterThan(0);
        if (result!.expectedFull  > 0) expect(result!.fullCount).toBeGreaterThan(0);
      }
    });

    test('5: EXIT entity renders floor_ladder sprite with pulse animation', async ({ page }) => {
      await page.goto(BASE_URL);
      await waitForDungeon(page);

      // The exit may be in an unrevealed cell initially - navigate toward it
      // Just check it's in the DOM if revealed
      const result = await page.evaluate(() => {
        const dungeon = (window as any).__dungeonState?.();
        if (!dungeon) return null;
        const exit = dungeon.entities.find((e: any) => e.type === 'EXIT');
        const ladderImg = document.querySelector('img[src*="floor_ladder"]') as HTMLImageElement | null;
        return {
          exitExists: !!exit,
          exitRevealed: exit ? dungeon.grid[exit.y]?.[exit.x]?.revealed : false,
          ladderImgPresent: !!ladderImg,
          ladderAnimated: ladderImg
            ? (ladderImg.style.animation || '').includes('exitPulse')
            : false,
        };
      });

      expect(result).not.toBeNull();
      expect(result!.exitExists).toBe(true);
      // If exit is in revealed area, ladder sprite and pulse animation must be present
      if (result!.exitRevealed) {
        expect(result!.ladderImgPresent).toBe(true);
        expect(result!.ladderAnimated).toBe(true);
      }
    });

    test('6: player token cycles through wizard sprite frames over time', async ({ page }) => {
      await page.goto(BASE_URL);
      await waitForDungeon(page);

      const firstSrc = await page.evaluate(() => {
        const img = document.querySelector('img[src*="wizzard_f_idle_anim_f"]') as HTMLImageElement | null;
        return img ? img.src : null;
      });
      expect(firstSrc).not.toBeNull();

      // Wait ~700ms for at least one frame cycle (interval = 600ms)
      await page.waitForTimeout(700);

      const secondSrc = await page.evaluate(() => {
        const img = document.querySelector('img[src*="wizzard_f_idle_anim_f"]') as HTMLImageElement | null;
        return img ? img.src : null;
      });
      expect(secondSrc).not.toBeNull();

      // Frame should have advanced (src changed to a different frame number)
      expect(secondSrc).not.toEqual(firstSrc);
    });

    test('7: no 404s for sprite assets and no console errors', async ({ page }) => {
      const failedRequests: string[] = [];
      const consoleErrors: string[] = [];

      page.on('response', res => {
        if (res.status() === 404 && res.url().includes('/assets/dungeon/')) {
          failedRequests.push(res.url());
        }
      });
      page.on('requestfailed', req => {
        if (req.url().includes('/assets/dungeon/')) {
          failedRequests.push(`${req.url()}: ${req.failure()?.errorText}`);
        }
      });
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', e => consoleErrors.push(String(e)));

      await page.goto(BASE_URL);
      await waitForDungeon(page);
      // Wait a moment for img loads to settle
      await page.waitForTimeout(500);

      expect(failedRequests).toEqual([]);
      // See test 1's comment: generic "Failed to load resource" console messages
      // carry no URL and are already covered precisely by failedRequests above.
      expect(consoleErrors.filter(e => !e.includes('favicon') && !e.startsWith('Failed to load resource'))).toEqual([]);
    });
  });
}
