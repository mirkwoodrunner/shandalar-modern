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
