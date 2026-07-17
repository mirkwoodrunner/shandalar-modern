// tests/scenarios/blaze-of-glory.test.js
// Blaze of Glory: "Cast this spell only during combat before blockers are
// declared. Target creature defending player controls can block any number
// of creatures this turn. It blocks each attacking creature this turn if
// able."
//
// Was the last remaining effect:"STUB" entry. Deferral reason ("blockers
// dict keyed by single blocker->single attacker can't represent one blocker
// blocking multiple attackers") is resolved by read-time synthesis: a new
// getBlockerRecipients(ns, bl) helper in DuelCore.js generalizes the banding
// subsystem's existing blocker-shares math (getEffectiveBlockers,
// computeBandBlockerShares, getNextBandingChoice) to also cover a flagged
// creature's synthesized multi-block coverage, with no stored multi-value
// blocking assignment. See docs/ENGINE_CONTRACT_SPEC.md Section 7.3 and
// docs/MECHANICS_INDEX.md -- Blaze of Glory.

import { describe, it, expect } from 'vitest';
import { duelReducer, getEffectiveBlockers } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import { getCardById } from '../../src/data/cards.js';

// Blaze of Glory as a hand card ready to cast.
function blazeInHand(iid, overrides = {}) {
  const def = getCardById('blaze_of_glory');
  return {
    iid, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
    ...def,
    ...overrides,
  };
}

function withMana(state, who, mana) {
  return { ...state, [who]: { ...state[who], mana: { ...state[who].mana, ...mana } } };
}

// Advances from COMBAT_ATTACKERS to COMBAT_AFTER_ATTACKERS -- the priority
// window Blaze of Glory's oracle text requires ("before blockers are
// declared"), one step before COMBAT_BLOCKERS.
function toAfterAttackersPhase(state) {
  return duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
}

// Advances from COMBAT_ATTACKERS through the COMBAT_BLOCKERS declaration
// point (does not declare blocks itself). Mirrors banding-core.test.js.
function toBlockersPhase(state) {
  const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
  return duelReducer(s1, { type: 'ADVANCE_PHASE' });        // -> COMBAT_BLOCKERS
}

// Drives ADVANCE_PHASE forward, auto-resolving any pendingChoice (banding OR
// Blaze of Glory damage-order) with its first (natural-order) option -- the
// same fallback useDuelController.ts already applies for any
// pendingChoice.controller==='o'. Mirrors banding-core.test.js's helper of
// the same name. Stops once combat has resolved (phase reaches
// COMBAT_DAMAGE with no pendingChoice left).
function runCombatDamage(state) {
  let s = state;
  while (true) {
    if (s.pendingChoice) {
      s = duelReducer(s, { type: 'RESOLVE_CHOICE', optionId: s.pendingChoice.options[0].id });
      continue;
    }
    if (s.phase === PHASE.COMBAT_DAMAGE) return s;
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
  }
}

// Full cast of Blaze of Glory by `who` targeting tgtIid, through the real
// reducer (CAST_SPELL -> RESOLVE_STACK). Blaze of Glory costs W.
function castBlaze(state, who, bogIid, tgtIid) {
  let s = withMana(state, who, { W: 1 });
  s = duelReducer(s, { type: 'CAST_SPELL', who, iid: bogIid, tgt: tgtIid });
  s = duelReducer(s, { type: 'RESOLVE_STACK' });
  return s;
}

describe('@engine-card-scenarios-3 Scenario: Blaze of Glory (multi-block grant)', () => {

  // -- Legality (BOG-01..06) ----------------------------------------------

  it('BOG-01: cast succeeds when phase is COMBAT_AFTER_ATTACKERS, attackers declared, target is a creature the defending player controls', () => {
    const attacker = makeCreature('att-1', { controller: 'o' });
    const target = makeCreature('bl-1', { controller: 'p' });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [target], pHand: [blazeInHand('bog-1')] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = toAfterAttackersPhase(s);
    s = withMana(s, 'p', { W: 1 });
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'bog-1', tgt: 'bl-1' });

    expect(s.stack.length).toBe(1);
    expect(s.p.hand.some(c => c.iid === 'bog-1')).toBe(false);
  });

  it('BOG-02: cast rejected during MAIN_1 (sorcery-speed window, no combat)', () => {
    const target = makeCreature('bl-1', { controller: 'o' });
    let s = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target], pHand: [blazeInHand('bog-1')] });
    s = withMana(s, 'p', { W: 1 });
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'bog-1', tgt: 'bl-1' });

    expect(s.stack.length).toBe(0);
    expect(s.p.hand.some(c => c.iid === 'bog-1')).toBe(true);
  });

  it('BOG-03: cast rejected during COMBAT_BLOCKERS (blockers already being declared)', () => {
    const attacker = makeCreature('att-1', { controller: 'o' });
    const target = makeCreature('bl-1', { controller: 'p' });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [target], pHand: [blazeInHand('bog-1')] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = toBlockersPhase(s);
    s = withMana(s, 'p', { W: 1 });
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'bog-1', tgt: 'bl-1' });

    expect(s.stack.length).toBe(0);
    expect(s.p.hand.some(c => c.iid === 'bog-1')).toBe(true);
  });

  it('BOG-04: cast rejected with zero attackers declared (phase is COMBAT_AFTER_ATTACKERS but s.attackers is empty)', () => {
    const target = makeCreature('bl-1', { controller: 'o' });
    let s = makeState({ phase: PHASE.COMBAT_AFTER_ATTACKERS, active: 'p', oBf: [target], pHand: [blazeInHand('bog-1')] });
    s = withMana(s, 'p', { W: 1 });
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'bog-1', tgt: 'bl-1' });

    expect(s.stack.length).toBe(0);
    expect(s.p.hand.some(c => c.iid === 'bog-1')).toBe(true);
  });

  it("BOG-05: cast rejected when target is controlled by the ATTACKING player (must be the defending player's creature)", () => {
    const attacker = makeCreature('att-1', { controller: 'o' });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pHand: [blazeInHand('bog-1')] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = toAfterAttackersPhase(s);
    s = withMana(s, 'p', { W: 1 });
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'bog-1', tgt: 'att-1' }); // att-1 belongs to 'o', the attacker

    expect(s.stack.length).toBe(0);
    expect(s.p.hand.some(c => c.iid === 'bog-1')).toBe(true);
  });

  it('BOG-06: cast rejected when target is a non-creature permanent', () => {
    const attacker = makeCreature('att-1', { controller: 'o' });
    const land = makeLand('land-1', { controller: 'p' });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [land], pHand: [blazeInHand('bog-1')] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = toAfterAttackersPhase(s);
    s = withMana(s, 'p', { W: 1 });
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'bog-1', tgt: 'land-1' });

    expect(s.stack.length).toBe(0);
    expect(s.p.hand.some(c => c.iid === 'bog-1')).toBe(true);
  });

  // -- Core mechanic (BOG-07..12) ------------------------------------------

  it("BOG-07: resolving sets blocksAllAttackers:true on the target", () => {
    const attacker = makeCreature('att-1', { controller: 'o' });
    const target = makeCreature('bl-1', { controller: 'p' });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [target], pHand: [blazeInHand('bog-1')] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = toAfterAttackersPhase(s);
    s = castBlaze(s, 'p', 'bog-1', 'bl-1');

    expect(s.p.bf.find(c => c.iid === 'bl-1').blocksAllAttackers).toBe(true);
  });

  it('BOG-08: a flagged creature with no explicit .blocking value still shows up in getEffectiveBlockers for every attacker it can legally block', () => {
    const att1 = makeCreature('att-1', { controller: 'o' });
    const att2 = makeCreature('att-2', { controller: 'o' });
    const blocker = makeCreature('bl-1', { controller: 'p', blocksAllAttackers: true });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [att1, att2], pBf: [blocker] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-2' });

    expect(s.p.bf.find(c => c.iid === 'bl-1').blocking).toBeNull();
    expect(getEffectiveBlockers(s, 'att-1').some(b => b.iid === 'bl-1')).toBe(true);
    expect(getEffectiveBlockers(s, 'att-2').some(b => b.iid === 'bl-1')).toBe(true);
  });

  it('BOG-09: "if able" -- a flagged creature that lacks flying is correctly EXCLUDED from blocking a flying attacker', () => {
    const flyingAtt = makeCreature('att-1', { controller: 'o', keywords: ['FLYING'] });
    const groundAtt = makeCreature('att-2', { controller: 'o' });
    const blocker = makeCreature('bl-1', { controller: 'p', blocksAllAttackers: true }); // no flying/reach
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [flyingAtt, groundAtt], pBf: [blocker] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-2' });

    expect(getEffectiveBlockers(s, 'att-1').some(b => b.iid === 'bl-1')).toBe(false);
    expect(getEffectiveBlockers(s, 'att-2').some(b => b.iid === 'bl-1')).toBe(true);
  });

  it('BOG-10: damage division -- a flagged creature (power 6) blocking two 3-toughness attackers with no stored order divides lethal-then-remainder in natural order', () => {
    const att1 = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3 });
    const att2 = makeCreature('att-2', { controller: 'o', power: 3, toughness: 3 });
    const blocker = makeCreature('bl-1', { controller: 'p', power: 6, toughness: 10, blocksAllAttackers: true });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [att1, att2], pBf: [blocker] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-2' });
    s = runCombatDamage(s);

    expect(s.o.bf.some(c => c.iid === 'att-1')).toBe(false); // took lethal (3)
    expect(s.o.bf.some(c => c.iid === 'att-2')).toBe(false); // took the remainder (3), also lethal
    expect(s.o.gy.some(c => c.iid === 'att-1')).toBe(true);
    expect(s.o.gy.some(c => c.iid === 'att-2')).toBe(true);
  });

  it("BOG-11: pendingChoice surfaces with kind 'blazeOfGloryDamageOrder' and controller equal to the flagged creature's OWN controller (not ns.active) when it blocks 2+ attackers", () => {
    const att1 = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3 });
    const att2 = makeCreature('att-2', { controller: 'o', power: 3, toughness: 3 });
    const blocker = makeCreature('bl-1', { controller: 'p', power: 6, toughness: 10, blocksAllAttackers: true });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [att1, att2], pBf: [blocker] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-2' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses for the choice

    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice.kind).toBe('blazeOfGloryDamageOrder');
    // ns.active is 'o' (the attacker) -- the choice must belong to bl-1's own
    // controller ('p'), per CR 509.2, NOT the active player (that would be
    // banding's 702.22k deviation, which this is not).
    expect(s.pendingChoice.controller).toBe('p');
  });

  it("BOG-12: the flagged creature receives full combined damage from ALL attackers it blocks -- each attacker's full power, independently, not divided", () => {
    const att1 = makeCreature('att-1', { controller: 'o', power: 4, toughness: 3 });
    const att2 = makeCreature('att-2', { controller: 'o', power: 5, toughness: 3 });
    const blocker = makeCreature('bl-1', { controller: 'p', power: 1, toughness: 20, blocksAllAttackers: true });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [att1, att2], pBf: [blocker] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-2' });
    s = runCombatDamage(s);

    // 4 + 5 = 9 combined, well short of bl-1's 20 toughness -- it survives.
    expect(s.p.bf.find(c => c.iid === 'bl-1').damage).toBe(9);
    expect(s.p.bf.some(c => c.iid === 'bl-1')).toBe(true);
  });

  // -- Cleanup / interactions (BOG-13..16) ---------------------------------

  it('BOG-13: blocksAllAttackers clears at end of turn', () => {
    const flagged = makeCreature('bl-1', { controller: 'p', blocksAllAttackers: true });
    const state = makeState({ phase: PHASE.END, active: 'p', pBf: [flagged] });

    const s = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP

    expect(s.phase).toBe(PHASE.CLEANUP);
    expect(s.p.bf.find(c => c.iid === 'bl-1').blocksAllAttackers).toBe(false);
  });

  it('BOG-14: a creature with an explicit block AND the flag still picks up every OTHER attacker via synthesis (no double-counting the explicit one)', () => {
    const att1 = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3 });
    const att2 = makeCreature('att-2', { controller: 'o', power: 3, toughness: 3 });
    const blocker = makeCreature('bl-1', { controller: 'p', power: 6, toughness: 10, blocksAllAttackers: true });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [att1, att2], pBf: [blocker] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-2' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' }); // explicit block of att-1 only

    expect(getEffectiveBlockers(s, 'att-1').map(b => b.iid)).toEqual(['bl-1']);
    expect(getEffectiveBlockers(s, 'att-2').map(b => b.iid)).toEqual(['bl-1']);

    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses

    // Exactly 2 recipients (att-1, att-2), not 3 -- att-1 isn't counted twice
    // (once from the explicit block, once from synthesis).
    expect(s.pendingChoice.options.length).toBe(2);
    expect(s.pendingChoice.options[0].order).toHaveLength(2);

    s = runCombatDamage(s);
    expect(s.o.bf.some(c => c.iid === 'att-1')).toBe(false);
    expect(s.o.bf.some(c => c.iid === 'att-2')).toBe(false);
    expect(s.p.bf.find(c => c.iid === 'bl-1').damage).toBe(6);
  });

  it("BOG-15: the ATTACKING player may cast Blaze of Glory targeting the defending player's creature (oracle text does not restrict the caster)", () => {
    const attacker = makeCreature('att-1', { controller: 'p', power: 3, toughness: 3 });
    const defenderCreature = makeCreature('bl-1', { controller: 'o', power: 2, toughness: 5 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [attacker], oBf: [defenderCreature], pHand: [blazeInHand('bog-1')] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = toAfterAttackersPhase(s);
    s = withMana(s, 'p', { W: 1 });
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'bog-1', tgt: 'bl-1' });

    expect(s.stack.length).toBe(1); // legal even though the caster is the attacking player

    s = duelReducer(s, { type: 'RESOLVE_STACK' });
    expect(s.o.bf.find(c => c.iid === 'bl-1').blocksAllAttackers).toBe(true);
  });

  it('BOG-16: two independent Blaze of Glory targets in the same combat -- no crash, each gets correct independent recipients', () => {
    const att1 = makeCreature('att-1', { controller: 'o' });
    const att2 = makeCreature('att-2', { controller: 'o' });
    const bl1 = makeCreature('bl-1', { controller: 'p', blocksAllAttackers: true });
    const bl2 = makeCreature('bl-2', { controller: 'p', blocksAllAttackers: true });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [att1, att2], pBf: [bl1, bl2] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-2' });

    expect(() => getEffectiveBlockers(s, 'att-1')).not.toThrow();
    expect(getEffectiveBlockers(s, 'att-1').map(b => b.iid).sort()).toEqual(['bl-1', 'bl-2']);
    expect(getEffectiveBlockers(s, 'att-2').map(b => b.iid).sort()).toEqual(['bl-1', 'bl-2']);
  });

  // -- Regression / meta (BOG-17..18) --------------------------------------

  it('BOG-17: ordinary combat with zero blocksAllAttackers creatures produces byte-identical results to pre-change behavior for a simple 1-attacker/1-blocker scenario', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 2, toughness: 2 });
    const blocker = makeCreature('bl-1', { controller: 'p', power: 2, toughness: 2 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [blocker] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves fully

    expect(s.pendingChoice).toBeFalsy();
    expect(s.o.bf.some(c => c.iid === 'att-1')).toBe(false);
    expect(s.p.bf.some(c => c.iid === 'bl-1')).toBe(false);
  });

  it('BOG-18: a banding scenario is unaffected -- bandBlockerDamageOrder\'s controller: ns.active is unchanged when the multi-recipient situation is purely band-based, not BoG-based', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 3, toughness: 10 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b], pBf: [x] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses

    expect(s.pendingChoice.kind).toBe('bandBlockerDamageOrder');
    expect(s.pendingChoice.controller).toBe('o'); // ns.active, NOT x's own controller ('p')
  });

});
