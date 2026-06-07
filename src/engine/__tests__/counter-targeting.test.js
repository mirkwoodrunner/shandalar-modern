import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../engine/DuelCore.js';
import { PHASE } from '../../engine/phases.js';
import { makeState, makePlayerState, makeSpell, makeCreature, makeStackItem } from './_factory.js';

describe('Counter targeting', () => {
  it('CT-01: counter by explicit stack id removes correct item', () => {
    const bolt = makeSpell('bolt-1', { id: 'lightning_bolt', name: 'Lightning Bolt', color: 'R', cmc: 1, cost: 'R', effect: 'damage3' });
    const counterspell = makeSpell('csp-1', { id: 'counterspell', name: 'Counterspell', color: 'U', cmc: 2, cost: 'UU', effect: 'counter' });

    const boltItem = makeStackItem(bolt, 'o', ['p']);
    const cspItem  = makeStackItem(counterspell, 'p', [boltItem.id]);

    const state = { ...makeState({ phase: PHASE.MAIN_1 }), stack: [boltItem, cspItem] };

    // RESOLVE_STACK pops cspItem (last) and resolves it; boltItem should be countered.
    const result = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(result.stack.length).toBe(0);
    expect(result.o.gy.some(c => c.id === 'lightning_bolt')).toBe(true);
  });

  it('CT-02: counterCreature fizzles against non-creature spell', () => {
    const bolt = makeSpell('bolt-2', { id: 'lightning_bolt', name: 'Lightning Bolt', color: 'R', cmc: 1, cost: 'R', effect: 'damage3' });
    const removeSoul = makeSpell('rs-1', { id: 'remove_soul', name: 'Remove Soul', color: 'U', cmc: 2, cost: '1U', effect: 'counterCreature' });

    const boltItem = makeStackItem(bolt, 'o', ['p']);
    const rsItem   = makeStackItem(removeSoul, 'p', [boltItem.id]);

    const state = { ...makeState({ phase: PHASE.MAIN_1 }), stack: [boltItem, rsItem], p: makePlayerState({ life: 20 }) };

    // Remove Soul resolves first; fizzles against non-creature. Then bolt resolves.
    let result = duelReducer(state, { type: 'RESOLVE_STACK' }); // resolve RS
    result = duelReducer(result, { type: 'RESOLVE_STACK' });    // resolve bolt -> deals 3
    expect(result.p.life).toBe(17);
  });

  it('CT-03: spell blast fizzles when CMC does not match X', () => {
    const terror = makeSpell('ter-1', { id: 'terror', name: 'Terror', color: 'B', cmc: 2, cost: '1B', effect: 'destroy' });
    const spellBlast = makeSpell('sb-1', { id: 'spell_blast', name: 'Spell Blast', color: 'U', cmc: 1, cost: 'XU', effect: 'counter' });

    const terrorItem    = makeStackItem(terror, 'o', ['p-cre-1']);
    const spellBlastItem = makeStackItem(spellBlast, 'p', [terrorItem.id], 1); // X=1, terror CMC=2

    const state = { ...makeState({ phase: PHASE.MAIN_1 }), stack: [terrorItem, spellBlastItem] };

    const result = duelReducer(state, { type: 'RESOLVE_STACK' });
    // Spell Blast fizzled (X=1 != CMC=2) -- Terror still on stack.
    expect(result.stack.some(i => i.id === terrorItem.id)).toBe(true);
  });

  it('CT-04: CAST_SPELL blocked when stack empty and card is counter', () => {
    const counterspell = makeSpell('csp-2', { id: 'counterspell', name: 'Counterspell', color: 'U', cmc: 2, cost: 'UU', effect: 'counter' });
    const state = {
      ...makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [counterspell] }),
      p: makePlayerState({ hand: [counterspell], mana: { W:0, U:2, B:0, R:0, G:0, C:0 } }),
      stack: [],
    };

    const result = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'csp-2', tgt: null, xVal: null });
    expect(result.stack.length).toBe(0);
    expect(result.p.hand.some(c => c.iid === 'csp-2')).toBe(true);
  });
});
