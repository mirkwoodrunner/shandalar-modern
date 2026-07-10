// tests/scenarios/artifact-possession-haunting-wind-powerleech.test.js
// Tap centralization Phase 2: unstubs Artifact Possession, Haunting Wind, and
// Powerleech on top of the new ON_ABILITY_ACTIVATED_NO_TAP event (emitted from
// the ACTIVATE_ABILITY addMana branch and the generic "1. Tap cost" step when
// an ability's cost has no {T}) and two new evaluateCondition types,
// affectedPermanentIsArtifact and affectedPermanentIsOpponentArtifact. See
// docs/ENGINE_CONTRACT_SPEC.md S7.6 and docs/MECHANICS_INDEX.md.
// See THIRD_PARTY_NOTICES.md for attribution (a/artifact_possession.txt,
// h/haunting_wind.txt, p/powerleech.txt).

import { describe, it, expect } from 'vitest';
import { duelReducer, tapPermanent, makeCardInstance } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], ...overrides };
}

// A test artifact permanent. `activated` defaults to a {T}-cost mana ability;
// pass an override with no "T" token to exercise the two Phase 2 emission
// sites (addMana branch / generic tap-cost step).
function testArtifact(iid, controller, overrides = {}) {
  return {
    iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '', cmc: 1, cost: '1',
    keywords: [], tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller,
    activated: { cost: 'T', effect: 'addMana', mana: 'C' },
    ...overrides,
  };
}

function testArtifactCreature(iid, controller, overrides = {}) {
  return {
    iid, id: 'test_artifact_creature', name: 'Test Artifact Creature', type: 'Artifact Creature',
    subtype: 'Golem', color: '', cmc: 3, cost: '3', power: 2, toughness: 2, keywords: [],
    tapped: false, summoningSick: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller, ...overrides,
  };
}

// A minimal watcher permanent for ON_ABILITY_ACTIVATED_NO_TAP with a
// deliberately-unknown condition type. evaluateCondition's documented
// fallback ("unknown conditions pass by default") makes it fire for ANY
// ON_ABILITY_ACTIVATED_NO_TAP event regardless of source -- used purely to
// detect whether the event fired at all (BOTH-01/02/04/05), independent of
// any specific card's own condition logic.
function makeNoTapEventWatcher(iid) {
  return {
    iid, id: 'test_no_tap_event_watcher', name: 'Test No-Tap Event Watcher', type: 'Enchantment',
    color: '', cmc: 0, cost: '', keywords: [], tapped: false, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller: 'p',
    triggeredAbilities: [{
      id: 'watch_no_tap', trigger: { event: 'ON_ABILITY_ACTIVATED_NO_TAP' },
      condition: { type: 'testAlwaysTrueFallback' },
      effect: { type: 'addCounter', counter: '+1/+1', amount: 1 },
    }],
  };
}

function fired(state, watcherIid) {
  return state.p.bf.find(c => c.iid === watcherIid)?.counters?.P1P1 || 0;
}

describe('@engine Scenario: Artifact Possession', () => {
  it('AP-01: enchanting an artifact with Artifact Possession, then tapping it (e.g. for mana), deals 2 damage to its controller', () => {
    const art = testArtifact('art-1', 'o');
    const ap = makeReadyInstance('artifact_possession', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [ap], oBf: [art] });
    const ns = tapPermanent(state, 'o', 'art-1');
    expect(ns.o.life).toBe(18);
  });

  it('AP-02: activating a non-tap ability of the enchanted artifact also deals 2 damage', () => {
    // Uses a generic (non-mana) activated ability -- the who-aware "1. Tap
    // cost" step (site 2) -- since the addMana branch (site 1) hardcodes its
    // effect to player 'p' regardless of `who` (a pre-existing, out-of-scope
    // convention; see ACTIVATE_ABILITY comments), which would give a false
    // negative here for an opponent-controlled artifact.
    const art = testArtifact('art-1', 'o', { activated: { cost: '', effect: 'pumpSelf' } });
    const ap = makeReadyInstance('artifact_possession', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [ap], oBf: [art], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'art-1' });
    expect(ns.o.life).toBe(18);
  });

  it('AP-03: a DIFFERENT artifact tapping/activating does not trigger it', () => {
    const host = testArtifact('art-1', 'o');
    // Generic activated ability (site 2, who-aware) -- see AP-02 comment for
    // why the addMana branch (site 1) isn't used for an opponent activator.
    const other = testArtifact('art-2', 'o', { activated: { cost: '', effect: 'pumpSelf' } });
    const ap = makeReadyInstance('artifact_possession', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [ap], oBf: [host, other], phase: PHASE.MAIN_1 });
    const s1 = tapPermanent(state, 'o', 'art-2');
    expect(s1.o.life).toBe(20);
    const s2 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'art-2' });
    expect(s2.o.life).toBe(20);
  });

  it('AP-04: repeated taps/activations across turns each deal 2 damage (not one-shot)', () => {
    const art = testArtifact('art-1', 'o');
    const ap = makeReadyInstance('artifact_possession', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [ap], oBf: [art] });
    const s1 = tapPermanent(state, 'o', 'art-1');
    expect(s1.o.life).toBe(18);
    const untapped = { ...s1, o: { ...s1.o, bf: s1.o.bf.map(c => c.iid === 'art-1' ? { ...c, tapped: false } : c) } };
    const s2 = tapPermanent(untapped, 'o', 'art-1');
    expect(s2.o.life).toBe(16);
  });
});

describe('@engine Scenario: Haunting Wind', () => {
  it('HW-01: ANY artifact tapping deals 1 damage to its controller', () => {
    const art = testArtifact('art-1', 'o');
    const hw = makeReadyInstance('haunting_wind', 'p');
    const state = makeState({ pBf: [hw], oBf: [art] });
    const ns = tapPermanent(state, 'o', 'art-1');
    expect(ns.o.life).toBe(19);
  });

  it('HW-02: ANY artifact activating a non-tap ability deals 1 damage to its controller', () => {
    // Generic activated ability (site 2, who-aware) -- see AP-02 comment for
    // why the addMana branch (site 1) isn't used for an opponent activator.
    const art = testArtifact('art-1', 'o', { activated: { cost: '', effect: 'pumpSelf' } });
    const hw = makeReadyInstance('haunting_wind', 'p');
    const state = makeState({ pBf: [hw], oBf: [art], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'art-1' });
    expect(ns.o.life).toBe(19);
  });

  it('HW-03: a non-artifact permanent (creature, land) tapping or activating does NOT trigger Haunting Wind', () => {
    const creature = makeCreature('c1', { controller: 'o', tapped: false });
    const land = makeLand('land-1', { controller: 'o', tapped: false });
    const hw = makeReadyInstance('haunting_wind', 'p');
    const state = makeState({ pBf: [hw], oBf: [creature, land] });
    const s1 = tapPermanent(state, 'o', 'c1');
    expect(s1.o.life).toBe(20);
    const s2 = tapPermanent(state, 'o', 'land-1');
    expect(s2.o.life).toBe(20);
  });

  it("HW-04: Haunting Wind's own controller's artifact tapping still deals damage to them (unrestricted wording, not opponent-only)", () => {
    const art = testArtifact('art-1', 'p');
    const hw = makeReadyInstance('haunting_wind', 'p');
    const state = makeState({ pBf: [hw, art] });
    const ns = tapPermanent(state, 'p', 'art-1');
    expect(ns.p.life).toBe(19);
  });
});

describe('@engine Scenario: Powerleech', () => {
  it("PL-01: an opponent's artifact tapping gains the Powerleech controller 1 life", () => {
    const art = testArtifact('art-1', 'o');
    const pl = makeReadyInstance('powerleech', 'p');
    const state = makeState({ pBf: [pl], oBf: [art] });
    const ns = tapPermanent(state, 'o', 'art-1');
    expect(ns.p.life).toBe(21);
  });

  it("PL-02: an opponent's artifact activating a non-tap ability gains 1 life", () => {
    // Generic activated ability (site 2, who-aware) -- see AP-02 comment for
    // why the addMana branch (site 1) isn't used for an opponent activator.
    const art = testArtifact('art-1', 'o', { activated: { cost: '', effect: 'pumpSelf' } });
    const pl = makeReadyInstance('powerleech', 'p');
    const state = makeState({ pBf: [pl], oBf: [art], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'art-1' });
    expect(ns.p.life).toBe(21);
  });

  it("PL-03: the Powerleech CONTROLLER's OWN artifact tapping/activating does NOT trigger it", () => {
    const art = testArtifact('art-1', 'p', { activated: { cost: '', effect: 'addMana', mana: 'C' } });
    const pl = makeReadyInstance('powerleech', 'p');
    const state = makeState({ pBf: [pl, art], phase: PHASE.MAIN_1 });
    const s1 = tapPermanent(state, 'p', 'art-1');
    expect(s1.p.life).toBe(20);
    const s2 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'art-1' });
    expect(s2.p.life).toBe(20);
  });

  it('PL-04: a non-artifact permanent does not trigger it even if controlled by an opponent', () => {
    const creature = makeCreature('c1', { controller: 'o', tapped: false });
    const pl = makeReadyInstance('powerleech', 'p');
    const state = makeState({ pBf: [pl], oBf: [creature] });
    const ns = tapPermanent(state, 'o', 'c1');
    expect(ns.p.life).toBe(20);
  });
});

describe('@engine Scenario: cross-card / migration regression (BOTH)', () => {
  it('BOTH-01: site 1 (addMana branch) and site 2 (generic tap-cost step) both correctly emit ON_ABILITY_ACTIVATED_NO_TAP', () => {
    // Site 1: act.effect === "addMana" with no {T} in cost.
    const manaArt = testArtifact('art-1', 'p', { activated: { cost: '', effect: 'addMana', mana: 'C' } });
    const watcher1 = makeNoTapEventWatcher('w1');
    const state1 = makeState({ pBf: [manaArt, watcher1], phase: PHASE.MAIN_1 });
    const s1 = duelReducer(state1, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'art-1' });
    expect(fired(s1, 'w1')).toBe(1);

    // Site 2: generic non-mana activated ability with no {T} in cost.
    const genericArt = testArtifact('art-2', 'p', { activated: { cost: '', effect: 'pumpSelf' } });
    const watcher2 = makeNoTapEventWatcher('w2');
    const state2 = makeState({ pBf: [genericArt, watcher2], phase: PHASE.MAIN_1 });
    const s2 = duelReducer(state2, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'art-2' });
    expect(fired(s2, 'w2')).toBe(1);
  });

  it('BOTH-02: a tapped-cost ability (includes {T}) never fires ON_ABILITY_ACTIVATED_NO_TAP, only ON_TAP', () => {
    const art = testArtifact('art-1', 'p', { activated: { cost: 'T', effect: 'addMana', mana: 'C' } });
    const watcher = makeNoTapEventWatcher('w1');
    const state = makeState({ pBf: [art, watcher], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'art-1' });
    expect(ns.p.bf.find(c => c.iid === 'art-1').tapped).toBe(true);
    expect(fired(ns, 'w1')).toBe(0);
  });

  it('BOTH-03: all three cards active simultaneously on the same artifact tap fire independently and correctly (no cross-suppression)', () => {
    const art = testArtifact('art-1', 'o');
    const ap = makeReadyInstance('artifact_possession', 'p', { iid: 'ap-1', enchantedArtifactIid: 'art-1' });
    const hw = makeReadyInstance('haunting_wind', 'p', { iid: 'hw-1' });
    const pl = makeReadyInstance('powerleech', 'p', { iid: 'pl-1' });
    const state = makeState({ pBf: [ap, hw, pl], oBf: [art] });
    const ns = tapPermanent(state, 'o', 'art-1');
    // Artifact Possession -2, Haunting Wind -1 to the tapped artifact's controller (o).
    expect(ns.o.life).toBe(17);
    // Powerleech +1 to its own controller (p), since the artifact belongs to an opponent.
    expect(ns.p.life).toBe(21);
  });

  it("BOTH-04: the activatedAbilities-array path (Mishra's Factory's animateLand) does NOT emit ON_ABILITY_ACTIVATED_NO_TAP", () => {
    const factory = makeReadyInstance('mishrass_factory', 'p');
    const watcher = makeNoTapEventWatcher('w1');
    const state = makeState({ pBf: [factory, watcher], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { ...state.p.mana, C: 1 } } };
    const ns = duelReducer(withMana, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'mishrass_factory-1', abilityId: 'factory_animate' });
    expect(ns.p.bf.find(c => c.iid === 'mishrass_factory-1').isAnimatedLand).toBe(true);
    expect(fired(ns, 'w1')).toBe(0);
  });

  it('BOTH-05: Fellwar Stone / Birds of Paradise / Black Lotus (always-tap mana rocks) never fire ON_ABILITY_ACTIVATED_NO_TAP, only ON_TAP', () => {
    const fellwar = makeReadyInstance('fellwar_stone', 'p');
    const bop = makeReadyInstance('birds_of_paradise', 'p');
    const lotus = makeReadyInstance('black_lotus', 'p');
    const watcher = makeNoTapEventWatcher('w1');
    const state = makeState({ pBf: [fellwar, bop, lotus, watcher], oBf: [makeLand('ol-1', { controller: 'o' })], phase: PHASE.MAIN_1 });

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'fellwar_stone-1' });
    expect(s1.p.bf.find(c => c.iid === 'fellwar_stone-1').tapped).toBe(true);
    expect(fired(s1, 'w1')).toBe(0);

    const s2 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'birds_of_paradise-1' });
    expect(s2.p.bf.find(c => c.iid === 'birds_of_paradise-1').tapped).toBe(true);
    expect(fired(s2, 'w1')).toBe(0);

    const s3 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'black_lotus-1' });
    expect(s3.p.bf.find(c => c.iid === 'black_lotus-1').tapped).toBe(true);
    expect(fired(s3, 'w1')).toBe(0);
  });

  it('BOTH-06: existing pre-Phase-2 mana-ability and generic-activated-ability behavior is unregressed (spot-check)', () => {
    const elf = makeReadyInstance('llanowar_elves', 'p');
    const state = makeState({ pBf: [elf], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'llanowar_elves-1' });
    expect(ns.p.mana.G).toBe(1);
    expect(ns.p.bf.find(c => c.iid === 'llanowar_elves-1').tapped).toBe(true);
  });

  it("BOTH-07: an artifact CREATURE (both types at once) still correctly triggers Haunting Wind/Powerleech's isArt-based conditions", () => {
    const golem = testArtifactCreature('golem-1', 'o');
    const hw = makeReadyInstance('haunting_wind', 'p');
    const pl = makeReadyInstance('powerleech', 'p');
    const state = makeState({ pBf: [hw, pl], oBf: [golem] });
    const ns = tapPermanent(state, 'o', 'golem-1');
    expect(ns.o.life).toBe(19); // Haunting Wind
    expect(ns.p.life).toBe(21); // Powerleech
  });

  it("BOTH-08: Artifact Possession's enchantedHostTapped condition, shared across both event types, correctly distinguishes its own host independently for each", () => {
    // Generic activated ability (site 2, who-aware) -- see AP-02 comment for
    // why the addMana branch (site 1) isn't used for an opponent activator.
    const host = testArtifact('art-1', 'o');
    const other = testArtifact('art-2', 'o', { activated: { cost: '', effect: 'pumpSelf' } });
    const ap = makeReadyInstance('artifact_possession', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [ap], oBf: [host, other], phase: PHASE.MAIN_1 });

    // ON_TAP on the non-host does not fire.
    const s1 = tapPermanent(state, 'o', 'art-2');
    expect(s1.o.life).toBe(20);
    // ON_ABILITY_ACTIVATED_NO_TAP on the non-host does not fire.
    const s2 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'art-2' });
    expect(s2.o.life).toBe(20);
    // ON_TAP on the host fires.
    const s3 = tapPermanent(state, 'o', 'art-1');
    expect(s3.o.life).toBe(18);
    // ON_ABILITY_ACTIVATED_NO_TAP on the host fires (host also has a no-{T} ability).
    const hostNoTap = testArtifact('art-1', 'o', { activated: { cost: '', effect: 'pumpSelf' } });
    const state2 = makeState({ pBf: [ap], oBf: [hostNoTap, other], phase: PHASE.MAIN_1 });
    const s4 = duelReducer(state2, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'art-1' });
    expect(s4.o.life).toBe(18);
  });
});
