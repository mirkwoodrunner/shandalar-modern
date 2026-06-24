import { test, expect } from '@playwright/test';

// Overworld pixel-art sprite sheets + directional walk-cycle.
// Boots the deterministic overworld sandbox (?overworld=sandbox, seed 42) and
// asserts the image-sheet sprites render, the keyboard walk-cycle drives
// frame/dir/moving, and -- the core regression -- mobile tap-to-move now sets
// dir/moving where it previously set nothing. window.__overworldAnim() is the
// sandbox-gated test global exposed by useOverworldController.js.

const URL = '/?overworld=sandbox';

// ---------------------------------------------------------------------------
// DESKTOP
// ---------------------------------------------------------------------------
test.describe('@overworld @mobile desktop overworld sprites', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('player renders as a canvas-backed sprite (old CSS/SVG body is gone)', async ({ page }) => {
    await page.goto(URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 10000 });

    // New: image-sheet canvas inside the player sprite.
    await expect(page.locator('.sprite.kind-mage.player canvas.sprite-canvas')).toHaveCount(1);
    // Old CSS-div anatomy must be gone.
    await expect(page.locator('.sprite.kind-mage .robe')).toHaveCount(0);
    await expect(page.locator('.sprite.kind-mage .hat')).toHaveCount(0);
    await expect(page.locator('.sprite .body-svg')).toHaveCount(0);
  });

  test('holding an arrow key cycles the walk frame', async ({ page }) => {
    await page.goto(URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]');
    await page.waitForFunction(() => typeof (window as any).__overworldAnim === 'function');

    await page.keyboard.down('ArrowRight');
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(80);
      const f = await page.evaluate(() => (window as any).__overworldAnim().player.frame);
      seen.add(f);
    }
    await page.keyboard.up('ArrowRight');
    // Walk cycle must visit more than one frame while moving.
    expect(seen.size).toBeGreaterThan(1);
  });

  test('each arrow key sets the matching direction', async ({ page }) => {
    await page.goto(URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]');
    await page.waitForFunction(() => typeof (window as any).__overworldAnim === 'function');

    const cases: Array<[string, string]> = [
      ['ArrowRight', 'right'],
      ['ArrowLeft', 'left'],
      ['ArrowUp', 'up'],
      ['ArrowDown', 'down'],
    ];
    for (const [key, dir] of cases) {
      await page.keyboard.down(key);
      await page.waitForTimeout(60);
      const a = await page.evaluate(() => (window as any).__overworldAnim().player);
      expect(a.dir, `key ${key}`).toBe(dir);
      expect(a.moving, `key ${key} moving`).toBe(true);
      await page.keyboard.up(key);
      await page.waitForTimeout(60);
    }
  });

  test('releasing the key clears the moving flag', async ({ page }) => {
    await page.goto(URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]');
    await page.waitForFunction(() => typeof (window as any).__overworldAnim === 'function');

    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(60);
    expect(await page.evaluate(() => (window as any).__overworldAnim().player.moving)).toBe(true);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => (window as any).__overworldAnim().player.moving)).toBe(false);
  });

  test('color tint produces colored (non-grayscale) sprite pixels', async ({ page }) => {
    await page.goto(URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]');
    // Let the sheet load + the tinted draw settle.
    await page.waitForTimeout(600);

    // Sample the player (gold) sprite canvas: expect opaque pixels where the
    // red channel clearly dominates blue (gold tint = high R, low B).
    const result = await page.evaluate(() => {
      const cv = document.querySelector('.sprite.kind-mage.player canvas.sprite-canvas') as HTMLCanvasElement;
      if (!cv) return null;
      const ctx = cv.getContext('2d')!;
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      let opaque = 0, gold = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a > 30) { opaque++; if (r > b + 25 && r >= g) gold++; }
      }
      return { opaque, gold };
    });
    expect(result).not.toBeNull();
    expect(result!.opaque).toBeGreaterThan(20);   // sprite actually drew
    expect(result!.gold).toBeGreaterThan(10);      // and it's tinted gold, not gray
  });

  test('a failed sprite sheet load degrades gracefully (no crash)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // Force the mage sheet to 404. The player is a mage and mage is also the
    // fallback kind, so this exercises the last-resort flat-square path.
    await page.route('**/*mage*.png', (route) => route.abort());

    await page.goto(URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]');
    await page.waitForTimeout(700);

    // Still renders a canvas, still no uncaught error.
    await expect(page.locator('.sprite.kind-mage.player canvas.sprite-canvas')).toHaveCount(1);
    const drew = await page.evaluate(() => {
      const cv = document.querySelector('.sprite.kind-mage.player canvas.sprite-canvas') as HTMLCanvasElement;
      const ctx = cv.getContext('2d')!;
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 30) opaque++;
      return opaque;
    });
    expect(drew).toBeGreaterThan(0);               // flat-square fallback drew something
    expect(pageErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MOBILE -- the parity regression: tap-to-move must now set dir/moving.
// ---------------------------------------------------------------------------
test.describe('@overworld @mobile mobile overworld sprites', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('tap-to-move sets direction and toggles the moving flag', async ({ page }) => {
    // Each direction starts from a fresh deterministic load so the player is
    // back at the seeded start position with open neighbors.
    const cases: Array<[string, number, number]> = [
      ['right', 1, 0],
      ['left', -1, 0],
      ['up', 0, -1],
      ['down', 0, 1],
    ];
    for (const [dir, dx, dy] of cases) {
      await page.goto(URL);
      await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]');
      await page.waitForFunction(() => typeof (window as any).__overworldAnim === 'function');
      await page.waitForTimeout(300);

      const box = await page.locator('.sprite.kind-mage.player').first().boundingBox();
      expect(box).not.toBeNull();
      const cx = box!.x + box!.width / 2 + dx * box!.width;
      const cy = box!.y + box!.height / 2 + dy * box!.height;
      await page.mouse.click(cx, cy);

      // Immediately after the tap: direction set, moving on.
      await page.waitForTimeout(40);
      const imm = await page.evaluate(() => (window as any).__overworldAnim().player);
      expect(imm.dir, `tap ${dir}`).toBe(dir);
      expect(imm.moving, `tap ${dir} moving on`).toBe(true);

      // After the timeout window: moving off again (no keyup on mobile).
      await page.waitForTimeout(360);
      const later = await page.evaluate(() => (window as any).__overworldAnim().player.moving);
      expect(later, `tap ${dir} moving off`).toBe(false);
    }
  });

  test('player sprite renders at mobile scale without layout break', async ({ page }) => {
    await page.goto(URL);
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]');
    await page.waitForTimeout(300);

    await expect(page.locator('.sprite.kind-mage.player canvas.sprite-canvas')).toHaveCount(1);
    const box = await page.locator('.sprite.kind-mage.player').first().boundingBox();
    expect(box).not.toBeNull();
    // Sprite stays tile-sized (scaled), not blown up or collapsed.
    expect(box!.width).toBeGreaterThan(8);
    expect(box!.width).toBeLessThan(60);
  });
});
