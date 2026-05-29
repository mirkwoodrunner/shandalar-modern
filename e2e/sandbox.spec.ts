import { test, expect, Page } from '@playwright/test';

// URL helpers
const SANDBOX_URL     = '/?duel=sandbox&aiSpeed=0';
const sandboxWith = (cards: string) => `/?duel=sandbox&aiSpeed=0&cards=${cards}`;

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
test.describe('Sandbox boot', () => {
  test('lands on duel screen without title interaction', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await expect(page.getByTestId('duel-screen')).toBeVisible();
  });

  test('phase bar is visible and starts on UNTAP or MAIN_1', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const active = page.getByTestId('phase-active');
    await expect(active).toBeVisible();
    const text = await active.textContent();
    expect(['Untap', 'Main 1']).toContain(text?.trim());
  });

  test('player hand is rendered with card testids', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const firstCard = page.locator('[data-testid^="hand-card-"]').first();
    await expect(firstCard).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
test.describe('Action bar controls', () => {
  test('Pass Priority button is present', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await expect(page.getByTestId('pass-priority-button')).toBeVisible();
  });

  test('End Turn button is present and enabled on player turn', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="phase-active"]');
      const t = el?.textContent?.trim() ?? '';
      return t === 'Main 1' || t === 'MAIN 1';
    }, { timeout: 15_000 });
    const endTurn = page.getByTestId('end-turn-button');
    await expect(endTurn).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
test.describe('window.__duelDispatch escape hatch', () => {
  test('dispatch and state are exposed in sandbox mode', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const hasDispatch = await page.evaluate(() =>
      typeof (window as any).__duelDispatch === 'function' &&
      typeof (window as any).__duelState    === 'function'
    );
    expect(hasDispatch).toBe(true);
  });

  test('state reflects life totals', async ({ page }) => {
    await page.goto(SANDBOX_URL);
    await waitForDuel(page);
    const life = await page.evaluate(() => (window as any).__duelState().p.life);
    expect(life).toBe(20);
  });
});

// ---------------------------------------------------------------------------
test.describe('?cards= injection', () => {
  async function getHandIds(page: Page): Promise<string[]> {
    await page.waitForFunction(() => {
      const s = (window as any).__duelState?.();
      return s && s.p && Array.isArray(s.p.hand);
    }, { timeout: 5_000 });
    return page.evaluate(() => (window as any).__duelState().p.hand.map((c: any) => c.id));
  }

  test('injected card is in hand regardless of decklist contents', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('grizzly_bears');
  });

  test('multiple injected cards are all in hand', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears,lightning_bolt'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('grizzly_bears');
    expect(ids).toContain('lightning_bolt');
  });

  test('colored mana lands are injected for a single card', async ({ page }) => {
    // mahamoti_djinn costs "4UU": 2 islands (colored) + 4 islands (generic, dominant=U)
    await page.goto(sandboxWith('mahamoti_djinn'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('mahamoti_djinn');
    expect(ids.filter((id: string) => id === 'island').length).toBeGreaterThanOrEqual(6);
  });

  test('multi-color injection satisfies all colored pip requirements', async ({ page }) => {
    // lightning_bolt "R":   R=1, generic=0
    // sengir_vampire "3BB": B=2, generic=3 (dominant=B -> swamp for generic)
    await page.goto(sandboxWith('lightning_bolt,sengir_vampire'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('lightning_bolt');
    expect(ids).toContain('sengir_vampire');
    expect(ids.filter((id: string) => id === 'swamp').length).toBeGreaterThanOrEqual(2);
    expect(ids.filter((id: string) => id === 'mountain').length).toBeGreaterThanOrEqual(1);
  });

  test('hand size exceeds 7 when many cards are injected', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears,lightning_bolt,sengir_vampire,serra_angel'));
    await waitForDuel(page);
    const ids = await getHandIds(page);
    expect(ids).toContain('grizzly_bears');
    expect(ids).toContain('lightning_bolt');
    expect(ids).toContain('sengir_vampire');
    expect(ids).toContain('serra_angel');
    expect(ids.length).toBeGreaterThan(7);
  });
});
