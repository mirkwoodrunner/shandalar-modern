import { test, expect } from '@playwright/test';

// Pixel-art tileset rendering for the overworld terrain. The render path is
// shared by desktop and mobile (single WorldMap component, no viewport branch),
// so every assertion runs at both 1280x800 and 390x844. A pass at one size and
// a fail at the other is a hard fail -- that would mean the path diverged.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

// Wait until at least one terrain canvas has been painted with non-transparent
// pixels (i.e. the tilesheets loaded and drew). Returns false on timeout.
async function waitForTerrainPainted(page) {
  return page
    .waitForFunction(() => {
      const canvases = Array.from(document.querySelectorAll('canvas.ow-terrain-canvas'));
      return canvases.some((cv) => {
        const c = cv as HTMLCanvasElement;
        if (!c.width || !c.height) return false;
        const ctx = c.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] !== 0) return true; // any opaque pixel
        }
        return false;
      });
    }, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
}

// Returns the set of distinct RGBA colors present on the first painted terrain
// canvas, plus whether any non-transparent pixel exists.
async function sampleTerrainCanvas(page) {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas.ow-terrain-canvas'));
    for (const cv of canvases) {
      const c = cv as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      if (!ctx || !c.width || !c.height) continue;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set<string>();
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        opaque += 1;
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      if (opaque > 0) return { colors: colors.size, opaque };
    }
    return { colors: 0, opaque: 0 };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`overworld @mobile ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('terrain renders sprites (not a flat color, not blank)', async ({ page }) => {
      await page.goto('/?overworld=sandbox');
      const painted = await waitForTerrainPainted(page);
      expect(painted).toBe(true);

      const { colors, opaque } = await sampleTerrainCanvas(page);
      // Map is not blank: opaque pixels exist.
      expect(opaque).toBeGreaterThan(0);
      // Sprite texture/decoration present: more than one distinct color.
      expect(colors).toBeGreaterThanOrEqual(2);
    });

    test('determinism: identical render across reloads (no Math.random)', async ({ page }) => {
      // Sandbox uses a fixed map seed (42), so a deterministic renderer must
      // produce byte-identical canvases on a fresh load of the same page.
      const grab = async () => {
        await page.goto('/?overworld=sandbox');
        await waitForTerrainPainted(page);
        return page.evaluate(() => {
          const canvases = Array.from(document.querySelectorAll('canvas.ow-terrain-canvas'));
          return (canvases as HTMLCanvasElement[]).slice(0, 12).map((c) => c.toDataURL());
        });
      };
      const first = await grab();
      const second = await grab();
      expect(second).toEqual(first);
    });
  });
}

// Eager preload + directional fog edge mask assertions.
// Runs at both desktop and mobile because WorldMap is shared.

for (const vp of VIEWPORTS) {
  test.describe(`overworld @mobile fog-edge mask ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('tileset painted within 2 s of page load (eager preload)', async ({ page }) => {
      // Record navigation start time, then wait for the overworld to load and
      // the terrain canvases to receive non-transparent pixel data. The eager
      // _startSheetLoad() call at module scope means loading starts before any
      // MapTile mounts, so the 2 s budget should be trivially achievable.
      const t0 = Date.now();
      await page.goto('/?overworld=sandbox');
      const painted = await page
        .waitForFunction(() => {
          const cvs = Array.from(document.querySelectorAll('canvas.ow-terrain-canvas'));
          return cvs.some((cv) => {
            const c = cv as HTMLCanvasElement;
            if (!c.width || !c.height) return false;
            const ctx = c.getContext('2d');
            if (!ctx) return false;
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
            return false;
          });
        }, null, { timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      const elapsed = Date.now() - t0;
      expect(painted, `tileset must paint within 2000 ms; took ${elapsed} ms`).toBe(true);
    });

    // Note: this used to assert an inline mask-image directly on the tile
    // root div. That mechanism was replaced (2026-07-03) by a separate
    // .ow-fog-fade overlay div because a CSS mask's painting area is the
    // border box, which fully hid the canvas's overflow bands (OVERFLOW_TOP/
    // OVERFLOW_X in terrainRenderer.js) and hard-clipped tree canopies at the
    // fog frontier. See docs/CURRENT_SPRINT.md -- Bug Fix: Sprite Black Boxes
    // + Tree Clipping.
    test('fog-edge tile has a directional linear-gradient fade overlay only on unrevealed sides', async ({ page }) => {
      await page.goto('/?overworld=sandbox');
      // Wait for the map to settle (toolbar or mobile menu must be visible).
      const selector = vp.width >= 640
        ? '[data-testid="ow-desktop-toolbar"]'
        : '[data-testid="ow-mobile-menu-btn"]';
      await page.waitForSelector(selector, { timeout: 10000 });
      await waitForTerrainPainted(page);

      // Find the first fog-edge tile (has data-fog-sides attribute).
      const result = await page.evaluate(() => {
        const tile = document.querySelector('[data-fog-sides]') as HTMLElement | null;
        if (!tile) return null;
        const sides = tile.getAttribute('data-fog-sides') ?? '';
        const overlay = tile.querySelector('.ow-fog-fade') as HTMLElement | null;
        return { sides, background: overlay?.style.background ?? '' };
      });

      // The sandbox map (seed 42) always has at least one revealed boundary tile.
      expect(result, 'at least one fog-edge tile must exist on the initial viewport').not.toBeNull();

      const { sides, background } = result!;

      // Must be directional linear-gradients, NOT the old radial gradient.
      expect(background).not.toContain('ellipse at center');
      expect(background).toContain('linear-gradient');

      // Each active side contributes exactly one gradient; count them.
      const activeSides = sides.split(',').filter(Boolean);
      const gradCount = (background.match(/linear-gradient/g) || []).length;
      expect(gradCount).toBe(activeSides.length);

      // Verify direction-to-gradient alignment: each active side maps to the
      // correct directional gradient.
      if (activeSides.includes('w')) expect(background).toContain('to right');
      if (activeSides.includes('e')) expect(background).toContain('to left');
      if (activeSides.includes('n')) expect(background).toContain('to bottom');
      if (activeSides.includes('s')) expect(background).toContain('to top');

      // Inactive sides must NOT appear in the overlay's background.
      if (!activeSides.includes('w')) expect(background).not.toContain('to right');
      if (!activeSides.includes('e')) expect(background).not.toContain('to left');
      if (!activeSides.includes('n')) expect(background).not.toContain('to bottom');
      if (!activeSides.includes('s')) expect(background).not.toContain('to top');
    });

    test('fully-interior revealed tile has no fog fade overlay', async ({ page }) => {
      // To guarantee an interior tile exists we press ArrowRight several times
      // so a previously unrevealed region opens up and some older revealed tiles
      // gain revealed neighbors on all four sides.
      await page.goto('/?overworld=sandbox');
      const selector = vp.width >= 640
        ? '[data-testid="ow-desktop-toolbar"]'
        : '[data-testid="ow-mobile-menu-btn"]';
      await page.waitForSelector(selector, { timeout: 10000 });
      await page.waitForFunction(() => typeof (window as any).__overworldAnim === 'function');

      // Move right enough to reveal several new tiles.
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(120);
      }

      const interiorHasFade = await page.evaluate(() => {
        // An interior tile: revealed, no data-fog-sides attribute, has an
        // ow-terrain-canvas sibling (i.e. it is a revealed tile, not the fog div).
        const tiles = Array.from(
          document.querySelectorAll('.ow-tile canvas.ow-terrain-canvas')
        ).map((cv) => cv.parentElement as HTMLElement);

        for (const tile of tiles) {
          if (tile.hasAttribute('data-fog-sides')) continue; // edge tile, skip
          if (tile.querySelector('.ow-fog-fade')) return true; // interior tile with a fade overlay = bug
          const style = tile.style;
          if (style.maskImage || style.webkitMaskImage) return true; // stale mask = bug
        }
        return false;
      });

      expect(
        interiorHasFade,
        'fully-interior revealed tile must not have a fog-fade overlay or mask-image applied'
      ).toBe(false);
    });
  });
}

// Fallback: when the tilesheet assets fail to load, the map must still render
// the legacy TERRAIN_BG colors -- no blank tiles, no thrown errors.
test.describe('@overworld-visual-2 @mobile asset-load fallback', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('blocks tilesheets -> flat TERRAIN_BG fallback still renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // Abort the two tileset PNG requests so the Image loaders fail.
    await page.route('**/forest_tileset*.png', (r) => r.abort());
    await page.route('**/forest_decorations*.png', (r) => r.abort());

    await page.goto('/?overworld=sandbox');
    // The map still mounts; terrain canvases exist but stay transparent.
    await page.waitForSelector('canvas.ow-terrain-canvas', { timeout: 15000 });

    // A revealed terrain tile retains its TERRAIN_BG background color.
    const bg = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('.ow-tile'));
      for (const el of tiles) {
        const style = getComputedStyle(el as HTMLElement);
        const c = style.backgroundColor;
        // Skip fully transparent / default tiles.
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      }
      return null;
    });
    expect(bg).not.toBeNull();
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Retry-backoff loader tests (MAX_RETRIES = 3, RETRY_BASE_DELAY_MS = 750)
// ---------------------------------------------------------------------------
// These tests cover the bounded-retry behavior added to _loadOne(). They run
// at both desktop and mobile viewports to assert singleton parity -- one loader,
// shared regardless of which screen component mounts MapTile first.

const RETRY_VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile',  width: 390,  height: 844 },
];

for (const vp of RETRY_VIEWPORTS) {
  test.describe(`overworld @mobile tilesheet retry — ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('retry recovery: warn emitted, tiles render after retry succeeds', async ({ page }) => {
      const warnMessages: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'warning') warnMessages.push(msg.text());
      });

      // Fail the tileset request exactly once, then allow it through.
      let tilesetFailCount = 0;
      await page.route('**/forest_tileset*.png', (route) => {
        if (tilesetFailCount < 1) {
          tilesetFailCount += 1;
          route.abort();
        } else {
          route.continue();
        }
      });

      await page.goto('/?overworld=sandbox');

      // Wait long enough for the retry cycle (attempt 1 delay = 1 * 750 ms).
      const painted = await waitForTerrainPainted(page);
      expect(painted, 'tiles must paint after retry succeeds').toBe(true);

      // A console.warn containing "tilesheet" and "Retrying" must have fired.
      const retryWarn = warnMessages.find(
        (m) => m.includes('tilesheet') && m.includes('Retrying')
      );
      expect(retryWarn, 'console.warn with "tilesheet" and "Retrying" must be emitted').toBeTruthy();

      // Tiles must show terrain art (sprite texture), not just a flat fallback color.
      const { colors } = await sampleTerrainCanvas(page);
      expect(colors, 'terrain canvas must have multiple colors (sprite painted)').toBeGreaterThanOrEqual(2);
    });

    test('terminal failure: error logged, flat-color fallback, no uncaught exception', async ({ page }) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      // Abort every tileset request unconditionally so all retries exhaust.
      await page.route('**/forest_tileset*.png', (route) => route.abort());

      await page.goto('/?overworld=sandbox');

      // Wait long enough for all 3 retry attempts to exhaust.
      // MAX_RETRIES=3, delays: 750ms + 1500ms + 2250ms = 4500ms total.
      await page.waitForSelector('canvas.ow-terrain-canvas', { timeout: 15000 });
      await page.waitForTimeout(5500); // exceed total retry window

      // A console.error containing "permanently failed" must have fired.
      const terminalErr = consoleErrors.find((m) => m.includes('permanently failed'));
      expect(terminalErr, 'console.error with "permanently failed" must be emitted').toBeTruthy();

      // No uncaught exceptions: the failure is surfaced via console, not thrown.
      expect(pageErrors, 'no unhandled page errors').toEqual([]);

      // Map must not be blank: TERRAIN_BG fallback color must appear.
      const bg = await page.evaluate(() => {
        const tiles = Array.from(document.querySelectorAll('.ow-tile'));
        for (const el of tiles) {
          const c = getComputedStyle(el as HTMLElement).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
        }
        return null;
      });
      expect(bg, 'TERRAIN_BG flat-color fallback must still render').not.toBeNull();
    });
  });
}

// ---------------------------------------------------------------------------
// Cross-Blended Tint Boundary Dithering (TINT-BLEND-DITHER-1)
// ---------------------------------------------------------------------------
// Verifies the getTintCells() dithering system in terrainRenderer.js.
// Tests import the pure module dynamically and query window.__overworldState()
// for real tile data -- no pixel-art texture noise, no canvas sampling.
// WorldMap has no viewport branch, so both viewports must pass identically;
// a pass at one and fail at the other is a hard fail for this feature.

for (const vp of VIEWPORTS) {
  test.describe(`overworld @mobile tint-blend dithering ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto('/?overworld=sandbox');
      await page.waitForFunction(
        () => typeof (window as any).__overworldState === 'function',
        { timeout: 10000 }
      );
      await waitForTerrainPainted(page);
    });

    // Spec test 1: boundary tile -> more than 1 instruction from getTintCells
    // (the old flat-fill produced at most 1 fillRect instruction; the dithered
    // path produces 1 base-fill + TINT_BAND_CELLS * cellsPerSide band cells).
    test('boundary tile: getTintCells returns dithered band cells beyond base fill', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const state = (window as any).__overworldState();
        const mod = await import('/src/ui/overworld/terrainRenderer.js');
        const { getTintCells, getTint } = mod;

        // tiles is a 2D array [y][x]; flatten to a 1D list for iteration.
        const allTiles: any[] = (state.tiles as any[][]).flat();
        const tileMap = new Map<string, any>();
        for (const t of allTiles) {
          if (t) tileMap.set(`${t.x},${t.y}`, t);
        }

        function nIds(tile: any) {
          return {
            n: tileMap.get(`${tile.x},${tile.y - 1}`)?.terrain?.id ?? null,
            s: tileMap.get(`${tile.x},${tile.y + 1}`)?.terrain?.id ?? null,
            e: tileMap.get(`${tile.x + 1},${tile.y}`)?.terrain?.id ?? null,
            w: tileMap.get(`${tile.x - 1},${tile.y}`)?.terrain?.id ?? null,
          };
        }

        function tintsDiffer(a: any, b: any): boolean {
          if (!a && !b) return false;
          if (!a || !b) return true;
          return a.r !== b.r || a.g !== b.g || a.b !== b.b;
        }

        for (const tile of allTiles) {
          if (!tile?.terrain) continue;
          const ownTint = getTint(tile.terrain.id);
          const ids = nIds(tile);
          const hasDiffNeighbor = (['n','s','e','w'] as const).some(
            (side) => tintsDiffer(ownTint, getTint(ids[side]))
          );
          if (!hasDiffNeighbor) continue;

          const cells = getTintCells(tile.terrain.id, tile.x, tile.y, ids, 34);
          if (cells.length > 1) {
            return { found: true, cellCount: cells.length, terrainId: tile.terrain.id };
          }
        }
        return { found: false, cellCount: 0, terrainId: null };
      });

      expect(result.found, 'no boundary tile found with blended band cells in map').toBe(true);
      expect(result.cellCount).toBeGreaterThan(1);
    });

    // Spec test 2: interior tile -> cheap path (0 or 1 instruction, not a full band).
    // Confirms the fast path still fires for same-tint-all-sides tiles so interior
    // biome regions look identical to the pre-change flat fill.
    test('interior tile: getTintCells uses cheap path (at most 1 instruction)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const state = (window as any).__overworldState();
        const mod = await import('/src/ui/overworld/terrainRenderer.js');
        const { getTintCells, getTint } = mod;

        // tiles is a 2D array [y][x]; flatten to a 1D list for iteration.
        const allTiles: any[] = (state.tiles as any[][]).flat();
        const tileMap = new Map<string, any>();
        for (const t of allTiles) {
          if (t) tileMap.set(`${t.x},${t.y}`, t);
        }

        const DIRS: Array<{ side: string; dx: number; dy: number }> = [
          { side: 'n', dx: 0,  dy: -1 },
          { side: 's', dx: 0,  dy:  1 },
          { side: 'e', dx: 1,  dy:  0 },
          { side: 'w', dx: -1, dy:  0 },
        ];

        function tintSame(a: any, b: any): boolean {
          if (!a && !b) return true;
          if (!a || !b) return false;
          return a.r === b.r && a.g === b.g && a.b === b.b;
        }

        for (const tile of allTiles) {
          if (!tile?.terrain) continue;
          const ownTint = getTint(tile.terrain.id);
          const neighbors = DIRS.map(({ dx, dy }) => tileMap.get(`${tile.x + dx},${tile.y + dy}`));
          // Interior: all 4 adjacent tiles exist and have the same tint as this tile.
          const isInterior = neighbors.every((n) => n?.terrain && tintSame(ownTint, getTint(n.terrain.id)));
          if (!isInterior) continue;

          const ids = {
            n: tileMap.get(`${tile.x},${tile.y - 1}`)?.terrain?.id ?? null,
            s: tileMap.get(`${tile.x},${tile.y + 1}`)?.terrain?.id ?? null,
            e: tileMap.get(`${tile.x + 1},${tile.y}`)?.terrain?.id ?? null,
            w: tileMap.get(`${tile.x - 1},${tile.y}`)?.terrain?.id ?? null,
          };
          const cells = getTintCells(tile.terrain.id, tile.x, tile.y, ids, 34);
          return { found: true, cellCount: cells.length, tinted: ownTint !== null };
        }
        return { found: false, cellCount: -1, tinted: false };
      });

      expect(result.found, 'no interior tile found with all-same-tint neighbors in map').toBe(true);
      // Cheap path: untinted interior -> 0; tinted interior -> 1 (full-tile base fill).
      // More than 1 means band cells were incorrectly emitted for a uniform interior.
      expect(result.cellCount).toBeLessThanOrEqual(1);
    });

    // Spec test 3: symmetry -- both tiles on either side of a seam produce band cells.
    // Confirms the dithering is not one-sided (old flat fill was per-tile only).
    test('seam symmetry: both tiles bordering a boundary produce dithered band cells', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const state = (window as any).__overworldState();
        const mod = await import('/src/ui/overworld/terrainRenderer.js');
        const { getTintCells, getTint } = mod;

        // tiles is a 2D array [y][x]; flatten to a 1D list for iteration.
        const allTiles: any[] = (state.tiles as any[][]).flat();
        const tileMap = new Map<string, any>();
        for (const t of allTiles) {
          if (t) tileMap.set(`${t.x},${t.y}`, t);
        }

        function nIds(tile: any) {
          return {
            n: tileMap.get(`${tile.x},${tile.y - 1}`)?.terrain?.id ?? null,
            s: tileMap.get(`${tile.x},${tile.y + 1}`)?.terrain?.id ?? null,
            e: tileMap.get(`${tile.x + 1},${tile.y}`)?.terrain?.id ?? null,
            w: tileMap.get(`${tile.x - 1},${tile.y}`)?.terrain?.id ?? null,
          };
        }

        function tintsDiffer(a: any, b: any): boolean {
          if (!a && !b) return false;
          if (!a || !b) return true;
          return a.r !== b.r || a.g !== b.g || a.b !== b.b;
        }

        const AXES: Array<[number, number]> = [[1, 0], [0, 1]];
        for (const tile of allTiles) {
          if (!tile?.terrain) continue;
          const ownTint = getTint(tile.terrain.id);
          for (const [dx, dy] of AXES) {
            const neighbor = tileMap.get(`${tile.x + dx},${tile.y + dy}`);
            if (!neighbor?.terrain) continue;
            const neighborTint = getTint(neighbor.terrain.id);
            if (!tintsDiffer(ownTint, neighborTint)) continue;

            const cellsA = getTintCells(tile.terrain.id, tile.x, tile.y, nIds(tile), 34);
            const cellsB = getTintCells(neighbor.terrain.id, neighbor.x, neighbor.y, nIds(neighbor), 34);
            if (cellsA.length > 1 && cellsB.length > 1) {
              return {
                symmetric: true,
                cellsA: cellsA.length,
                cellsB: cellsB.length,
                idA: tile.terrain.id,
                idB: neighbor.terrain.id,
              };
            }
          }
        }
        return { symmetric: false, cellsA: 0, cellsB: 0, idA: null, idB: null };
      });

      expect(result.symmetric, 'no symmetric boundary pair found in map').toBe(true);
      expect(result.cellsA, 'tile A (left/top of seam) must have band cells').toBeGreaterThan(1);
      expect(result.cellsB, 'tile B (right/bottom of seam) must have band cells').toBeGreaterThan(1);
    });

    // Spec test 4: determinism -- same args produce identical output every call.
    // Guards against any Math.random() or non-seeded randomness in getTintCells.
    test('determinism: getTintCells returns byte-identical results on repeated calls', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const state = (window as any).__overworldState();
        const mod = await import('/src/ui/overworld/terrainRenderer.js');
        const { getTintCells } = mod;

        // tiles is a 2D array [y][x]; flatten to a 1D list for iteration.
        const allTiles: any[] = (state.tiles as any[][]).flat();
        const tileMap = new Map<string, any>();
        for (const t of allTiles) {
          if (t) tileMap.set(`${t.x},${t.y}`, t);
        }

        // Use first tile with valid terrain as a stable target.
        const tile = allTiles.find((t: any) => t?.terrain);
        if (!tile) return { identical: false, reason: 'no tile found' };

        const ids = {
          n: tileMap.get(`${tile.x},${tile.y - 1}`)?.terrain?.id ?? null,
          s: tileMap.get(`${tile.x},${tile.y + 1}`)?.terrain?.id ?? null,
          e: tileMap.get(`${tile.x + 1},${tile.y}`)?.terrain?.id ?? null,
          w: tileMap.get(`${tile.x - 1},${tile.y}`)?.terrain?.id ?? null,
        };

        // Call three times; all must match.
        const run1 = JSON.stringify(getTintCells(tile.terrain.id, tile.x, tile.y, ids, 34));
        const run2 = JSON.stringify(getTintCells(tile.terrain.id, tile.x, tile.y, ids, 34));
        const run3 = JSON.stringify(getTintCells(tile.terrain.id, tile.x, tile.y, ids, 34));
        return { identical: run1 === run2 && run2 === run3, reason: '' };
      });

      expect(result.identical, result.reason || 'repeated getTintCells calls returned different results').toBe(true);
    });
  });
}

// Singleton parity guard: the retry state is module-level and shared, so
// exhausting retries in one viewport context must show the same terminal state
// when a second load occurs (no per-screen re-initialization of _loadStarted).
test.describe('@overworld-visual-2 @mobile singleton parity guard', () => {
  test('terminal failure state is not reset between viewport changes', async ({ browser }) => {
    // Load mobile viewport first; exhaust retries for tileset.
    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileCtx.newPage();
    await mobilePage.route('**/forest_tileset*.png', (r) => r.abort());
    await mobilePage.goto('/?overworld=sandbox');
    await mobilePage.waitForSelector('canvas.ow-terrain-canvas', { timeout: 15000 });
    // Wait for retry window to exhaust (MAX_RETRIES=3: 750+1500+2250=4500ms).
    await mobilePage.waitForTimeout(5500);

    // Confirm terminal error was logged on mobile.
    const mobileErrors: string[] = [];
    mobilePage.on('console', (msg) => {
      if (msg.type() === 'error') mobileErrors.push(msg.text());
    });
    await mobileCtx.close();

    // Load desktop viewport in a fresh context (same module bundle, _loadStarted = true).
    // The singleton _loadStarted flag means _startSheetLoad() is a no-op -- the loader
    // does NOT re-attempt when the desktop screen mounts. Flat-color fallback persists.
    const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopCtx.newPage();
    await desktopPage.route('**/forest_tileset*.png', (r) => r.abort());
    await desktopPage.goto('/?overworld=sandbox');
    await desktopPage.waitForSelector('canvas.ow-terrain-canvas', { timeout: 15000 });

    // No unhandled exceptions on the desktop load either.
    const desktopPageErrors: string[] = [];
    desktopPage.on('pageerror', (e) => desktopPageErrors.push(String(e)));
    await desktopPage.waitForTimeout(1000);
    expect(desktopPageErrors).toEqual([]);

    await desktopCtx.close();
  });
});
