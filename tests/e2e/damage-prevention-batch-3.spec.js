// tests/e2e/damage-prevention-batch-3.spec.js
//
// A9 Damage Prevention/Redirect bucket, sub-batch 3 (6 cards) Playwright
// regression tests.
//
// Same convention as tests/e2e/damage-prevention-batch-1-2.spec.js:
// engine-only cases exercise the real DuelCore.js code via page.evaluate +
// dynamic import (no full duel session). This batch adds no new UI
// component and no new click-flow shape -- all 6 cards are static abilities
// on vanilla creatures or a single Aura, resolved entirely inside
// resolveCombat()/hurtCreature()/the DECLARE_ATTACKER reducer case -- so
// there is no new UI surface to click through. Run at both desktop
// (1280x800) and mobile (390x844) viewports within this same chromium-only
// spec, per the prompt's explicit requirement, even though the underlying
// assertions are viewport-independent (pure engine calls).
//
// See tests/scenarios/damage-prevention-batch-3.test.js for the full 19-case
// Vitest coverage; this spec covers one representative case per card.

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
  test.describe(`@engine A9 Damage Prevention/Redirect batch 3 [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
    });

    test('DPB3-E01: Bronze Horse prevents spell damage while its controller controls another creature', async ({ page }) => {
      const state = makeState({});
      const out = await page.evaluate(async (state) => {
        const { hurtCreature, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const bronze = { ...makeCardInstance('bronze_horse', 'p'), iid: 'bh-1' };
        const other = { ...makeCardInstance('grizzly_bears', 'p'), iid: 'other-1' };
        const withBf = { ...state, p: { ...state.p, bf: [bronze, other] } };
        const s1 = hurtCreature(withBf, 'bh-1', 5, 'Test Spell', { sourceIid: 'spell-1', sourceType: 'spell' });
        return { damage: s1.p.bf.find((c) => c.iid === 'bh-1')?.damage };
      }, state);
      expect(out.damage).toBe(0);
    });

    test('DPB3-E02: Enchanted Being prevents combat damage from an enchanted attacker', async ({ page }) => {
      const state = makeState({ phase: 'COMBAT_DAMAGE', active: 'o', attackers: ['att-1'], blockers: { 'eb-1': 'att-1' } });
      const out = await page.evaluate(async (state) => {
        const { resolveCombat, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const attacker = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'att-1', power: 3, toughness: 3, attacking: true, tapped: true, enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] };
        const eb = { ...makeCardInstance('enchanted_being', 'p'), iid: 'eb-1', blocking: 'att-1' };
        const withBf = { ...state, p: { ...state.p, bf: [eb] }, o: { ...state.o, bf: [attacker] } };
        const s1 = resolveCombat(withBf);
        return { damage: s1.p.bf.find((c) => c.iid === 'eb-1')?.damage };
      }, state);
      expect(out.damage).toBe(0);
    });

    test("DPB3-E03: Demonic Torment's enchanted creature is rejected by DECLARE_ATTACKER", async ({ page }) => {
      const state = makeState({ phase: 'COMBAT_ATTACKERS', active: 'o' });
      const out = await page.evaluate(async (state) => {
        const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const target = { ...makeCardInstance('grizzly_bears', 'o'), iid: 't-1', summoningSick: false, enchantments: [{ iid: 'dt-1', name: 'Demonic Torment', mod: { cantAttack: true, preventCombatDamageBySelf: true } }] };
        const withBf = { ...state, o: { ...state.o, bf: [target] } };
        const s1 = duelReducer(withBf, { type: 'DECLARE_ATTACKER', iid: 't-1' });
        return { attackers: s1.attackers };
      }, state);
      expect(out.attackers).toEqual([]);
    });

    test('DPB3-E04: Wall of Putrid Flesh prevents combat damage from an enchanted attacker', async ({ page }) => {
      const state = makeState({ phase: 'COMBAT_DAMAGE', active: 'o', attackers: ['att-1'], blockers: { 'wpf-1': 'att-1' } });
      const out = await page.evaluate(async (state) => {
        const { resolveCombat, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const attacker = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'att-1', color: 'G', power: 3, toughness: 3, attacking: true, tapped: true, enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] };
        const wpf = { ...makeCardInstance('wall_of_putrid_flesh', 'p'), iid: 'wpf-1', blocking: 'att-1' };
        const withBf = { ...state, p: { ...state.p, bf: [wpf] }, o: { ...state.o, bf: [attacker] } };
        const s1 = resolveCombat(withBf);
        return { damage: s1.p.bf.find((c) => c.iid === 'wpf-1')?.damage };
      }, state);
      expect(out.damage).toBe(0);
    });

    test("DPB3-E05: Wall of Shadows prevents damage from the specific creature it's blocking", async ({ page }) => {
      const state = makeState({ phase: 'COMBAT_DAMAGE', active: 'o', attackers: ['att-1'], blockers: { 'wos-1': 'att-1' } });
      const out = await page.evaluate(async (state) => {
        const { resolveCombat, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const attacker = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'att-1', power: 2, toughness: 2, attacking: true, tapped: true };
        const wos = { ...makeCardInstance('wall_of_shadows', 'p'), iid: 'wos-1', blocking: 'att-1' };
        const withBf = { ...state, p: { ...state.p, bf: [wos] }, o: { ...state.o, bf: [attacker] } };
        const s1 = resolveCombat(withBf);
        return { damage: s1.p.bf.find((c) => c.iid === 'wos-1')?.damage };
      }, state);
      expect(out.damage).toBe(0);
    });

    test("DPB3-E06: Wall of Vapor prevents damage from the specific creature it's blocking", async ({ page }) => {
      const state = makeState({ phase: 'COMBAT_DAMAGE', active: 'o', attackers: ['att-1'], blockers: { 'wov-1': 'att-1' } });
      const out = await page.evaluate(async (state) => {
        const { resolveCombat, makeCardInstance } = await import('/src/engine/DuelCore.js');
        const attacker = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'att-1', power: 2, toughness: 2, attacking: true, tapped: true };
        const wov = { ...makeCardInstance('wall_of_vapor', 'p'), iid: 'wov-1', blocking: 'att-1' };
        const withBf = { ...state, p: { ...state.p, bf: [wov] }, o: { ...state.o, bf: [attacker] } };
        const s1 = resolveCombat(withBf);
        return { damage: s1.p.bf.find((c) => c.iid === 'wov-1')?.damage };
      }, state);
      expect(out.damage).toBe(0);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
