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
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
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
  test.describe(`fog-edge mask ${vp.name} ${vp.width}x${vp.height}`, () => {
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

    test('fog-edge tile has directional linear-gradient mask only on unrevealed sides', async ({ page }) => {
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
        const style = tile.style;
        return { sides, maskImage: style.maskImage || style.webkitMaskImage || '' };
      });

      // The sandbox map (seed 42) always has at least one revealed boundary tile.
      expect(result, 'at least one fog-edge tile must exist on the initial viewport').not.toBeNull();

      const { sides, maskImage } = result!;

      // Must be directional linear-gradients, NOT the old radial gradient.
      expect(maskImage).not.toContain('ellipse at center');
      expect(maskImage).toContain('linear-gradient');

      // Each active side contributes exactly one gradient; count them.
      const activeSides = sides.split(',').filter(Boolean);
      const gradCount = (maskImage.match(/linear-gradient/g) || []).length;
      expect(gradCount).toBe(activeSides.length);

      // Verify direction-to-gradient alignment: each active side maps to the
      // correct directional gradient.
      if (activeSides.includes('w')) expect(maskImage).toContain('to right');
      if (activeSides.includes('e')) expect(maskImage).toContain('to left');
      if (activeSides.includes('n')) expect(maskImage).toContain('to bottom');
      if (activeSides.includes('s')) expect(maskImage).toContain('to top');

      // Inactive sides must NOT appear in the mask.
      if (!activeSides.includes('w')) expect(maskImage).not.toContain('to right');
      if (!activeSides.includes('e')) expect(maskImage).not.toContain('to left');
      if (!activeSides.includes('n')) expect(maskImage).not.toContain('to bottom');
      if (!activeSides.includes('s')) expect(maskImage).not.toContain('to top');
    });

    test('fully-interior revealed tile has no fog mask', async ({ page }) => {
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

      const interiorHasMask = await page.evaluate(() => {
        // An interior tile: revealed, no data-fog-sides attribute, has an
        // ow-terrain-canvas sibling (i.e. it is a revealed tile, not the fog div).
        const tiles = Array.from(
          document.querySelectorAll('.ow-tile canvas.ow-terrain-canvas')
        ).map((cv) => cv.parentElement as HTMLElement);

        for (const tile of tiles) {
          if (tile.hasAttribute('data-fog-sides')) continue; // edge tile, skip
          const style = tile.style;
          const mask = style.maskImage || style.webkitMaskImage || '';
          if (mask) return mask; // non-empty mask on an interior tile = bug
        }
        return null;
      });

      expect(
        interiorHasMask,
        'fully-interior revealed tile must not have a mask-image applied'
      ).toBeNull();
    });
  });
}

// Fallback: when the tilesheet assets fail to load, the map must still render
// the legacy TERRAIN_BG colors -- no blank tiles, no thrown errors.
test.describe('asset-load fallback', () => {
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
