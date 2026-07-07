// tests/scenarios/batch-14-quick-win-stubs.test.js
// Batch 14 -- Quick-Win Stubs: Living Artifact, Elder Spawn, Osai Vultures,
// Scavenging Ghoul, Sage of Lat-Nam, Island of Wak-Wak, Urza's Avenger.
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkDeath, makeCardInstance, canBlockDuel } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

// Builds a real CARD_DB-backed battlefield instance with a known iid, ready to
// act (not summoning sick, untapped). Mirrors deferral-sweep-1's helper.
function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], ...overrides };
}

describe('@engine Scenario: batch-14 -- Living Artifact', () => {
  it('gets vitality counters equal to combat damage dealt to its controller, exactly once', () => {
    const artifact = { iid: 'art-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const living = makeReadyInstance('living_artifact', 'p', { enchantedArtifactIid: 'art-1', counters: {} });
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3 });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [living, artifact] });
    const state = { ...base, p: { ...base.p, life: 20 } };

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves

    expect(s5.p.life).toBe(17);
    expect(s5.p.bf.find(c => c.iid === 'living_artifact-1').counters.VITALITY).toBe(3); // not 6 (no double-fire)
  });

  it('does not trigger when the artifact controller is damaged instead of the Aura controller', () => {
    const artifact = { iid: 'art-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    // Living Artifact controlled by 'p', enchanting an artifact controlled by 'o'.
    const living = makeReadyInstance('living_artifact', 'p', { enchantedArtifactIid: 'art-1', counters: {} });
    const attacker = makeCreature('att-1', { controller: 'p', power: 2, toughness: 2 });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [attacker, living], oBf: [artifact] });
    const state = { ...base, o: { ...base.o, life: 20 } };

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' });

    expect(s5.o.life).toBe(18);
    expect(s5.p.bf.find(c => c.iid === 'living_artifact-1').counters?.VITALITY).toBeUndefined();
  });

  it('upkeep: removes a vitality counter and gains 1 life when its controller pays', () => {
    const artifact = { iid: 'art-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const living = makeReadyInstance('living_artifact', 'p', { enchantedArtifactIid: 'art-1', counters: { VITALITY: 2 } });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [living, artifact] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues the choice
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('livingArtifactUpkeep');
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s3.p.life).toBe(21);
    expect(s3.p.bf.find(c => c.iid === 'living_artifact-1').counters.VITALITY).toBe(1);
  });

  it('upkeep: does nothing when declined', () => {
    const artifact = { iid: 'art-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const living = makeReadyInstance('living_artifact', 'p', { enchantedArtifactIid: 'art-1', counters: { VITALITY: 2 } });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [living, artifact] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s3.p.life).toBe(20);
    expect(s3.p.bf.find(c => c.iid === 'living_artifact-1').counters.VITALITY).toBe(2);
  });

  it('upkeep: goes to the graveyard when no longer attached to an artifact', () => {
    const living = makeReadyInstance('living_artifact', 'p', { enchantedArtifactIid: 'gone-1', counters: { VITALITY: 3 } });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [living] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(s2.p.bf.some(c => c.iid === 'living_artifact-1')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'living_artifact-1')).toBe(true);
  });
});

describe('@engine Scenario: batch-14 -- Elder Spawn', () => {
  it("can't be blocked by red creatures", () => {
    const spawn = makeReadyInstance('elder_spawn', 'p');
    const redBlocker = makeCreature('rb-1', { controller: 'o', color: 'R' });
    expect(canBlockDuel(redBlocker, spawn, [])).toBe(false);
  });

  it('can be blocked by a non-red creature', () => {
    const spawn = makeReadyInstance('elder_spawn', 'p');
    const blueBlocker = makeCreature('bb-1', { controller: 'o', color: 'U' });
    expect(canBlockDuel(blueBlocker, spawn, [])).toBe(true);
  });

  it('upkeep: sacrifices an Island instead of itself when the controller pays', () => {
    const spawn = makeReadyInstance('elder_spawn', 'p');
    const island = makeLand('isl-1', { subtype: 'Island', controller: 'p' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [spawn, island] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('elderSpawnUpkeep');
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'SACRIFICE_ISLAND' });
    expect(s3.p.bf.some(c => c.iid === 'isl-1')).toBe(false);
    expect(s3.p.bf.some(c => c.iid === 'elder_spawn-1')).toBe(true);
    expect(s3.p.life).toBe(20);
  });

  it('upkeep: sacrifices itself and deals 6 damage when no Island is sacrificed', () => {
    const spawn = makeReadyInstance('elder_spawn', 'p');
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [spawn] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s3.p.bf.some(c => c.iid === 'elder_spawn-1')).toBe(false);
    expect(s3.p.life).toBe(14);
  });
});

describe('@engine Scenario: batch-14 -- Amrou Kithkin / Bog Rats block-restriction bugfix', () => {
  it("Amrou Kithkin can't be blocked by creatures with power 3 or greater", () => {
    const kithkin = makeReadyInstance('amrou_kithkin', 'p');
    const bigBlocker = makeCreature('big-1', { controller: 'o', power: 3, toughness: 3 });
    expect(canBlockDuel(bigBlocker, kithkin, [])).toBe(false);
  });

  it('Amrou Kithkin can be blocked by a creature with power under 3', () => {
    const kithkin = makeReadyInstance('amrou_kithkin', 'p');
    const smallBlocker = makeCreature('small-1', { controller: 'o', power: 2, toughness: 2 });
    expect(canBlockDuel(smallBlocker, kithkin, [])).toBe(true);
  });

  it("Bog Rats can't be blocked by Walls", () => {
    const bogRats = makeReadyInstance('bog_rats', 'p');
    const wall = makeCreature('wall-1', { controller: 'o', subtype: 'Wall' });
    expect(canBlockDuel(wall, bogRats, [])).toBe(false);
  });
});

describe('@engine Scenario: batch-14 -- Osai Vultures', () => {
  it('gets exactly 1 carrion counter regardless of how many creatures died this turn', () => {
    const vultures = makeReadyInstance('osai_vultures', 'p');
    const victim1 = makeCreature('v-1', { controller: 'o', toughness: 1, damage: 1 });
    const victim2 = makeCreature('v-2', { controller: 'o', toughness: 1, damage: 1 });
    const victim3 = makeCreature('v-3', { controller: 'o', toughness: 1, damage: 1 });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [vultures], oBf: [victim1, victim2, victim3] });
    const s1 = checkDeath(base); // three victims die -> creaturesDiedThisTurn: [v-1, v-2, v-3]
    const s2 = duelReducer({ ...s1, phase: PHASE.MAIN_2 }, { type: 'ADVANCE_PHASE' }); // MAIN_2 -> END
    expect(s2.p.bf.find(c => c.iid === 'osai_vultures-1').counters.CARRION).toBe(1);
  });

  it('gets no counter when nothing died this turn', () => {
    const vultures = makeReadyInstance('osai_vultures', 'p');
    const base = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [vultures] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' });
    expect(s1.p.bf.find(c => c.iid === 'osai_vultures-1').counters?.CARRION).toBeUndefined();
  });

  it('activated ability removes two carrion counters for +1/+1 until end of turn', () => {
    const vultures = makeReadyInstance('osai_vultures', 'p', { counters: { CARRION: 2 } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [vultures] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'osai_vultures-1' });
    expect(s1.stack.length).toBe(1);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const ov = s2.p.bf.find(c => c.iid === 'osai_vultures-1');
    expect(ov.counters.CARRION).toBe(0);
    expect(ov.eotBuffs).toContainEqual({ power: 1, toughness: 1 });
  });

  it('activation is rejected with fewer than two carrion counters', () => {
    const vultures = makeReadyInstance('osai_vultures', 'p', { counters: { CARRION: 1 } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [vultures] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'osai_vultures-1' });
    expect(s1.stack.length).toBe(0);
    expect(s1.p.bf.find(c => c.iid === 'osai_vultures-1').counters.CARRION).toBe(1);
  });
});

describe('@engine Scenario: batch-14 -- Scavenging Ghoul', () => {
  it('gets a corpse counter for each creature that died this turn', () => {
    const ghoul = makeReadyInstance('scavenging_ghoul', 'p');
    const victim1 = makeCreature('v-1', { controller: 'o', toughness: 1, damage: 1 });
    const victim2 = makeCreature('v-2', { controller: 'o', toughness: 1, damage: 1 });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [ghoul], oBf: [victim1, victim2] });
    const s1 = checkDeath(base);
    const s2 = duelReducer({ ...s1, phase: PHASE.MAIN_2 }, { type: 'ADVANCE_PHASE' });
    expect(s2.p.bf.find(c => c.iid === 'scavenging_ghoul-1').counters.CORPSE).toBe(2);
  });

  it('activated ability removes a corpse counter and regenerates', () => {
    const ghoul = makeReadyInstance('scavenging_ghoul', 'p', { counters: { CORPSE: 1 } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ghoul] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'scavenging_ghoul-1' });
    expect(s1.stack.length).toBe(1);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const sg = s2.p.bf.find(c => c.iid === 'scavenging_ghoul-1');
    expect(sg.counters.CORPSE).toBe(0);
    expect(sg.regenerating).toBe(true);
  });

  it('activation no-ops with zero corpse counters', () => {
    const ghoul = makeReadyInstance('scavenging_ghoul', 'p', { counters: {} });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ghoul] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'scavenging_ghoul-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const sg = s2.p.bf.find(c => c.iid === 'scavenging_ghoul-1');
    expect(sg.regenerating).toBeFalsy();
  });
});

describe('@engine Scenario: batch-14 -- Sage of Lat-Nam', () => {
  it('draws a card when tapped and an artifact is sacrificed', () => {
    const sage = makeReadyInstance('sage_of_lat_nam', 'p');
    const art = { iid: 'art-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const topOfLib = { iid: 'lib-1', id: 'forest', name: 'Forest', type: 'Land' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [sage, art] });
    const state = { ...base, p: { ...base.p, lib: [topOfLib] } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'sage_of_lat_nam-1' });
    expect(s1.p.gy.some(c => c.iid === 'art-1')).toBe(true); // sacrificed
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.some(c => c.iid === 'lib-1')).toBe(true);
  });

  it('activation is rejected with no artifact to sacrifice', () => {
    const sage = makeReadyInstance('sage_of_lat_nam', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [sage] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'sage_of_lat_nam-1' });
    expect(s1.p.bf.find(c => c.iid === 'sage_of_lat_nam-1').tapped).toBe(false);
    expect(s1.stack.length).toBe(0);
  });
});

describe('@engine Scenario: batch-14 -- Island of Wak-Wak', () => {
  it('sets a flying creature\'s power to 0 until end of turn', () => {
    const wakwak = { ...makeReadyInstance('island_of_wak_wak', 'p'), type: 'Land' };
    const flier = makeCreature('fl-1', { controller: 'o', power: 4, toughness: 4, keywords: [KEYWORDS.FLYING.id] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wakwak], oBf: [flier] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'island_of_wak_wak-1', tgt: 'fl-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const flierAfter = s2.o.bf.find(c => c.iid === 'fl-1');
    expect(flierAfter.eotBuffs).toContainEqual({ layerDef: { layer: '7b', setPower: 0 } });
  });

  it('fizzles against a non-flying creature', () => {
    const wakwak = { ...makeReadyInstance('island_of_wak_wak', 'p'), type: 'Land' };
    const ground = makeCreature('gr-1', { controller: 'o', power: 4, toughness: 4, keywords: [] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wakwak], oBf: [ground] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'island_of_wak_wak-1', tgt: 'gr-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const groundAfter = s2.o.bf.find(c => c.iid === 'gr-1');
    expect(groundAfter.eotBuffs ?? []).not.toContainEqual({ layerDef: { layer: '7b', setPower: 0 } });
  });
});

describe("@engine Scenario: batch-14 -- Urza's Avenger", () => {
  it('opens a 4-option modal choice when activated', () => {
    const avenger = makeReadyInstance('urzass_avenger', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [avenger] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'urzass_avenger-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('modalChoice');
    expect(s2.pendingChoice.options.map(o => o.id).sort()).toEqual(['banding', 'firststrike', 'flying', 'trample']);
  });

  it('banding option: gets -1/-1 and gains banding until end of turn', () => {
    const avenger = makeReadyInstance('urzass_avenger', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [avenger] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'urzass_avenger-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'banding' });
    const av = s3.p.bf.find(c => c.iid === 'urzass_avenger-1');
    expect(av.eotBuffs).toContainEqual({ power: -1, toughness: -1, keywords: [KEYWORDS.BANDING.id] });
  });

  it('flying option: gets -1/-1 and gains flying until end of turn', () => {
    const avenger = makeReadyInstance('urzass_avenger', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [avenger] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'urzass_avenger-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'flying' });
    const av = s3.p.bf.find(c => c.iid === 'urzass_avenger-1');
    expect(av.eotBuffs).toContainEqual({ power: -1, toughness: -1, keywords: [KEYWORDS.FLYING.id] });
  });

  it('can be reactivated repeatedly since the cost is {0}', () => {
    const avenger = makeReadyInstance('urzass_avenger', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [avenger] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'urzass_avenger-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'trample' });
    expect(s3.p.bf.find(c => c.iid === 'urzass_avenger-1').tapped).toBe(false);
    const s4 = duelReducer(s3, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'urzass_avenger-1' });
    expect(s4.stack.length).toBe(1);
  });
});
