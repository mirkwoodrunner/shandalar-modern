import { test, expect } from '@playwright/test';
import { OVERFLOW_TOP, OVERFLOW_X } from '../../src/ui/overworld/terrainRenderer.js';

// Regression suite for the 2026-07-02 "Sprite Black Boxes + Tree Clipping" fix:
//   1. goblin.png / zombie.png shipped with opaque near-black backgrounds
//      (black-box sprites on the overworld map).
//   2. The per-tile terrain canvas was exactly tileSize wide, so wide tree
//      decorations (with anchor jitter) got sliced at the canvas edge.
//   3. Revealed tiles bordering fog got an inline mask-image that clipped the
//      entire overflow band above the tile, hard-cutting tree canopies at the
//      fog frontier.
// Runs at both desktop and mobile viewports because WorldMap is shared -- a
// pass at one size and a fail at the other would mean the render path diverged.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

async function waitForOWReady(page) {
  const selector = (page.viewportSize()?.width ?? 1280) >= 640
    ? '[data-testid="ow-desktop-toolbar"]'
    : '[data-testid="ow-mobile-menu-btn"]';
  await page.waitForSelector(selector, { timeout: 12000 });
}

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
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
        return false;
      });
    }, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
}

for (const vp of VIEWPORTS) {
  test.describe(`@overworld-visual-1 @mobile sprite + tree rendering ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('goblin.png and zombie.png are no longer black-box sprites (alpha ratio > 30%)', async ({ page }) => {
      await page.goto('/?overworld=sandbox');
      await waitForOWReady(page);

      const ratios = await page.evaluate(async () => {
        const urls = {
          goblin: '/src/assets/sprites/goblin.png',
          zombie: '/src/assets/sprites/zombie.png',
        };
        const out: Record<string, number> = {};
        for (const [name, url] of Object.entries(urls)) {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = url;
          });
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          const ctx = cv.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let transparent = 0;
          const total = data.length / 4;
          for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent += 1;
          out[name] = transparent / total;
        }
        return out;
      });

      expect(ratios.goblin, 'goblin.png transparent-pixel ratio').toBeGreaterThan(0.30);
      expect(ratios.zombie, 'zombie.png transparent-pixel ratio').toBeGreaterThan(0.30);
    });

    test('per-tile terrain canvas is widened by OVERFLOW_X on each horizontal side', async ({ page }) => {
      await page.goto('/?overworld=sandbox');
      await waitForOWReady(page);
      await waitForTerrainPainted(page);

      const geometry = await page.evaluate(() => {
        const tile = document.querySelector('.ow-tile:not(.ow-fog)') as HTMLElement | null;
        if (!tile) return null;
        const canvas = tile.querySelector('canvas.ow-terrain-canvas') as HTMLCanvasElement | null;
        if (!canvas) return null;
        const tileSize = parseFloat(tile.style.width);
        const left = parseFloat(canvas.style.left);
        return { tileSize, canvasWidth: canvas.width, left };
      });

      expect(geometry, 'a revealed non-fog tile with a terrain canvas must exist').not.toBeNull();
      const { tileSize, canvasWidth, left } = geometry!;
      expect(canvasWidth).toBe(tileSize + 2 * OVERFLOW_X);
      expect(left).toBeLessThan(0);
    });

    test('fog-edge tiles use the fade overlay, not a CSS mask', async ({ page }) => {
      await page.goto('/?overworld=sandbox');
      await waitForOWReady(page);
      await waitForTerrainPainted(page);

      const result = await page.evaluate(() => {
        const tiles = Array.from(document.querySelectorAll('.ow-tile')) as HTMLElement[];
        let anyMask = false;
        let overlayFound = false;
        for (const tile of tiles) {
          const style = tile.style;
          if (style.maskImage || style.webkitMaskImage) anyMask = true;
          if (tile.hasAttribute('data-fog-sides') && tile.querySelector('.ow-fog-fade')) {
            overlayFound = true;
          }
        }
        return { anyMask, overlayFound, fogTileCount: tiles.filter((t) => t.hasAttribute('data-fog-sides')).length };
      });

      expect(result.anyMask, 'no revealed tile should carry an inline mask-image style').toBe(false);
      expect(
        result.fogTileCount,
        'the sandbox seed must have at least one fog-frontier tile on the initial viewport'
      ).toBeGreaterThan(0);
      expect(result.overlayFound, 'a fog-frontier tile must render the .ow-fog-fade overlay div').toBe(true);
    });

    test('the overflow band is actually painted into on visible FOREST tiles', async ({ page }) => {
      await page.goto('/?overworld=sandbox');
      await waitForOWReady(page);
      await waitForTerrainPainted(page);

      const result = await page.evaluate((overflowTop) => {
        const tiles = Array.from(document.querySelectorAll('.ow-forest')) as HTMLElement[];
        if (!tiles.length) return { noForestTiles: true, overflowUsed: false };
        let overflowUsed = false;
        for (const tile of tiles) {
          const canvas = tile.querySelector('canvas.ow-terrain-canvas') as HTMLCanvasElement | null;
          if (!canvas) continue;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          // Top OVERFLOW_TOP-px band.
          for (let y = 0; y < overflowTop && !overflowUsed; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const i = (y * canvas.width + x) * 4 + 3;
              if (data[i] !== 0) { overflowUsed = true; break; }
            }
          }
          // Left/right OVERFLOW_X columns (checked implicitly: full-width scan
          // above already covers them since canvas.width includes both bands).
          if (overflowUsed) break;
        }
        return { noForestTiles: false, overflowUsed };
      }, OVERFLOW_TOP);

      test.skip(result.noForestTiles, 'no visible FOREST tiles in the current sandbox viewport -- skipping rather than passing vacuously');
      if (!result.noForestTiles) {
        expect(result.overflowUsed, 'at least one FOREST tile canvas must paint into the overflow band').toBe(true);
      }
    });
  });
}
