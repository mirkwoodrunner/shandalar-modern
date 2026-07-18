// tests/e2e/legendary-creatures-batch-3.spec.js
//
// Legendary Creatures Batch 3 Playwright regression tests (LGB3-E01 - LGB3-E04).
// Covers the three Elder Dragons: Palladia-Mors, Nicol Bolas, Vaevictis Asmadi.
//
// Same convention as tests/e2e/legendary-creatures-batch-1-2.spec.js: engine-only
// cases exercise the real DuelCore.js code via page.evaluate + dynamic import (no
// full duel session, no viewport split beyond the project matrix already running
// every spec against both `chromium` and `mobile-chrome`). Unlike that file's
// hand-rolled makeCreature/makeSpell helpers (fine for cards with no upkeep/
// triggeredAbilities/activatedAbilities field to reproduce), these three dragons'
// mechanics live entirely in those extra fields, so card data is pulled from the
// real CARD_DB inside page.evaluate rather than duplicated here.
//
// Note: the upkeep-sacrifice-unless-pay mechanic on these three dragons is the
// same sacrificeUnless_U/_WW shape used by Phantasmal Forces/Stasis/Conversion --
// mana burns to zero at the same phase-transition boundary the check runs in, so
// (matching that existing precedent, verified in the Vitest suite for this batch)
// the cost can never actually be paid through duelReducer. All three cases below
// therefore observe the sacrifice outcome, not a "paid and survived" outcome.

import { test, expect } from '@playwright/test';

function makePlayerState(overrides = {}) {
  return {
    life: 20, lib: [], hand: [], bf: [], gy: [], exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
    ...overrides,
  };
}

function makeState({ pBf = [], oBf = [], pHand = [], oHand = [], active = 'p', phase = 'MAIN_1' } = {}) {
  return {
    phase, active, turn: 1, landsPlayed: 0, spellsThisTurn: 0,
    attackers: [], blockers: {}, stack: [], over: null,
    selCard: null, selTgt: null, xVal: 1, log: [],
    ruleset: { startingLife: 20, startingHandSize: 7, drawOnFirstTurn: false, londonMulligan: false, deathtouch: true },
    oppArch: { id: 'KARAG', profileId: 'KARAG' }, castleMod: null,
    pendingLotus: false, pendingLotusIid: null, pendingBop: false,
    turnState: { damageLog: [] }, triggerQueue: [], pendingChoice: null,
    fogActive: false, anteEnabled: false, anteP: null, anteO: null,
    anteExtraP: [], anteExtraO: [], ownershipChanges: [],
    pendingAnteChoice: null, pendingUpkeepChoice: null, pendingUpkeepChoiceQueue: [],
    pendingAnteExchange: null, pendingDamageShieldChoice: null,
    p: makePlayerState({ bf: pBf, hand: pHand }),
    o: makePlayerState({ bf: oBf, hand: oHand }),
  };
}

test.describe('@engine Legendary Creatures Batch 3 -- Elder Dragons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('LGB3-E01: casting Palladia-Mors resolves onto the battlefield, then reaching its controller\'s next upkeep sacrifices it', async ({ page }) => {
    const state = makeState({});
    const funded = { ...state, p: { ...state.p, mana: { W: 2, U: 0, B: 0, R: 2, G: 2, C: 2 } } };

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const dragon = { ...makeCardInstance('palladia_mors', 'p'), iid: 'pm-1', summoningSick: false };
      const withHand = { ...state, p: { ...state.p, hand: [dragon] } };
      const s1 = duelReducer(withHand, { type: 'CAST_SPELL', who: 'p', iid: 'pm-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const onBf = s2.p.bf.find((c) => c.iid === 'pm-1');
      const untapped = { ...s2, phase: 'UNTAP', active: 'p' };
      const s3 = duelReducer(untapped, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
      return {
        onBf: onBf ? { power: onBf.power, toughness: onBf.toughness } : null,
        stillOnBfAfterUpkeep: s3.p.bf.some((c) => c.iid === 'pm-1'),
        inGyAfterUpkeep: s3.p.gy.some((c) => c.iid === 'pm-1'),
      };
    }, funded);

    expect(out.onBf).toEqual({ power: 7, toughness: 7 });
    expect(out.stillOnBfAfterUpkeep).toBe(false);
    expect(out.inGyAfterUpkeep).toBe(true);
  });

  test('LGB3-E02: casting Nicol Bolas resolves onto the battlefield, then reaching its controller\'s next upkeep sacrifices it', async ({ page }) => {
    const state = makeState({});
    const funded = { ...state, p: { ...state.p, mana: { U: 2, B: 2, R: 2, W: 0, G: 0, C: 2 } } };

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const dragon = { ...makeCardInstance('nicol_bolas', 'p'), iid: 'nb-1', summoningSick: false };
      const withHand = { ...state, p: { ...state.p, hand: [dragon] } };
      const s1 = duelReducer(withHand, { type: 'CAST_SPELL', who: 'p', iid: 'nb-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const onBf = s2.p.bf.find((c) => c.iid === 'nb-1');
      const untapped = { ...s2, phase: 'UNTAP', active: 'p' };
      const s3 = duelReducer(untapped, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
      return {
        onBf: onBf ? { power: onBf.power, toughness: onBf.toughness } : null,
        stillOnBfAfterUpkeep: s3.p.bf.some((c) => c.iid === 'nb-1'),
        inGyAfterUpkeep: s3.p.gy.some((c) => c.iid === 'nb-1'),
      };
    }, funded);

    expect(out.onBf).toEqual({ power: 7, toughness: 7 });
    expect(out.stillOnBfAfterUpkeep).toBe(false);
    expect(out.inGyAfterUpkeep).toBe(true);
  });

  test('LGB3-E03: casting Vaevictis Asmadi resolves onto the battlefield, its {R} pump ability works, then reaching its controller\'s next upkeep sacrifices it', async ({ page }) => {
    const state = makeState({});
    const funded = { ...state, p: { ...state.p, mana: { B: 2, R: 2, G: 2, W: 0, U: 0, C: 2 } } };

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const dragon = { ...makeCardInstance('vaevictis_asmadi', 'p'), iid: 'va-1', summoningSick: false };
      const withHand = { ...state, p: { ...state.p, hand: [dragon] } };
      const s1 = duelReducer(withHand, { type: 'CAST_SPELL', who: 'p', iid: 'va-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const onBf = s2.p.bf.find((c) => c.iid === 'va-1');
      // Casting Vaevictis Asmadi spends all funded mana (2BBRRGG) -- refund a
      // single {R} so the pump ability below has something to pay with.
      const refunded = { ...s2, p: { ...s2.p, mana: { ...s2.p.mana, R: 1 } } };
      const s3 = duelReducer(refunded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'va-1', abilityId: 'vaevictis_pump_r' });
      const pumped = s3.p.bf.find((c) => c.iid === 'va-1');
      const untapped = { ...s3, phase: 'UNTAP', active: 'p' };
      const s4 = duelReducer(untapped, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
      return {
        onBf: onBf ? { power: onBf.power, toughness: onBf.toughness } : null,
        pumpedEotBuffs: pumped?.eotBuffs,
        stillOnBfAfterUpkeep: s4.p.bf.some((c) => c.iid === 'va-1'),
        inGyAfterUpkeep: s4.p.gy.some((c) => c.iid === 'va-1'),
      };
    }, funded);

    expect(out.onBf).toEqual({ power: 7, toughness: 7 });
    expect(out.pumpedEotBuffs).toEqual([{ power: 1 }]);
    expect(out.stillOnBfAfterUpkeep).toBe(false);
    expect(out.inGyAfterUpkeep).toBe(true);
  });

  test('LGB3-E04: Nicol Bolas dealing unblocked combat damage to the opponent discards their entire hand', async ({ page }) => {
    const state = makeState({ active: 'o', phase: 'COMBAT_ATTACKERS' });

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const dragon = { ...makeCardInstance('nicol_bolas', 'o'), iid: 'nb-1', summoningSick: false };
      const withBf = {
        ...state,
        o: { ...state.o, bf: [dragon] },
        p: { ...state.p, hand: [
          { iid: 'h-1', id: 'test_spell', name: 'Test Spell', type: 'Instant', color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, summoningSick: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' },
          { iid: 'h-2', id: 'test_spell', name: 'Test Spell', type: 'Instant', color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, summoningSick: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' },
          { iid: 'h-3', id: 'test_spell', name: 'Test Spell', type: 'Instant', color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, summoningSick: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' },
        ] },
      };
      const s1 = duelReducer(withBf, { type: 'DECLARE_ATTACKER', iid: 'nb-1' });
      const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
      const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
      const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
      const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
      return { handLength: s5.p.hand.length, gyIids: s5.p.gy.map((c) => c.iid).sort() };
    }, state);

    expect(out.handLength).toBe(0);
    expect(out.gyIids).toEqual(['h-1', 'h-2', 'h-3']);
  });
});
