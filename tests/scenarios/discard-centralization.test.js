// tests/scenarios/discard-centralization.test.js
// Discard centralization Phase 1: every "card moves from hand to graveyard as
// a discard" mutation site in DuelCore.js now routes through the single
// discardCard() choke point, which consults a (currently empty)
// DISCARD_REPLACEMENTS registry before mutating and emits a new ON_DISCARD
// event (paired with an immediate processTriggerQueue) after the mutation.
// See docs/ENGINE_CONTRACT_SPEC.md S7.7 and docs/MECHANICS_INDEX.md.

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { duelReducer, discardCard, DISCARD_REPLACEMENTS, makeCardInstance } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

// A minimal watcher permanent that reacts to ON_DISCARD by dealing 1 damage
// to its own controller, reusing the existing 'dealDamageToController'
// triggered effect (already registered for other cards) rather than inventing
// a test-only effect type.
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

function makeReplacerPermanent(iid, controller = 'p') {
  return {
    iid, id: 'test_replacer', name: 'Test Replacer', type: 'Artifact', color: '',
    cmc: 0, cost: '', keywords: [], tapped: false, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller,
  };
}

describe('@engine Scenario: discard centralization Phase 1', () => {
  afterEach(() => {
    delete DISCARD_REPLACEMENTS['test_replacer'];
  });

  // --- Infrastructure (9) -----------------------------------------------

  it('DISC-01: discardCard basic -- card leaves hand, appears at end of gy, state otherwise untouched', () => {
    const card = makeSpell('s1', { id: 'lightning_bolt', name: 'Lightning Bolt' });
    const existingGy = [makeSpell('gy1', { id: 'terror', name: 'Terror' })];
    let state = makeState({ pHand: [card] });
    state = { ...state, p: { ...state.p, gy: existingGy } };

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(ns.p.hand).toEqual([]);
    expect(ns.p.gy).toEqual([...existingGy, card]);
    expect(ns.p.life).toBe(state.p.life);
    expect(ns.phase).toBe(state.phase);
  });

  it('DISC-02: iid not in hand -- state returned unchanged, console.error called', () => {
    const state = makeState({ pHand: [] });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ns = discardCard(state, 'p', 'does-not-exist', { cause: 'effect' });

    expect(ns).toBe(state);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('DISC-03: missing cause throws; invalid cause string throws', () => {
    const card = makeSpell('s1');
    const state = makeState({ pHand: [card] });

    expect(() => discardCard(state, 'p', 's1')).toThrow();
    expect(() => discardCard(state, 'p', 's1', {})).toThrow();
    expect(() => discardCard(state, 'p', 's1', { cause: 'bogus' })).toThrow();
  });

  it('DISC-04: ON_DISCARD wiring -- synthetic battlefield card fires on discard', () => {
    const watcher = makeDiscardWatcher('w1', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [watcher], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(ns.p.life).toBe(19);
  });

  it('DISC-05: ON_DISCARD trigger resolves immediately within the same call (processTriggerQueue pairing), not left queued', () => {
    const watcher = makeDiscardWatcher('w1', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [watcher], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(ns.triggerQueue).toEqual([]);
    expect(ns.p.life).toBe(19);
  });

  it('DISC-06: matching DISCARD_REPLACEMENTS entry intercepts -- apply result returned, gy unchanged, no ON_DISCARD emitted', () => {
    let applyCalled = false;
    DISCARD_REPLACEMENTS['test_replacer'] = {
      matches: () => true,
      apply: (state) => {
        applyCalled = true;
        return { ...state, p: { ...state.p, life: state.p.life - 5 } };
      },
    };
    // Watcher would take life to 20-1=19 if ON_DISCARD fired -- combined with
    // the replacement's own -5, distinguishing "intercepted" (15) from
    // "intercepted AND still emitted" (14) from "not intercepted" (19).
    const watcher = makeDiscardWatcher('w1', 'p');
    const replacer = makeReplacerPermanent('r1', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [replacer, watcher], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(applyCalled).toBe(true);
    expect(ns.p.gy).toEqual([]);
    expect(ns.p.hand).toEqual([card]);
    expect(ns.p.life).toBe(15);
  });

  it('DISC-07: one-shot guard -- a replacement whose apply() calls discardCard again does not recurse into itself', () => {
    let interceptCount = 0;
    DISCARD_REPLACEMENTS['test_replacer'] = {
      matches: () => true,
      apply: (state, who, payload) => {
        interceptCount++;
        // Remove self from the battlefield before recursing, so the nested
        // discardCard call's replacement scan no longer finds this entry --
        // the real discard proceeds instead of matching again.
        const withoutSelf = { ...state, [who]: { ...state[who], bf: state[who].bf.filter(c => c.id !== 'test_replacer') } };
        return discardCard(withoutSelf, who, payload.iid, { cause: payload.cause, sourceName: payload.sourceName });
      },
    };
    const replacer = makeReplacerPermanent('r1', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [replacer], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(interceptCount).toBe(1);
    expect(ns.p.hand).toEqual([]);
    expect(ns.p.gy).toEqual([card]);
  });

  it('DISC-08: non-matching DISCARD_REPLACEMENTS entry -- normal discard proceeds, ON_DISCARD emitted', () => {
    DISCARD_REPLACEMENTS['test_replacer'] = {
      matches: () => false,
      apply: () => { throw new Error('apply should not be called'); },
    };
    const watcher = makeDiscardWatcher('w1', 'p');
    const replacer = makeReplacerPermanent('r1', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [replacer, watcher], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'effect' });

    expect(ns.p.hand).toEqual([]);
    expect(ns.p.gy).toEqual([card]);
    expect(ns.p.life).toBe(19);
  });

  it('DISC-09: a replacement matching only cause==="effect" does not intercept a cause:"cost" discard', () => {
    DISCARD_REPLACEMENTS['test_replacer'] = {
      matches: (state, who, payload) => payload.cause === 'effect',
      apply: () => { throw new Error('apply should not be called'); },
    };
    const replacer = makeReplacerPermanent('r1', 'p');
    const card = makeSpell('s1');
    const state = makeState({ pBf: [replacer], pHand: [card] });

    const ns = discardCard(state, 'p', 's1', { cause: 'cost' });

    expect(ns.p.hand).toEqual([]);
    expect(ns.p.gy).toEqual([card]);
  });

  // --- Parity (14) ---------------------------------------------------------

  it('DISC-P01: Bazaar of Baghdad draw-followup discards the 3 most recently drawn/held cards, verbatim dlog', () => {
    const bazaar = makeCardInstance('bazaar_of_baghdad', 'p');
    const a = makeSpell('a', { id: 'lightning_bolt', name: 'Card A' });
    const b = makeSpell('b', { id: 'lightning_bolt', name: 'Card B' });
    const c = makeSpell('c', { id: 'lightning_bolt', name: 'Card C' });
    const d = makeSpell('d', { id: 'lightning_bolt', name: 'Card D' });
    const e = makeSpell('e', { id: 'lightning_bolt', name: 'Card E' });
    const state = makeState({ pBf: [bazaar], pHand: [a, b, c], phase: PHASE.MAIN_1 });
    const withLib = { ...state, p: { ...state.p, lib: [d, e] } };

    const s1 = duelReducer(withLib, { type: 'ACTIVATE_ABILITY', who: 'p', iid: bazaar.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.hand.map(x => x.iid)).toEqual(['a', 'b']);
    expect(s2.p.gy.map(x => x.iid)).toEqual(['e', 'd', 'c']);
    expect(s2.log.some(l => l.text === 'Bazaar: drew 2, discarded 3.')).toBe(true);
  });

  it('DISC-P02: Jalum Tome draws then discards the drawn card, verbatim dlog', () => {
    const tome = makeCardInstance('jalum_tome', 'p');
    const x = makeSpell('x', { id: 'lightning_bolt', name: 'Card X' });
    const state = makeState({ pBf: [tome], pHand: [], phase: PHASE.MAIN_1 });
    const ready = { ...state, p: { ...state.p, lib: [x], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(ready, { type: 'ACTIVATE_ABILITY', who: 'p', iid: tome.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.hand).toEqual([]);
    expect(s2.p.gy.map(c => c.iid)).toEqual(['x']);
    expect(s2.log.some(l => l.text === 'Jalum Tome: p discards Card X.')).toBe(true);
  });

  it('DISC-P03: Sindbad draws, reveals, and discards a nonland draw, verbatim dlog', () => {
    const sindbad = makeCardInstance('sindbad', 'p');
    const nonland = makeSpell('nl', { id: 'lightning_bolt', name: 'Nonland Card' });
    const state = makeState({ pBf: [sindbad], pHand: [], phase: PHASE.MAIN_1 });
    const ready = { ...state, p: { ...state.p, lib: [nonland] } };

    const s1 = duelReducer(ready, { type: 'ACTIVATE_ABILITY', who: 'p', iid: sindbad.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.hand).toEqual([]);
    expect(s2.p.gy.map(c => c.iid)).toEqual(['nl']);
    expect(s2.log.some(l => l.text === 'Sindbad: p reveals Nonland Card.')).toBe(true);
    expect(s2.log.some(l => l.text === "Sindbad: Nonland Card isn't a land -- discarded.")).toBe(true);
  });

  it('DISC-P04: discardX (Mind Twist) discards X=2 random cards from the opponent, verbatim dlog format', () => {
    const twist = makeCardInstance('mind_twist', 'p');
    const o1 = makeSpell('o1', { id: 'lightning_bolt', name: 'Same Name' });
    const o2 = makeSpell('o2', { id: 'lightning_bolt', name: 'Same Name' });
    const o3 = makeSpell('o3', { id: 'lightning_bolt', name: 'Same Name' });
    const state = makeState({ pHand: [twist], oHand: [o1, o2, o3], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: twist.iid, xVal: 2 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.o.hand.length).toBe(1);
    expect(s2.o.gy.length).toBe(2);
    const discardLines = s2.log.filter(l => l.text === 'o discards Same Name.');
    expect(discardLines.length).toBe(2);
  });

  it('DISC-P05: discardOne (Disrupting Scepter) discards a card from the opponent, verbatim dlog', () => {
    const scepter = makeCardInstance('disrupting_scepter', 'p');
    const only = makeSpell('only', { id: 'lightning_bolt', name: 'Only Card' });
    const state = makeState({ pBf: [scepter], oHand: [only], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } };

    const s1 = duelReducer(withMana, { type: 'ACTIVATE_ABILITY', who: 'p', iid: scepter.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.o.hand).toEqual([]);
    expect(s2.o.gy.map(c => c.iid)).toEqual(['only']);
    expect(s2.log.some(l => l.text === 'o discards Only Card.')).toBe(true);
  });

  it('DISC-P06: Wheel of Fortune discards both full hands then redraws 7 each, verbatim dlog', () => {
    const wheel = makeCardInstance('wheel_of_fortune', 'p');
    const pHandCards = ['ph1', 'ph2'].map(id => makeSpell(id, { id: 'lightning_bolt', name: id }));
    const oHandCards = ['oh1', 'oh2', 'oh3'].map(id => makeSpell(id, { id: 'lightning_bolt', name: id }));
    const pLib = Array.from({ length: 7 }, (_, i) => makeSpell(`pl${i}`, { id: 'lightning_bolt', name: `pl${i}` }));
    const oLib = Array.from({ length: 7 }, (_, i) => makeSpell(`ol${i}`, { id: 'lightning_bolt', name: `ol${i}` }));
    const state = makeState({ pHand: [wheel, ...pHandCards], oHand: oHandCards, phase: PHASE.MAIN_1 });
    let ready = { ...state, p: { ...state.p, lib: pLib, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 2 } } };
    ready = { ...ready, o: { ...ready.o, lib: oLib } };

    const s1 = duelReducer(ready, { type: 'CAST_SPELL', who: 'p', iid: wheel.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.hand.length).toBe(7);
    expect(s2.o.hand.length).toBe(7);
    // Wheel of Fortune itself (a sorcery) joins its caster's gy after resolving
    // -- the generic non-permanent-spell cleanup in RESOLVE_STACK, unrelated to
    // and unaffected by this migration.
    expect(s2.p.gy.map(c => c.iid)).toEqual(['ph1', 'ph2', wheel.iid]);
    expect(s2.o.gy.map(c => c.iid)).toEqual(['oh1', 'oh2', 'oh3']);
    expect(s2.log.some(l => l.text === 'Wheel of Fortune!')).toBe(true);
  });

  it('DISC-P07: Balance discards down to the smaller hand, verbatim dlog', () => {
    const balance = makeCardInstance('balance', 'p');
    const pHandCards = ['ph1', 'ph2', 'ph3'].map(id => makeSpell(id, { id: 'lightning_bolt', name: id }));
    const oHandCards = ['oh1'].map(id => makeSpell(id, { id: 'lightning_bolt', name: id }));
    const state = makeState({ pHand: [balance, ...pHandCards], oHand: oHandCards, phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: balance.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.hand.map(c => c.iid)).toEqual(['ph1']);
    // Balance itself (a sorcery) joins its caster's gy after resolving -- the
    // generic non-permanent-spell cleanup in RESOLVE_STACK, unrelated to and
    // unaffected by this migration.
    expect(s2.p.gy.map(c => c.iid)).toEqual(['ph3', 'ph2', balance.iid]);
    expect(s2.o.hand.map(c => c.iid)).toEqual(['oh1']);
    expect(s2.log.some(l => l.text === 'Balance: permanents and hands equalized.')).toBe(true);
  });

  it('DISC-P08: Amnesia discards all nonland cards from the target, preserving order, verbatim summary dlog', () => {
    const amnesia = makeCardInstance('amnesia', 'p');
    const land = { iid: 'ol', id: 'forest', name: 'Forest', type: 'Land', subtype: 'Forest', color: '', cmc: 0, cost: '', keywords: [], tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o', produces: ['G'] };
    const nl1 = makeSpell('onl1', { id: 'lightning_bolt', name: 'Nonland 1' });
    const nl2 = makeSpell('onl2', { id: 'lightning_bolt', name: 'Nonland 2' });
    const state = makeState({ pHand: [amnesia], oHand: [land, nl1, nl2], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { W: 0, U: 3, B: 0, R: 0, G: 0, C: 3 } } };

    const s1 = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: amnesia.iid, tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.o.hand.map(c => c.iid)).toEqual(['ol']);
    expect(s2.o.gy.map(c => c.iid)).toEqual(['onl1', 'onl2']);
    expect(s2.log.some(l => l.text === 'Amnesia: o reveals hand and discards 2 nonland card(s).')).toBe(true);
  });

  it('DISC-P09: Contract from Below discards the whole hand before anteing and redrawing 7', () => {
    const contract = makeCardInstance('contract_from_below', 'p');
    const pHandCards = ['ph1', 'ph2'].map(id => makeSpell(id, { id: 'lightning_bolt', name: id }));
    const pLib = Array.from({ length: 8 }, (_, i) => makeSpell(`pl${i}`, { id: 'lightning_bolt', name: `pl${i}` }));
    const state = makeState({ pHand: [contract, ...pHandCards], phase: PHASE.MAIN_1 });
    let ready = { ...state, p: { ...state.p, lib: pLib, mana: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 }, anteEnabled: true } };
    ready = { ...ready, anteEnabled: true };

    const s1 = duelReducer(ready, { type: 'CAST_SPELL', who: 'p', iid: contract.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.hand.length).toBe(7);
    // Contract from Below itself (a sorcery) joins its caster's gy after
    // resolving -- the generic non-permanent-spell cleanup in RESOLVE_STACK,
    // unrelated to and unaffected by this migration.
    expect(s2.p.gy.map(c => c.iid)).toEqual(['ph1', 'ph2', contract.iid]);
    expect(s2.anteExtraP.length).toBe(1);
  });

  it("DISC-P10: Mishra's War Machine upkeep (AI/'o' auto-discard branch) discards the last card, verbatim dlog", () => {
    const warMachine = makeCardInstance('mishrass_war_machine', 'o');
    const only = makeSpell('only', { id: 'lightning_bolt', name: 'Only Card' });
    const state = makeState({ oBf: [warMachine], oHand: [only], phase: PHASE.UNTAP, active: 'o' });

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UPKEEP

    expect(ns.o.hand).toEqual([]);
    expect(ns.o.gy.map(c => c.iid)).toEqual(['only']);
    expect(ns.log.some(l => l.text === "Mishra's War Machine: opponent discards Only Card.")).toBe(true);
  });

  it("DISC-P11: Mishra's War Machine upkeep (human/'p' pendingUpkeepChoice DISCARD branch) discards the last card", () => {
    const warMachine = makeCardInstance('mishrass_war_machine', 'p');
    const only = makeSpell('only', { id: 'lightning_bolt', name: 'Only Card' });
    const state = makeState({ pBf: [warMachine], pHand: [only], phase: PHASE.UNTAP, active: 'p' });

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues the choice
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('mishrasWarMachineUpkeep');
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DISCARD' });

    expect(s2.p.hand).toEqual([]);
    expect(s2.p.gy.map(c => c.iid)).toEqual(['only']);
  });

  it('DISC-P12: Mind Bomb discards 3 cards per player (chained numberChoice), verbatim per-player summary dlog', () => {
    const bomb = makeCardInstance('mind_bomb', 'p');
    const pHandCards = ['ph1', 'ph2', 'ph3'].map(id => makeSpell(id, { id: 'lightning_bolt', name: id }));
    const oHandCards = ['oh1', 'oh2', 'oh3'].map(id => makeSpell(id, { id: 'lightning_bolt', name: id }));
    const state = makeState({ pHand: [bomb, ...pHandCards], oHand: oHandCards, phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } } };

    const s1 = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: bomb.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.handlerKey).toBe('mindBombDiscard');
    expect(s2.pendingChoice?.forPlayer).toBe('p');

    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: '3' }); // p discards 3
    expect(s3.pendingChoice?.forPlayer).toBe('o');
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: '3' }); // o discards 3

    expect(s4.p.hand).toEqual([]);
    // Mind Bomb itself (a sorcery) joins the caster's gy immediately on
    // RESOLVE_STACK, before either RESOLVE_CHOICE dispatch -- the generic
    // non-permanent-spell cleanup, unrelated to and unaffected by this
    // migration.
    expect(s4.p.gy.map(c => c.iid).sort()).toEqual([bomb.iid, 'ph1', 'ph2', 'ph3'].sort());
    expect(s4.o.hand).toEqual([]);
    expect(s4.o.gy.map(c => c.iid).sort()).toEqual(['oh1', 'oh2', 'oh3']);
    expect(s4.log.some(l => l.text === 'p discards 3 card(s) to Mind Bomb.')).toBe(true);
    expect(s4.log.some(l => l.text === 'o discards 3 card(s) to Mind Bomb.')).toBe(true);
    // No damage: 3 - 3 discarded = 0.
    expect(s4.p.life).toBe(20);
    expect(s4.o.life).toBe(20);
  });

  it('DISC-P13: CLEANUP hand-size discard (cause:gameRule) discards down to maxHandSize', () => {
    const pHandCards = Array.from({ length: 9 }, (_, i) => makeSpell(`c${i}`, { id: 'lightning_bolt', name: `c${i}` }));
    const base = makeState({ pHand: pHandCards, phase: PHASE.END, active: 'p' });
    const state = { ...base, ruleset: { ...base.ruleset, maxHandSize: 7 } };

    const ns = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> CLEANUP

    expect(ns.p.hand.length).toBe(7);
    expect(ns.p.hand.map(c => c.iid)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(ns.p.gy.map(c => c.iid)).toEqual(['c8', 'c7']);
  });

  it("DISC-P14: Jandor's Ring discardLastDrawn as an activation cost (cause:cost), verbatim dlog", () => {
    const ring = makeCardInstance('jandorss_ring', 'p');
    const last = makeSpell('last', { id: 'lightning_bolt', name: 'Last Drawn' });
    const drawn = makeSpell('drawn', { id: 'lightning_bolt', name: 'Freshly Drawn' });
    const state = makeState({ pBf: [ring], pHand: [last], phase: PHASE.MAIN_1 });
    const ready = { ...state, p: { ...state.p, lib: [drawn], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(ready, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ring.iid });
    expect(s1.p.hand).toEqual([]);
    expect(s1.p.gy.map(c => c.iid)).toEqual(['last']);
    expect(s1.log.some(l => l.text === "Jandor's Ring: p discards Last Drawn.")).toBe(true);

    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.map(c => c.iid)).toEqual(['drawn']);
  });

  // --- Tripwire meta (1) -----------------------------------------------

  it('DISC-24: meta -- exactly one remaining direct hand-to-gy mutation line in DuelCore.js (discardCard\'s own)', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '../../src/engine/DuelCore.js'), 'utf8');
    const lines = src.split('\n');
    const matches = [];
    lines.forEach((line, idx) => {
      if (/hand.*gy: \[\.\.\.|gy: \[\.\.\..*hand/.test(line)) matches.push({ line: idx + 1, text: line.trim() });
    });
    expect(matches.length).toBe(1);
    expect(matches[0].text).toContain('state[who].hand.filter');
  });
});
