// tests/scenarios/deferral-sweep-1-cards.test.js
// Deferral Sweep 1, Part 3: per-card tests for the 12 cards unblocked by the new
// trigger events and hurt() damage-source meta. See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, zMove, checkDeath, makeCardInstance } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

// Builds a real CARD_DB-backed battlefield instance with a known iid, ready to
// attack/act (not summoning sick, untapped).
function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, ...overrides };
}

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Cave People', () => {
  it('gets +1/-2 until end of turn when it attacks', () => {
    const cave = makeReadyInstance('cave_people', 'p');
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [cave] });
    const s1 = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: cave.iid });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(s2.p.bf.find(c => c.iid === cave.iid).eotBuffs).toContainEqual({ power: 1, toughness: -2 });
  });

  it('activated ability grants mountainwalk to target creature until end of turn', () => {
    const cave = makeReadyInstance('cave_people', 'p');
    const target = makeCreature('tgt-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cave, target] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 2, C: 1 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: cave.iid, tgt: 'tgt-1' });
    expect(s1.stack.length).toBe(1);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'tgt-1').eotBuffs).toContainEqual({ keywords: [KEYWORDS.MOUNTAINWALK.id] });
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Hasran Ogress', () => {
  it('deals 3 damage to its controller when it attacks if they decline to pay {2}', () => {
    const ogress = makeReadyInstance('hasran_ogress', 'p');
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [ogress] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: ogress.iid });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(s2.pendingChoice).not.toBeNull();
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'decline' });
    expect(s3.p.life).toBe(17);
  });

  it('deals no damage when its controller pays {2}', () => {
    const ogress = makeReadyInstance('hasran_ogress', 'p');
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [ogress] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { ...base.p.mana, C: 2 } } };
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: ogress.iid });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'pay' });
    expect(s3.p.life).toBe(20);
    expect(s3.p.mana.C).toBe(0);
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Citanul Druid', () => {
  it('gets a +1/+1 counter when an opponent casts an artifact spell', () => {
    const druid = makeReadyInstance('citanul_druid', 'p');
    const artifactSpell = makeSpell('as-1', { id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '', cmc: 1, cost: '1', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [druid], oHand: [artifactSpell] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, C: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'as-1' });
    expect(s1.p.bf.find(c => c.iid === druid.iid).counters.P1P1).toBe(1);
  });

  it('does not trigger when its own controller casts the artifact spell', () => {
    const druid = makeReadyInstance('citanul_druid', 'p');
    const artifactSpell = makeSpell('as-1', { id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '', cmc: 1, cost: '1', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [druid], pHand: [artifactSpell] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, C: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'as-1' });
    expect(s1.p.bf.find(c => c.iid === druid.iid).counters?.P1P1).toBeUndefined();
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Throne of Bone', () => {
  it('may pay {1} to gain 1 life when a player casts a black spell', () => {
    const throne = { ...makeReadyInstance('throne_of_bone', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const blackSpell = makeSpell('bs-1', { id: 'test_black', name: 'Test Black Spell', type: 'Sorcery', color: 'B', cmc: 1, cost: 'B', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [throne], oHand: [blackSpell] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, B: 1 } }, p: { ...base.p, life: 20, mana: { ...base.p.mana, C: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'bs-1' });
    expect(s1.pendingChoice).not.toBeNull();
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'pay' });
    expect(s2.p.life).toBe(21);
  });

  it('does not trigger for a non-black spell', () => {
    const throne = { ...makeReadyInstance('throne_of_bone', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const whiteSpell = makeSpell('ws-1', { id: 'test_white', name: 'Test White Spell', type: 'Sorcery', color: 'W', cmc: 1, cost: 'W', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [throne], oHand: [whiteSpell] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, W: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'o', iid: 'ws-1' });
    expect(s1.pendingChoice).toBeNull();
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Urza\'s Chalice', () => {
  it('may pay {1} to gain 1 life when a player casts an artifact spell', () => {
    const chalice = { ...makeReadyInstance('urzass_chalice', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const artifactSpell = makeSpell('as-1', { id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '', cmc: 1, cost: '1', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [chalice], pHand: [artifactSpell] });
    const funded = { ...base, p: { ...base.p, life: 20, mana: { ...base.p.mana, C: 2 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'as-1' });
    expect(s1.pendingChoice).not.toBeNull();
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'pay' });
    expect(s2.p.life).toBe(21);
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Dingus Egg', () => {
  it("deals 2 damage to a land's controller when that land is put into a graveyard from the battlefield", () => {
    const egg = { ...makeReadyInstance('dingus_egg', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const land = makeLand('l-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [egg], oBf: [land] });
    const state = { ...base, o: { ...base.o, life: 20 } };
    const s1 = zMove(state, 'l-1', 'o', 'o', 'gy');
    expect(s1.o.life).toBe(18);
  });

  it('does not trigger for a creature dying', () => {
    const egg = { ...makeReadyInstance('dingus_egg', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const creature = makeCreature('c-1', { controller: 'o', toughness: 1, damage: 1 });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [egg], oBf: [creature] });
    const state = { ...base, o: { ...base.o, life: 20 } };
    const s1 = checkDeath(state);
    expect(s1.o.life).toBe(20);
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Tablet of Epityr', () => {
  it('may pay {1} to gain 1 life when an artifact you control dies', () => {
    const tablet = { ...makeReadyInstance('tablet_of_epityr', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const ownArtifact = { iid: 'oa-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tablet, ownArtifact] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { ...base.p.mana, C: 1 } } };
    const s1 = zMove(state, 'oa-1', 'p', 'p', 'gy');
    expect(s1.pendingChoice).not.toBeNull();
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'pay' });
    expect(s2.p.life).toBe(21);
  });

  it("does not trigger for an opponent's artifact dying", () => {
    const tablet = { ...makeReadyInstance('tablet_of_epityr', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oppArtifact = { iid: 'oa-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'o', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tablet], oBf: [oppArtifact] });
    const s1 = zMove(base, 'oa-1', 'o', 'o', 'gy');
    expect(s1.pendingChoice).toBeNull();
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Urza\'s Miter', () => {
  it('may pay {3} to draw a card when an artifact you control dies without being sacrificed', () => {
    const miter = { ...makeReadyInstance('urzass_miter', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const ownArtifact = { iid: 'oa-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const topOfLib = { iid: 'lib-1', id: 'forest', name: 'Forest', type: 'Land' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [miter, ownArtifact] });
    const state = { ...base, p: { ...base.p, lib: [topOfLib], mana: { ...base.p.mana, C: 3 } } };
    const s1 = zMove(state, 'oa-1', 'p', 'p', 'gy');
    expect(s1.pendingChoice).not.toBeNull();
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'pay' });
    expect(s2.p.hand.some(c => c.iid === 'lib-1')).toBe(true);
  });

  it('does not trigger when the artifact was sacrificed (e.g. as an activated-ability cost)', () => {
    const miter = { ...makeReadyInstance('urzass_miter', 'p'), damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    // "Sacrifice cost" style artifact: activating its own ability sacrifices itself.
    const sacArtifact = { iid: 'sa-1', id: 'test_sac_artifact', name: 'Test Sac Artifact', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      activated: { cost: 'sac', effect: 'noop' } };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [miter, sacArtifact] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'sa-1' });
    expect(s1.p.gy.some(c => c.iid === 'sa-1')).toBe(true); // sacrificed
    expect(s1.pendingChoice).toBeNull(); // Urza's Miter does not offer the draw
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Khabál Ghoul', () => {
  it('gets a +1/+1 counter for each creature that died this turn at each end step', () => {
    const ghoul = makeReadyInstance('khabal_ghoul', 'p');
    const victim1 = makeCreature('v-1', { controller: 'o', toughness: 1, damage: 1 });
    const victim2 = makeCreature('v-2', { controller: 'o', toughness: 1, damage: 1 });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [ghoul], oBf: [victim1, victim2] });
    const s1 = checkDeath(base); // both victims die -> creaturesDiedThisTurn: [v-1, v-2]
    const s2 = duelReducer({ ...s1, phase: PHASE.MAIN_2 }, { type: 'ADVANCE_PHASE' }); // MAIN_2 -> END
    expect(s2.p.bf.find(c => c.iid === ghoul.iid).counters.P1P1).toBe(2);
  });

  it('gets no counter when nothing died this turn', () => {
    const ghoul = makeReadyInstance('khabal_ghoul', 'p');
    const base = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [ghoul] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // MAIN_2 -> END
    expect(s1.p.bf.find(c => c.iid === ghoul.iid).counters?.P1P1).toBeUndefined();
  });
});

describe('@engine-batch-stubs-2 Scenario: deferral-sweep-1 -- Reverse Polarity', () => {
  it('gains life equal to twice the artifact damage taken this turn', () => {
    const spell = makeSpell('rp-1', { id: 'reverse_polarity', name: 'Reverse Polarity', type: 'Instant', color: 'W', cmc: 2, cost: 'WW', effect: 'reversePolarityGain', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = {
      ...base,
      p: { ...base.p, life: 15, mana: { ...base.p.mana, W: 2 } },
      turnState: { ...base.turnState, damageBySourceType: { p: { artifact: 5 } } },
    };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'rp-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.life).toBe(25); // 15 + 2*5
  });
});
