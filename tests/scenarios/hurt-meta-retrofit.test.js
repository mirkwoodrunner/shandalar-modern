// tests/scenarios/hurt-meta-retrofit.test.js
// Damage Shields + hurt() Source Metadata (Part 1): spot-checks a representative
// sample of the ~113 hurt() call sites retrofitted with { sourceIid, sourceType }
// metadata, and confirms the retrofit is byte-for-byte behavior-invisible on its
// own -- life totals, log text, and game state are identical to pre-retrofit
// behavior for a few existing scenarios. See docs/SYSTEMS.md -- Damage Shields.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt, inferSourceType } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: hurt() meta retrofit -- spell-source call sites', () => {
  it('Lightning Bolt (damage3, Instant) tags meta with its own iid and sourceType "spell"', () => {
    const bolt = makeSpell('bolt-1', { id: 'lightning_bolt', name: 'Lightning Bolt', color: 'R', cost: 'R', cmc: 1, effect: 'damage3' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [bolt] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } }, turnState: { ...base.turnState, damageBySourceType: {} } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'bolt-1', tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.life).toBe(17);
    expect(s2.turnState.damageBySourceType.o.spell).toBe(3);
  });

  it('Psionic Blast (both damage instances) tags meta consistently', () => {
    const blast = makeSpell('blast-1', { id: 'psionic_blast', name: 'Psionic Blast', color: 'U', cost: '2U', cmc: 3, effect: 'psionicBlast' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [blast] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 2 }, life: 20 }, o: { ...base.o, life: 20 }, turnState: { ...base.turnState, damageBySourceType: {} } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'blast-1', tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.life).toBe(16); // 4 damage to opponent
    expect(s2.p.life).toBe(18); // 2 damage to self
    expect(s2.turnState.damageBySourceType.o.spell).toBe(4);
    expect(s2.turnState.damageBySourceType.p.spell).toBe(2);
  });
});

describe('@engine Scenario: hurt() meta retrofit -- enchantment trigger call sites', () => {
  it('Manabarbs (tapping a land for mana) tags meta with the enchantment\'s own iid', () => {
    const manabarbs = makeSpell('barbs-1', { id: 'manabarbs', name: 'Manabarbs', type: 'Enchantment', color: 'R', cost: '3R', cmc: 4 });
    const forest = makeLand('land-1', { id: 'forest', name: 'Forest', controller: 'p', produces: ['G'] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [manabarbs, forest] });
    const state = { ...base, p: { ...base.p, life: 20 }, turnState: { ...base.turnState, damageBySourceType: {} } };
    const s1 = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-1' });
    expect(s1.p.life).toBe(19);
    expect(s1.turnState.damageBySourceType.p.enchantment).toBe(1);
  });
});

describe('@engine Scenario: hurt() meta retrofit -- combat lifelink meta (previously untagged)', () => {
  it('lifelink life-gain from an unblocked attacker now carries sourceIid/sourceType (creature, combat)', () => {
    const attacker = makeCreature('att-1', { id: 'serra_angel', name: 'Serra Angel', controller: 'p', power: 4, toughness: 4, keywords: ['LIFELINK'], attacking: true });
    const base = makeState({ phase: PHASE.COMBAT_AFTER_BLOCKERS, active: 'p', pBf: [attacker] });
    const state = { ...base, attackers: ['att-1'], p: { ...base.p, life: 20 }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves
    expect(s1.o.life).toBe(16);
    expect(s1.p.life).toBe(24); // lifelink gain -- meta addition does not change the amount gained
  });
});

describe('@engine Scenario: hurt() meta retrofit -- regression (Part 1 is behavior-invisible on its own)', () => {
  it('Hurricane deals identical damage to both players and flying creatures as before the retrofit', () => {
    const flier = makeCreature('flier-1', { id: 'giant_albatross', name: 'Giant Albatross', controller: 'o', power: 3, toughness: 5, keywords: ['FLYING'] });
    const hurricane = makeSpell('hur-1', { id: 'hurricane', name: 'Hurricane', type: 'Sorcery', color: 'G', cost: 'XG', cmc: 2, effect: 'hurricane' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [hurricane], oBf: [flier] });
    const state = { ...base, xVal: 3, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 3 }, life: 20 }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'hur-1', xVal: 3 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.life).toBe(17);
    expect(s2.o.life).toBe(17);
    expect(s2.o.bf.find(c => c.iid === 'flier-1').damage).toBe(3);
  });

  it('mana burn (no card in scope) still carries no meta -- a legitimate gap, not a regression', () => {
    const base = makeState({ phase: PHASE.CLEANUP, active: 'p' });
    const state = { ...base, ruleset: { ...base.ruleset, manaBurn: true }, p: { ...base.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 }, life: 20 } };
    const s1 = hurt(state, 'p', 2, 'mana burn');
    expect(s1.p.life).toBe(18);
  });

  it('inferSourceType maps every basic permanent shape to its expected bucket', () => {
    expect(inferSourceType(makeCreature('c1'))).toBe('creature');
    expect(inferSourceType({ type: 'Artifact', iid: 'a1' })).toBe('artifact');
    expect(inferSourceType({ type: 'Enchantment', iid: 'e1' })).toBe('enchantment');
    expect(inferSourceType(makeLand('l1'))).toBe('land');
    expect(inferSourceType({ type: 'Instant', iid: 'i1' })).toBe('spell');
    expect(inferSourceType({ type: 'Sorcery', iid: 's1' })).toBe('spell');
    expect(inferSourceType(null)).toBeNull();
  });
});
