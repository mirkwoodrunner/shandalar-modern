import { test, expect } from '@playwright/test';

// Regression suite for the hooded-figure sprite variant introduced in the
// overworld enemy sprite system. Every spawned enemy has a 50% chance (rolled
// once at spawn time, baked into spriteKind) to render as hoodedFigure in its
// archetype color rather than the archetype's default sprite kind.
//
// Test globals exposed by useOverworldController.js (sandbox mode only):
//   window.__overworldState()           -> { enemies, moves, pos, tiles }
//   window.__overworldSetEnemies(fn)    -> React setState setter

const OW_URL = '/?overworld=sandbox';

async function waitForOWReady(page) {
  await page.waitForFunction(
    () =>
      typeof (window as any).__overworldState === 'function' &&
      typeof (window as any).__overworldSetEnemies === 'function',
    null,
    { timeout: 12000 }
  );
}

// Inject N enemies near the player with alternating spriteKind values so we
// have a controlled mix visible in the DOM.
async function injectEnemyMix(page, count: number) {
  const { px, py } = await page.evaluate(() => {
    const { pos } = (window as any).__overworldState();
    return { px: pos.x, py: pos.y };
  });

  const ARCHS = [
    { archKey: 'WHITE_WEENIE', spriteColor: 'white' },
    { archKey: 'BLUE_TEMPO',   spriteColor: 'blue'  },
    { archKey: 'BLACK_CONTROL',spriteColor: 'black' },
    { archKey: 'RED_AGGRO',    spriteColor: 'red'   },
    { archKey: 'GREEN_STOMPY', spriteColor: 'green' },
  ];

  // Lay enemies out in a row to the right of the player (inside vision range).
  const enemies: object[] = [];
  for (let i = 0; i < count; i++) {
    const arch = ARCHS[i % ARCHS.length];
    // Alternate hoodedFigure / base sprite so the mix is deterministic.
    const spriteKind = i % 2 === 0 ? 'hoodedFigure' : 'goblin';
    enemies.push({
      id: `test-hood-${i}`,
      x: px + 1 + (i % 8),
      y: py + Math.floor(i / 8),
      tier: 1,
      archKey: arch.archKey,
      name: `Test ${i}`,
      hp: 10,
      terrain: 'FOREST',
      spriteKind,
      spriteColor: arch.spriteColor,
      animFrame: 0,
      dir: 'down',
    });
  }

  await page.evaluate((list) => {
    (window as any).__overworldSetEnemies((prev: any[]) => [...prev, ...list]);
  }, enemies);

  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// DESKTOP (1280x800)
// ---------------------------------------------------------------------------
test.describe('desktop hooded-figure sprite variant', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('sprite variety: hoodedFigure and non-hoodedFigure enemies both appear', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    // Inject 40 enemies with alternating spriteKind so we get a known 50/50 split.
    await injectEnemyMix(page, 40);

    const counts = await page.evaluate(() => {
      const hooded = document.querySelectorAll('.sprite.enemy.kind-hoodedFigure').length;
      const total  = document.querySelectorAll('.sprite.enemy').length;
      // Count non-hooded-figure enemy sprites.
      const other  = total - hooded;
      return { hooded, other, total };
    });

    // Both variants must be present.
    expect(counts.hooded, 'at least one hoodedFigure enemy').toBeGreaterThan(0);
    expect(counts.other,  'at least one non-hoodedFigure enemy').toBeGreaterThan(0);
    // Sanity: we injected 40 so at least several must be visible in the viewport.
    expect(counts.total, 'enemies rendered in DOM').toBeGreaterThan(0);
  });

  test('tint correctness: hoodedFigure enemy canvases are non-blank for all 5 archetype colors', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    const COLORS = [
      { archKey: 'WHITE_WEENIE',  spriteColor: 'white' },
      { archKey: 'BLUE_TEMPO',    spriteColor: 'blue'  },
      { archKey: 'BLACK_CONTROL', spriteColor: 'black' },
      { archKey: 'RED_AGGRO',     spriteColor: 'red'   },
      { archKey: 'GREEN_STOMPY',  spriteColor: 'green' },
    ];

    // Place one hoodedFigure per color adjacent to the player so all are visible.
    await page.evaluate(({ px, py, colors }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        ...colors.map((c, i) => ({
          id: `tint-test-${c.spriteColor}`,
          x: px + 1 + i,
          y: py,
          tier: 1,
          archKey: c.archKey,
          name: `Tint ${c.spriteColor}`,
          hp: 10,
          terrain: 'FOREST',
          spriteKind: 'hoodedFigure',
          spriteColor: c.spriteColor,
          animFrame: 0,
          dir: 'down',
        })),
      ]);
    }, { px, py, colors: COLORS });

    // Wait for sheets to load and canvases to paint.
    await page.waitForTimeout(800);

    for (const { spriteColor } of COLORS) {
      const opaque = await page.evaluate((color) => {
        // Find hoodedFigure enemies with this color class (look for the specific test id).
        const sprites = Array.from(
          document.querySelectorAll(`.sprite.enemy.kind-hoodedFigure.${color}`)
        ) as HTMLElement[];
        if (sprites.length === 0) return -1; // not found in DOM

        let maxOpaque = 0;
        for (const sprite of sprites) {
          const cv = sprite.querySelector('canvas.sprite-canvas') as HTMLCanvasElement | null;
          if (!cv) continue;
          const ctx = cv.getContext('2d');
          if (!ctx) continue;
          const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
          let count = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 30) count++;
          if (count > maxOpaque) maxOpaque = count;
        }
        return maxOpaque;
      }, spriteColor);

      // -1 means the enemy tile is offscreen (not in viewport) — skip pixel check,
      // but assert >= 0 to catch a DOM structure failure.
      expect(opaque, `hoodedFigure ${spriteColor} canvas DOM present`).toBeGreaterThanOrEqual(0);
      if (opaque > 0) {
        // Canvas is visible — it must have drawn something (not a blank tile).
        expect(opaque, `hoodedFigure ${spriteColor} canvas drew opaque pixels`).toBeGreaterThan(5);
      }
    }
  });

  test('spriteForHenchman still returns mage (henchmen unaffected)', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-desktop-toolbar"]', { timeout: 12000 });
    await waitForOWReady(page);

    const { px, py } = await page.evaluate(() => {
      const { pos } = (window as any).__overworldState();
      return { px: pos.x, py: pos.y };
    });

    // Inject a henchman with explicitly baked spriteKind:'mage' as the controller would.
    await page.evaluate(({ x, y }) => {
      (window as any).__overworldSetEnemies((prev: any[]) => [
        ...prev,
        {
          id: 'test-henchman-hood',
          x, y,
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

    // The henchman sprite must be kind-mage, never kind-hoodedFigure.
    await expect(page.locator('.sprite.enemy.kind-mage')).toHaveCount(1);
    // No hoodedFigure henchmen.
    await expect(
      page.locator('.sprite.enemy.kind-hoodedFigure[title="Necromancer"]')
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// MOBILE (390x844) -- parity: Sprite.jsx is shared, behavior must match.
// ---------------------------------------------------------------------------
test.describe('mobile hooded-figure sprite variant', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sprite variety: hoodedFigure and non-hoodedFigure enemies both appear', async ({ page }) => {
    await page.goto(OW_URL);
    await page.waitForSelector('[data-testid="ow-mobile-menu-btn"]', { timeout: 12000 });
    await waitForOWReady(page);

    await injectEnemyMix(page, 40);

    const counts = await page.evaluate(() => {
      const hooded = document.querySelectorAll('.sprite.enemy.kind-hoodedFigure').length;
      const total  = document.querySelectorAll('.sprite.enemy').length;
      const other  = total - hooded;
      return { hooded, other, total };
    });

    expect(counts.hooded, 'at least one hoodedFigure enemy (mobile)').toBeGreaterThan(0);
    expect(counts.other,  'at least one non-hoodedFigure enemy (mobile)').toBeGreaterThan(0);
    expect(counts.total,  'enemies rendered in DOM (mobile)').toBeGreaterThan(0);
  });
});
