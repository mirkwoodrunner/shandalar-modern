// tests/e2e/copy-and-modal-choice.spec.ts
//
// End-to-end coverage for the generalized copy mechanism (Vesuvan
// Doppelganger) and the Primal Clay modal ETB choice.
//   - Vesuvan Doppelganger: casting it opens the normal optional-targeting
//     cast-prompt flow (castFlow kind:'spell', optionalTarget:true); the
//     upkeep re-copy exercises the NEW castFlow kind:'trigger' path, which
//     extends the same targeting UI to a suspended triggered ability
//     (s.pendingTriggerTarget / RESOLVE_TRIGGER_TARGET in DuelCore.js) rather
//     than a fixed pendingChoice option list.
//   - Primal Clay: a fixed three-mode ETB choice through the generic
//     ChoiceModal/pendingChoice pipeline (kind: 'primalClayChoice'), same
//     rendering path as generalized-choice-mechanisms.spec.ts's Alchor's Tomb
//     coverage.
//
// Sandbox escape hatches used (see docs/CLAUDE.md "Escape hatches"):
//   window.__duelDispatch(action) -- drive the engine directly
//   window.__duelState()          -- read current GameState snapshot

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForEngineReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    { timeout: 15000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

function makeCreatureCard(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, type: 'Creature', subtype: 'Bear', controller: 'o', color: 'G',
    power: 2, toughness: 2, tapped: false, summoningSick: false, attacking: false,
    blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    ...overrides,
  };
}

async function resolveStack(page: Page) {
  for (let i = 0; i < 5; i++) {
    const stackLen = await page.evaluate(() => (window as any).__duelState().stack?.length ?? 0);
    if (stackLen === 0) return;
    const passBtn = page.locator('[data-testid="pass-priority-button"]').first();
    if (await passBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await passBtn.click();
    }
    await page.waitForTimeout(300);
  }
}

async function castFromHand(page: Page, nameRegex: RegExp) {
  const card = page.locator('[data-testid^="hand-card-"], [data-testid="hand-card"]')
    .filter({ hasText: nameRegex })
    .first();
  await expect(card).toBeVisible({ timeout: 5000 });
  await card.click();
  await page.waitForTimeout(200);

  const castBtn = page.locator('[data-testid="cast-button"]').first();
  await expect(castBtn).toBeVisible({ timeout: 5000 });
  await castBtn.click();
  await page.waitForTimeout(200);
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine-layers-copy-1 @mobile Vesuvan Doppelganger + Primal Clay [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test('Vesuvan Doppelganger: accepting the ETB copy targets a creature and copies its characteristics', async ({ page }) => {
      const bear = makeCreatureCard('bear-e2e', { id: 'grizzly_bears', name: 'Grizzly Bears' });

      await page.evaluate(({ bear }) => {
        (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cardIds: ['vesuvan_doppelganger'], withManaSupport: true });
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { o: { ...s.o, bf: [bear] } } });
      }, { bear });
      await page.waitForTimeout(200);

      await castFromHand(page, /vesuvan doppelganger/i);

      // Optional targeting -- Skip should be visible (declining is legal), but
      // we target the bear instead.
      await expect(page.locator('[data-testid="cast-prompt-skip"]')).toBeVisible({ timeout: 3000 });
      const bearEl = page.locator('[data-iid="bear-e2e"]').first();
      await expect(bearEl).toBeVisible({ timeout: 3000 });
      await bearEl.dispatchEvent('click');
      await page.waitForTimeout(200);

      await page.locator('[data-testid="cast-prompt-confirm"]').click();
      await page.waitForTimeout(200);
      await resolveStack(page);

      const copy = await page.evaluate(() =>
        (window as any).__duelState().p.bf.find((c: any) => c.name === 'Grizzly Bears' || c.id === 'vesuvan_doppelganger')
      );
      expect(copy.name).toBe('Grizzly Bears');
      expect(copy.power).toBe(2);
      expect(copy.toughness).toBe(2);
      expect(copy.color).toBe('U'); // colorOverride -- Vesuvan stays blue
      expect(copy.triggeredAbilities).toHaveLength(1);
    });

    test('Vesuvan Doppelganger: upkeep re-copy opens the trigger targeting flow and re-copies a new creature', async ({ page }) => {
      const bear = makeCreatureCard('bear-e2e2', { id: 'grizzly_bears', name: 'Grizzly Bears' });

      await page.evaluate(({ bear }) => {
        (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cardIds: ['vesuvan_doppelganger'], withManaSupport: true });
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { o: { ...s.o, bf: [bear] } } });
      }, { bear });
      await page.waitForTimeout(200);

      await castFromHand(page, /vesuvan doppelganger/i);
      const bearEl = page.locator('[data-iid="bear-e2e2"]').first();
      await expect(bearEl).toBeVisible({ timeout: 3000 });
      await bearEl.dispatchEvent('click');
      await page.waitForTimeout(200);
      await page.locator('[data-testid="cast-prompt-confirm"]').click();
      await page.waitForTimeout(200);
      await resolveStack(page);

      // Add a second creature to re-copy into, then force the controller's
      // upkeep so the recurring trigger fires and suspends into pendingTriggerTarget.
      const juggernaut = makeCreatureCard('jug-e2e', {
        id: 'juggernaut', name: 'Juggernaut', type: 'Artifact Creature', color: '',
        power: 5, toughness: 3, controller: 'o',
      });
      await page.evaluate(({ juggernaut }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { o: { ...s.o, bf: [...s.o.bf, juggernaut] } } });
        (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'UNTAP', active: 'p' });
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
      }, { juggernaut });
      await page.waitForTimeout(300);

      const pendingBefore = await page.evaluate(() => (window as any).__duelState().pendingTriggerTarget);
      expect(pendingBefore).toBeTruthy();

      // castFlow kind:'trigger' should auto-open the same targeting cast-prompt.
      await expect(page.locator('[data-testid="cast-prompt-skip"]')).toBeVisible({ timeout: 3000 });

      const jugEl = page.locator('[data-iid="jug-e2e"]').first();
      await expect(jugEl).toBeVisible({ timeout: 3000 });
      await jugEl.dispatchEvent('click');
      await page.waitForTimeout(200);
      await page.locator('[data-testid="cast-prompt-confirm"]').click();
      await page.waitForTimeout(200);

      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        return {
          pendingCleared: s.pendingTriggerTarget === null,
          vesuvan: s.p.bf.find((c: any) => c.id === 'vesuvan_doppelganger' || c.name === 'Juggernaut'),
        };
      });
      expect(result.pendingCleared).toBe(true);
      expect(result.vesuvan.name).toBe('Juggernaut');
      expect(result.vesuvan.power).toBe(5);
      expect(result.vesuvan.color).toBe('U');
      expect(result.vesuvan.triggeredAbilities).toHaveLength(1);
    });

    test('Primal Clay: choosing the Wall mode sets 1/6 with defender and adds Wall to its subtype', async ({ page }) => {
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'MAIN_1', active: 'p' });
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cardIds: ['primal_clay'], withManaSupport: true });
      });
      await page.waitForTimeout(200);

      await castFromHand(page, /primal clay/i);
      await resolveStack(page);

      await expect(page.locator('[data-testid="choice-modal"]')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('[data-testid="choice-option-wall"]')).toBeVisible();
      await page.locator('[data-testid="choice-option-wall"]').click();
      await page.waitForTimeout(200);

      await expect(page.locator('[data-testid="choice-modal"]')).toHaveCount(0);
      const clay = await page.evaluate(() =>
        (window as any).__duelState().p.bf.find((c: any) => c.id === 'primal_clay')
      );
      expect(clay.power).toBe(1);
      expect(clay.toughness).toBe(6);
      expect(clay.subtype).toBe('Shapeshifter Wall');
    });
  });
}
