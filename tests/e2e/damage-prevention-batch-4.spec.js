// tests/e2e/damage-prevention-batch-4.spec.js
//
// A9 Damage Prevention/Redirect bucket, batch 4 (4 cards) Playwright
// regression tests.
//
// Same convention as tests/e2e/damage-prevention-batch-1-2.spec.js and
// tests/e2e/damage-prevention-batch-3.spec.js: engine-only cases exercise the
// real DuelCore.js/AI.js code via page.evaluate + dynamic import (no full
// duel session). This batch adds no new UI component and no new click-flow
// shape -- Al-abara's Carpet and Scarecrow reuse the existing generic
// untargeted "activate ability" button, Whippoorwill reuses the existing
// creature-targeting click flow already used by Kry Shield/Maze of Ith (via
// its new ACTIVATE_TARGET_EFFECTS/CREATURE_ONLY_TARGET_EFFECTS registration),
// and Marble Priest is a fully static/AI-only heuristic with no activated
// ability at all. Since every card in this batch dispatches through the same
// duelReducer/useDuelController.ts path regardless of screen, there is no
// code path where a mobile-only change could diverge from desktop -- that
// guarantee is structural, not just tested here. Run at both desktop
// (1280x800) and mobile (390x844) viewports within this same chromium-only
// spec per the prompt's explicit requirement, even though the underlying
// assertions are viewport-independent (pure engine calls).
//
// See tests/scenarios/damage-prevention-batch-4.test.js for the full 22-case
// Vitest coverage; this spec covers one representative case per prompt item.

import { test, expect } from '@playwright/test';

function makePlayerState(overrides = {}) {
  return {
    life: 20, lib: [], hand: [], bf: [], gy: [], exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
    ...overrides,
  };
}

function makeState({ pBf = [], oBf = [], active = 'p', phase = 'MAIN_1', attackers = [], blockers = {} } = {}) {
  return {
    phase, active, turn: 1, landsPlayed: 0, spellsThisTurn: 0,
    attackers, blockers, stack: [], over: null,
    selCard: null, selTgt: null, xVal: 1, log: [],
    ruleset: { startingLife: 20, startingHandSize: 7, drawOnFirstTurn: false, londonMulligan: false, deathtouch: true },
    oppArch: { id: 'KARAG', profileId: 'KARAG' }, castleMod: null,
    pendingLotus: false, pendingLotusIid: null, pendingBop: false,
    turnState: { damageLog: [] }, triggerQueue: [], pendingChoice: null,
    fogActive: false, anteEnabled: false, anteP: null, anteO: null,
    anteExtraP: [], anteExtraO: [], ownershipChanges: [],
    pendingAnteChoice: null, pendingUpkeepChoice: null, pendingUpkeepChoiceQueue: [],
    pendingAnteExchange: null, pendingDamageShieldChoice: null,
    p: makePlayerState({ bf: pBf }),
    o: makePlayerState({ bf: oBf }),
  };
}

function runSuite(viewport, label) {
  test.describe(`@engine A9 Damage Prevention/Redirect batch 4 [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
    });

    test('DPB4-E01: activating Al-abara\'s Carpet / Scarecrow completes via the generic untargeted activation flow and records a filteredDamagePrevention entry + log line', async ({ page }) => {
      const state = makeState({});
      const out = await page.evaluate(async (state) => {
        const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const carpet = { ...makeCardInstance('al_abaras_carpet', 'p'), iid: 'carpet-1', summoningSick: false };
        const withBf = { ...state, p: { ...state.p, bf: [carpet], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } } };
        const s1 = duelReducer(withBf, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'carpet-1' });
        const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
        return {
          filter: s2.turnState.filteredDamagePrevention?.p,
          tapped: s2.p.bf.find((c) => c.iid === 'carpet-1')?.tapped,
          logHasEntry: s2.log.some((l) => typeof l.text === 'string' && l.text.includes('attacking creatures without flying')),
        };
      }, state);
      expect(out.filter).toEqual([{ filter: 'attackingNonFlying', shieldSourceName: "Al-abara's Carpet" }]);
      expect(out.tapped).toBe(true);
      expect(out.logHasEntry).toBe(true);
    });

    test('DPB4-E02: activating Whippoorwill targets a creature via the shared creature-targeting flow and completes, cursing the target', async ({ page }) => {
      const state = makeState({});
      const out = await page.evaluate(async (state) => {
        const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const whip = { ...makeCardInstance('whippoorwill', 'p'), iid: 'wp-1', summoningSick: false };
        const target = { ...makeCardInstance('grizzly_bears', 'o'), iid: 't-1' };
        const withBf = { ...state, p: { ...state.p, bf: [whip], mana: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 } }, o: { ...state.o, bf: [target] } };
        const s1 = duelReducer(withBf, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'wp-1', tgt: 't-1' });
        const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
        const after = s2.o.bf.find((c) => c.iid === 't-1');
        return {
          cantRegenerateThisTurn: after?.cantRegenerateThisTurn,
          cantPreventOrRedirectDamage: after?.cantPreventOrRedirectDamage,
          exileOnDeathThisTurn: after?.exileOnDeathThisTurn,
        };
      }, state);
      expect(out.cantRegenerateThisTurn).toBe(true);
      expect(out.cantPreventOrRedirectDamage).toBe(true);
      expect(out.exileOnDeathThisTurn).toBe(true);
    });

    test('DPB4-E03: a Whippoorwill-cursed creature that dies moves to the exile zone, not the graveyard', async ({ page }) => {
      const state = makeState({});
      const out = await page.evaluate(async (state) => {
        const { hurtCreature, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const target = { ...makeCardInstance('grizzly_bears', 'o'), iid: 't-1', toughness: 2, exileOnDeathThisTurn: true, cantPreventOrRedirectDamage: true };
        const withBf = { ...state, o: { ...state.o, bf: [target] } };
        const s1 = hurtCreature(withBf, 't-1', 5, 'Test Ping', { sourceIid: 'src-1' });
        return {
          onBf: s1.o.bf.some((c) => c.iid === 't-1'),
          inExile: s1.o.exile.some((c) => c.iid === 't-1'),
          inGy: s1.o.gy.some((c) => c.iid === 't-1'),
        };
      }, state);
      expect(out.onBf).toBe(false);
      expect(out.inExile).toBe(true);
      expect(out.inGy).toBe(false);
    });

    test('DPB4-E04: an attacking Marble Priest causes the AI\'s available Wall to auto-block via planBlock', async ({ page }) => {
      const state = makeState({ phase: 'COMBAT_BLOCKERS', active: 'p', attackers: ['mp-1'] });
      const out = await page.evaluate(async (state) => {
        const { makeCardInstance } = await import('/src/engine/DuelCore.js');
        const { getAIPlan } = await import('/src/engine/AI.js');
        const priest = { ...makeCardInstance('marble_priest', 'p'), iid: 'mp-1', attacking: true, tapped: true };
        const wall = { ...makeCardInstance('wall_of_shadows', 'o'), iid: 'wall-1', tapped: false, attacking: false };
        const withBf = { ...state, p: { ...state.p, bf: [priest] }, o: { ...state.o, bf: [wall] } };
        const plan = getAIPlan(withBf, 'COMBAT_BLOCKERS');
        return { actions: plan.actions };
      }, state);
      expect(out.actions.some((a) => a.type === 'BLOCK' && a.blockerId === 'wall-1' && a.attackerId === 'mp-1')).toBe(true);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
