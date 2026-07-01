// tests/scenarios/simple-tier-forge-batch-abilities.test.js
// Simple-tier Alpha/Beta stub cards implemented from Card-Forge/forge reference
// scripts (GPL-3.0). Covers activated-ability cards, including the new
// ACTIVATE_ABILITY cost tokens (sacArt, exile, discardLastDrawn) added for
// this batch. See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

describe('@engine Scenario: Simple-tier Forge batch -- activated abilities', () => {

  it('Orcish Mechanics (T,sacArt cost): sacrifices an artifact you control, deals 2 damage on resolve', () => {
    const mechanics = makeCreature('om-1', {
      id: 'orcish_mechanics', name: 'Orcish Mechanics', controller: 'p',
      activated: { cost: 'T,sacArt', effect: 'damage2Any' },
    });
    const art = { iid: 'art-1', id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [mechanics, art] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'om-1', tgt: 'o' });

    // Artifact sacrificed as cost, ability creature untouched (not itself sacrificed).
    expect(s1.p.bf.some(c => c.iid === 'art-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'art-1')).toBe(true);
    expect(s1.p.bf.some(c => c.iid === 'om-1')).toBe(true);
    expect(s1.stack).toHaveLength(1);

    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.life).toBe(18);
  });

  it('Orcish Mechanics: cannot activate with no artifact to sacrifice', () => {
    const mechanics = makeCreature('om-1', {
      id: 'orcish_mechanics', name: 'Orcish Mechanics', controller: 'p',
      activated: { cost: 'T,sacArt', effect: 'damage2Any' },
    });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [mechanics] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'om-1', tgt: 'o' });
    expect(s1.stack).toHaveLength(0);
    expect(s1.p.bf.find(c => c.iid === 'om-1').tapped).toBe(false);
  });

  it("Feldon's Cane (T,exile cost): exiles itself, shuffles graveyard into library", () => {
    const cane = { iid: 'fc-1', id: 'feldonss_cane', name: "Feldon's Cane", type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], activated: { cost: 'T,exile', effect: 'shuffleGYIntoLibrary' } };
    const gy1 = makeLand('gy-1'); const gy2 = makeLand('gy-2');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cane] });
    const state = { ...base, p: { ...base.p, gy: [gy1, gy2] } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'fc-1' });

    // Exiled as cost, not in gy or bf.
    expect(s1.p.exile.some(c => c.iid === 'fc-1')).toBe(true);
    expect(s1.p.bf.some(c => c.iid === 'fc-1')).toBe(false);

    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.gy).toHaveLength(0);
    expect(s2.p.lib.map(c => c.iid).sort()).toEqual(['gy-1', 'gy-2']);
  });

  it("Jandor's Ring (discardLastDrawn cost): discards last card in hand, draws a new one", () => {
    const ring = { iid: 'jr-1', id: 'jandorss_ring', name: "Jandor's Ring", type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], activated: { cost: '2,T,discardLastDrawn', effect: 'draw1' } };
    const held = makeLand('h-1');
    const drawnCard = makeLand('h-2');
    const libCard = makeLand('lib-1');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ring], pHand: [held, drawnCard] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 }, lib: [libCard] } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'jr-1' });

    // Last card in hand (drawnCard, "the last card drawn" approximation) discarded as cost.
    expect(s1.p.hand.some(c => c.iid === 'h-2')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'h-2')).toBe(true);
    expect(s1.p.mana.C).toBe(0);

    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.some(c => c.iid === 'lib-1')).toBe(true);
  });

  it('Hyperion Blacksmith (tapOrUntapArtifact): taps an untapped opponent artifact', () => {
    const smith = makeCreature('hb-1', { id: 'hyperion_blacksmith', name: 'Hyperion Blacksmith', controller: 'p', activated: { cost: 'T', effect: 'tapOrUntapArtifact' } });
    const oArt = { iid: 'oa-1', id: 'mox_jet', name: 'Mox Jet', type: 'Artifact', controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [smith], oBf: [oArt] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hb-1', tgt: 'oa-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'oa-1').tapped).toBe(true);
  });

  it('Hyperion Blacksmith: untaps a tapped opponent artifact', () => {
    const smith = makeCreature('hb-1', { id: 'hyperion_blacksmith', name: 'Hyperion Blacksmith', controller: 'p', activated: { cost: 'T', effect: 'tapOrUntapArtifact' } });
    const oArt = { iid: 'oa-1', id: 'mox_jet', name: 'Mox Jet', type: 'Artifact', controller: 'o', tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [smith], oBf: [oArt] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hb-1', tgt: 'oa-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'oa-1').tapped).toBe(false);
  });

  it('Fellwar Stone (addManaReflected): adds a color an opponent land could produce', () => {
    const stone = { iid: 'fw-1', id: 'fellwar_stone', name: 'Fellwar Stone', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], activated: { cost: 'T', effect: 'addManaReflected' } };
    const oLand = makeLand('ol-1', { controller: 'o', id: 'island', subtype: 'Basic Island', produces: ['U'] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [stone], oBf: [oLand] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'fw-1' });
    expect(s1.p.mana.U).toBe(1);
  });

  it('Grapeshot Catapult (damage1Flying): only damages a creature with flying', () => {
    const catapult = makeCreature('gc-1', { id: 'grapeshot_catapult', name: 'Grapeshot Catapult', controller: 'p', activated: { cost: 'T', effect: 'damage1Flying' } });
    const flier = makeCreature('fl-1', { controller: 'o', keywords: [KEYWORDS.FLYING.id], toughness: 2, damage: 0 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [catapult], oBf: [flier] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'gc-1', tgt: 'fl-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'fl-1').damage).toBe(1);
  });

  it('Grapeshot Catapult: fizzles against a non-flying creature', () => {
    const catapult = makeCreature('gc-1', { id: 'grapeshot_catapult', name: 'Grapeshot Catapult', controller: 'p', activated: { cost: 'T', effect: 'damage1Flying' } });
    const grounded = makeCreature('gr-1', { controller: 'o', keywords: [], toughness: 2, damage: 0 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [catapult], oBf: [grounded] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'gc-1', tgt: 'gr-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'gr-1').damage).toBe(0);
  });

  it("Argivian Archaeologist (WW,T -> returnArtifactFromGYToHand): returns own artifact from graveyard", () => {
    const archaeologist = makeCreature('aa-1', { id: 'argivian_archaeologist', name: 'Argivian Archaeologist', controller: 'p', activated: { cost: 'WW,T', effect: 'returnArtifactFromGYToHand' } });
    const art = { iid: 'gy-1', id: 'mox_pearl', name: 'Mox Pearl', type: 'Artifact', cmc: 0 };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [archaeologist] });
    const state = { ...base, p: { ...base.p, gy: [art], mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'aa-1', tgt: 'gy-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.some(c => c.iid === 'gy-1')).toBe(true);
    expect(s2.p.gy).toHaveLength(0);
  });

  it('Wyluli Wolf (reused pumpCreature via card.mod): pumps target creature +1/+1 EOT', () => {
    const wolf = makeCreature('ww-1', { id: 'wyluli_wolf', name: 'Wyluli Wolf', controller: 'p', activated: { cost: 'T', effect: 'pumpCreature' }, mod: { power: 1, toughness: 1 } });
    const target = makeCreature('t-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wolf, target] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ww-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 't-1').eotBuffs).toEqual([{ power: 1, toughness: 1 }]);
  });

  it("Mishra's Workshop: taps for {C}{C}{C} (3 colorless), not 1", () => {
    const workshop = makeLand('mw-1', { id: 'mishrass_workshop', name: "Mishra's Workshop", subtype: '', produces: ['C'] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [workshop] });
    const s1 = duelReducer(base, { type: 'TAP_LAND', who: 'p', iid: 'mw-1' });
    expect(s1.p.mana.C).toBe(3);
  });

  it('Coal Golem (3,sac -> addMana3Red): sacrifices itself, adds RRR on resolve', () => {
    const golem = makeCreature('cg-1', { id: 'coal_golem', name: 'Coal Golem', controller: 'p', activated: { cost: '3,sac', effect: 'addMana3Red' } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [golem] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cg-1' });
    expect(s1.p.bf.some(c => c.iid === 'cg-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'cg-1')).toBe(true);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.mana.R).toBe(3);
  });

});
