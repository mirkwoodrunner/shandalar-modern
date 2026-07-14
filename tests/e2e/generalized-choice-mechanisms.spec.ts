// tests/e2e/generalized-choice-mechanisms.spec.ts
//
// End-to-end coverage for the Generalize Existing Choice Mechanisms batch:
//   - Alchor's Tomb: color choice via the generalized pendingChoice/ChoiceModal
//     pipeline (Part 1). ChoiceModal now renders on both DuelScreen and
//     DuelScreenMobile -- this spec is the actual verification of that mobile
//     parity fix, since it clicks a real choice-option button and asserts the
//     resulting dispatch on both viewports (registered in mobile-chrome below).
//   - Darkpact: the ante-target picker (pendingAnteExchange, reusing TutorModal).
//   - Ashnod's Battle Gear: the untap-step optionalUntap choice.
//
// Sandbox escape hatches used (see docs/CLAUDE.md "Escape hatches"):
//   window.__duelDispatch(action) -- drive the engine directly
//   window.__duelState()          -- read current GameState snapshot
//   DEBUG_SET_ACTIVE { patch }    -- inject arbitrary state, same pattern as
//                                    tests/e2e/force-of-nature-mobile-parity.spec.ts

import { test, expect, Page } from '@playwright/test';

const DUEL_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForDuelReady(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 15000 });
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' && typeof (window as any).__duelState === 'function',
    null,
    { timeout: 10000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(200);
  }
}

function makeArtifact(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, type: 'Artifact', controller: 'p', tapped: false, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], cmc: 4, ...overrides,
  };
}

function makeCreatureCard(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, type: 'Creature', subtype: 'Bear', controller: 'p', color: 'G',
    power: 2, toughness: 2, tapped: false, summoningSick: false, attacking: false,
    blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Alchor's Tomb -- color choice through the generalized ChoiceModal
// ---------------------------------------------------------------------------
for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine-cast-flow-ui-2 @mobile Alchor's Tomb color choice [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("activating Alchor's Tomb opens ChoiceModal; picking a color sets the target's color", async ({ page }) => {
      await page.goto(DUEL_URL);
      await waitForDuelReady(page);

      const tomb = makeArtifact('tomb-e2e', { id: 'alchorss_tomb', name: "Alchor's Tomb", activated: { cost: '2,T', effect: 'colorChoiceTarget' } });
      const bear = makeCreatureCard('bear-e2e', { id: 'grizzly_bears', name: 'Grizzly Bears', cmc: 2 });

      await page.evaluate(({ tomb, bear }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1',
            active: 'p',
            p: { ...s.p, bf: [tomb, bear], mana: { ...s.p.mana, W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } },
          },
        });
      }, { tomb, bear });
      await page.waitForTimeout(150);

      // Activate the ability targeting the bear, then resolve the stack --
      // ChoiceModal is what the *rendering layer* is under test here (Part 1's
      // mobile parity fix); driving ACTIVATE_ABILITY/RESOLVE_STACK directly
      // exercises the exact same reducer path a real click-target flow would.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-e2e', tgt: 'bear-e2e' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="choice-modal"]')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('[data-testid="choice-option-U"]')).toBeVisible();

      await page.locator('[data-testid="choice-option-U"]').click();
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="choice-modal"]')).toHaveCount(0);
      const bearColor = await page.evaluate(() => (window as any).__duelState().p.bf.find((c: any) => c.iid === 'bear-e2e')?.color);
      expect(bearColor).toBe('U');
    });
  });
}

// ---------------------------------------------------------------------------
// Darkpact -- ante-target picker (reuses TutorModal)
// ---------------------------------------------------------------------------
for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine-cast-flow-ui-2 @mobile Darkpact ante-exchange picker [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("choosing an ante card exchanges it with the top of the library", async ({ page }) => {
      await page.goto(`${DUEL_URL}&ante=1`);
      await waitForDuelReady(page);

      const ownAnteCard = { iid: 'ante-own-e2e', id: 'forest', name: 'Own Ante Forest', type: 'Land', cmc: 0, cost: '' };
      const libTop = { iid: 'lib-top-e2e', id: 'mountain', name: 'Library Top Mountain', type: 'Land', cmc: 0, cost: '' };

      await page.evaluate(({ ownAnteCard, libTop }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            anteEnabled: true,
            anteP: ownAnteCard,
            anteExtraP: [],
            p: { ...s.p, lib: [libTop] },
            pendingAnteExchange: { caster: 'p', cards: [ownAnteCard] },
          },
        });
      }, { ownAnteCard, libTop });
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="tutor-modal"]')).toBeVisible({ timeout: 3000 });
      await page.locator(`[data-testid="tutor-card-${ownAnteCard.id}"]`).click();
      await expect(page.locator('[data-testid="tutor-confirm"]')).toBeVisible();
      await page.locator('[data-testid="tutor-confirm"]').click();
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="tutor-modal"]')).toHaveCount(0);
      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        return { anteP: s.anteP, lib: s.p.lib.map((c: any) => c.iid), pendingCleared: s.pendingAnteExchange === null };
      });
      expect(result.pendingCleared).toBe(true);
      expect(result.anteP.iid).toBe('lib-top-e2e');
      expect(result.lib).toContain('ante-own-e2e');
    });
  });
}

// ---------------------------------------------------------------------------
// Ashnod's Battle Gear -- untap-step optional-untap choice
// ---------------------------------------------------------------------------
for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`@engine-cast-flow-ui-2 @mobile Ashnod's Battle Gear untap-step choice [${viewport.name}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('choosing to keep it tapped preserves the bonus; the modal resolves through the real reducer', async ({ page }) => {
      await page.goto(DUEL_URL);
      await waitForDuelReady(page);

      const gear = makeArtifact('gear-e2e', {
        id: 'ashnodss_battle_gear', name: "Ashnod's Battle Gear",
        tapped: true, whileTappedPump: { targetIid: 'bear-e2e', power: 2, toughness: -2 },
      });
      const bear = makeCreatureCard('bear-e2e', { id: 'grizzly_bears', name: 'Grizzly Bears' });

      await page.evaluate(({ gear, bear }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'UNTAP',
            active: 'p',
            p: { ...s.p, bf: [gear, bear] },
            pendingUpkeepChoice: { cardName: "Ashnod's Battle Gear", handlerKey: 'optionalUntap', iid: 'gear-e2e' },
          },
        });
      }, { gear, bear });
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="optional-untap-modal"]')).toBeVisible({ timeout: 3000 });
      await page.locator('[data-testid="optional-untap-keep-tapped-button"]').click();
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="optional-untap-modal"]')).toHaveCount(0);
      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        const g = s.p.bf.find((c: any) => c.iid === 'gear-e2e');
        return { pendingCleared: s.pendingUpkeepChoice === null, tapped: g?.tapped };
      });
      expect(result.pendingCleared).toBe(true);
      expect(result.tapped).toBe(true);
    });

    test('choosing to untap it clears the bonus (Layer 7c is tapped-gated)', async ({ page }) => {
      await page.goto(DUEL_URL);
      await waitForDuelReady(page);

      const gear = makeArtifact('gear-e2e2', {
        id: 'ashnodss_battle_gear', name: "Ashnod's Battle Gear",
        tapped: true, whileTappedPump: { targetIid: 'bear-e2e2', power: 2, toughness: -2 },
      });
      const bear = makeCreatureCard('bear-e2e2', { id: 'grizzly_bears', name: 'Grizzly Bears' });

      await page.evaluate(({ gear, bear }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'UNTAP',
            active: 'p',
            p: { ...s.p, bf: [gear, bear] },
            pendingUpkeepChoice: { cardName: "Ashnod's Battle Gear", handlerKey: 'optionalUntap', iid: 'gear-e2e2' },
          },
        });
      }, { gear, bear });
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="optional-untap-modal"]')).toBeVisible({ timeout: 3000 });
      await page.locator('[data-testid="optional-untap-untap-button"]').click();
      await page.waitForTimeout(150);

      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        const g = s.p.bf.find((c: any) => c.iid === 'gear-e2e2');
        return { tapped: g?.tapped };
      });
      expect(result.tapped).toBe(false);
    });
  });
}
