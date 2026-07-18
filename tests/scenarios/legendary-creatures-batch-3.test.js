// tests/scenarios/legendary-creatures-batch-3.test.js
// Legendary Creatures Batch 3 -- the three Elder Dragons (Palladia-Mors, Nicol
// Bolas, Vaevictis Asmadi). All three reuse the existing sacrificeUnless_U /
// sacrificeUnless_WW upkeep-sacrifice shape (Phantasmal Forces / Stasis /
// Conversion / Sunken City), extended to three-color costs. Nicol Bolas adds a
// discard-hand trigger via the same ON_DAMAGE_DEALT + selfIsDamageSourceToPlayer
// generic pipeline Marsh Viper/Pit Scorpion use (see tests/scenarios/poison-counters.test.js),
// not a "Hypnotic Specter" trigger -- that card's oracle text has never actually
// been wired to a real engine trigger (verified live; see the batch writeup in
// docs/CURRENT_SPRINT.md). Vaevictis Asmadi's three redundant pump abilities use
// the pre-existing activatedAbilities[] array (Wormwood Treefolk / Mishra's
// Factory precedent), not a schema change.
//
// Deviation from the original test plan (documented, not silent): the prompt
// this batch was written from expected "survives when paid" + "correct mana
// deducted on payment" sub-tests per card, matching sacrificeUnless_U's shape
// exactly. Verified live (see tests/scenarios/stub-batch-rd-conv-stasis.test.js
// CONV-04/STAS-04): mana burns to zero at the SAME phase-transition boundary
// the upkeep switch checks affordability in, for every existing card using this
// exact shape (Phantasmal Forces included) -- there is no queueUpkeepChoice
// deferral here, so a human/AI player can never actually have mana in the pool
// at the moment the check runs. Paying is therefore unreachable through
// duelReducer for this card shape, not something specific to these 3 dragons.
// The 3-tests-per-card upkeep coverage below is redirected accordingly: fires
// and sacrifices (card data asserted inline); the same burn-then-check ordering
// regression as CONV-04/STAS-04 (protects against a future ordering fix
// silently changing behavior); and doesn't fire outside the upkeep transition.
//
// Styled after tests/scenarios/legendary-creatures-batch-1-2.test.js and
// tests/scenarios/banding-cards-batch.test.js: real CARD_DB-backed instances
// via makeCardInstance, not synthetic fixtures.

import { describe, it, expect } from 'vitest';
import { duelReducer, hasKw, makeCardInstance, checkLegendRule } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeSpell, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], ...overrides };
}

describe('@engine Scenario: legendary-creatures-batch-3 -- Palladia-Mors', () => {
  it('has correct card data and is sacrificed at upkeep when the {R}{G}{W} cost cannot be paid', () => {
    const dragon = makeReadyInstance('palladia_mors', 'p');
    expect(dragon.type).toBe('Legendary Creature');
    expect(dragon.subtype).toBe('Elder Dragon');
    expect(dragon.cost).toBe('2RRGGWW');
    expect(dragon.cmc).toBe(8);
    expect(dragon.power).toBe(7);
    expect(dragon.toughness).toBe(7);
    expect(hasKw(dragon, KEYWORDS.FLYING.id)).toBe(true);
    expect(hasKw(dragon, KEYWORDS.TRAMPLE.id)).toBe(true);

    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dragon] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.p.bf.some(c => c.iid === 'palladia_mors-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'palladia_mors-1')).toBe(true);
  });

  it('is still sacrificed even when {R}{G}{W} was pre-loaded before the transition (mana burn clears the pool first -- same documented behavior as Stasis/Conversion)', () => {
    const dragon = makeReadyInstance('palladia_mors', 'p');
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dragon] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, R: 1, G: 1, W: 1 } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s1.p.bf.some(c => c.iid === 'palladia_mors-1')).toBe(false);
  });

  it('does not fire outside of the upkeep transition -- untouched through main phase 1', () => {
    const dragon = makeReadyInstance('palladia_mors', 'p');
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // MAIN_1 -> COMBAT_BEGIN
    expect(s1.p.bf.some(c => c.iid === 'palladia_mors-1')).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-batch-3 -- Nicol Bolas', () => {
  it('has correct card data and is sacrificed at upkeep when the {U}{B}{R} cost cannot be paid', () => {
    const dragon = makeReadyInstance('nicol_bolas', 'p');
    expect(dragon.type).toBe('Legendary Creature');
    expect(dragon.subtype).toBe('Elder Dragon');
    expect(dragon.cost).toBe('2UUBBRR');
    expect(dragon.cmc).toBe(8);
    expect(dragon.power).toBe(7);
    expect(dragon.toughness).toBe(7);
    expect(hasKw(dragon, KEYWORDS.FLYING.id)).toBe(true);

    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dragon] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.bf.some(c => c.iid === 'nicol_bolas-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'nicol_bolas-1')).toBe(true);
  });

  it('is still sacrificed even when {U}{B}{R} was pre-loaded before the transition (mana burn clears the pool first)', () => {
    const dragon = makeReadyInstance('nicol_bolas', 'p');
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dragon] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 1, B: 1, R: 1 } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s1.p.bf.some(c => c.iid === 'nicol_bolas-1')).toBe(false);
  });

  it('does not fire outside of the upkeep transition -- untouched through main phase 1', () => {
    const dragon = makeReadyInstance('nicol_bolas', 'p');
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.bf.some(c => c.iid === 'nicol_bolas-1')).toBe(true);
  });

  it('unblocked combat damage to the opponent discards their entire hand', () => {
    const dragon = makeReadyInstance('nicol_bolas', 'o');
    const oppHand = [
      makeSpell('h-1', { controller: 'p' }),
      makeSpell('h-2', { controller: 'p' }),
      makeSpell('h-3', { controller: 'p' }),
    ];
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [dragon], pHand: oppHand });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'nicol_bolas-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s5.p.hand.length).toBe(0);
    expect(s5.p.gy.map(c => c.iid).sort()).toEqual(['h-1', 'h-2', 'h-3']);
  });

  it('does not discard when Nicol Bolas deals damage to a blocking creature instead of a player', () => {
    const dragon = makeReadyInstance('nicol_bolas', 'o');
    // Nicol Bolas has flying -- the blocker needs flying/reach of its own to
    // legally block it, or DECLARE_BLOCKER silently no-ops (canBlockDuel gate)
    // and the attack goes through as if unblocked.
    const blocker = makeCreature('bl-1', { controller: 'p', power: 8, toughness: 8, keywords: [KEYWORDS.FLYING.id] });
    const oppHand = [makeSpell('h-1', { controller: 'p' })];
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [dragon], pBf: [blocker], pHand: oppHand });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'nicol_bolas-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'nicol_bolas-1', blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s6.p.hand.length).toBe(1);
  });
});

describe('@engine Scenario: legendary-creatures-batch-3 -- Vaevictis Asmadi', () => {
  it('has correct card data and is sacrificed at upkeep when the {B}{R}{G} cost cannot be paid', () => {
    const dragon = makeReadyInstance('vaevictis_asmadi', 'p');
    expect(dragon.type).toBe('Legendary Creature');
    expect(dragon.subtype).toBe('Elder Dragon');
    expect(dragon.cost).toBe('2BBRRGG');
    expect(dragon.cmc).toBe(8);
    expect(dragon.power).toBe(7);
    expect(dragon.toughness).toBe(7);
    expect(hasKw(dragon, KEYWORDS.FLYING.id)).toBe(true);
    expect(dragon.activatedAbilities.map(a => a.mana).sort()).toEqual(['B', 'G', 'R']);

    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dragon] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.bf.some(c => c.iid === 'vaevictis_asmadi-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'vaevictis_asmadi-1')).toBe(true);
  });

  it('is still sacrificed even when {B}{R}{G} was pre-loaded before the transition (mana burn clears the pool first)', () => {
    const dragon = makeReadyInstance('vaevictis_asmadi', 'p');
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [dragon] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1, R: 1, G: 1 } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s1.p.bf.some(c => c.iid === 'vaevictis_asmadi-1')).toBe(false);
  });

  it('does not fire outside of the upkeep transition -- untouched through main phase 1', () => {
    const dragon = makeReadyInstance('vaevictis_asmadi', 'p');
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.bf.some(c => c.iid === 'vaevictis_asmadi-1')).toBe(true);
  });

  it('each of the three {B}/{R}/{G} pump abilities independently grants +1/+0 until end of turn without tapping it', () => {
    const dragon = makeReadyInstance('vaevictis_asmadi', 'p');
    for (const [abilityId, color] of [['vaevictis_pump_b', 'B'], ['vaevictis_pump_r', 'R'], ['vaevictis_pump_g', 'G']]) {
      const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
      const state = { ...base, p: { ...base.p, mana: { ...base.p.mana, [color]: 1 } } };
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'vaevictis_asmadi-1', abilityId });
      expect(s1.p.mana[color]).toBe(0);
      expect(s1.p.bf.find(c => c.iid === 'vaevictis_asmadi-1').eotBuffs).toEqual([{ power: 1 }]);
      expect(s1.p.bf.find(c => c.iid === 'vaevictis_asmadi-1').tapped).toBe(false);
    }
  });

  it('stacks when more than one of the three pump abilities is activated the same turn (not mutually exclusive)', () => {
    const dragon = makeReadyInstance('vaevictis_asmadi', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
    const state = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1, G: 1 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'vaevictis_asmadi-1', abilityId: 'vaevictis_pump_b' });
    const s2 = duelReducer(s1, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'vaevictis_asmadi-1', abilityId: 'vaevictis_pump_r' });
    const s3 = duelReducer(s2, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'vaevictis_asmadi-1', abilityId: 'vaevictis_pump_g' });
    const finalCard = s3.p.bf.find(c => c.iid === 'vaevictis_asmadi-1');
    expect(finalCard.eotBuffs).toEqual([{ power: 1 }, { power: 1 }, { power: 1 }]);
    expect(s3.p.mana).toMatchObject({ B: 0, R: 0, G: 0 });
  });
});

describe('@engine Scenario: legendary-creatures-batch-3 -- legend rule integration', () => {
  it('checkLegendRule triggers when a player controls two copies of Nicol Bolas', () => {
    const leg1 = makeReadyInstance('nicol_bolas', 'p');
    const leg2 = { ...makeReadyInstance('nicol_bolas', 'p'), iid: 'nicol_bolas-2' };
    const state = makeState({ pBf: [leg1, leg2] });
    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).not.toBeNull();
    expect(s1.pendingChoice.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.legendName).toBe('Nicol Bolas');
    expect(s1.pendingChoice.options.map(o => o.id).sort()).toEqual(['nicol_bolas-1', 'nicol_bolas-2']);
  });
});
