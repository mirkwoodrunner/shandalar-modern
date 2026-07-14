// tests/scenarios/type-change-cards.test.js
// Deferral Sweep 2: Living Lands, Kormus Bell, Blood Moon, Evil Presence.
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, isCre, isLand, getPow, getTou, canBlockDuel, recomputeTypeEffects, resolveCombat } from '../../src/engine/DuelCore.js';
import { computeCharacteristics } from '../../src/engine/layers.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function withMana(state, who, mana) {
  return { ...state, [who]: { ...state[who], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } } };
}

// Fixtures mirror the CARD_DB entries in cards.js exactly -- CAST_SPELL/resolveEff use the
// hand card object as-is (no CARD_DB relookup by id), so `effect`/`globalTypeEffect`/`mod`
// must be present on the fixture, not just `id`/`name`.
const LIVING_LANDS = { id: 'living_lands', name: 'Living Lands', type: 'Enchantment', color: 'G', cmc: 4, cost: '3G', keywords: [],
  effect: 'globalTypeEffect', globalTypeEffect: { filter: 'Forest', addTypes: ['Creature'], setPower: 1, setToughness: 1 } };
const KORMUS_BELL = { id: 'kormus_bell', name: 'Kormus Bell', type: 'Artifact', color: '', cmc: 4, cost: '4', keywords: [],
  effect: 'globalTypeEffect', globalTypeEffect: { filter: 'Swamp', addTypes: ['Creature'], setPower: 1, setToughness: 1, setColor: 'B' } };
const BLOOD_MOON = { id: 'blood_moon', name: 'Blood Moon', type: 'Enchantment', color: 'R', cmc: 3, cost: '2R', keywords: [],
  effect: 'globalTypeEffect', globalTypeEffect: { filter: 'nonBasicLand', setSubtypes: ['Mountain'] } };
const EVIL_PRESENCE = { id: 'evil_presence', name: 'Evil Presence', type: 'Enchantment', subtype: 'Aura', color: 'B', cmc: 1, cost: 'B', keywords: [],
  effect: 'enchantLand', mod: { layerDef: { layer: 4, setSubtypes: ['Swamp'] } } };
const DISENCHANT = { id: 'disenchant', name: 'Disenchant', type: 'Instant', color: 'W', cmc: 2, cost: '1W', keywords: [], effect: 'destroyArtOrEnch' };
const LIGHTNING_BOLT = { id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant', color: 'R', cmc: 1, cost: 'R', keywords: [], effect: 'damage3' };

describe('@engine-layers-copy-2 Scenario: Deferral Sweep 2 -- type-changing continuous effects', () => {

  it('Living Lands: animates only Forests, leaving other lands and creatures untouched', () => {
    const forest = makeLand('forest-1', { subtype: 'Forest' });
    const island = makeLand('island-1', { id: 'island', name: 'Island', subtype: 'Island', produces: ['U'] });
    const bear = makeCreature('bear-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [forest, island, bear], pHand: [{ ...LIVING_LANDS, iid: 'll-hand' }] });
    state = withMana(state, 'p', { G: 1, C: 3 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'll-hand' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const bakedForest = s2.p.bf.find(c => c.iid === 'forest-1');
    const bakedIsland = s2.p.bf.find(c => c.iid === 'island-1');
    const bakedBear = s2.p.bf.find(c => c.iid === 'bear-1');

    expect(isCre(bakedForest)).toBe(true);
    expect(isLand(bakedForest)).toBe(true);
    expect(getPow(bakedForest, s2)).toBe(1);
    expect(getTou(bakedForest, s2)).toBe(1);

    expect(isCre(bakedIsland)).toBe(false); // not a Forest -- untouched
    expect(isCre(bakedBear)).toBe(true);
    expect(getPow(bakedBear, s2)).toBe(2); // Grizzly Bears baseline, unaffected
  });

  it('Living Lands: animation ends and the Forest reverts when it leaves the battlefield', () => {
    const forest = makeLand('forest-1', { subtype: 'Forest' });
    const living = { ...LIVING_LANDS, iid: 'll-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], enterTs: 1 };
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [forest, living], pHand: [{ ...DISENCHANT, iid: 'destroy-hand' }] });
    state = withMana(state, 'p', { W: 1, C: 1 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'destroy-hand', tgt: 'll-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.bf.find(c => c.iid === 'll-1')).toBeUndefined();
    const revertedForest = s2.p.bf.find(c => c.iid === 'forest-1');
    expect(isCre(revertedForest)).toBe(false);
    expect(isLand(revertedForest)).toBe(true);
  });

  it('Living Lands: an animated Forest that takes lethal damage dies to the graveyard as a land', () => {
    const forest = makeLand('forest-1', { subtype: 'Forest' });
    // Cast Living Lands through the real pipeline first so recomputeTypeEffects has
    // already baked the Forest's typeEff before Lightning Bolt is cast -- placing an
    // already-active Living Lands directly on the battlefield via factories would skip
    // the choke point that bakes it, understating what a real game sequence produces.
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [forest], pHand: [{ ...LIVING_LANDS, iid: 'll-hand' }] });
    state = withMana(state, 'p', { G: 1, C: 3 });
    const afterLL = duelReducer(duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'll-hand' }), { type: 'RESOLVE_STACK' });
    expect(isCre(afterLL.p.bf.find(c => c.iid === 'forest-1'))).toBe(true);

    let state2 = { ...afterLL, p: { ...afterLL.p, hand: [{ ...LIGHTNING_BOLT, iid: 'bolt-hand' }] } };
    state2 = withMana(state2, 'p', { R: 1 });

    const s1 = duelReducer(state2, { type: 'CAST_SPELL', who: 'p', iid: 'bolt-hand', tgt: 'forest-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.bf.find(c => c.iid === 'forest-1')).toBeUndefined();
    const gyForest = s2.p.gy.find(c => c.iid === 'forest-1');
    expect(gyForest).toBeDefined();
    expect(gyForest.type).toBe('Land');
    expect(isCre(gyForest)).toBe(false);
  });

  it('Kormus Bell: makes Swamps 1/1 black creatures that are still lands', () => {
    const swamp = makeLand('swamp-1', { id: 'swamp', name: 'Swamp', subtype: 'Swamp', color: '', produces: ['B'] });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [swamp], pHand: [{ ...KORMUS_BELL, iid: 'kb-hand' }] });
    state = withMana(state, 'p', { C: 4 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'kb-hand' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const bakedSwamp = s2.p.bf.find(c => c.iid === 'swamp-1');
    expect(isCre(bakedSwamp)).toBe(true);
    expect(isLand(bakedSwamp)).toBe(true);
    expect(getPow(bakedSwamp, s2)).toBe(1);
    expect(getTou(bakedSwamp, s2)).toBe(1);
    expect(s2.p.bf.find(c => c.iid === 'kb-hand')).toBeDefined(); // Kormus Bell itself resolves onto the bf
    expect(computeCharacteristics(bakedSwamp, s2).color).toBe('B');
  });

  it('Evil Presence: enchanted land becomes a Swamp and loses its Forest identity', () => {
    const forest = makeLand('forest-1', { subtype: 'Forest' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [forest], pHand: [{ ...EVIL_PRESENCE, iid: 'ep-hand' }] });
    state = withMana(state, 'p', { B: 1 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ep-hand', tgt: 'forest-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const bakedForest = s2.p.bf.find(c => c.iid === 'forest-1');
    expect(bakedForest.subtypeEff).toBe('Swamp');
    expect(bakedForest.landTypeOverride).toBe('Swamp');
    expect(isLand(bakedForest)).toBe(true);
    expect(isCre(bakedForest)).toBe(false); // Evil Presence does not animate -- still just a land

    // Its printed abilities (tapping for G as a Forest) are lost -- it now taps for B only.
    const s3 = duelReducer(s2, { type: 'TAP_LAND', who: 'p', iid: 'forest-1' });
    expect(s3.p.mana.B).toBe(1);
    expect(s3.p.mana.G).toBe(0);
  });

  it('Blood Moon: nonbasic lands become Mountains and tap for {R} only', () => {
    const dual = makeLand('dual-1', { id: 'taiga', name: 'Taiga', subtype: undefined, color: '', produces: ['R', 'G'] });
    const basicForest = makeLand('forest-1', { subtype: 'Basic Forest' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dual, basicForest], pHand: [{ ...BLOOD_MOON, iid: 'bm-hand' }] });
    state = withMana(state, 'p', { R: 1, C: 2 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'bm-hand' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    const bakedDual = s2.p.bf.find(c => c.iid === 'dual-1');
    const bakedBasic = s2.p.bf.find(c => c.iid === 'forest-1');
    expect(bakedDual.landTypeOverride).toBe('Mountain');
    expect(bakedBasic.landTypeOverride).toBeUndefined(); // basic lands are unaffected

    const s3 = duelReducer(s2, { type: 'TAP_LAND', who: 'p', iid: 'dual-1' });
    expect(s3.p.mana.R).toBe(1);
    expect(s3.p.mana.G).toBe(0);

    // Basic Forest still taps for G as normal.
    const s4 = duelReducer(s2, { type: 'TAP_LAND', who: 'p', iid: 'forest-1' });
    expect(s4.p.mana.G).toBe(1);
  });

  it('Blood Moon: reverts every nonbasic land when it leaves the battlefield', () => {
    const dual = makeLand('dual-1', { id: 'taiga', name: 'Taiga', subtype: undefined, color: '', produces: ['R', 'G'] });
    const moon = { ...BLOOD_MOON, iid: 'bm-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], enterTs: 1 };
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dual, moon], pHand: [{ ...DISENCHANT, iid: 'destroy-hand' }] });
    state = withMana(state, 'p', { W: 1, C: 1 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'destroy-hand', tgt: 'bm-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.p.bf.find(c => c.iid === 'bm-1')).toBeUndefined();
    const revertedDual = s2.p.bf.find(c => c.iid === 'dual-1');
    expect(revertedDual.landTypeOverride).toBeUndefined();

    const s3 = duelReducer(s2, { type: 'TAP_LAND', who: 'p', iid: 'dual-1', mana: 'G' });
    expect(s3.p.mana.G).toBe(1);
  });

  it('Kormus Bell: an animated Swamp gets protection-from-black interactions via its computed color', () => {
    const swamp = makeLand('swamp-1', { id: 'swamp', name: 'Swamp', subtype: 'Swamp', color: '', produces: ['B'] });
    const bell = { ...KORMUS_BELL, iid: 'kb-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], enterTs: 1 };
    const protFromBlack = makeCreature('pfb-1', { controller: 'o', keywords: [KEYWORDS.PROTECTION.id], protection: ['black'] });
    const state0 = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [swamp, bell], oBf: [protFromBlack] });
    // A raw makeState board doesn't run recomputeTypeEffects on its own -- bake it directly,
    // matching how it's actually invoked from the engine's zone-change choke points.
    const state = recomputeTypeEffects(state0);
    const bakedSwamp = state.p.bf.find(c => c.iid === 'swamp-1');
    expect(canBlockDuel(protFromBlack, bakedSwamp, state.p.bf, state)).toBe(false);
  });

  it('Stage 3 -- mid-combat revert: destroying Living Lands while the animated Forest is attacking removes it from combat and deals no damage', () => {
    const forest = makeLand('forest-1', { subtype: 'Forest' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [forest], pHand: [{ ...LIVING_LANDS, iid: 'll-hand' }] });
    state = withMana(state, 'p', { G: 1, C: 3 });
    let s = duelReducer(duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'll-hand' }), { type: 'RESOLVE_STACK' });
    expect(isCre(s.p.bf.find(c => c.iid === 'forest-1'))).toBe(true);

    // Declare the animated Forest as an attacker.
    s = { ...s, phase: PHASE.COMBAT_ATTACKERS };
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'forest-1' });
    expect(s.attackers).toEqual(['forest-1']);
    const blocker = makeCreature('blocker-1', { controller: 'o', power: 0, toughness: 5 });
    s = { ...s, o: { ...s.o, bf: [blocker] } };

    // Destroy Living Lands with the Forest still marked as attacking.
    s = { ...s, phase: PHASE.MAIN_1, p: { ...s.p, hand: [{ ...DISENCHANT, iid: 'destroy-hand' }] } };
    s = withMana(s, 'p', { W: 1, C: 1 });
    const llIid = s.p.bf.find(c => c.name === 'Living Lands').iid;
    s = duelReducer(s, { type: 'CAST_SPELL', who: 'p', iid: 'destroy-hand', tgt: llIid });
    s = duelReducer(s, { type: 'RESOLVE_STACK' });

    // The Forest reverted and was spliced out of combat -- it's no longer a legal attacker.
    const revertedForest = s.p.bf.find(c => c.iid === 'forest-1');
    expect(isCre(revertedForest)).toBe(false);
    expect(revertedForest.attacking).toBe(false);
    expect(s.attackers).not.toContain('forest-1');

    // Even if something were to resolve combat damage now, the reverted land deals none
    // (resolveCombat's isCre guard skips it, same as an attacker that died mid-combat).
    const before = s.o.life;
    const afterCombat = resolveCombat(s);
    expect(afterCombat.o.life).toBe(before);
  });

});
