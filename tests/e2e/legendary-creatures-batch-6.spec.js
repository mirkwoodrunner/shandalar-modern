// tests/e2e/legendary-creatures-batch-6.spec.js
//
// Legendary Creatures Batch 6 (9 cards) Playwright regression tests.
// See tests/scenarios/legendary-creatures-batch-6.test.js for the full
// 34-case Vitest engine coverage; this spec covers the 6 UI-surface items
// called out in the prompt, each run at both desktop (1280x800,
// /?duel=sandbox) and mobile (390x844, /?duel=sandbox-mobile) per the same
// convention as tests/e2e/a9-upkeep-activated-batch.spec.js, so both
// DuelScreen.tsx and DuelScreenMobile.tsx render paths are exercised.
//
// Note on Rasputin Dreamweaver (case 5): no battlefield UI component renders
// raw counter values anywhere in this codebase today (a pre-existing gap,
// out of scope for this batch -- see src/ui/Card/FieldCard.tsx, which shows
// only power/toughness). "Confirm the DREAM counter display updates" is
// therefore verified via window.__duelState() immediately after the real
// click-driven activation, the same "real click, then read engine state"
// pattern already used throughout this suite (e.g. damage-prevention-batch-4's
// DPB4-E01) wherever no dedicated visual exists.

import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

async function waitForDuel(page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForDuelMobile(page) {
  await page.waitForSelector('[data-testid="duel-screen-wrapper"]', { timeout: 10_000 });
}

async function waitForEngineReady(page) {
  await page.waitForFunction(
    () => typeof window.__duelDispatch === 'function' && typeof window.__duelState === 'function',
    { timeout: 15000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

// Same helper as tests/e2e/a9-upkeep-activated-batch.spec.js: clicking a
// battlefield permanent with an activated ability begins its activate flow
// directly on desktop, but on mobile it only *selects* the permanent --
// ActionBar's "Activate" button must then be pressed.
async function clickAndActivate(page, iid) {
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

// DEBUG_SET_ACTIVE shallow-merges `patch` onto state (`{ ...s, ...patch }`), so
// a bare `patch.p`/`patch.o` would replace the ENTIRE player object (wiping
// life/hand/lib/etc, not just the fields the test cares about) -- this helper
// merges patch.p/patch.o onto the current s.p/s.o first, same as the explicit
// `p: { ...s.p, bf: [...] }` spread tests/e2e/a9-upkeep-activated-batch.spec.js
// uses at each call site, just centralized here so callers only pass overrides.
async function seed(page, patch) {
  await page.evaluate((patch) => {
    const s = window.__duelState();
    const merged = { ...patch };
    if (patch.p) merged.p = { ...s.p, ...patch.p };
    if (patch.o) merged.o = { ...s.o, ...patch.o };
    window.__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: merged });
  }, patch);
  await page.waitForTimeout(200);
}

function makeCard(id, name, overrides = {}) {
  return {
    id, name, type: 'Creature', subtype: '', color: '', cmc: 1, cost: '', power: 1, toughness: 1,
    keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    ...overrides,
  };
}

function runSuite(viewport, label, url, waitForScreen) {
  test.describe(`@engine @mobile Legendary Creatures Batch 6 UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test('landwalk nullification: with a nullifier in play, walk attackers become legal block targets via a real click', async ({ page }) => {
      const fixtures = [
        { nullifierId: 'gosta_dirk', nullifierName: 'Gosta Dirk', nullifiesLandwalk: ['island'], walkKw: 'ISLANDWALK', landId: 'island', landName: 'Island' },
        { nullifierId: 'lord_magnus', nullifierName: 'Lord Magnus', nullifiesLandwalk: ['plains', 'forest'], walkKw: 'PLAINSWALK', landId: 'plains', landName: 'Plains' },
        { nullifierId: 'ur_drago', nullifierName: 'Ur-Drago', nullifiesLandwalk: ['swamp'], walkKw: 'SWAMPWALK', landId: 'swamp', landName: 'Swamp' },
      ];
      for (const [i, fx] of fixtures.entries()) {
        const nullifierIid = `e2e-lw6-null-${i}`;
        const blockerIid = `e2e-lw6-bl-${i}`;
        const landIid = `e2e-lw6-land-${i}`;
        const attackerIid = `e2e-lw6-att-${i}`;
        const nullifier = makeCard(fx.nullifierId, fx.nullifierName, { iid: nullifierIid, type: 'Legendary Creature', power: 4, toughness: 4, controller: 'p', nullifiesLandwalk: fx.nullifiesLandwalk });
        const blocker = makeCard('grizzly_bears', 'Grizzly Bears', { iid: blockerIid, power: 2, toughness: 2, controller: 'p' });
        const land = { iid: landIid, id: fx.landId, name: fx.landName, type: 'Land', subtype: `Basic ${fx.landName}`, color: '', cmc: 0, cost: '', keywords: [], tapped: false, produces: [], controller: 'p' };
        const attacker = makeCard('goblin_hero', 'Goblin Hero', { iid: attackerIid, keywords: [fx.walkKw], controller: 'o' });

        await seed(page, {
          phase: 'COMBAT_BLOCKERS', active: 'o', priorityWindow: false, stack: [],
          attackers: [attackerIid], blockers: {},
          p: { bf: [nullifier, blocker, land] },
          o: { bf: [attacker] },
        });

        await page.locator(`[data-iid="${blockerIid}"]`).first().click();
        await page.waitForTimeout(200);
        await page.locator(`[data-iid="${attackerIid}"]`).first().click();
        await page.waitForTimeout(200);

        const state = await page.evaluate(() => window.__duelState());
        expect(state.blockers[blockerIid], `${fx.nullifierName} nullifies ${fx.walkKw}`).toBe(attackerIid);
      }
    });

    test('Livonya Silone: attacking with no legendary land in play is blockable via a real click', async ({ page }) => {
      const livonya = makeCard('livonya_silone', 'Livonya Silone', { iid: 'e2e-liv-1', type: 'Legendary Creature', power: 4, toughness: 4, landwalkLegendary: true, controller: 'o' });
      const blocker = makeCard('grizzly_bears', 'Grizzly Bears', { iid: 'e2e-liv-bl-1', power: 2, toughness: 2, controller: 'p' });
      const ordinaryLand = { iid: 'e2e-liv-land-1', id: 'swamp', name: 'Swamp', type: 'Land', subtype: 'Basic Swamp', color: '', cmc: 0, cost: '', keywords: [], tapped: false, produces: [], controller: 'p' };

      await seed(page, {
        phase: 'COMBAT_BLOCKERS', active: 'o', priorityWindow: false, stack: [],
        attackers: ['e2e-liv-1'], blockers: {},
        p: { bf: [blocker, ordinaryLand] },
        o: { bf: [livonya] },
      });

      await page.locator('[data-iid="e2e-liv-bl-1"]').first().click();
      await page.waitForTimeout(200);
      await page.locator('[data-iid="e2e-liv-1"]').first().click();
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => window.__duelState());
      expect(state.blockers['e2e-liv-bl-1']).toBe('e2e-liv-1');
    });

    test('Rubinia Soulsinger: activate + target steals a creature, then reverts when Rubinia is untapped by an outside effect', async ({ page }) => {
      const rubinia = makeCard('rubinia_soulsinger', 'Rubinia Soulsinger', {
        iid: 'e2e-rb-1', type: 'Legendary Creature', power: 2, toughness: 3, controller: 'p',
        optionalUntap: true, optionalUntapAlways: true,
        activated: { cost: 'T', effect: 'rubiniaSteal', requiresTarget: true },
      });
      const target = makeCard('grizzly_bears', 'Grizzly Bears', { iid: 'e2e-rb-target-1', power: 2, toughness: 2, tapped: true, controller: 'o' });

      await seed(page, {
        phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
        p: { bf: [rubinia] },
        o: { bf: [target] },
      });

      await clickAndActivate(page, 'e2e-rb-1');
      const tgtLoc = page.locator('[data-iid="e2e-rb-target-1"]').first();
      await expect(tgtLoc).toBeVisible({ timeout: 15000 });
      await tgtLoc.click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="cast-prompt-confirm"]').click();
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(400);

      let state = await page.evaluate(() => window.__duelState());
      expect(state.o.bf.some((c) => c.iid === 'e2e-rb-target-1')).toBe(false);
      const stolen = state.p.bf.find((c) => c.iid === 'e2e-rb-target-1');
      expect(stolen).toBeDefined();
      expect(stolen.controller).toBe('p');
      // Visual confirmation: the stolen creature's tile now renders on the player's board.
      await expect(page.locator('[data-iid="e2e-rb-target-1"]').first()).toBeVisible({ timeout: 10000 });

      // Rubinia becomes untapped by an outside effect -- the stolen creature must
      // revert. checkControlGrants only runs inside checkDeath, which isn't on
      // every ADVANCE_PHASE transition (MAIN_1 -> COMBAT_BEGIN doesn't reach it) --
      // so this calls the real engine checkDeath() directly (dynamic import, same
      // "call the actual reducer/helper" pattern as damage-prevention-batch-4.spec.js)
      // and re-applies its result via DEBUG_SET_ACTIVE.
      await seed(page, { p: { ...state.p, bf: state.p.bf.map((c) => c.iid === 'e2e-rb-1' ? { ...c, tapped: false } : c) } });
      await page.evaluate(async () => {
        const { checkDeath } = await import('/src/engine/DuelCore.js');
        const ns = checkDeath(window.__duelState());
        window.__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: ns });
      });
      await page.waitForTimeout(300);

      state = await page.evaluate(() => window.__duelState());
      expect(state.p.bf.some((c) => c.iid === 'e2e-rb-target-1')).toBe(false);
      expect(state.o.bf.some((c) => c.iid === 'e2e-rb-target-1')).toBe(true);
    });

    test('Ayesha Tanaka: activate + target an artifact-ability stack item; the artifact remains on the battlefield whether the controller pays or declines', async ({ page }) => {
      // Two full activate/target/resolve fixtures plus a mid-test page reload
      // (to avoid cross-fixture React state leakage) exceed the default 30s
      // budget under load -- same "known-slow multi-step test" accommodation
      // as tests/e2e/a9-upkeep-activated-batch.spec.js's Tolaria case.
      test.setTimeout(60_000);
      async function runFixture(iidSuffix, oppMana) {
        const ayesha = makeCard('ayesha_tanaka', 'Ayesha Tanaka', {
          iid: `e2e-ay-${iidSuffix}`, type: 'Legendary Creature', power: 2, toughness: 2, controller: 'p', keywords: ['BANDING'],
          activated: { cost: 'T', effect: 'counterActivatedAbilityUnlessPay', requiresTarget: true },
        });
        const artIid = `e2e-ay-art-${iidSuffix}`;
        const stackId = `e2e-ay-stack-${iidSuffix}`;
        const artifact = { iid: artIid, id: 'aladdinss_ring', name: "Aladdin's Ring", type: 'Artifact', color: '', cmc: 8, cost: '8', keywords: [], tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o' };
        const abilityItem = { id: stackId, card: { ...artifact, effect: 'damage4Any' }, caster: 'o', targets: [], xVal: 1, isAbility: true };

        await seed(page, {
          phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [abilityItem],
          p: { bf: [ayesha], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
          o: { bf: [artifact], mana: oppMana },
        });

        await clickAndActivate(page, `e2e-ay-${iidSuffix}`);
        // Mobile: the stack starts collapsed as a tap-to-expand pill when seeded
        // directly (rather than pushed via a real cast/activate), so items aren't
        // individually clickable until it's expanded.
        const stackPill = page.locator('[data-testid="stack-pill"]');
        if (await stackPill.isVisible({ timeout: 800 }).catch(() => false)) {
          await stackPill.click();
          await page.waitForTimeout(200);
        }
        const stackTgt = page.locator(`[data-stack-item-id="${stackId}"]`).first();
        await expect(stackTgt).toBeVisible({ timeout: 15000 });
        await stackTgt.click();
        await page.waitForTimeout(300);
        await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toBeVisible({ timeout: 10000 });
        await page.locator('[data-testid="cast-prompt-confirm"]').click();
        await page.waitForTimeout(400);
        await page.evaluate(() => window.__duelDispatch({ type: 'RESOLVE_STACK' }));
        await page.waitForTimeout(600); // AI auto-resolves pendingConditionalCounter (targetCaster 'o')

        const state = await page.evaluate(() => window.__duelState());
        expect(state.o.bf.some((c) => c.iid === artIid)).toBe(true);
        await expect(page.locator(`[data-iid="${artIid}"]`).first()).toBeVisible({ timeout: 10000 });
        return state;
      }

      // Decline outcome: opponent has no white mana, so the AI auto-declines to pay.
      const declineState = await runFixture('1', { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
      expect(declineState.pendingConditionalCounter).toBeFalsy();
      expect(declineState.stack.some((i) => i.id === 'e2e-ay-stack-1')).toBe(false);

      // Fresh page mount between fixtures -- avoids any cross-fixture React state
      // leakage (castFlow/selCard/etc.) rather than trying to seed a second,
      // independent scenario on top of the first one's already-resolved state.
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);

      // Pay outcome: opponent has {W} available, so the AI auto-pays.
      const payState = await runFixture('2', { W: 1, U: 0, B: 0, R: 0, G: 0, C: 5 });
      expect(payState.o.mana.W).toBe(0);
      expect(payState.o.mana.C).toBe(5);
    });

    test('Rasputin Dreamweaver: activating either counter-cost ability via the ability menu updates its dream counters', async ({ page }) => {
      const rasputin = makeCard('rasputin_dreamweaver', 'Rasputin Dreamweaver', {
        iid: 'e2e-rd-1', type: 'Legendary Creature', power: 4, toughness: 1, controller: 'p',
        counters: { DREAM: 7 },
        activatedAbilities: [
          { id: 'rasputin_add_mana', cost: 'counter', effect: 'rasputinAddMana', description: 'Remove a dream counter: Add {C}' },
          { id: 'rasputin_prevent_damage', cost: 'counter', effect: 'rasputinPreventDamage1Self', description: 'Remove a dream counter: Prevent the next 1 damage to Rasputin Dreamweaver this turn' },
        ],
      });

      await seed(page, {
        phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
        p: { bf: [rasputin], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      });

      await clickAndActivate(page, 'e2e-rd-1');
      await expect(page.locator('[data-testid="ability-menu"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="ability-option-rasputin_add_mana"]').click();
      await page.waitForTimeout(400);

      const state = await page.evaluate(() => window.__duelState());
      const updated = state.p.bf.find((c) => c.iid === 'e2e-rd-1');
      expect(updated.counters.DREAM).toBe(6);
      expect(state.p.mana.C).toBe(1);
    });

    test('Boris Devilboon: activating creates a Minor Demon token that renders on the battlefield', async ({ page }) => {
      const boris = makeCard('boris_devilboon', 'Boris Devilboon', {
        iid: 'e2e-bd-1', type: 'Legendary Creature', power: 2, toughness: 2, controller: 'p',
        activated: { cost: '2BR,T', effect: 'borisCreateMinorDemon' },
      });

      await seed(page, {
        phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
        p: { bf: [boris], mana: { W: 0, U: 0, B: 1, R: 1, G: 0, C: 2 } },
      });

      await clickAndActivate(page, 'e2e-bd-1');
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(400);

      const state = await page.evaluate(() => window.__duelState());
      const token = state.p.bf.find((c) => c.tokenId === 'minor_demon');
      expect(token).toBeDefined();
      await expect(page.locator(`[data-iid="${token.iid}"]`).first()).toBeVisible({ timeout: 10000 });
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
