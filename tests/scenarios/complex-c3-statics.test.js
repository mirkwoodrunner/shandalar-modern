// tests/scenarios/complex-c3-statics.test.js
// Complex-tier stub cards implemented from Card-Forge/forge reference scripts
// (GPL-3.0), sub-batch C3: static/continuous effects.
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, getPow, getTou, hasKw } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeArt(iid, overrides = {}) {
  return { iid, id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 0, ...overrides };
}

describe('@engine-tier-complex-1 Scenario: Complex-tier Forge batch C3 -- static/continuous effects', () => {

  it("Angry Mob: 2 + opponent's Swamps on its controller's turn, flat 2/2 otherwise", () => {
    const mob = makeCreature('am-1', { id: 'angry_mob', name: 'Angry Mob', controller: 'p', power: 2, toughness: 2, layerDef: { layer: '7a', powerFn: 'angryMobPT', toughnessFn: 'angryMobPT' } });
    const swamp1 = makeLand('sw1', { controller: 'o', subtype: 'Swamp' });
    const swamp2 = makeLand('sw2', { controller: 'o', subtype: 'Swamp' });
    const stateP = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [mob], oBf: [swamp1, swamp2] });
    expect(getPow(mob, stateP)).toBe(4);
    expect(getTou(mob, stateP)).toBe(4);
    const stateO = { ...stateP, active: 'o' };
    expect(getPow(mob, stateO)).toBe(2);
    expect(getTou(mob, stateO)).toBe(2);
  });

  it('Rabid Wombat: +2/+2 for each attached Aura', () => {
    const aura1 = { iid: 'a1', name: 'Blessing', mod: {}, controller: 'p', cardData: {} };
    const aura2 = { iid: 'a2', name: 'Unholy Strength', mod: {}, controller: 'p', cardData: {} };
    const wombat = makeCreature('rw-1', { name: 'Rabid Wombat', controller: 'p', power: 0, toughness: 1, enchantments: [aura1, aura2] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wombat] });
    expect(getPow(wombat, state)).toBe(4);
    expect(getTou(wombat, state)).toBe(5);
  });

  it("Damping Field: caps a player's untapping artifacts to 1 per untap step", () => {
    const damping = { iid: 'df-1', id: 'damping_field', name: 'Damping Field', type: 'Enchantment', controller: 'p' };
    const art1 = makeArt('a1', { tapped: true });
    const art2 = makeArt('a2', { tapped: true });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [damping, art1, art2] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    expect(s1.active).toBe('p');
    const untappedCount = s1.p.bf.filter(c => c.iid !== 'df-1' && !c.tapped).length;
    expect(untappedCount).toBe(1);
  });

  it('Hidden Path: green creatures gain forestwalk', () => {
    const path = { iid: 'hp-1', id: 'hidden_path', name: 'Hidden Path', type: 'Enchantment', controller: 'p' };
    const greenCre = makeCreature('gc-1', { controller: 'p', color: 'G' });
    const blackCre = makeCreature('bc-1', { controller: 'p', color: 'B' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [path, greenCre, blackCre] });
    expect(hasKw(greenCre, 'FORESTWALK', state)).toBe(true);
    expect(hasKw(blackCre, 'FORESTWALK', state)).toBe(false);
  });

  it("Energy Flux: opponent's artifact is sacrificed at their upkeep (mana always burns to 0 at the phase boundary before this check runs, same convention as Force of Nature's auto-decide branch)", () => {
    const flux = { iid: 'ef-1', id: 'energy_flux', name: 'Energy Flux', type: 'Enchantment', controller: 'p' };
    const oArt = makeArt('oa-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'p', pBf: [flux], oBf: [oArt] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UNTAP (o's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    expect(s2.o.bf.some(c => c.iid === 'oa-1')).toBe(false);
  });

  it('Energy Flux: player pays {2} via the upkeep choice, artifact survives', () => {
    const flux = { iid: 'ef-1', id: 'energy_flux', name: 'Energy Flux', type: 'Enchantment', controller: 'p' };
    const pArt = makeArt('pa-1', { controller: 'p' });
const base = { ...makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [flux, pArt] }),
      pendingUpkeepChoice: { cardName: 'Mox Ruby', handlerKey: 'energyFluxUpkeep', iid: 'pa-1' } };
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s1.p.bf.some(c => c.iid === 'pa-1')).toBe(true);
    expect(s1.p.mana.C).toBe(0);
  });

  it('Energy Flux: player declines to pay, artifact is sacrificed', () => {
    const pArt = makeArt('pa-1', { controller: 'p' });
    const base = { ...makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [pArt] }),
      pendingUpkeepChoice: { cardName: 'Mox Ruby', handlerKey: 'energyFluxUpkeep', iid: 'pa-1' } };
    const s1 = duelReducer(base, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s1.p.bf.some(c => c.iid === 'pa-1')).toBe(false);
  });

  it("Farmstead: enchants a land, controller may pay WW at upkeep for 1 life", () => {
    const spell = { iid: 'fs-1', id: 'farmstead', name: 'Farmstead', type: 'Enchantment', cmc: 3, cost: 'WWW', effect: 'enchantLand', mod: {} };
    const land = makeLand('l-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], pBf: [land] });
    const state = { ...base, p: { ...base.p, mana: { W: 3, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'fs-1', tgt: 'l-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'l-1').enchantments.some(e => e.name === 'Farmstead')).toBe(true);
  });

  it('Farmstead: pay-WW upkeep choice gains 1 life', () => {
    const farmsteadAura = { iid: 'fs-1', name: 'Farmstead', mod: {}, controller: 'p', cardData: {} };
    const land = makeLand('l-1', { controller: 'p', enchantments: [farmsteadAura] });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [land] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2raw = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues the choice
    expect(s2raw.pendingUpkeepChoice?.handlerKey).toBe('farmsteadUpkeep');
    // Mana burns at phase boundaries (classic rule); tap for WW in response to the
    // upkeep choice itself, same as a live player would after seeing the prompt.
    const s2 = { ...s2raw, p: { ...s2raw.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s3.p.life).toBe(21);
    expect(s3.p.mana.W).toBe(0);
  });

  it('Phantasmal Terrain: enchants a land and presents a basic-land-type choice', () => {
    const spell = { iid: 'pt-1', id: 'phantasmal_terrain', name: 'Phantasmal Terrain', type: 'Enchantment', cmc: 2, cost: 'UU', effect: 'phantasmalTerrainEnchant' };
    const land = makeLand('l-1', { controller: 'p', subtype: 'Island' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], pBf: [land] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'pt-1', tgt: 'l-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('basicLandTypeChoice');
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'Mountain' });
    const landAfter = s3.p.bf.find(c => c.iid === 'l-1');
    expect(landAfter.subtypeEff).toContain('Mountain');
    expect(landAfter.subtypeEff).not.toContain('Island');
  });
});
