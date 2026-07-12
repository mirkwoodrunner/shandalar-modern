// tests/scenarios/additional-cost-sacrifice.test.js
// Additional Costs Infrastructure + Sacrifice (Phase 3 of discard/cost work).
// Sacrifice: "As an additional cost to cast this spell, sacrifice a creature.
// Add an amount of {B} equal to the sacrificed creature's mana value."
//
// SAC-11 through SAC-20 mirror useDuelController.castFlow.test.ts's established
// pattern (pure logic simulation against the real exported helpers, not
// renderHook) -- see that file's own header comment for precedent.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { duelReducer, canPay, isCre, buildDuelState } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { RULESETS } from '../../src/data/rulesets.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';
import { needsAnyTarget, isOptionalTarget } from '../../src/hooks/useDuelController';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeSacrifice(iid, overrides = {}) {
  return makeSpell(iid, {
    id: 'sacrifice',
    name: 'Sacrifice',
    type: 'Instant',
    color: 'B',
    cmc: 1,
    cost: 'B',
    additionalCost: { type: 'sacrificeCreature' },
    effect: 'addManaFromSacrificedValue',
    ...overrides,
  });
}

// ── Engine-level infrastructure (SAC-01 .. SAC-10) ──────────────────────────

describe('@engine Scenario: additional-cost-sacrifice -- CAST_SPELL payment', () => {
  it('SAC-01: casting Sacrifice with one creature moves it bf->gy and adds B mana equal to its cmc on resolve', () => {
    const sac = makeSacrifice('sac-1');
    const cre = makeCreature('cre-1', { name: 'Big Bear', cmc: 3, controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [sac], pBf: [cre] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1 } } };

    state = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sac-1', tgt: null, xVal: 1, additionalCostIid: 'cre-1' });

    expect(state.p.bf.some(c => c.iid === 'cre-1')).toBe(false);
    expect(state.p.gy.some(c => c.iid === 'cre-1')).toBe(true);
    expect(state.p.mana.B).toBe(0); // paid {B} to cast
    expect(state.stack.length).toBe(1);
    expect(state.log.some(l => l.text.includes('sacrifices Big Bear as an additional cost'))).toBe(true);

    state = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(state.p.mana.B).toBe(3);
    expect(state.log.some(l => l.text.includes('adds 3B'))).toBe(true);
  });

  it('SAC-02: CAST_SPELL is blocked at the reducer level when the caster controls zero creatures', () => {
    const sac = makeSacrifice('sac-2');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [sac], pBf: [] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1 } } };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const after = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sac-2', tgt: null, xVal: 1, additionalCostIid: null });

    expect(after).toBe(state); // unchanged reference -- no mutation occurred
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('SAC-03: additionalCostIid pointing at a card not on the caster\'s battlefield is blocked', () => {
    const sac = makeSacrifice('sac-3');
    const oCre = makeCreature('ocre-3', { controller: 'o' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [sac], pBf: [], oBf: [oCre] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1 } } };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const after = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sac-3', tgt: null, xVal: 1, additionalCostIid: 'ocre-3' });

    expect(after).toBe(state);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('SAC-04: additionalCostIid pointing at a noncreature permanent the caster controls is blocked', () => {
    const sac = makeSacrifice('sac-4');
    const land = makeLand('land-4', { controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [sac], pBf: [land] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1 } } };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const after = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sac-4', tgt: null, xVal: 1, additionalCostIid: 'land-4' });

    expect(after).toBe(state);
    expect(after.p.bf.some(c => c.iid === 'land-4')).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // additionalCostSnapshot is created and cleared atomically within the same
  // CAST_SPELL dispatch (never observable afterward -- see ENGINE_CONTRACT_SPEC.md),
  // so bfIndex correctness is verified directly against UNDO_ADDITIONAL_COST's
  // reinsertion logic using a hand-built snapshot fixture, same as SAC-07.
  it('SAC-05: a snapshot bfIndex for an interior position reinstates the creature between its original neighbors', () => {
    const c0 = makeCreature('c0', { controller: 'p' });
    const c1 = makeCreature('c1', { controller: 'p' });
    const c2 = makeCreature('c2', { name: 'Sacrificed', controller: 'p' }); // was at index 2 of 4
    const c3 = makeCreature('c3', { controller: 'p' });
    let state = makeState({ pBf: [c0, c1, c3] });
    state = {
      ...state,
      p: { ...state.p, gy: [{ ...c2, tapped: false, damage: 0 }] },
      additionalCostSnapshot: { type: 'sacrificeCreature', card: c2, bfIndex: 2 },
    };

    const after = duelReducer(state, { type: 'UNDO_ADDITIONAL_COST' });

    expect(after.p.bf.map(c => c.iid)).toEqual(['c0', 'c1', 'c2', 'c3']);
  });

  it('SAC-06: UNDO_ADDITIONAL_COST with no snapshot present is a no-op', () => {
    const cre = makeCreature('cre-6', { controller: 'p' });
    let state = { ...makeState({ pBf: [cre] }), additionalCostSnapshot: null };

    const after = duelReducer(state, { type: 'UNDO_ADDITIONAL_COST' });

    expect(after).toBe(state);
  });

  it('SAC-07: UNDO_ADDITIONAL_COST restores the exact creature at the exact original bfIndex and removes it from gy', () => {
    const creA = makeCreature('creA', { controller: 'p' });
    const creSac = makeCreature('creSac', { name: 'Sacrificed', cmc: 4, controller: 'p', tapped: true });
    let state = makeState({ pBf: [creA] }); // creSac was originally at index 1 (end)
    state = {
      ...state,
      p: { ...state.p, gy: [{ ...creSac, tapped: false, damage: 0 }] },
      additionalCostSnapshot: { type: 'sacrificeCreature', card: creSac, bfIndex: 1 },
    };

    const after = duelReducer(state, { type: 'UNDO_ADDITIONAL_COST' });

    expect(after.p.bf.map(c => c.iid)).toEqual(['creA', 'creSac']);
    expect(after.p.bf.find(c => c.iid === 'creSac').tapped).toBe(true); // exact pre-sacrifice snapshot restored
    expect(after.p.gy.some(c => c.iid === 'creSac')).toBe(false);
    expect(after.additionalCostSnapshot).toBeNull();
  });

  it('SAC-08: cancel after tapping lands and choosing a sacrifice target (pre-CAST_SPELL) only needs UNDO_MANA_TAPS -- the creature was never removed from bf', () => {
    // Mana tapping happens via separate TAP_LAND dispatches before CAST_SPELL,
    // same as any other cast. Choosing the sacrifice target is client-side
    // castFlow state in the real hook (useDuelController.selectAdditionalCost)
    // -- it never dispatches to the engine, so additionalCostSnapshot is never
    // set until CAST_SPELL itself fires (payment is atomic, one transaction).
    // Confirmed against pre-flight step 4 / the TAP_LAND-then-CAST_SPELL
    // sequencing already used elsewhere in DuelCore.js.
    const land = makeLand('land-8', { controller: 'p', produces: ['B'] });
    const cre = makeCreature('cre-8', { controller: 'p', cmc: 2 });
    let state = { ...makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [land, cre] }), manaTapSnapshot: null, additionalCostSnapshot: null };

    state = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-8', mana: 'B' });
    expect(state.manaTapSnapshot).not.toBeNull();
    expect(state.p.mana.B).toBe(1);

    // "Selection made" -- represented only as external castFlow state, not
    // reflected in the engine at all.
    expect(state.additionalCostSnapshot).toBeNull();
    expect(state.p.bf.some(c => c.iid === 'cre-8')).toBe(true);

    // cancelCastFlow: UNDO_MANA_TAPS fires (snapshot present); UNDO_ADDITIONAL_COST
    // would be a no-op since additionalCostSnapshot is null -- both payments of
    // one cast roll back together, and here only one had actually committed.
    state = duelReducer(state, { type: 'UNDO_MANA_TAPS' });
    expect(state.manaTapSnapshot).toBeNull();
    expect(state.p.mana.B).toBe(0);
    expect(state.p.bf.find(c => c.iid === 'land-8').tapped).toBe(false);
    expect(state.p.bf.some(c => c.iid === 'cre-8')).toBe(true); // creature never left
  });

  it('SAC-09: stack item additionalCostPaid.card reflects the sacrificed creature\'s full pre-sacrifice card object', () => {
    const sac = makeSacrifice('sac-9');
    const cre = makeCreature('cre-9', { name: 'Serra Angel', cmc: 5, controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [sac], pBf: [cre] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1 } } };

    state = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sac-9', tgt: null, xVal: 1, additionalCostIid: 'cre-9' });

    const item = state.stack[0];
    expect(item.additionalCostPaid.type).toBe('sacrificeCreature');
    expect(item.additionalCostPaid.card.name).toBe('Serra Angel');
    expect(item.additionalCostPaid.card.cmc).toBe(5);
  });

  it('SAC-10: resolving Sacrifice with a 0-cmc sacrificed creature adds 0 B without erroring', () => {
    const sac = makeSacrifice('sac-10');
    const token = makeCreature('token-10', { name: 'Saproling', cmc: 0, controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [sac], pBf: [token] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1 } } };

    state = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sac-10', tgt: null, xVal: 1, additionalCostIid: 'token-10' });

    expect(() => {
      state = duelReducer(state, { type: 'RESOLVE_STACK' });
    }).not.toThrow();
    expect(state.p.mana.B).toBe(0);
  });
});

// ── UI/flow-state logic (SAC-11 .. SAC-18) ──────────────────────────────────
// Same lightweight pattern as useDuelController.castFlow.test.ts: exercises
// the real exported helpers plus the identical conditional shape used inside
// beginCastFlow / advanceCastFlow / selectAdditionalCost / cancelCastFlow in
// useDuelController.ts, without rendering the hook itself.

describe('@engine Scenario: additional-cost-sacrifice -- castFlow state shape', () => {
  it('SAC-11: beginCastFlow opens additionalCost mode for a targetless card carrying additionalCost', () => {
    const sacCard = { id: 'sacrifice', additionalCost: { type: 'sacrificeCreature' }, cost: 'B', effect: 'addManaFromSacrificedValue' };
    const pBf = [makeCreature('cre-11', { controller: 'p' })];
    const creatureCount = pBf.filter(isCre).length;
    expect(creatureCount).toBeGreaterThan(0); // legality gate passes

    const hasTarget = needsAnyTarget(sacCard) || isOptionalTarget(sacCard);
    expect(hasTarget).toBe(false);

    const mode = sacCard.additionalCost?.type === 'sacrificeCreature' ? 'additionalCost' : (hasTarget ? 'targeting' : 'mana');
    expect(mode).toBe('additionalCost');
  });

  it('SAC-12: beginCastFlow legality gate blocks the cast entirely when the caster controls zero creatures', () => {
    const pBf = [];
    const creatureCount = pBf.filter(isCre).length;
    expect(creatureCount).toBe(0);
    const castFlowWouldOpen = creatureCount > 0; // beginCastFlow: selectCard(null); return
    expect(castFlowWouldOpen).toBe(false);
  });

  it('SAC-13: selectAdditionalCost accepts the caster\'s own creature, sets selection, and auto-advances', () => {
    const cre = makeCreature('cre-13', { controller: 'p' });
    const pBf = [cre];
    const prev = { mode: 'additionalCost', additionalCostSelection: null };

    const clicked = pBf.find(c => c.iid === 'cre-13');
    const eligible = !!clicked && isCre(clicked);
    expect(eligible).toBe(true);

    const next = eligible ? { ...prev, additionalCostSelection: clicked.iid, _advance: true } : prev;
    expect(next.additionalCostSelection).toBe('cre-13');
    expect(next._advance).toBe(true);
  });

  it('SAC-14: selectAdditionalCost ignores a creature on the opponent\'s battlefield', () => {
    const oCre = makeCreature('ocre-14', { controller: 'o' });
    const pBf = [makeCreature('pcre-14', { controller: 'p' })];
    const prev = { mode: 'additionalCost', additionalCostSelection: null };

    // selectAdditionalCost looks the clicked iid up in s.p.bf only.
    const clicked = pBf.find(c => c.iid === oCre.iid);
    expect(clicked).toBeUndefined();

    const next = clicked && isCre(clicked) ? { ...prev, additionalCostSelection: clicked.iid } : prev;
    expect(next.additionalCostSelection).toBeNull();
    expect(next.mode).toBe('additionalCost'); // mode unchanged
  });

  it('SAC-15: selectAdditionalCost ignores a noncreature permanent the caster controls', () => {
    const land = makeLand('land-15', { controller: 'p' });
    const pBf = [land];
    const prev = { mode: 'additionalCost', additionalCostSelection: null };

    const clicked = pBf.find(c => c.iid === 'land-15');
    const eligible = !!clicked && isCre(clicked);
    expect(eligible).toBe(false);

    const next = eligible ? { ...prev, additionalCostSelection: clicked.iid } : prev;
    expect(next.additionalCostSelection).toBeNull();
  });

  it('SAC-16: cancelCastFlow mid-additionalCost before a creature is chosen dispatches no UNDO actions', () => {
    const manaTapSnapshot = null;
    const additionalCostSnapshot = null;
    const dispatched = [];
    const dispatch = (a) => dispatched.push(a);

    if (manaTapSnapshot !== null) dispatch({ type: 'UNDO_MANA_TAPS' });
    if (additionalCostSnapshot !== null) dispatch({ type: 'UNDO_ADDITIONAL_COST' });

    expect(dispatched).toEqual([]);
  });

  it('SAC-17: cancelCastFlow after choosing a sacrifice target but before CAST_SPELL fires dispatches no UNDO actions', () => {
    // additionalCostSelection lives only on castFlow (React state) until
    // CAST_SPELL dispatches -- the engine's additionalCostSnapshot is never
    // touched at this point (see SAC-08).
    const castFlow = { mode: 'additionalCost', additionalCostSelection: 'cre-1' };
    const manaTapSnapshot = null;
    const additionalCostSnapshot = null;
    const dispatched = [];
    const dispatch = (a) => dispatched.push(a);

    if (manaTapSnapshot !== null) dispatch({ type: 'UNDO_MANA_TAPS' });
    if (additionalCostSnapshot !== null) dispatch({ type: 'UNDO_ADDITIONAL_COST' });

    expect(dispatched).toEqual([]);
    expect(castFlow.additionalCostSelection).toBe('cre-1'); // discarded via setCastFlow(null), not an engine undo
  });

  it('SAC-18: cancelCastFlow is unreachable once CAST_SPELL has dispatched -- castFlow clears synchronously with the dispatch', () => {
    // advanceCastFlow's spell branch calls castSpell(...) and setCastFlow(null)
    // in the same synchronous block (useDuelController.ts), so there is no
    // tick where castFlow is still non-null after CAST_SPELL has fired --
    // cancelCastFlow's implicit guard (only invoked while castFlow is truthy
    // in the UI) can never run against a committed cast.
    let castFlow = { mode: 'mana', additionalCostSelection: 'cre-1' };
    const canPayNow = true;
    const dispatched = [];
    function castSpell() { dispatched.push('CAST_SPELL'); }
    function setCastFlowNull() { castFlow = null; }

    if (canPayNow) {
      castSpell();
      setCastFlowNull();
    }

    expect(dispatched).toEqual(['CAST_SPELL']);
    expect(castFlow).toBeNull();
  });
});

// ── Regression/parity (SAC-19 .. SAC-22) ────────────────────────────────────

describe('@engine Scenario: additional-cost-sacrifice -- regression guards', () => {
  it('SAC-19: a targetless, non-X, no-additionalCost card still takes the instant-cast shortcut when affordable', () => {
    const grizzly = { id: 'grizzly_bears', type: 'Creature', cost: '1G', effect: undefined };
    const hasX = /X/i.test(grizzly.cost || '') && grizzly.id !== 'power_sink';
    const hasTarget = needsAnyTarget(grizzly) || isOptionalTarget(grizzly);
    expect(hasX).toBe(false);
    expect(hasTarget).toBe(false);

    const wouldStopAtAdditionalCost = grizzly.additionalCost?.type === 'sacrificeCreature';
    expect(wouldStopAtAdditionalCost).toBe(false); // the new gate never fires for this card

    const pool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 1 };
    expect(canPay(pool, grizzly.cost, 0)).toBe(true); // instant-cast shortcut still fires
  });

  it('SAC-20: an existing targeted spell with no additionalCost still flows targeting -> mana unchanged', () => {
    const bolt = { id: 'lightning_bolt', effect: 'damage3', cost: 'R' };
    const hasTarget = needsAnyTarget(bolt) || isOptionalTarget(bolt);
    expect(hasTarget).toBe(true);

    const wouldStopAtAdditionalCost = bolt.additionalCost?.type === 'sacrificeCreature';
    expect(wouldStopAtAdditionalCost).toBe(false); // advanceCastFlow's new gate is skipped entirely
  });

  it('SAC-21: exactly 7 uppercase STUB entries remain in cards.js, and Sacrifice is no longer one of them', () => {
    const filePath = path.join(__dirname, '../../src/data/cards.js');
    const src = readFileSync(filePath, 'utf8');
    const matches = src.match(/effect:"STUB"/g) || [];
    expect(matches.length).toBe(7);

    const sacrificeLine = src.split('\n').find(l => l.includes('id:"sacrifice"'));
    expect(sacrificeLine).toBeTruthy();
    expect(sacrificeLine).not.toContain('effect:"STUB"');
    expect(sacrificeLine).toContain('additionalCost:{type:"sacrificeCreature"}');
  });

  it('SAC-22: additionalCostSnapshot defaults to null in fresh game state and is cleared at end-of-turn cleanup', () => {
    const pDeckIds = ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'savannah_lions'];
    const freshState = buildDuelState(pDeckIds, 'RED_BURN', RULESETS.CLASSIC, null, null, false, null);
    expect(freshState.additionalCostSnapshot).toBeNull();

    const cre = makeCreature('cre-22', { controller: 'p' });
    let state = makeState({ phase: PHASE.END, active: 'p', pBf: [cre] });
    state = { ...state, additionalCostSnapshot: { type: 'sacrificeCreature', card: cre, bfIndex: 0 } };

    const after = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(after.additionalCostSnapshot).toBeNull();
  });
});
