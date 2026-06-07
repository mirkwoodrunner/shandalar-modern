import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const sandboxWith = (cards: string) => `${SANDBOX_URL}&cards=${cards}`;

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT  = { width: 390,  height: 844 };

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

async function tapLand(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const land = (s.p.bf as any[]).find((c: any) => c.type === 'Land' && !c.tapped);
    if (land) dispatch({ type: 'TAP_LAND', who: 'p', iid: land.iid, mana: land.produces?.[0] ?? 'G' });
  });
}

// Play a land from hand to the battlefield (no stack involved).
async function playLand(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const land = (s.p.hand as any[]).find((c: any) => c.type === 'Land');
    if (!land) throw new Error('No land in hand');
    dispatch({ type: 'PLAY_LAND', who: 'p', iid: land.iid });
  });
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return (s?.p?.bf as any[])?.some((c: any) => c.type === 'Land');
  }, { timeout: 5_000 });
}

// Cast a card from hand (by id) and resolve the stack.
async function castAndResolve(page: Page, cardId: string) {
  await page.evaluate((id) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s.p.hand as any[]).find((c: any) => c.id === id);
    if (!card) throw new Error(`${id} not in hand`);
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: null, xVal: 0 });
  }, cardId);
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return (s?.stack?.length ?? 0) >= 1;
  }, { timeout: 5_000 });
  // Player passes priority; AI already passed (aiSpeed=0)
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'PASS_PRIORITY', who: 'p' });
  });
  await page.waitForFunction((id) => {
    const s = (window as any).__duelState?.();
    return (s?.p?.bf as any[])?.some((c: any) => c.id === id);
  }, cardId, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------

test.describe('Card type line — desktop', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('shows em dash between type and subtype', async ({ page }) => {
    await page.goto(sandboxWith('grizzly_bears'));
    await waitForDuel(page);
    // Wait for the Grizzly Bears hand card's typeBar
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('[class*="typeBar"]'))
        .some(el => (el as HTMLElement).innerText.includes('Bear'));
    }, { timeout: 10_000 });
    const typeLine = await page.locator('[class*="typeBar"]', { hasText: /Bear/ }).first().innerText();
    expect(typeLine).toMatch(/Creature\s*—\s*Bear/);
    expect(typeLine).not.toContain('?');
  });

  test('shows type only when no subtype', async ({ page }) => {
    await page.goto(sandboxWith('lightning_bolt'));
    await waitForDuel(page);
    // Wait for a typeBar that reads exactly "Instant"
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('[class*="typeBar"]'))
        .some(el => (el as HTMLElement).innerText.trim() === 'Instant');
    }, { timeout: 10_000 });
    const typeLine = await page.locator('[class*="typeBar"]', { hasText: /^Instant$/ }).first().innerText();
    expect(typeLine).toBe('Instant');
    expect(typeLine).not.toContain('?');
    expect(typeLine).not.toContain('—');
  });
});

// ---------------------------------------------------------------------------

test.describe('Card type line — mobile', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  // Llanowar Elves (cost G, subtype "Elf Druid") is castable with one Forest.
  // Mobile lands render as LandPip (no fieldType class); creatures use FieldCard.
  test('shows full type line with em dash', async ({ page }) => {
    await page.goto(sandboxWith('llanowar_elves'));
    await waitForDuel(page);
    await waitForMain1(page);
    await playLand(page);
    await tapLand(page);
    await castAndResolve(page, 'llanowar_elves');
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('[class*="fieldType"]'))
        .some(el => (el as HTMLElement).innerText.includes('Elf'));
    }, { timeout: 5_000 });
    const typeLine = await page.locator('[class*="fieldType"]', { hasText: /Elf/ }).first().innerText();
    expect(typeLine).toMatch(/Creature\s*—\s*Elf Druid/);
    expect(typeLine).not.toContain('?');
  });

  // Mox Jet (cost 0, type "Artifact", no subtype) reaches the battlefield through the stack.
  test('shows type only when no subtype', async ({ page }) => {
    await page.goto(sandboxWith('mox_jet'));
    await waitForDuel(page);
    await waitForMain1(page);
    await castAndResolve(page, 'mox_jet');
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('[class*="fieldType"]'))
        .some(el => (el as HTMLElement).innerText.trim() === 'Artifact');
    }, { timeout: 5_000 });
    const typeLine = await page.locator('[class*="fieldType"]', { hasText: /^Artifact$/ }).first().innerText();
    expect(typeLine).toBe('Artifact');
    expect(typeLine).not.toContain('?');
    expect(typeLine).not.toContain('—');
  });
});
