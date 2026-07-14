// tests/e2e/protection-artifact-ward.spec.ts
//
// End-to-end coverage for the Protection-from-Artifact extension + Artifact
// Ward: an artifact creature cannot legally block (or be blocked by) a
// creature with protection from artifact, an artifact source's damage to a
// protected creature is prevented, and the click-time targeting guard
// (DuelScreen.tsx / DuelScreenMobile.tsx) refuses to let a targeting-mode
// click select a protected creature. See docs/ENGINE_CONTRACT_SPEC.md --
// Protection (DEBT).
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile
// (390x844, /?duel=sandbox-mobile) per the project convention, so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths are exercised.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// DuelScreenMobile.tsx never renders a node with data-testid="duel-screen"
// (only DuelScreen.tsx does) -- see creature-damage-centralization.spec.ts precedent.
async function waitForDuelMobile(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 10_000 });
}

async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

function wardAura(name: string, protection: string[]) {
  return { name, mod: { protection }, enterTs: 0 };
}

function makeCreature(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G',
    cmc: 2, cost: '1G', power: 2, toughness: 2, tapped: false, summoningSick: false, attacking: false,
    blocking: null, damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[], controller: 'o',
    ...overrides,
  };
}

function makeArtifactCreature(iid: string, overrides: Record<string, any> = {}) {
  return makeCreature(iid, { id: 'ornithopter', name: 'Ornithopter', type: 'Artifact Creature', color: '', power: 0, toughness: 2, ...overrides });
}

function makeArtifactZap(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'artifact_zap', name: 'Artifact Zap', type: 'Artifact', color: '', cmc: 1, cost: '1',
    keywords: [] as string[], effect: 'damage3', ...overrides,
  };
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine-combat-1 Protection from artifact + Artifact Ward UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await dismissMulligan(page);
      await waitForMain1(page);
    });

    test('Blocking + damage: artifact creature cannot block the protected attacker, and an artifact spell cannot damage the protected creature', async ({ page }) => {
      const wardedAttacker = makeCreature('warded-att-1', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
      const artifactBlocker = makeArtifactCreature('art-bl-1', { controller: 'p' });

      // Part 1: declare the artifact creature as a blocker against the protected attacker.
      await page.evaluate(({ att, bl }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'COMBAT_BLOCKERS', active: 'o', priorityWindow: false, stack: [],
            attackers: ['warded-att-1'], blockers: {},
            o: { ...s.o, bf: [att] },
            p: { ...s.p, bf: [bl] },
          },
        });
      }, { att: wardedAttacker, bl: artifactBlocker });
      await page.waitForTimeout(150);

      // Two-click declare-blocker flow (same as BLOCK-E2E-02): select own
      // creature, then click the attacker to declare the block.
      const blockerLoc = page.locator('[data-iid="art-bl-1"]').first();
      await expect(blockerLoc).toBeVisible({ timeout: 10000 });
      await blockerLoc.click();
      await page.waitForTimeout(150);
      const attackerLoc = page.locator('[data-iid="warded-att-1"]').first();
      await expect(attackerLoc).toBeVisible({ timeout: 10000 });
      await attackerLoc.click();
      await page.waitForTimeout(200);

      const afterBlock = await page.evaluate(() => (window as any).__duelState());
      expect(afterBlock.blockers['art-bl-1'], 'artifact creature must not be able to block the protected attacker').toBeUndefined();

      // Part 2: an artifact-sourced spell cannot damage the protected creature.
      const wardedTarget = makeCreature('warded-tgt-1', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
      const zap = makeArtifactZap('zap-1');

      await page.evaluate(({ tgt, spell }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, hand: [spell], mana: { ...s.p.mana, W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } },
            o: { ...s.o, bf: [tgt] },
          },
        });
      }, { tgt: wardedTarget, spell: zap });
      await page.waitForTimeout(150);

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'zap-1', tgt: 'warded-tgt-1' });
      });
      await page.waitForTimeout(200);

      const afterCast = await page.evaluate(() => (window as any).__duelState());
      expect(afterCast.stack, 'the illegal cast must not reach the stack').toHaveLength(0);
      expect(afterCast.p.hand.some((c: any) => c.iid === 'zap-1'), 'the spell must remain in hand -- the cast was rejected').toBe(true);
      const targetAfter = afterCast.o.bf.find((c: any) => c.iid === 'warded-tgt-1');
      expect(targetAfter?.damage, 'the protected creature must show 0 damage').toBe(0);
    });

    test('Targeting click guard: clicking the protected creature during targeting mode is a no-op and the cast prompt remains open', async ({ page }) => {
      const wardedTarget = makeCreature('warded-tgt-2', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
      const zap = makeArtifactZap('zap-2');

      await page.evaluate(({ tgt, spell }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, hand: [spell], mana: { ...s.p.mana, W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } },
            o: { ...s.o, bf: [tgt] },
          },
        });
      }, { tgt: wardedTarget, spell: zap });
      await page.waitForTimeout(150);

      // Click the hand card, then Cast, to enter targeting mode.
      const handCard = page.locator('[data-testid^="hand-card-"], [data-testid="hand-card"]')
        .filter({ hasText: /artifact zap/i }).first();
      await expect(handCard).toBeVisible({ timeout: 10000 });
      await handCard.click();
      await page.waitForTimeout(150);
      const castBtn = page.locator('[data-testid="cast-button"]').first();
      await expect(castBtn).toBeVisible({ timeout: 10000 });
      await castBtn.click();
      await page.waitForTimeout(150);

      await expect(page.locator('[data-testid="cast-prompt"]')).toBeVisible({ timeout: 10000 });

      // Attempt to click the protected creature -- the click guard must ignore it.
      const targetLoc = page.locator('[data-iid="warded-tgt-2"]').first();
      await expect(targetLoc).toBeVisible({ timeout: 10000 });
      await targetLoc.click();
      await page.waitForTimeout(200);

      // No target was selected -- the Confirm button never appears (it only
      // renders once castPrompt.targetsSelected >= 1) -- and the prompt is
      // still open, waiting for a legal target.
      await expect(page.locator('[data-testid="cast-prompt-confirm"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="cast-prompt"]')).toBeVisible();

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.stack, 'nothing was cast').toHaveLength(0);
      expect(state.p.hand.some((c: any) => c.iid === 'zap-2'), 'the spell is still in hand, targeting mode still active').toBe(true);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
