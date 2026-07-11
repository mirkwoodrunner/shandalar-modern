// tests/scenarios/library-of-leng.test.js
// Library of Leng Phase 2: the first production DISCARD_REPLACEMENTS
// consumer (discard centralization Phase 1 shipped the empty registry) and
// the "no maximum hand size" half of the card. See
// docs/ENGINE_CONTRACT_SPEC.md S7.7 and docs/MECHANICS_INDEX.md.

import { describe, it, expect, vi } from 'vitest';
import { duelReducer, discardCard, DISCARD_REPLACEMENTS, makeCardInstance, drawD } from '../../src/engine/DuelCore.js';
import { chooseDiscardToLibrary } from '../../src/engine/AI.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

// Same synthetic watcher shape as discard-centralization.test.js's DISC-04 --
// reacts to ON_DISCARD with the existing 'dealDamageToController' triggered
// effect rather than inventing a test-only effect type.
function makeDiscardWatcher(iid, controller = 'p') {
  return {
    iid, id: 'test_discard_watcher', name: 'Test Discard Watcher', type: 'Enchantment', color: '',
    cmc: 0, cost: '', keywords: [], tapped: false, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller,
    triggeredAbilities: [{
      id: 'watch_discard', trigger: { event: 'ON_DISCARD' },
      effect: { type: 'dealDamageToController', amount: 1 },
    }],
  };
}

describe('@engine Scenario: Library of Leng Phase 2', () => {
  it('LENG-01: p controls Leng with a 10-card hand -- cleanup causes zero discards', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const hand = Array.from({ length: 10 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const base = makeState({ pBf: [leng], pHand: hand, phase: PHASE.END, active: 'p' });
    const state = { ...base, ruleset: { ...base.ruleset, maxHandSize: 7 } };

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP

    expect(ns.p.hand.length).toBe(10);
    expect(ns.p.gy.length).toBe(0);
  });

  it('LENG-02: o controls Leng with a 10-card hand at its own cleanup -- zero discards (symmetry)', () => {
    const leng = makeCardInstance('library_of_leng', 'o');
    const hand = Array.from({ length: 10 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const base = makeState({ oBf: [leng], oHand: hand, phase: PHASE.END, active: 'o' });
    const state = { ...base, ruleset: { ...base.ruleset, maxHandSize: 7 } };

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP

    expect(ns.o.hand.length).toBe(10);
    expect(ns.o.gy.length).toBe(0);
  });

  it('LENG-03: no Leng on the active players bf -- cleanup discards down to maxHandSize exactly (parity guard)', () => {
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const base = makeState({ pHand: hand, phase: PHASE.END, active: 'p' });
    const state = { ...base, ruleset: { ...base.ruleset, maxHandSize: 7 } };

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(ns.p.hand.length).toBe(7);
    expect(ns.p.gy.map(c => c.iid)).toEqual(['c8', 'c7']);
  });

  it('LENG-04: Leng leaves the battlefield before cleanup -- discard rule resumes', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const hand = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const base = makeState({ pBf: [leng], pHand: hand, phase: PHASE.END, active: 'p' });
    let state = { ...base, ruleset: { ...base.ruleset, maxHandSize: 7 } };
    state = { ...state, p: { ...state.p, bf: [] } }; // Leng leaves the battlefield

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(ns.p.hand.length).toBe(7);
    expect(ns.p.gy.map(c => c.iid)).toEqual(['c8', 'c7']);
  });

  it('LENG-05: effect discard for p with Leng creates a discardToLibraryChoice', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const card = makeSpell('s1', { id: 'lightning_bolt', name: 'Card One' });
    const state = makeState({ pBf: [leng], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(ns.p.gy.map(c => c.iid)).toEqual(['s1']);
    expect(ns.p.hand).toEqual([]);
    expect(ns.pendingChoice).toBeTruthy();
    expect(ns.pendingChoice.kind).toBe('discardToLibraryChoice');
    expect(ns.pendingChoice.controller).toBe('p');
    expect(ns.pendingChoice.cardIid).toBe('s1');
  });

  it("LENG-06: RESOLVE_CHOICE 'graveyard' keeps the card in gy and clears pendingChoice", () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [leng], pHand: [card] });
    const s1 = discardCard(state, 'p', 's1', { cause: 'effect' });

    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'graveyard' });

    expect(s2.p.gy.map(c => c.iid)).toEqual(['s1']);
    expect(s2.pendingChoice).toBeNull();
  });

  it("LENG-07: RESOLVE_CHOICE 'library' puts the card on top of the library (next draw yields it)", () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const card = makeSpell('s1', { id: 'lightning_bolt', name: 'Card One' });
    const existingLibCard = makeSpell('lib1', { id: 'lightning_bolt', name: 'Existing Lib Card' });
    const state = makeState({ pBf: [leng], pHand: [card] });
    const withLib = { ...state, p: { ...state.p, lib: [existingLibCard] } };
    const s1 = discardCard(withLib, 'p', 's1', { cause: 'effect' });

    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'library' });

    expect(s2.p.gy).toEqual([]);
    expect(s2.p.lib.map(c => c.iid)).toEqual(['s1', 'lib1']);
    expect(s2.pendingChoice).toBeNull();

    const s3 = drawD(s2, 'p');
    expect(s3.p.hand.map(c => c.iid)).toEqual(['s1']);
  });

  it('LENG-08: ON_DISCARD still fires through a Leng-intercepted discard, before the choice resolves', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const watcher = makeDiscardWatcher('w1', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [leng, watcher], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(ns.p.life).toBe(19);
    expect(ns.pendingChoice?.kind).toBe('discardToLibraryChoice');
  });

  it("LENG-09: Jandor's Ring discardLastDrawn (cause:cost) is not intercepted by Leng", () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const ring = makeCardInstance('jandorss_ring', 'p');
    const last = makeSpell('last', { id: 'lightning_bolt', name: 'Last Drawn' });
    const drawn = makeSpell('drawn', { id: 'lightning_bolt', name: 'Freshly Drawn' });
    const state = makeState({ pBf: [leng, ring], pHand: [last], phase: PHASE.MAIN_1 });
    const ready = { ...state, p: { ...state.p, lib: [drawn], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(ready, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ring.iid });

    expect(s1.p.hand).toEqual([]);
    expect(s1.p.gy.map(c => c.iid)).toEqual(['last']);
    expect(s1.pendingChoice).toBeNull();
  });

  it("LENG-10: opponent's effect discard while only p controls Leng -- no choice for o, plain discard", () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const card = makeSpell('o1');
    const state = makeState({ pBf: [leng], oHand: [card] });

    const ns = discardCard(state, 'o', 'o1', { cause: 'effect' });

    expect(ns.o.hand).toEqual([]);
    expect(ns.o.gy.map(c => c.iid)).toEqual(['o1']);
    expect(ns.pendingChoice).toBeNull();
  });

  it('LENG-11: multi-discard chaining -- Wheel of Fortune chains 7 discards through one pendingChoice', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const wheel = makeCardInstance('wheel_of_fortune', 'p');
    const pHandCards = Array.from({ length: 7 }, (_, i) => makeSpell(`ph${i}`, { id: 'lightning_bolt', name: `ph${i}` }));
    const pLib = Array.from({ length: 7 }, (_, i) => makeSpell(`pl${i}`, { id: 'lightning_bolt', name: `pl${i}` }));
    const oLib = Array.from({ length: 7 }, (_, i) => makeSpell(`ol${i}`, { id: 'lightning_bolt', name: `ol${i}` }));
    const state = makeState({ pBf: [leng], pHand: [wheel, ...pHandCards], phase: PHASE.MAIN_1 });
    let ready = { ...state, p: { ...state.p, lib: pLib, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 2 } } };
    ready = { ...ready, o: { ...ready.o, lib: oLib } };

    const s1 = duelReducer(ready, { type: 'CAST_SPELL', who: 'p', iid: wheel.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    // All 7 of p's non-Wheel hand cards were discarded (real gy membership,
    // per Assumption A) before any choice resolves, then p redrew 7 from its
    // library and Wheel itself joined the gy via the generic post-resolution
    // sorcery cleanup.
    expect(s2.p.gy.map(c => c.iid)).toEqual(['ph0', 'ph1', 'ph2', 'ph3', 'ph4', 'ph5', 'ph6', wheel.iid]);
    expect(s2.p.hand.map(c => c.iid)).toEqual(['pl0', 'pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6']);
    expect(s2.pendingChoice?.kind).toBe('discardToLibraryChoice');
    expect(s2.pendingChoice.controller).toBe('p');
    expect(s2.pendingChoice.cardIid).toBe('ph0');
    expect(s2.pendingChoice.queuedIids).toEqual(['ph1', 'ph2', 'ph3', 'ph4', 'ph5', 'ph6']);

    // Resolve all 7 in order, alternating answers.
    const answers = ['library', 'graveyard', 'library', 'graveyard', 'library', 'graveyard', 'library'];
    let ns = s2;
    for (const optionId of answers) {
      expect(ns.pendingChoice).toBeTruthy();
      ns = duelReducer(ns, { type: 'RESOLVE_CHOICE', optionId });
    }

    expect(ns.pendingChoice).toBeNull();
    // ph0, ph2, ph4, ph6 chose 'library' (lifted, most recent on top);
    // ph1, ph3, ph5 chose 'graveyard' and stayed, alongside Wheel itself.
    expect(ns.p.lib.map(c => c.iid)).toEqual(['ph6', 'ph4', 'ph2', 'ph0']);
    expect(ns.p.gy.map(c => c.iid)).toEqual(['ph1', 'ph3', 'ph5', wheel.iid]);
  });

  it('LENG-12: chaining fizzle -- a queued card missing from gy fizzles and the chain advances', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const a = makeSpell('a', { id: 'lightning_bolt', name: 'Card A' });
    const b = makeSpell('b', { id: 'lightning_bolt', name: 'Card B' });
    const c = makeSpell('c', { id: 'lightning_bolt', name: 'Card C' });
    const state = makeState({ pBf: [leng], pHand: [a, b, c] });

    let ns = discardCard(state, 'p', 'a', { cause: 'effect' });
    ns = discardCard(ns, 'p', 'b', { cause: 'effect' });
    ns = discardCard(ns, 'p', 'c', { cause: 'effect' });

    expect(ns.pendingChoice.cardIid).toBe('a');
    expect(ns.pendingChoice.queuedIids).toEqual(['b', 'c']);

    const s1 = duelReducer(ns, { type: 'RESOLVE_CHOICE', optionId: 'graveyard' }); // resolves a, advances to b
    expect(s1.pendingChoice.cardIid).toBe('b');
    expect(s1.pendingChoice.queuedIids).toEqual(['c']);

    // Something else removes b from the graveyard before its choice resolves.
    const tampered = { ...s1, p: { ...s1.p, gy: s1.p.gy.filter(x => x.iid !== 'b') } };

    const s2 = duelReducer(tampered, { type: 'RESOLVE_CHOICE', optionId: 'library' });
    expect(s2.log.some(l => l.text.includes('no longer in the graveyard'))).toBe(true);
    expect(s2.pendingChoice.cardIid).toBe('c');
    expect(s2.pendingChoice.queuedIids).toEqual([]);
    expect(s2.p.lib.some(x => x.iid === 'b')).toBe(false); // b was not lifted -- fizzled

    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'graveyard' });
    expect(s3.pendingChoice).toBeNull();
    expect(s3.p.gy.map(x => x.iid).sort()).toEqual(['a', 'c']);
  });

  it('LENG-13: pendingChoice collision -- console.error, existing choice untouched, card stays in gy', () => {
    const leng = makeCardInstance('library_of_leng', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [leng], pHand: [card] });
    const syntheticChoice = { id: 'choice_synthetic', kind: 'colorChoice', sourceCardId: 'other', controller: 'p', options: [], required: true, targetIid: 'x' };
    const occupied = { ...state, pendingChoice: syntheticChoice };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ns = discardCard(occupied, 'p', 's1', { cause: 'effect' });

    expect(ns.p.gy.map(c => c.iid)).toEqual(['s1']);
    expect(ns.p.hand).toEqual([]);
    expect(ns.pendingChoice).toEqual(syntheticChoice);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('LENG-14: chooseDiscardToLibrary policy unit', () => {
    const lands = [makeLand('l1', { controller: 'o' }), makeLand('l2', { controller: 'o' })];
    const baseState = makeState({ oBf: lands });

    const cheapNonland = makeSpell('cheap', { id: 'lightning_bolt', name: 'Cheap', cmc: 1, type: 'Instant' });
    const s1 = { ...baseState, o: { ...baseState.o, gy: [cheapNonland] } };
    expect(chooseDiscardToLibrary({ cardIid: 'cheap' }, s1)).toBe('library');

    const land = makeLand('land1', { controller: 'o' });
    const s2 = { ...baseState, o: { ...baseState.o, gy: [land] } };
    expect(chooseDiscardToLibrary({ cardIid: 'land1' }, s2)).toBe('graveyard');

    const expensive = makeSpell('expensive', { id: 'lightning_bolt', name: 'Expensive', cmc: 5, type: 'Sorcery' });
    const s3 = { ...baseState, o: { ...baseState.o, gy: [expensive] } };
    expect(chooseDiscardToLibrary({ cardIid: 'expensive' }, s3)).toBe('graveyard');

    const s4 = { ...baseState, o: { ...baseState.o, gy: [] } };
    expect(chooseDiscardToLibrary({ cardIid: 'missing' }, s4)).toBe('graveyard');
  });

  it('LENG-15: AI end-to-end at engine level -- o controls Leng, policy answer resolves the choice', () => {
    const leng = makeCardInstance('library_of_leng', 'o');
    const oLand = makeLand('ol1', { controller: 'o' });
    const card = makeSpell('oc1', { id: 'lightning_bolt', name: 'Opp Card', cmc: 1, type: 'Instant' });
    const state = makeState({ oBf: [leng, oLand], oHand: [card] });

    const s1 = discardCard(state, 'o', 'oc1', { cause: 'effect' });
    expect(s1.pendingChoice.controller).toBe('o');

    const answer = chooseDiscardToLibrary(s1.pendingChoice, s1);
    expect(answer).toBe('library'); // cmc 1 <= 1 AI-controlled land

    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: answer });

    expect(s2.pendingChoice).toBeNull();
    expect(s2.o.lib.map(c => c.iid)).toEqual(['oc1']);
  });

  it('LENG-16: registry hygiene -- DISCARD_REPLACEMENTS contains exactly the library_of_leng key', () => {
    expect(Object.keys(DISCARD_REPLACEMENTS)).toEqual(['library_of_leng']);
  });
});
