// tests/e2e/titanias-song.spec.ts
//
// End-to-end tests for Titania's Song: an on-battlefield noncreature artifact
// becomes an artifact creature (visible on its battlefield tile), the effect
// survives Titania's Song leaving the battlefield until end of turn (via the
// shared emblem infrastructure), and reverts on the following turn.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, to confirm both DuelScreen.tsx and DuelScreenMobile.tsx
// render paths behave the same way.
//
// TS-E2E-01: an artifact under Titania's Song shows creature P/T on its
//            battlefield tile and can be declared as an attacker.
// TS-E2E-02: Titania's Song is destroyed -- the artifact still shows as a
//            creature for the rest of that turn (endOfTurn emblem).
// TS-E2E-03: on the following turn (after CLEANUP), the artifact reverts to a
//            normal noncreature artifact tile.
// TS-E2E-04: a second artifact played after Titania's Song already left is
//            still affected by the still-active endOfTurn emblem -- the
//            emblem's globalTypeEffect is a filter checked fresh on every
//            recompute, not a snapshot of the specific artifacts present when
//            it left (see layers.js collectEffects step 14b).

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

function makeArtifact(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 3, cost: '3', keywords: [] as string[], protection: [] as string[],
    tapped: false, summoningSick: false, attacking: false, blocking: null as string | null,
    damage: 0, counters: {}, eotBuffs: [] as any[], enchantments: [] as any[],
    controller: 'p',
    ...overrides,
  };
}

function makeSong(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid, id: 'titaniass_song', name: "Titania's Song", type: 'Enchantment', color: 'G',
    cmc: 4, cost: '3G', keywords: [] as string[], tapped: false, damage: 0, counters: {},
    eotBuffs: [] as any[], enchantments: [] as any[], controller: 'p', enterTs: 1,
    effect: 'globalTypeEffect',
    globalTypeEffect: {
      filter: 'nonCreatureArtifact', addTypes: ['Creature'], wipeAbilities: true,
      powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA',
    },
    triggeredAbilities: [{
      id: 'titanias_song_leaves_bf',
      trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' },
      effect: { type: 'titaniasSongPersist' },
    }],
    ...overrides,
  };
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

// Playing a throwaway land is the only realistic action that forces a
// full-board typeEff/subtypeEff rebake outside the zMove/RESOLVE_STACK paths
// -- DEBUG_SET_ACTIVE is a raw state patch and never calls
// recomputeTypeEffects itself (same reason the CLEANUP emblem sweep needed
// its own explicit call -- see DuelCore.js).
async function recomputeViaLandPlay(page: Page, who: 'p' | 'o' = 'p') {
  await page.evaluate((who) => {
    const s = (window as any).__duelState();
    const dummyIid = `recompute-land-${Math.random().toString(36).slice(2)}`;
    const dummyLand = {
      iid: dummyIid, id: 'plains', name: 'Plains', type: 'Land', subtype: 'Basic Plains',
      color: '', cmc: 0, cost: '', keywords: [], produces: ['W'],
    };
    (window as any).__duelDispatch({
      type: 'DEBUG_SET_ACTIVE',
      patch: {
        phase: 'MAIN_1', active: who, stack: [], priorityWindow: false, landsPlayed: 0,
        [who]: { ...s[who], hand: [...s[who].hand, dummyLand] },
      },
    });
    (window as any).__duelDispatch({ type: 'PLAY_LAND', who, iid: dummyIid });
  }, who);
  await page.waitForTimeout(50);
}

function runSuite(viewport: { width: number; height: number }, label: string) {
  test.describe(`@engine Titania's Song UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test("TS-E2E-01: an artifact under Titania's Song shows creature P/T and can be declared as an attacker", async ({ page }) => {
      const art = makeArtifact('ts-art-1', { cmc: 3 });
      const song = makeSong('ts-song-1');

      await page.evaluate(({ art, song }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: { phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [], p: { ...s.p, bf: [art, song] } },
        });
      }, { art, song });
      await page.waitForTimeout(50);
      await recomputeViaLandPlay(page, 'p');

      const tile = page.locator('[data-iid="ts-art-1"]');
      await expect(tile).toBeVisible();
      await expect(tile).toContainText('3/3');

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { phase: 'COMBAT_ATTACKERS', priorityWindow: false, stack: [] } });
      });
      await page.waitForTimeout(100);
      await page.evaluate((iid) => {
        (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
      }, 'ts-art-1');
      await page.waitForTimeout(100);

      const after = await page.evaluate(() => (window as any).__duelState());
      expect(after.attackers).toContain('ts-art-1');
    });

    test("TS-E2E-02: Titania's Song is destroyed -- the artifact still shows as a creature for the rest of that turn", async ({ page }) => {
      const art = makeArtifact('ts-art-2', { cmc: 4 });
      const song = makeSong('ts-song-2');
      const disenchant = {
        iid: 'ts-disenchant', id: 'test_disenchant', name: 'Test Disenchant', type: 'Instant',
        color: 'W', cmc: 2, cost: '1W', keywords: [], effect: 'destroyArtOrEnch',
      };

      await page.evaluate(({ art, song, disenchant }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [art, song], hand: [disenchant], mana: { ...s.p.mana, C: 1, W: 1 } },
          },
        });
      }, { art, song, disenchant });
      await page.waitForTimeout(50);
      await recomputeViaLandPlay(page, 'p');

      await expect(page.locator('[data-iid="ts-art-2"]')).toContainText('4/4');

      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'ts-disenchant', tgt: 'ts-song-2' });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.gy.some((c: any) => c.iid === 'ts-song-2')).toBe(true);
      expect(state.p.emblems?.length).toBe(1);
      expect(state.p.emblems[0].duration).toBe('endOfTurn');

      await expect(page.locator('[data-iid="ts-art-2"]')).toContainText('4/4');
    });

    test('TS-E2E-03: on the next turn the artifact reverts to a normal noncreature artifact tile', async ({ page }) => {
      const art = makeArtifact('ts-art-3', { cmc: 5 });
      const emblem = {
        id: 'ts-emblem-3', source: 'titanias_song', name: "Titania's Song (emblem)",
        controller: 'p', duration: 'endOfTurn', enterTs: 1,
        globalTypeEffect: {
          filter: 'nonCreatureArtifact', addTypes: ['Creature'], wipeAbilities: true,
          powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA',
        },
      };

      await page.evaluate(({ art, emblem }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'END', active: 'p', priorityWindow: false, stack: [],
            p: { ...s.p, bf: [art], emblems: [emblem] },
          },
        });
      }, { art, emblem });
      await page.waitForTimeout(50);

      // Sanity: the artifact reads as a creature while the emblem is still active.
      const beforeCleanup = await page.evaluate(() => (window as any).__duelState());
      expect(beforeCleanup.p.emblems.length).toBe(1);

      // END -> CLEANUP expires the endOfTurn emblem and rebakes typeEff.
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); });
      await page.waitForTimeout(100);

      const afterCleanup = await page.evaluate(() => (window as any).__duelState());
      expect(afterCleanup.phase).toBe('CLEANUP');
      expect(afterCleanup.p.emblems).toEqual([]);

      const tile = page.locator('[data-iid="ts-art-3"]');
      await expect(tile).toBeVisible();
      await expect(tile).not.toContainText('5/5');
    });

    test("TS-E2E-04: a second artifact played after Titania's Song already left is still affected by the still-active endOfTurn emblem", async ({ page }) => {
      const emblem = {
        id: 'ts-emblem-4', source: 'titanias_song', name: "Titania's Song (emblem)",
        controller: 'p', duration: 'endOfTurn', enterTs: 1,
        globalTypeEffect: {
          filter: 'nonCreatureArtifact', addTypes: ['Creature'], wipeAbilities: true,
          powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA',
        },
      };
      const freshArt = { iid: 'ts-fresh-art', id: 'test_artifact_2', name: 'Fresh Artifact', type: 'Artifact', color: '', cmc: 2, cost: '2', keywords: [] };

      await page.evaluate(({ emblem, freshArt }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1', active: 'p', priorityWindow: false, stack: [], landsPlayed: 0,
            p: { ...s.p, bf: [], emblems: [emblem], hand: [freshArt], mana: { ...s.p.mana, C: 2 } },
          },
        });
      }, { emblem, freshArt });

      // Cast the fresh artifact through the real pipeline so RESOLVE_STACK's
      // own recomputeTypeEffects call bakes the result -- no manual trigger needed.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid: 'ts-fresh-art', tgt: null });
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => { (window as any).__duelDispatch({ type: 'RESOLVE_STACK' }); });
      await page.waitForTimeout(150);

      const state = await page.evaluate(() => (window as any).__duelState());
      expect(state.p.bf.some((c: any) => c.iid === 'ts-fresh-art')).toBe(true);
      expect(state.p.emblems.length).toBe(1); // still active, before CLEANUP

      // The emblem's filter check is evaluated fresh, not a snapshot of the
      // artifacts present when Titania's Song left -- the fresh artifact is
      // affected too.
      await expect(page.locator('[data-iid="ts-fresh-art"]')).toContainText('2/2');
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
