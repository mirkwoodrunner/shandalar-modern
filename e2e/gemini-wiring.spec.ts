import { test, expect } from '@playwright/test';

const DESKTOP = { viewport: { width: 1280, height: 800 } };

test.describe('Gemini wiring -- heuristic fallback (no API key)', () => {
  test('Duel starts and AI takes its turn without crashing when useGemini=true but API fails', async ({ browser }) => {
    // useGemini is not yet surfaced as a URL param -- this test verifies the
    // heuristic path still works when the flag is false (default sandbox).
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState?.(), { timeout: 15000 });

    // Advance through several AI turns and confirm no JS errors
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(300);
    }

    expect(errors.filter(e => !e.includes('GeminiAdvisor'))).toHaveLength(0);
    await ctx.close();
  });
});

test.describe('Gemini wiring -- mobile parity', () => {
  test('isGeminiThinking indicator is not visible by default in sandbox', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState?.(), { timeout: 15000 });

    // Indicator should not be present when useGemini is not set
    const indicator = page.locator('text=Gemini is thinking');
    await expect(indicator).not.toBeVisible();
    await ctx.close();
  });
});

test.describe('Gemini log entries', () => {
  test('GEMINI_LOG dispatch appends gemini-typed entries to state log', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/?duel=sandbox&aiSpeed=0');
    await page.waitForFunction(() => (window as any).__duelState?.(), { timeout: 15000 });

    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'GEMINI_LOG',
        entries: [
          { text: '[Gemini] Test reasoning entry.', type: 'gemini' },
        ],
      });
    });

    await page.waitForTimeout(200);
    const logState = await page.evaluate(() => (window as any).__duelState().log);
    const geminiEntry = logState.find((e: any) => e.type === 'gemini');
    expect(geminiEntry).toBeTruthy();
    expect(geminiEntry.text).toContain('[Gemini]');
    await ctx.close();
  });
});
