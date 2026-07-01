// tests/scenarios/simple-tier-forge-batch-static.test.js
// Simple-tier Alpha/Beta stub cards implemented as continuous/static effects:
// Castle, Fortified Area, Weakstone (layers.js collectEffects, name-based
// check mirroring the existing Holy Ground pattern), Moat (DECLARE_ATTACKER
// legality gate), and Water Wurm (CDA evaluator, kird_ape pattern).
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, getTou, getPow, hasKw } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function castleEnch(controller = 'p') {
  return { iid: 'castle-1', id: 'castle', name: 'Castle', type: 'Enchantment', controller, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
}
function fortifiedAreaEnch(controller = 'p') {
  return { iid: 'fa-1', id: 'fortified_area', name: 'Fortified Area', type: 'Enchantment', controller, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
}
function weakstoneArt() {
  return { iid: 'ws-1', id: 'weakstone', name: 'Weakstone', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
}
function moatEnch() {
  return { iid: 'moat-1', id: 'moat', name: 'Moat', type: 'Enchantment', controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
}

describe('@engine Scenario: Simple-tier Forge batch -- static/continuous effects', () => {

  it('Castle: untapped creatures you control get +0/+2', () => {
    const cre = makeCreature('cr-1', { controller: 'p', tapped: false, toughness: 2 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cre, castleEnch()] });
    const c = state.p.bf.find(x => x.iid === 'cr-1');
    expect(getTou(c, state)).toBe(4);
  });

  it("Castle: does not affect tapped creatures or opponent's creatures", () => {
    const tappedCre = makeCreature('cr-1', { controller: 'p', tapped: true, toughness: 2 });
    const oppCre = makeCreature('cr-2', { controller: 'o', tapped: false, toughness: 2 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tappedCre, castleEnch()], oBf: [oppCre] });
    expect(getTou(state.p.bf.find(x => x.iid === 'cr-1'), state)).toBe(2);
    expect(getTou(state.o.bf.find(x => x.iid === 'cr-2'), state)).toBe(2);
  });

  it('Fortified Area: Wall creatures you control get +1/+0 and banding', () => {
    const wall = makeCreature('wall-1', { controller: 'p', subtype: 'Wall', power: 0, toughness: 4 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wall, fortifiedAreaEnch()] });
    const w = state.p.bf.find(x => x.iid === 'wall-1');
    expect(getPow(w, state)).toBe(1);
    expect(hasKw(w, KEYWORDS.BANDING.id, state)).toBe(true);
  });

  it('Fortified Area: does not affect non-Wall creatures', () => {
    const bear = makeCreature('cr-1', { controller: 'p', subtype: 'Bear', power: 2, toughness: 2 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [bear, fortifiedAreaEnch()] });
    expect(getPow(state.p.bf.find(x => x.iid === 'cr-1'), state)).toBe(2);
  });

  it('Weakstone: attacking creatures get -1/-0, either side', () => {
    const attP = makeCreature('cr-1', { controller: 'p', attacking: true, power: 3 });
    const attO = makeCreature('cr-2', { controller: 'o', attacking: true, power: 2 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [attP, weakstoneArt()], oBf: [attO] });
    expect(getPow(state.p.bf.find(x => x.iid === 'cr-1'), state)).toBe(2);
    expect(getPow(state.o.bf.find(x => x.iid === 'cr-2'), state)).toBe(1);
  });

  it('Weakstone: does not affect non-attacking creatures', () => {
    const idle = makeCreature('cr-1', { controller: 'p', attacking: false, power: 3 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [idle, weakstoneArt()] });
    expect(getPow(state.p.bf.find(x => x.iid === 'cr-1'), state)).toBe(3);
  });

  it("Moat: a non-flying creature can't be declared an attacker", () => {
    const ground = makeCreature('cr-1', { controller: 'p', keywords: [], summoningSick: false });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [ground], oBf: [moatEnch()] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'cr-1' });
    expect(s1.attackers).toEqual([]);
  });

  it('Moat: a flying creature can still attack', () => {
    const flier = makeCreature('cr-1', { controller: 'p', keywords: [KEYWORDS.FLYING.id], summoningSick: false });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [flier], oBf: [moatEnch()] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'cr-1' });
    expect(s1.attackers).toEqual(['cr-1']);
  });

  it("Water Wurm: gets +0/+1 when an opponent controls an Island", () => {
    const wurm = makeCreature('ww-1', { id: 'water_wurm', name: 'Water Wurm', controller: 'p', power: 1, toughness: 1, layerDef: { layer: '7a', toughnessFn: 'waterWurmToughness' } });
    const oIsland = makeLand('l-1', { controller: 'o', subtype: 'Basic Island' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wurm], oBf: [oIsland] });
    expect(getTou(state.p.bf.find(x => x.iid === 'ww-1'), state)).toBe(2);
  });

  it('Water Wurm: stays 1/1 when the opponent controls no Island', () => {
    const wurm = makeCreature('ww-1', { id: 'water_wurm', name: 'Water Wurm', controller: 'p', power: 1, toughness: 1, layerDef: { layer: '7a', toughnessFn: 'waterWurmToughness' } });
    const oForest = makeLand('l-1', { controller: 'o', subtype: 'Basic Forest' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wurm], oBf: [oForest] });
    expect(getTou(state.p.bf.find(x => x.iid === 'ww-1'), state)).toBe(1);
  });

});
