// tests/scenarios/simple-tier-forge-batch-effects.test.js
// Simple-tier Alpha/Beta stub cards implemented from Card-Forge/forge reference
// scripts (GPL-3.0). Covers the spell-level / single-shot effect cases added
// to resolveEff() in DuelCore.js. See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

function spellItem(id, effect, caster, targets = [], extra = {}) {
  return {
    id: `si-${id}`,
    card: { iid: `sp-${id}`, id, name: id, type: 'Sorcery', color: 'X', cmc: 1, effect, ...extra },
    caster,
    targets,
    xVal: 1,
  };
}

describe('@engine-tier-simple-1 Scenario: Simple-tier Forge batch -- spell effects', () => {

  it('Amnesia (discardAllNonland): target player discards all nonland cards, keeps lands', () => {
    const land = makeLand('l-1');
    const spell1 = makeSpell('h-1', { name: 'Shock' });
    const spell2 = makeSpell('h-2', { name: 'Bolt' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oHand: [land, spell1, spell2] });
    const state = { ...base, stack: [spellItem('amnesia', 'discardAllNonland', 'p', ['o'])] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.o.hand).toHaveLength(1);
    expect(s1.o.hand[0].iid).toBe('l-1');
    expect(s1.o.gy).toHaveLength(2);
  });

  it('Desert Twister (destroy): destroys any target permanent with no restriction', () => {
    const land = makeLand('l-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [land] });
    const state = { ...base, stack: [spellItem('desert_twister', 'destroy', 'p', ['l-1'])] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.o.bf).toHaveLength(0);
    expect(s1.o.gy).toHaveLength(1);
  });

  it('Hell Swarm (reused globalDebuffPower1EOT): all creatures get -1/-0 EOT', () => {
    const pCre = makeCreature('cr-p', { controller: 'p', power: 3, toughness: 3 });
    const oCre = makeCreature('cr-o', { controller: 'o', power: 2, toughness: 2 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pCre], oBf: [oCre] });
    const state = { ...base, stack: [spellItem('hell_swarm', 'globalDebuffPower1EOT', 'p')] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.p.bf[0].eotBuffs).toEqual([{ power: -1 }]);
    expect(s1.o.bf[0].eotBuffs).toEqual([{ power: -1 }]);
  });

  it('Marsh Gas (globalDebuffPower2EOT): all creatures get -2/-0 EOT', () => {
    const oCre = makeCreature('cr-o', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [oCre] });
    const state = { ...base, stack: [spellItem('marsh_gas', 'globalDebuffPower2EOT', 'p')] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.o.bf[0].eotBuffs).toEqual([{ power: -2 }]);
  });

  it('Army of Allah (pumpAttackersPower2EOT): only attacking creatures get +2/+0', () => {
    const attacker = makeCreature('cr-1', { controller: 'p', attacking: true });
    const nonAttacker = makeCreature('cr-2', { controller: 'p', attacking: false });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [attacker, nonAttacker] });
    const state = { ...base, attackers: ['cr-1'], stack: [spellItem('army_of_allah', 'pumpAttackersPower2EOT', 'p')] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.p.bf.find(c => c.iid === 'cr-1').eotBuffs).toEqual([{ power: 2 }]);
    expect(s1.p.bf.find(c => c.iid === 'cr-2').eotBuffs).toEqual([]);
  });

  it('Piety (pumpBlockersToughness3EOT): only blocking creatures get +0/+3', () => {
    const blocker = makeCreature('cr-1', { controller: 'o', blocking: 'att-1' });
    const nonBlocker = makeCreature('cr-2', { controller: 'o', blocking: null });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [blocker, nonBlocker] });
    const state = { ...base, stack: [spellItem('piety', 'pumpBlockersToughness3EOT', 'p')] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.o.bf.find(c => c.iid === 'cr-1').eotBuffs).toEqual([{ toughness: 3 }]);
    expect(s1.o.bf.find(c => c.iid === 'cr-2').eotBuffs).toEqual([]);
  });

  it('Riptide (tapAllBlueCreatures): taps only blue creatures, both sides', () => {
    const blueP = makeCreature('cr-1', { controller: 'p', color: 'U' });
    const greenP = makeCreature('cr-2', { controller: 'p', color: 'G' });
    const blueO = makeCreature('cr-3', { controller: 'o', color: 'U' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [blueP, greenP], oBf: [blueO] });
    const state = { ...base, stack: [spellItem('riptide', 'tapAllBlueCreatures', 'p')] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.p.bf.find(c => c.iid === 'cr-1').tapped).toBe(true);
    expect(s1.p.bf.find(c => c.iid === 'cr-2').tapped).toBe(false);
    expect(s1.o.bf.find(c => c.iid === 'cr-3').tapped).toBe(true);
  });

  it('Artifact Blast (counterArtifact): counters an artifact spell on the stack', () => {
    const artSpell = { iid: 'as-1', id: 'sol_ring', name: 'Sol Ring', type: 'Artifact', cmc: 1 };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      stack: [
        { id: 'target-si', card: artSpell, caster: 'o', targets: [], xVal: 1 },
        spellItem('artifact_blast', 'counterArtifact', 'p', ['target-si']),
      ],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.stack.find(i => i.id === 'target-si')).toBeUndefined();
    expect(s1.o.gy).toHaveLength(1);
  });

  it('Artifact Blast: fizzles against a non-artifact spell', () => {
    const nonArtSpell = { iid: 'ns-1', id: 'shock', name: 'Shock', type: 'Instant', cmc: 1 };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      stack: [
        { id: 'target-si', card: nonArtSpell, caster: 'o', targets: [], xVal: 1 },
        spellItem('artifact_blast', 'counterArtifact', 'p', ['target-si']),
      ],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.stack.find(i => i.id === 'target-si')).toBeDefined();
  });

  it('Untamed Wilds (fetchBasicToBf): fetches first basic land to battlefield and shuffles', () => {
    const basic = makeLand('lib-1', { id: 'forest', subtype: 'Basic Forest' });
    const nonBasic = makeLand('lib-2', { id: 'strip_mine', name: 'Strip Mine', subtype: '' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, lib: [nonBasic, basic] },
      stack: [spellItem('untamed_wilds', 'fetchBasicToBf', 'p')],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.p.bf).toHaveLength(1);
    expect(s1.p.bf[0].id).toBe('forest');
    expect(s1.p.lib.some(c => c.iid === 'lib-1')).toBe(false);
  });

  it('Natural Selection (scryTop3Reveal): reveals top 3 without mutating library order', () => {
    const c1 = makeLand('lib-1'); const c2 = makeLand('lib-2'); const c3 = makeLand('lib-3'); const c4 = makeLand('lib-4');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      o: { ...base.o, lib: [c1, c2, c3, c4] },
      stack: [spellItem('natural_selection', 'scryTop3Reveal', 'p', ['o'])],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.o.lib.map(c => c.iid)).toEqual(['lib-1', 'lib-2', 'lib-3', 'lib-4']);
    expect(s1.log.at(-1).text).toMatch(/lib-1|Forest/);
  });

  it('Reset (untapAllOwnLands + cast restriction): untaps caster\'s lands', () => {
    const land = makeLand('l-1', { tapped: true, controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [land] });
    const state = { ...base, stack: [spellItem('reset', 'untapAllOwnLands', 'p')] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.p.bf[0].tapped).toBe(false);
  });

  it('Reset: cannot be cast on caster\'s own turn', () => {
    const resetCard = { iid: 'r-1', id: 'reset', name: 'Reset', type: 'Instant', color: 'U', cmc: 2, cost: 'UU', effect: 'untapAllOwnLands' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [resetCard] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'r-1' });
    // Blocked: still in hand, mana untouched.
    expect(s1.p.hand).toHaveLength(1);
    expect(s1.p.mana.U).toBe(2);
  });

  it('Reset: cannot be cast during opponent\'s upkeep', () => {
    const resetCard = { iid: 'r-1', id: 'reset', name: 'Reset', type: 'Instant', color: 'U', cmc: 2, cost: 'UU', effect: 'untapAllOwnLands' };
    const base = makeState({ phase: PHASE.UPKEEP, active: 'o', pHand: [resetCard] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'r-1' });
    expect(s1.p.hand).toHaveLength(1);
  });

  it('Reset: legal after opponent\'s upkeep step', () => {
    const resetCard = { iid: 'r-1', id: 'reset', name: 'Reset', type: 'Instant', color: 'U', cmc: 2, cost: 'UU', effect: 'untapAllOwnLands' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pHand: [resetCard] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'r-1' });
    expect(s1.p.hand).toHaveLength(0);
    expect(s1.stack).toHaveLength(1);
  });

  it('Reconstruction (returnArtifactFromGYToHand): returns artifact card, not nonartifact', () => {
    const art = { iid: 'gy-1', id: 'sol_ring', name: 'Sol Ring', type: 'Artifact', cmc: 1 };
    const nonArt = { iid: 'gy-2', id: 'shock', name: 'Shock', type: 'Instant', cmc: 1 };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = { ...base, p: { ...base.p, gy: [nonArt, art] }, stack: [spellItem('reconstruction', 'returnArtifactFromGYToHand', 'p', ['gy-1'])] };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    expect(s1.p.hand.map(c => c.iid)).toEqual(['gy-1']);
    // The Reconstruction spell itself also lands in the graveyard after resolving
    // (RESOLVE_STACK's generic non-permanent handling), alongside the untouched card.
    expect(s1.p.gy.map(c => c.iid).sort()).toEqual(['gy-2', 'sp-reconstruction']);
  });

});
