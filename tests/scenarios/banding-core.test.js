// tests/scenarios/banding-core.test.js
// Banding core subsystem (CR 702.22): band formation validity, 702.22h/i
// blocked-propagation, the 702.22j/k damage-division choices, and the
// no-banding-present gating checks that keep ordinary combat unchanged.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

// Drives ADVANCE_PHASE forward, auto-resolving any banding damage-division
// choice with its first (default/natural-order) option -- the same fallback
// useDuelController.ts already applies for any pendingChoice.controller==='o'.
// Stops the instant phase reaches COMBAT_DAMAGE with no pendingChoice left,
// i.e. once combat has actually resolved.
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

// Advances from COMBAT_ATTACKERS through COMBAT_BLOCKERS declaration point
// (does not declare blocks itself) -- shared setup for every scenario below.
function toBlockersPhase(state) {
  const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
  return duelReducer(s1, { type: 'ADVANCE_PHASE' });        // -> COMBAT_BLOCKERS
}

describe('@engine Banding core (CR 702.22)', () => {

  // -- Band formation validity (702.22c) -------------------------------------

  it('FORM_BAND: two banding creatures form a band and share a bandId', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'] });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'] });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });

    const ca = s.o.bf.find(c => c.iid === 'a');
    const cb = s.o.bf.find(c => c.iid === 'b');
    expect(ca.bandId).toBeTruthy();
    expect(ca.bandId).toBe(cb.bandId);
  });

  it('FORM_BAND: one banding creature plus one without banding is a legal band', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'] });
    const b = makeCreature('b', { controller: 'o', keywords: [] });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });

    const ca = s.o.bf.find(c => c.iid === 'a');
    const cb = s.o.bf.find(c => c.iid === 'b');
    expect(ca.bandId).toBeTruthy();
    expect(cb.bandId).toBe(ca.bandId);
  });

  it('FORM_BAND: rejected when no member has banding', () => {
    const a = makeCreature('a', { controller: 'o', keywords: [] });
    const b = makeCreature('b', { controller: 'o', keywords: [] });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });

    expect(s.o.bf.find(c => c.iid === 'a').bandId).toBeFalsy();
    expect(s.o.bf.find(c => c.iid === 'b').bandId).toBeFalsy();
  });

  it('FORM_BAND: rejected when 2+ members lack banding ("up to one without")', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'] });
    const b = makeCreature('b', { controller: 'o', keywords: [] });
    const c = makeCreature('c', { controller: 'o', keywords: [] });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b, c] });
    for (const iid of ['a', 'b', 'c']) s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b', 'c'] });

    expect(s.o.bf.find(x => x.iid === 'a').bandId).toBeFalsy();
  });

  it('FORM_BAND: rejected when a member is not a declared attacker', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'] });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'] });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' }); // b never declared
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });

    expect(s.o.bf.find(x => x.iid === 'a').bandId).toBeFalsy();
  });

  it('FORM_BAND: rejected when a member is already in another band', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'] });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'] });
    const c = makeCreature('c', { controller: 'o', keywords: ['BANDING'] });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b, c] });
    for (const iid of ['a', 'b', 'c']) s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });
    const firstBandId = s.o.bf.find(x => x.iid === 'a').bandId;
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['b', 'c'] });

    // b's band membership from the first FORM_BAND call is untouched; c never joins.
    expect(s.o.bf.find(x => x.iid === 'b').bandId).toBe(firstBandId);
    expect(s.o.bf.find(x => x.iid === 'c').bandId).toBeFalsy();
  });

  // -- 702.22f: removed from combat -> removed from its band -----------------

  it('702.22f: un-declaring an attacker clears its bandId but leaves its bandmate alone', () => {
    // Vigilance so 'a' stays untapped after attacking -- DECLARE_ATTACKER's
    // own tapped guard otherwise blocks toggling a tapped attacker back off,
    // same restriction that applies with or without this feature.
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING', 'VIGILANCE'] });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'] });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });
    const bandId = s.o.bf.find(x => x.iid === 'a').bandId;

    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' }); // toggle a back off

    expect(s.attackers).not.toContain('a');
    expect(s.o.bf.find(x => x.iid === 'a').bandId).toBeFalsy();
    expect(s.o.bf.find(x => x.iid === 'b').bandId).toBe(bandId);
  });

  // -- 702.22h/i propagation + 702.22k division -------------------------------

  it('702.22h: blocking one band member blocks the whole band -- the unblocked-looking member deals no player damage', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 1, toughness: 5 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b], pBf: [x] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' }); // x blocks only a
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    s = runCombatDamage(s);

    // b was never directly blocked, but propagation means it counts as blocked
    // too -- if this regressed, b's un-blocked 2 power would drop p to 18.
    expect(s.p.life).toBe(20);
    // x's power (1) is divided between a and b (702.22k), not dealt in full to
    // each -- natural order is [a,b], so a gets the full share and b gets 0.
    expect(s.o.bf.find(c => c.iid === 'a').damage).toBe(1);
    expect(s.o.bf.find(c => c.iid === 'b').damage).toBe(0);
    expect(s.p.bf.find(c => c.iid === 'x').damage).toBe(4); // a's 2 + b's 2
  });

  it('702.22k: choosing a different damage-division order changes which band member dies', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 3, toughness: 10 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b], pBf: [x] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses for the 702.22k choice

    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice.kind).toBe('bandBlockerDamageOrder');
    // 702.22k: the ACTIVE player chooses (they control the blocked band).
    expect(s.pendingChoice.controller).toBe('o');

    // option 1 is the [b, a] order (see permutations()): b takes lethal (2)
    // first, a takes the 1 damage left over -- the reverse of natural order.
    const flippedOrder = s.pendingChoice.options.find(o => o.order[0] === 'b');
    s = duelReducer(s, { type: 'RESOLVE_CHOICE', optionId: flippedOrder.id });

    expect(s.o.bf.some(c => c.iid === 'b')).toBe(false); // b died
    expect(s.o.gy.some(c => c.iid === 'b')).toBe(true);
    expect(s.o.bf.find(c => c.iid === 'a').damage).toBe(1); // a survives with the remainder
  });

  // -- 702.22j gating and division --------------------------------------------

  it('702.22j gating: an ordinary double-block with no banding blocker queues no choice (unchanged automatic division)', () => {
    const a = makeCreature('a', { controller: 'o', keywords: [], power: 4, toughness: 4 });
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 1, toughness: 1 });
    const y = makeCreature('y', { controller: 'p', keywords: [], power: 1, toughness: 1 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a], pBf: [x, y] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'y' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE

    expect(s.pendingChoice).toBeFalsy();
    // Natural order [x,y]: x takes lethal (1) first, then y takes lethal (1);
    // the remaining 2 power is not assigned (no trample) -- both die.
    expect(s.p.bf.some(c => c.iid === 'x')).toBe(false);
    expect(s.p.bf.some(c => c.iid === 'y')).toBe(false);
  });

  it('702.22j gating: a double-block including one banding blocker queues a defending-player choice', () => {
    const a = makeCreature('a', { controller: 'o', keywords: [], power: 4, toughness: 4 });
    const x = makeCreature('x', { controller: 'p', keywords: ['BANDING'], power: 1, toughness: 3 });
    const y = makeCreature('y', { controller: 'p', keywords: [], power: 1, toughness: 3 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a], pBf: [x, y] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'y' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses

    expect(s.pendingChoice).toBeTruthy();
    expect(s.pendingChoice.kind).toBe('bandAttackerDamageOrder');
    // 702.22j: the DEFENDING player chooses, not a's controller.
    expect(s.pendingChoice.controller).toBe('p');
    expect(s.pendingChoice.options.length).toBe(2); // 2! permutations of [x,y]
  });

  it('702.22j: resolving with a different order changes which blocker dies', () => {
    const a = makeCreature('a', { controller: 'o', keywords: [], power: 4, toughness: 4 });
    const x = makeCreature('x', { controller: 'p', keywords: ['BANDING'], power: 1, toughness: 3 });
    const y = makeCreature('y', { controller: 'p', keywords: [], power: 1, toughness: 3 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a], pBf: [x, y] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'y' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // pauses for the choice

    // Natural order would be [x,y] (x dies). Pick the [y,x] order instead.
    const flippedOrder = s.pendingChoice.options.find(o => o.order[0] === 'y');
    s = duelReducer(s, { type: 'RESOLVE_CHOICE', optionId: flippedOrder.id });

    expect(s.p.bf.some(c => c.iid === 'y')).toBe(false); // y died instead
    expect(s.p.gy.some(c => c.iid === 'y')).toBe(true);
    expect(s.p.bf.find(c => c.iid === 'x').damage).toBe(1); // x survives with the remainder
  });

  // -- 702.22k gating ----------------------------------------------------------

  it('702.22k gating: a lone banding attacker (no band formed) double-blocked queues no choice', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 4, toughness: 4 });
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 1, toughness: 1 });
    const y = makeCreature('y', { controller: 'p', keywords: [], power: 1, toughness: 1 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a], pBf: [x, y] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' }); // never banded -- solo
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'y' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE

    expect(s.pendingChoice).toBeFalsy();
    expect(s.p.bf.some(c => c.iid === 'x')).toBe(false);
    expect(s.p.bf.some(c => c.iid === 'y')).toBe(false);
  });

  // -- Regression: banding keyword alone changes nothing without a band -------

  it('regression: a solo banding attacker blocked by one ordinary blocker resolves exactly like before this feature', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 2, toughness: 2 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a], pBf: [x] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE

    expect(s.pendingChoice).toBeFalsy();
    expect(s.o.bf.some(c => c.iid === 'a')).toBe(false); // mutual lethal trade, both die
    expect(s.p.bf.some(c => c.iid === 'x')).toBe(false);
  });

  // -- 702.22e: a band lasts the rest of combat even if banding is removed ----

  it('702.22e: band membership survives a member losing the banding keyword mid-combat', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'], power: 2, toughness: 2 });
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 1, toughness: 5 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b], pBf: [x] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['a', 'b'] });

    // Simulate a's banding keyword being stripped after the band already
    // formed -- membership is looked up live off bandId/s.attackers, never
    // re-validated against hasKw, so this must not evict a from the band.
    s = { ...s, o: { ...s.o, bf: s.o.bf.map(c => c.iid === 'a' ? { ...c, keywords: [] } : c) } };

    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = runCombatDamage(s);

    // b still counts as blocked via propagation despite a no longer having banding.
    expect(s.p.life).toBe(20);
  });

});
