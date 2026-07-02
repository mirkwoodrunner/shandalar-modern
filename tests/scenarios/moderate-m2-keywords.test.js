// tests/scenarios/moderate-m2-keywords.test.js
// Moderate-tier Alpha/Beta stub cards implemented from Card-Forge/forge reference
// scripts (GPL-3.0), sub-batch M2: keyword-line cards.
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, canBlockDuel } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

describe('@engine Scenario: Moderate-tier Forge batch M2 -- keyword-line cards', () => {

  it('Crimson Manticore: deals 1 damage to a target attacking creature', () => {
    const manticore = makeCreature('cm-1', { id: 'crimson_manticore', name: 'Crimson Manticore', controller: 'p', keywords: [KEYWORDS.FLYING.id], activated: { cost: 'R,T', effect: 'damage1AttackerOrBlocker' } });
    const attacker = makeCreature('att-1', { controller: 'o', attacking: true, toughness: 3, damage: 0 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [manticore], oBf: [attacker] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cm-1', tgt: 'att-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'att-1').damage).toBe(1);
  });

  it('Crimson Manticore: fizzles against a creature that is neither attacking nor blocking', () => {
    const manticore = makeCreature('cm-1', { id: 'crimson_manticore', name: 'Crimson Manticore', controller: 'p', activated: { cost: 'R,T', effect: 'damage1AttackerOrBlocker' } });
    const bystander = makeCreature('by-1', { controller: 'o', toughness: 3, damage: 0 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [manticore], oBf: [bystander] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cm-1', tgt: 'by-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'by-1').damage).toBe(0);
  });

  it('Fallen Angel: sacrifices a creature, gets +2/+1 until end of turn', () => {
    const angel = makeCreature('fa-1', { id: 'fallen_angel', name: 'Fallen Angel', controller: 'p', power: 3, toughness: 3, activated: { cost: 'sacCre', effect: 'pumpSelf21EOT' } });
    const fodder = makeCreature('fo-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [angel, fodder] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'fa-1' });
    expect(s1.p.bf.some(c => c.iid === 'fo-1')).toBe(false);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'fa-1').eotBuffs).toEqual([{ power: 2, toughness: 1 }]);
  });

  it('Fire Drake: pumps +1/+0, blocked from a second activation the same turn', () => {
    const drake = makeCreature('fd-1', { id: 'fire_drake', name: 'Fire Drake', controller: 'p', power: 1, toughness: 2, activated: { cost: 'R', effect: 'pumpSelf', onceEachTurn: true } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [drake] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'fd-1' });
    expect(s1.stack).toHaveLength(1);
    const s2 = duelReducer(s1, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'fd-1' });
    expect(s2.stack).toHaveLength(1); // second activation this turn rejected
    expect(s2.p.mana.R).toBe(1); // no mana spent on the rejected activation
  });

  it('Mountain Yeti: has mountainwalk and protection from white', () => {
    const yeti = makeCreature('my-1', { id: 'mountain_yeti', name: 'Mountain Yeti', controller: 'p', keywords: [KEYWORDS.MOUNTAINWALK.id, KEYWORDS.PROTECTION.id], protection: ['white'] });
    const whiteBlocker = makeCreature('wb-1', { controller: 'o', color: 'W' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [yeti], oBf: [whiteBlocker] });
    expect(canBlockDuel(whiteBlocker, yeti, base.o.bf, base)).toBe(false);
  });

  it('Thunder Spirit: has flying and first strike keywords', () => {
    const spirit = makeCreature('ts-1', { id: 'thunder_spirit', name: 'Thunder Spirit', controller: 'p', keywords: [KEYWORDS.FLYING.id, KEYWORDS.FIRST_STRIKE.id] });
    expect(spirit.keywords).toContain(KEYWORDS.FLYING.id);
    expect(spirit.keywords).toContain(KEYWORDS.FIRST_STRIKE.id);
  });

  it("Wall of Light: has defender and protection from black", () => {
    const wall = makeCreature('wl-1', { id: 'wall_of_light', name: 'Wall of Light', controller: 'p', keywords: [KEYWORDS.PROTECTION.id, KEYWORDS.DEFENDER.id], protection: ['black'] });
    const blackAttacker = makeCreature('ba-1', { controller: 'o', color: 'B' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [wall], oBf: [blackAttacker] });
    expect(canBlockDuel(wall, blackAttacker, base.p.bf, base)).toBe(false);
    // Defender: can't attack.
    const attackState = { ...base, active: 'p', phase: PHASE.COMBAT_ATTACKERS };
    const s1 = duelReducer(attackState, { type: 'DECLARE_ATTACKER', iid: 'wl-1' });
    expect(s1.attackers).toEqual([]);
  });
});
