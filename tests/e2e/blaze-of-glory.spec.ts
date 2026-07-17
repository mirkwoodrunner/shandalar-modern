// tests/e2e/blaze-of-glory.spec.ts
//
// End-to-end tests for Blaze of Glory: "Cast this spell only during combat
// before blockers are declared. Target creature defending player controls
// can block any number of creatures this turn. It blocks each attacking
// creature this turn if able." See docs/ENGINE_CONTRACT_SPEC.md Section 7.3
// and docs/MECHANICS_INDEX.md -- Blaze of Glory.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per
// the project convention. Follows the structure of tests/e2e/oubliette.spec.ts
// and tests/e2e/banding-core.spec.ts (closest same-machinery examples).
//
// BOG-E2E-01: cast on a defending creature facing 2 attackers; both get
//             blocked and damage divides correctly. Desktop-only: the
//             "BLOCKED" badge appears on both attackers and the flagged
//             creature shows the committed-blocker outline highlight.
// BOG-E2E-02: illegal-cast guard -- attempting the cast during MAIN_1 is
//             rejected (no stack item, card stays in hand).
// BOG-E2E-03: "if able" -- the flagged creature lacks flying; a flying
//             attacker is NOT blocked by it and deals damage to the player.
// BOG-E2E-04: mobile-specific -- isAssignedBlocker highlight renders on the
//             flagged creature in DuelScreenMobile.tsx with no explicit
//             DECLARE_BLOCKER action taken.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

function makeCreature(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
    keywords: [] as string[],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null as string | null,
    damage: 0,
    counters: {},
    eotBuffs: [] as any[],
    enchantments: [] as any[],
    controller: 'o',
    ...overrides,
  };
}

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForDuelMobile(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 10_000 });
}

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

// Casts Blaze of Glory (already forced into p's hand with W mana) targeting
// tgtIid via direct dispatch (CAST_SPELL -> RESOLVE_STACK), mirroring
// oubliette.spec.ts's own direct-dispatch cast for its Shatter follow-up.
// A real click-through of hand-card -> cast-button -> target -> confirm, OR
// any reliance on useDuelController's own auto-advance heuristics, races the
// live AI main loop: with active:'o' (required here so the engine gate's
// bogDefender computes to 'p', letting the cast legally target the
// defending player's creature), that loop can call requestPhaseAdvance() on
// its own schedule and push the phase forward from under a still-in-progress
// manual sequence.
//
// Fix: flip `active` to 'p' in the same dispatch batch as the cast. The AI
// loop's very first guard is `if (s.active !== 'o' || aiRef.current) return;`,
// so this permanently disengages it for the rest of the scenario -- every
// later phase transition is then driven only by this test's own explicit
// ADVANCE_PHASE dispatches. This is safe here: `s.active` is not one of
// ADVANCE_PHASE's own reducer guards (priorityWindow/stack/pendingXxx), and
// ChoiceModal renders purely off `pendingChoice.controller === 'p'`,
// independent of `s.active`. (A pendingUpkeepChoice-based block was tried
// first and rejected -- ADVANCE_PHASE's own reducer checks
// `if (s.pendingUpkeepChoice) return s;` unconditionally too, so that
// approach silently froze combat instead of letting it resolve.)
async function castBlaze(page: Page, bogIid: string, tgtIid: string) {
  await page.evaluate(({ bogIid, tgtIid }: any) => {
    (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: bogIid, tgt: tgtIid });
    (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
    (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { active: 'p' } });
  }, { bogIid, tgtIid });
  await page.waitForTimeout(150);
}

function runSuite(viewport: { width: number; height: number }, label: string, url: string, waitForScreen: (page: Page) => Promise<void>) {
  test.describe(`@engine-card-scenarios-3 Blaze of Glory UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test('BOG-E2E-01: cast on a defending creature facing 2 attackers -- both get blocked and damage divides correctly', async ({ page }) => {
      const att1 = makeCreature('e2e-bog-att-1', { name: 'Attacker One', controller: 'o', attacking: true, tapped: true, power: 3, toughness: 3 });
      const att2 = makeCreature('e2e-bog-att-2', { name: 'Attacker Two', controller: 'o', attacking: true, tapped: true, power: 3, toughness: 3 });
      const defender = makeCreature('e2e-bog-def-1', { name: 'Defender', controller: 'p', power: 6, toughness: 10 });

      await page.evaluate(({ att1, att2, defender }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'COMBAT_AFTER_ATTACKERS', active: 'o',
            attackers: [att1.iid, att2.iid], blockers: {}, priorityWindow: false, stack: [],
            o: { ...s.o, bf: [att1, att2] },
            p: { ...s.p, bf: [defender] },
          },
        });
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['blaze_of_glory'], mana: { W: 1 } });
      }, { att1, att2, defender });
      await page.waitForFunction(
        () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'blaze_of_glory'),
        { timeout: 5000 },
      );
      const bogIid: string = await page.evaluate(
        () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'blaze_of_glory')?.iid,
      );

      await castBlaze(page, bogIid, 'e2e-bog-def-1');

      const midState = await page.evaluate(() => (window as any).__duelState());
      expect(midState.p.bf.find((c: any) => c.iid === 'e2e-bog-def-1').blocksAllAttackers).toBe(true);

      // active is now 'p' (see castBlaze's doc comment), so the AI loop is
      // permanently disengaged -- this dispatch is the only thing that can
      // move the phase forward here.
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); }); // -> COMBAT_BLOCKERS
      await page.waitForTimeout(150);

      if (label === 'desktop') {
        // Both attackers show the "BLOCKED" badge; the flagged defender
        // shows the committed-blocker outline highlight -- both computed
        // live off getEffectiveBlockers/blocksAllAttackers, with no
        // DECLARE_BLOCKER ever dispatched.
        await expect(page.getByText('BLOCKED', { exact: true })).toHaveCount(2);
        const defenderWrapperStyle = await page.locator('[data-iid="e2e-bog-def-1"]').locator('xpath=..').getAttribute('style');
        expect(defenderWrapperStyle).toContain('outline');
      }

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses for the damage-order choice
      });
      await page.waitForTimeout(150);

      const midCombat = await page.evaluate(() => (window as any).__duelState());
      expect(midCombat.pendingChoice?.kind).toBe('blazeOfGloryDamageOrder');
      expect(midCombat.pendingChoice?.controller).toBe('p'); // defender's OWN controller, not ns.active ('o')

      const choiceModal = page.locator('[data-testid="choice-modal"]');
      await expect(choiceModal).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid^="choice-option-"]').first().click();
      await page.waitForTimeout(150);

      const final = await page.evaluate(() => (window as any).__duelState());
      expect(final.pendingChoice).toBeFalsy();
      expect(final.o.bf.some((c: any) => c.iid === 'e2e-bog-att-1')).toBe(false); // both attackers died
      expect(final.o.bf.some((c: any) => c.iid === 'e2e-bog-att-2')).toBe(false);
      expect(final.p.bf.find((c: any) => c.iid === 'e2e-bog-def-1').damage).toBe(6); // 3 + 3, undivided on the receiving side
    });

    test('BOG-E2E-02: illegal-cast guard -- attempting the cast during MAIN_1 is rejected', async ({ page }) => {
      const target = makeCreature('e2e-bog-tgt-2', { controller: 'p' });

      await page.evaluate(({ target }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', attackers: [], blockers: {}, priorityWindow: false, stack: [],
            p: { ...s.p, bf: [target] },
          },
        });
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['blaze_of_glory'], mana: { W: 1 } });
      }, { target });
      await page.waitForFunction(
        () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'blaze_of_glory'),
        { timeout: 5000 },
      );
      const bogIid: string = await page.evaluate(
        () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'blaze_of_glory')?.iid,
      );

      await page.evaluate(({ bogIid, tgt }: any) => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: bogIid, tgt });
      }, { bogIid, tgt: 'e2e-bog-tgt-2' });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.stack.length).toBe(0);
      expect(state.p.hand.some((c: any) => c.iid === bogIid)).toBe(true); // still in hand -- cast was rejected
    });

    test('BOG-E2E-03: "if able" -- the flagged creature lacks flying and does not block a flying attacker, which deals damage to the defending player', async ({ page }) => {
      const flyer = makeCreature('e2e-bog-att-3', { name: 'Flyer', controller: 'o', attacking: true, tapped: true, power: 4, toughness: 4, keywords: ['FLYING'] });
      const groundBlocker = makeCreature('e2e-bog-def-3', { name: 'Grounded Defender', controller: 'p', power: 2, toughness: 6 }); // no flying/reach

      await page.evaluate(({ flyer, groundBlocker }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'COMBAT_AFTER_ATTACKERS', active: 'o',
            attackers: [flyer.iid], blockers: {}, priorityWindow: false, stack: [],
            o: { ...s.o, bf: [flyer] },
            p: { ...s.p, bf: [groundBlocker], life: 20 },
          },
        });
        (window as any).__duelDispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['blaze_of_glory'], mana: { W: 1 } });
      }, { flyer, groundBlocker });
      await page.waitForFunction(
        () => (window as any).__duelState().p.hand.some((c: any) => c.id === 'blaze_of_glory'),
        { timeout: 5000 },
      );
      const bogIid: string = await page.evaluate(
        () => (window as any).__duelState().p.hand.find((c: any) => c.id === 'blaze_of_glory')?.iid,
      );

      await castBlaze(page, bogIid, 'e2e-bog-def-3');

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves (single attacker, unblocked)
      });
      await page.waitForTimeout(150);

      const final = await page.evaluate(() => (window as any).__duelState());
      expect(final.pendingChoice).toBeFalsy();
      expect(final.p.life).toBe(16); // took the flier's 4 damage, unblocked
      expect(final.p.bf.find((c: any) => c.iid === 'e2e-bog-def-3').damage).toBe(0); // never blocked, no combat damage
    });

  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);

// BOG-E2E-04: mobile-specific -- isAssignedBlocker highlight renders on the
// flagged creature in DuelScreenMobile.tsx even with no explicit
// DECLARE_BLOCKER action taken. Separate describe block since this
// assertion only makes sense on the mobile screen.
test.describe('@engine-card-scenarios-3 Blaze of Glory UI [mobile-only]', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(SANDBOX_MOBILE_URL);
    await waitForDuelMobile(page);
    await waitForEngineReady(page);
  });

  test('BOG-E2E-04: isAssignedBlocker highlight renders on the flagged creature with no explicit DECLARE_BLOCKER action', async ({ page }) => {
    const attacker = makeCreature('e2e-bog-att-4', { name: 'Attacker Four', controller: 'o', attacking: true, tapped: true, power: 2, toughness: 2 });
    const flagged = makeCreature('e2e-bog-def-4', { name: 'Flagged Defender', controller: 'p', power: 2, toughness: 6, blocksAllAttackers: true });

    await page.evaluate(({ attacker, flagged }: any) => {
      const s = (window as any).__duelState();
      (window as any).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          phase: 'COMBAT_BLOCKERS', active: 'o',
          attackers: [attacker.iid], blockers: {}, priorityWindow: false, stack: [],
          o: { ...s.o, bf: [attacker] },
          p: { ...s.p, bf: [flagged] },
        },
      });
    }, { attacker, flagged });
    await page.waitForTimeout(150);

    // No DECLARE_BLOCKER was ever dispatched -- flagged.blocking stays null,
    // yet the mobile screen must still render the assigned-blocker highlight
    // (isAssignedBlocker's blocksAllAttackers fallback).
    const state = await page.evaluate(() => (window as any).__duelState());
    expect(state.p.bf.find((c: any) => c.iid === 'e2e-bog-def-4').blocking).toBeNull();

    const borderColor = await page.locator('[data-iid="e2e-bog-def-4"]').evaluate(el => (el as HTMLElement).style.borderColor);
    expect(borderColor).toContain('80, 140, 255');
  });
});
