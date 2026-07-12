// tests/e2e/creature-damage-centralization.spec.ts
//
// End-to-end coverage for Creature Damage Centralization + Jade Monolith +
// Personal Incarnation. Jade Monolith's target-creature click and the
// existing damage-shield TutorModal picker are driven through real UI clicks
// (the new click-routing guard, isCreatureOnlyTarget, is the primary thing
// under test); state setup, stack resolution, and the damage-triggering step
// use the sandbox's __duelDispatch escape hatch, matching the established
// convention in damage-shields.spec.ts and discard-centralization.spec.ts.
//
// Tests run at both desktop (1280x800, /?duel=sandbox) and mobile (390x844,
// /?duel=sandbox-mobile) per the project convention, so both DuelScreen.tsx
// and DuelScreenMobile.tsx render paths are exercised.
// See docs/ENGINE_CONTRACT_SPEC.md -- Creature Damage Shields.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

// DuelScreenMobile.tsx never renders a node with data-testid="duel-screen"
// (only DuelScreen.tsx does) -- the sandbox-mobile route's outer wrapper is
// duel-screen-wrapper (see discard-centralization.spec.ts precedent).
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

// Clicking a battlefield permanent with an activated ability begins its
// activate flow directly on desktop, but on mobile it only *selects* the
// permanent -- DuelScreenMobile.tsx's ActionBar then needs an explicit
// "Activate" button press (see handleActivateBf / ActionBar.tsx's
// battlefield-selection branch) before beginActivateFlow actually runs.
// This clicks the card, then presses the mobile-only Activate button if it
// appears, so the same call site works for both viewports.
async function clickAndActivate(page: Page, iid: string) {
  const loc = page.locator(`[data-iid="${iid}"]`).first();
  await expect(loc).toBeVisible({ timeout: 15000 });
  await loc.click();
  await page.waitForTimeout(300);
  const activateBtn = page.locator('[data-testid="action-bar"]').getByText('Activate', { exact: false });
  if (await activateBtn.isVisible({ timeout: 800 }).catch(() => false)) {
    await activateBtn.click();
    await page.waitForTimeout(300);
  }
}

function makeJadeMonolith(iid: string) {
  return {
    iid, id: 'jade_monolith', name: 'Jade Monolith', type: 'Artifact', color: '', cmc: 4, cost: '4',
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p',
    activated: { cost: '1', effect: 'chooseDamageShieldSourceForTarget' },
    damageShieldMode: 'redirect',
  };
}

function makeCreature(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G',
    cmc: 2, cost: '1G', power: 2, toughness: 2, tapped: false, summoningSick: false, attacking: false,
    blocking: null, damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[], controller: 'o',
    ...overrides,
  };
}

function makePersonalIncarnation(iid: string) {
  return {
    iid, id: 'personal_incarnation', name: 'Personal Incarnation', type: 'Creature', subtype: 'Avatar Incarnation',
    color: 'W', cmc: 6, cost: '3WWW', power: 6, toughness: 6, tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[],
    controller: 'p',
    activated: { cost: '0', effect: 'addCreatureDamageShieldSelf' },
    triggeredAbilities: [{ id: 'personal_incarnation_dies', trigger: { event: 'ON_CREATURE_DIES', scope: 'self' }, effect: { type: 'loseHalfLifeRoundedUp' } }],
  };
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine Creature damage centralization UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await dismissMulligan(page);
      await waitForMain1(page);
    });

    test('Jade Monolith: targeting a creature and choosing a source via the picker redirects that source\'s next damage to the controller', async ({ page }) => {
      const jm = makeJadeMonolith('jm-1');
      const targetCre = makeCreature('target-cre-1', { toughness: 5, controller: 'o' });
      const threat = makeCreature('threat-1', { id: 'shivan_dragon', name: 'Shivan Dragon', controller: 'o', activated: { cost: '1', effect: 'damage3' } });

      await page.evaluate(({ jm, targetCre, threat }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, life: 20, bf: [jm], mana: { ...s.p.mana, W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } },
            o: { ...s.o, life: 20, bf: [targetCre, threat], mana: { ...s.o.mana, W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } },
          },
        });
      }, { jm, targetCre, threat });
      await page.waitForTimeout(400);

      // Real UI clicks: activate Jade Monolith, then click the opposing
      // creature -- this is the isCreatureOnlyTarget click-routing guard's
      // actual code path (handleCardClick / handleBfCardClick).
      await clickAndActivate(page, 'jm-1');
      const tgtLoc = page.locator('[data-iid="target-cre-1"]').first();
      await expect(tgtLoc).toBeVisible({ timeout: 15000 });
      await tgtLoc.click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="cast-prompt-confirm"]').click();
      await page.waitForTimeout(400);

      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(400);

      // Existing damage-shield TutorModal picker, same precedent as Circle of
      // Protection / Eye for an Eye (damage-shields.spec.ts) -- real clicks.
      await expect(page.locator('[data-testid="tutor-modal"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="tutor-card-shivan_dragon"]').click();
      await page.locator('[data-testid="tutor-confirm"]').click();
      await page.waitForTimeout(400);

      const armed = await page.evaluate(() => (window as any).__duelState().turnState.creatureDamageShields['target-cre-1']);
      expect(armed).toHaveLength(1);
      expect(armed[0].chosenSourceIid).toBe('threat-1');

      // Trigger the chosen source's damage (re-arm o's mana -- earlier phase
      // transitions along the way may have emptied mana pools).
      await page.evaluate(() => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { o: { ...s.o, mana: { ...s.o.mana, W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } } });
        (window as any).__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'o', iid: 'threat-1', tgt: 'target-cre-1' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(400);

      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        return { pLife: s.p.life, tgtDamage: s.o.bf.find((c: any) => c.iid === 'target-cre-1')?.damage };
      });
      expect(result.pLife).toBe(17); // Jade Monolith's controller took the redirected 3 damage
      expect(result.tgtDamage).toBe(0); // the targeted creature's damage display is unaffected
    });

    test('Personal Incarnation: activating {0} twice via the UI, then taking 3 damage, redirects 2 and marks exactly 1', async ({ page }) => {
      const pi = makePersonalIncarnation('pi-1');
      const bolt = { iid: 'bolt-1', id: 'shock', name: 'Shock Bolt', type: 'Instant', color: 'R', cmc: 1, cost: 'R', effect: 'damage3' };

      await page.evaluate(({ pi, bolt }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, life: 20, bf: [pi] },
            o: { ...s.o, life: 20, hand: [bolt], mana: { ...s.o.mana, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } },
          },
        });
      }, { pi, bolt });
      await page.waitForTimeout(400);

      // Activate {0} via the UI twice -- Personal Incarnation's card click
      // dispatches immediately on desktop (no target step, no mana step);
      // on mobile it selects the card and needs the Activate button press,
      // handled by clickAndActivate.
      await clickAndActivate(page, 'pi-1');
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(300);

      await clickAndActivate(page, 'pi-1');
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(400);

      const shields = await page.evaluate(() => (window as any).__duelState().turnState.creatureDamageShields['pi-1']);
      expect(shields).toHaveLength(2);

      // Apply 3 damage from a real card (re-arm o's mana -- earlier phase
      // transitions along the way may have emptied mana pools).
      await page.evaluate(() => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { o: { ...s.o, mana: { ...s.o.mana, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } });
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'o', iid: 'bolt-1', tgt: 'pi-1' });
        (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
      });
      await page.waitForTimeout(400);

      const result = await page.evaluate(() => {
        const s = (window as any).__duelState();
        return { pLife: s.p.life, piDamage: s.p.bf.find((c: any) => c.iid === 'pi-1')?.damage };
      });
      expect(result.piDamage).toBe(1);
      expect(result.pLife).toBe(18); // 20 - 2 redirected
    });

    test('Combat regression: plain mutual-kill combat with no creature-damage-shields resolves identically to pre-existing behavior', async ({ page }) => {
      // Jump straight to a pre-populated mid-combat state (attackers/blockers
      // already declared), same precedent as damage-shields.spec.ts's Circle
      // of Protection combat step. Setting active:'o' with aiSpeed=0 means
      // the AI driver may resolve combat (and continue autonomously into
      // later phases/turns) before this script's next line runs, so this
      // waits on the actual state outcome rather than racing DOM visibility
      // checks or a manual ADVANCE_PHASE dispatch against the AI loop.
      const attacker = makeCreature('att-1', { controller: 'o', attacking: true });
      const blocker = makeCreature('bl-1', { controller: 'p', blocking: 'att-1' });

      await page.evaluate(({ attacker, blocker }) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'COMBAT_AFTER_BLOCKERS', active: 'o', priorityWindow: false, stack: [],
            attackers: ['att-1'], blockers: { 'bl-1': 'att-1' },
            o: { ...s.o, bf: [attacker] },
            p: { ...s.p, bf: [blocker] },
          },
        });
      }, { attacker, blocker });

      // Mutual lethal damage: both 2/2s die, exactly as before this migration.
      await page.waitForFunction(() => {
        const s = (window as any).__duelState();
        return s.o.gy.some((c: any) => c.iid === 'att-1') && s.p.gy.some((c: any) => c.iid === 'bl-1');
      }, { timeout: 15000 });

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.o.gy.some((c: any) => c.iid === 'att-1')).toBe(true);
      expect(state.p.gy.some((c: any) => c.iid === 'bl-1')).toBe(true);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
