// tests/e2e/a9-upkeep-activated-batch.spec.js
//
// A9 Upkeep-Restricted Activated-Ability batch: UI regression coverage for
// Dwarven Weaponsmith (real click-driven activate/target flow) and Tolaria
// (dual-ability land). See docs/CURRENT_SPRINT.md / docs/MECHANICS_INDEX.md
// for the full batch and tests/scenarios/a9-upkeep-activated-batch.test.js /
// tests/scenarios/life-matrix.test.js for the engine-level coverage.
//
// NOTE on Tolaria's second ability: this engine's battlefield click routing
// (DuelScreen.tsx's `isLand(card) && !card.tapped` branch, and
// DuelScreenMobile.tsx's LandPip -> handleLandTap) always taps a
// single-color-producing land for mana on click, with no path to a
// card.activated non-mana ability defined alongside `produces`. This is a
// pre-existing gap already affecting Strip Mine (same "produces" + singular
// "activated" shape, cost "T,sac") -- not something introduced by this batch,
// and DuelScreen.tsx/DuelScreenMobile.tsx click-routing changes are out of
// scope for this prompt. The mana-ability half is exercised via a real click
// below; the banding-removal half is exercised via the sandbox's documented
// __duelDispatch escape hatch (same convention tests/e2e/coral-helm.spec.ts
// already uses for its ability-activation step).

import { test, expect } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const SANDBOX_MOBILE_URL = '/?duel=sandbox-mobile&aiSpeed=0';

function makeWeaponsmith(iid) {
  return {
    iid, id: 'dwarven_weaponsmith', name: 'Dwarven Weaponsmith', type: 'Creature', subtype: 'Dwarf Artificer',
    color: 'R', cmc: 2, cost: '1R', power: 1, toughness: 1, keywords: [],
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    activated: { cost: 'T,sacArt', effect: 'dwarvenWeaponsmithCounter', myUpkeepOnly: true },
  };
}

function makeArt(iid) {
  return {
    iid, id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', color: '', cmc: 0, cost: '',
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
  };
}

function makeBear(iid) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G',
    cmc: 2, cost: '1G', power: 2, toughness: 2, tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
  };
}

function makeTolaria(iid) {
  return {
    iid, id: 'tolaria', name: 'Tolaria', type: 'Legendary Land', color: '', cmc: 0, cost: '',
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    produces: ['U'],
    activated: { cost: 'T', effect: 'removeBandingEOT', anyUpkeepOnly: true },
  };
}

function makeBandit(iid) {
  return {
    iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G',
    cmc: 2, cost: '1G', power: 2, toughness: 2, tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    keywords: ['BANDING'], controller: 'o',
  };
}

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

// Same helper as tests/e2e/creature-damage-centralization.spec.ts: clicking a
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

function runSuite(viewport, label, url, waitForScreen) {
  test.describe(`@engine @mobile A9 upkeep-activated batch UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      await waitForScreen(page);
      await waitForEngineReady(page);
    });

    test('Dwarven Weaponsmith: activate/target UI flow puts a +1/+1 counter on the selected creature', async ({ page }) => {
      const smith = makeWeaponsmith('e2e-dw-smith-1');
      const art = makeArt('e2e-dw-art-1');
      const bear = makeBear('e2e-dw-bear-1');

      await page.evaluate(({ smith, art, bear }) => {
        const s = window.__duelState();
        window.__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'UPKEEP', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [smith, art, bear] },
            o: { ...s.o, bf: [] },
          },
        });
      }, { smith, art, bear });
      await page.waitForTimeout(300);

      // Real UI clicks: select/activate Dwarven Weaponsmith, then click the
      // target creature -- exercises the ACTIVATE_TARGET_EFFECTS click-routing
      // wired up for dwarvenWeaponsmithCounter.
      await clickAndActivate(page, 'e2e-dw-smith-1');
      const tgtLoc = page.locator('[data-iid="e2e-dw-bear-1"]').first();
      await expect(tgtLoc).toBeVisible({ timeout: 15000 });
      await tgtLoc.click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid="cast-prompt-confirm"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="cast-prompt-confirm"]').click();
      await page.waitForTimeout(400);

      await page.evaluate(() => window.__duelDispatch({ type: 'RESOLVE_STACK' }));
      await page.waitForTimeout(400);

      const state = await page.evaluate(() => window.__duelState());
      const smithAfter = state.p.bf.find((c) => c.iid === 'e2e-dw-smith-1');
      const bearAfter = state.p.bf.find((c) => c.iid === 'e2e-dw-bear-1');
      expect(smithAfter?.tapped).toBe(true);
      expect(state.p.bf.some((c) => c.iid === 'e2e-dw-art-1')).toBe(false);
      expect(bearAfter?.counters?.P1P1).toBe(1);

      // Visual confirmation: the counter is reflected on the battlefield tile.
      const bearTile = page.locator('[data-iid="e2e-dw-bear-1"]').first();
      await expect(bearTile).toContainText('3/3');
    });

    test("Tolaria: mana-tap path reachable via a real click; banding-removal path activates during the opponent's upkeep", async ({ page }) => {
      // The AI loop acts on `active: 'o'` states with the sandbox's aiSpeed=0,
      // so the opponent's-upkeep scenario below dispatches ACTIVATE_ABILITY and
      // RESOLVE_STACK back-to-back in the same page.evaluate call as the state
      // seed -- React effects (and the AI's own setTimeout) can't run inside
      // that synchronous block, so the AI can't race ahead of UPKEEP first.
      test.setTimeout(60_000);

      const tolaria = makeTolaria('e2e-tol-1');

      await page.evaluate(({ tolaria }) => {
        const s = window.__duelState();
        window.__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [tolaria] },
          },
        });
      }, { tolaria });
      await page.waitForTimeout(300);

      // Real UI click: tap Tolaria for {U}.
      const tolariaTile = page.locator('[data-iid="e2e-tol-1"]').first();
      await expect(tolariaTile).toBeVisible({ timeout: 15000 });
      await tolariaTile.click();
      await page.waitForTimeout(300);

      const stateAfterTap = await page.evaluate(() => window.__duelState());
      expect(stateAfterTap.p.mana.U).toBe(1);
      expect(stateAfterTap.p.bf.find((c) => c.iid === 'e2e-tol-1')?.tapped).toBe(true);

      // Fresh, untapped Tolaria, opponent's upkeep -- exercise the
      // banding-removal ability via the sandbox escape hatch (see the
      // file-level NOTE on why this isn't a real click path today). All three
      // dispatches run inside one synchronous page.evaluate call (React 18
      // batches them into a single render) so the AI loop's own effect --
      // which would otherwise advance the opponent past UPKEEP -- only ever
      // observes the already-resolved end state.
      const tolaria2 = makeTolaria('e2e-tol-2');
      const bandit = makeBandit('e2e-tol-bandit-1');
      await page.evaluate(({ tolaria2, bandit }) => {
        const s = window.__duelState();
        window.__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'UPKEEP', active: 'o', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [tolaria2] },
            o: { ...s.o, bf: [bandit] },
          },
        });
        window.__duelDispatch({ type: 'ACTIVATE_ABILITY', who: 'p', iid: 'e2e-tol-2', tgt: 'e2e-tol-bandit-1' });
        window.__duelDispatch({ type: 'RESOLVE_STACK' });
      }, { tolaria2, bandit });
      await page.waitForTimeout(200);

      const stateAfterBanding = await page.evaluate(() => window.__duelState());
      const banditAfter = stateAfterBanding.o.bf.find((c) => c.iid === 'e2e-tol-bandit-1');
      expect(banditAfter?.eotBuffs).toContainEqual({ layerDef: { layer: '6', removeKeywords: ['BANDING'] } });
      expect(stateAfterBanding.p.bf.find((c) => c.iid === 'e2e-tol-2')?.tapped).toBe(true);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop', SANDBOX_URL, waitForDuel);
runSuite({ width: 390, height: 844 }, 'mobile', SANDBOX_MOBILE_URL, waitForDuelMobile);
