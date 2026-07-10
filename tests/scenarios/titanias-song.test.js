// tests/scenarios/titanias-song.test.js
// Titania's Song: "Each noncreature artifact loses all abilities and becomes
// an artifact creature with power and toughness each equal to its mana value.
// If this enchantment leaves the battlefield, this effect continues until end
// of turn." Uses the shared emblem infrastructure (see
// tests/scenarios/emblem-infrastructure.test.js) for the "continues after it
// leaves" tail.
// Adapted from Card-Forge/forge (t/titanias_song.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, zMove, recomputeTypeEffects, isCre } from '../../src/engine/DuelCore.js';
import { computeCharacteristics } from '../../src/engine/layers.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import { getCardById } from '../../src/data/cards.js';

function makeArtifact(iid, overrides = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
    cmc: 3, cost: '3', keywords: [], protection: [], tapped: false, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    ...overrides,
  };
}

function makeArtifactCreature(iid, overrides = {}) {
  return {
    iid, id: 'test_art_creature', name: 'Test Artifact Creature', type: 'Artifact Creature',
    subtype: 'Golem', color: '', cmc: 3, cost: '3', power: 2, toughness: 2, keywords: [],
    protection: [], tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
    ...overrides,
  };
}

function makeSong(iid, overrides = {}) {
  const def = getCardById('titaniass_song');
  return {
    iid, tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p', enterTs: 1,
    ...def,
    ...overrides,
  };
}

describe("@engine Scenario: Titania's Song", () => {

  it('TS-01: a noncreature artifact on the battlefield becomes a Creature (Layer 4) while Titania\'s Song is in play', () => {
    const art = makeArtifact('art-1');
    const song = makeSong('song-1');
    const state = makeState({ pBf: [art, song] });

    const ch = computeCharacteristics(art, state);
    expect(ch.types).toContain('Creature');
    expect(ch.types).toContain('Artifact');
  });

  it("TS-02: that artifact's keywords and protection are wiped (Layer 6)", () => {
    const art = makeArtifact('art-1', { keywords: ['FLYING'], protection: ['R'] });
    const song = makeSong('song-1');
    const state = makeState({ pBf: [art, song] });

    const ch = computeCharacteristics(art, state);
    expect(ch.keywords).toEqual([]);
    expect(ch.protection).toEqual([]);
  });

  it('TS-03: its power/toughness equal its own cmc (Layer 7a via manaValueCDA)', () => {
    const art = makeArtifact('art-1', { cmc: 6 });
    const song = makeSong('song-1');
    const state = makeState({ pBf: [art, song] });

    const ch = computeCharacteristics(art, state);
    expect(ch.power).toBe(6);
    expect(ch.toughness).toBe(6);
  });

  it('TS-04: an artifact CREATURE (already a creature type) is unaffected by the filter', () => {
    const artCre = makeArtifactCreature('ac-1', { keywords: ['FLYING'], power: 2, toughness: 2 });
    const song = makeSong('song-1');
    const state = makeState({ pBf: [artCre, song] });

    const ch = computeCharacteristics(artCre, state);
    expect(ch.keywords).toContain('FLYING');
    expect(ch.power).toBe(2);
    expect(ch.toughness).toBe(2);
  });

  it('TS-05: a non-artifact permanent is unaffected', () => {
    const bear = makeCreature('bear-1', { controller: 'p', power: 2, toughness: 2 });
    const song = makeSong('song-1');
    const state = makeState({ pBf: [bear, song] });

    const ch = computeCharacteristics(bear, state);
    expect(ch.power).toBe(2);
    expect(ch.toughness).toBe(2);
    expect(ch.types).not.toContain('Artifact');
  });

  it('TS-06: Titania\'s Song leaving the battlefield creates an endOfTurn emblem carrying the same globalTypeEffect', () => {
    const song = makeSong('song-1', { controller: 'p' });
    let state = makeState({ pBf: [song] });

    state = zMove(state, 'song-1', 'p', 'p', 'gy');

    expect(state.p.emblems.length).toBe(1);
    const emblem = state.p.emblems[0];
    expect(emblem.duration).toBe('endOfTurn');
    expect(emblem.controller).toBe('p');
    expect(emblem.globalTypeEffect).toEqual(getCardById('titaniass_song').globalTypeEffect);
  });

  it("TS-07: the effect still applies to artifacts via the emblem after Titania's Song is gone", () => {
    const art = makeArtifact('art-1');
    const song = makeSong('song-1', { controller: 'p' });
    let state = makeState({ pBf: [art, song] });

    state = zMove(state, 'song-1', 'p', 'p', 'gy');
    const artAfter = state.p.bf.find(c => c.iid === 'art-1');

    const ch = computeCharacteristics(artAfter, state);
    expect(ch.types).toContain('Creature');
    expect(ch.power).toBe(artAfter.cmc);
  });

  it('TS-08: the emblem clears at CLEANUP and artifacts revert to normal on the next characteristic read', () => {
    const art = makeArtifact('art-1');
    const song = makeSong('song-1', { controller: 'p' });
    let state = makeState({ phase: PHASE.END, active: 'p', pBf: [art, song] });

    state = zMove(state, 'song-1', 'p', 'p', 'gy');
    expect(state.p.emblems.length).toBe(1);

    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.phase).toBe(PHASE.CLEANUP);
    expect(s1.p.emblems).toEqual([]);

    const artAfter = s1.p.bf.find(c => c.iid === 'art-1');
    const ch = computeCharacteristics(artAfter, s1);
    expect(ch.types).not.toContain('Creature');
    // The CLEANUP emblem sweep must also rebake typeEff -- removing an emblem
    // from state.emblems is not a zone move, so it does not get this for free
    // the way a battlefield permanent leaving play does via zMove's own
    // recomputeTypeEffects call. isCre() reads the baked field directly.
    expect(isCre(artAfter)).toBe(false);
  });

  it('TS-09: a Layer 6 effect with a later timestamp than the wipe still applies afterward', () => {
    const song = makeSong('song-1', { enterTs: 1 });
    const laterAura = { iid: 'aura-1', enterTs: 5, mod: { keywords: ['FLYING'] } };
    const art = makeArtifact('art-1', { enchantments: [laterAura] });
    const state = makeState({ pBf: [art, song] });

    const ch = computeCharacteristics(art, state);
    // The wipe (ts=1) clears keywords first; the later-timestamped aura (ts=5)
    // re-adds FLYING afterward in the same sorted Layer 6 pass -- correct CR
    // 613 timestamp behavior, not a special case.
    expect(ch.keywords).toContain('FLYING');
  });

  it("TS-10: matchesGlobalTypeFilter's nonCreatureArtifact check is unaffected by Layer 4 already having added Creature this same pass", () => {
    const art = makeArtifact('art-1');
    const song = makeSong('song-1');
    let state = makeState({ pBf: [art, song] });

    // Bake typeEff onto the artifact (as the real recompute pipeline does every tick).
    state = recomputeTypeEffects(state);
    const bakedArt = state.p.bf.find(c => c.iid === 'art-1');
    expect(bakedArt.typeEff).toBe('Artifact Creature');

    // Re-running computeCharacteristics against the now-baked card must still
    // detect it as a noncreature artifact via its base card.type (unaffected
    // by its own already-baked typeEff) -- otherwise the effect would "fall
    // off" the moment it was first applied.
    const ch = computeCharacteristics(bakedArt, state);
    expect(ch.types).toContain('Creature');
    expect(ch.power).toBe(bakedArt.cmc);
  });

});
