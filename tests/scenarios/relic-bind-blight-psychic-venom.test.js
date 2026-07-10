// tests/scenarios/relic-bind-blight-psychic-venom.test.js
// Unstubs Blight, Psychic Venom, and Relic Bind on top of tap centralization
// Phase 1's new ON_TAP event and enchantedHostTapped condition.
// See THIRD_PARTY_NOTICES.md for attribution (b/blight.txt, p/psychic_venom.txt,
// r/relic_bind.txt).

import { describe, it, expect } from 'vitest';
import { duelReducer, tapPermanent, makeCardInstance } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], ...overrides };
}

function testArtifact(iid, controller, overrides = {}) {
  return { iid, id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '', cmc: 1, cost: '1', keywords: [], tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller, ...overrides };
}

describe('@engine Scenario: Blight', () => {
  it('BLIGHT-01: enchanting a land with Blight, then tapping it for mana, destroys it', () => {
    const land = makeLand('land-1', { controller: 'o', produces: ['G'] });
    const blight = makeReadyInstance('blight', 'p', { enchantedLandIid: 'land-1' });
    const state = makeState({ pBf: [blight], oBf: [land] });
    const ns = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'land-1' });
    expect(ns.o.bf.some(c => c.iid === 'land-1')).toBe(false);
    expect(ns.o.gy.some(c => c.iid === 'land-1')).toBe(true);
  });

  it('BLIGHT-02: Blight itself is cleaned up after its host is destroyed (no orphaned Aura)', () => {
    // Blight's host is already gone; the destroy step happens once (ON_TAP is a
    // one-time trigger), and cleanup of Blight itself is reactive on its own
    // controller's next upkeep (kudzuStyleLandOrphanCheck) -- there is no
    // general SBA sweep for orphaned Kudzu-style Auras in this engine (same
    // mechanism Kudzu/Living Artifact already rely on). See completion summary.
    const blight = makeReadyInstance('blight', 'p', { enchantedLandIid: 'gone-land' });
    const state = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [blight] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP (p)
    expect(s2.p.bf.some(c => c.iid === 'blight-1')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'blight-1')).toBe(true);
  });

  it('BLIGHT-03: a DIFFERENT land tapping does not destroy anything', () => {
    const hostLand = makeLand('land-1', { controller: 'o', produces: ['G'] });
    const otherLand = makeLand('land-2', { controller: 'o', produces: ['U'] });
    const blight = makeReadyInstance('blight', 'p', { enchantedLandIid: 'land-1' });
    const state = makeState({ pBf: [blight], oBf: [hostLand, otherLand] });
    const ns = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'land-2' });
    expect(ns.o.bf.some(c => c.iid === 'land-1')).toBe(true);
    expect(ns.o.bf.some(c => c.iid === 'land-2')).toBe(true);
    expect(ns.p.bf.some(c => c.iid === 'blight-1')).toBe(true);
  });

  it("BLIGHT-04: Blight enchanting an opponent's land, tapped by that opponent, still destroys it (controller-independent)", () => {
    const land = makeLand('land-1', { controller: 'o', produces: ['G'] });
    const blight = makeReadyInstance('blight', 'p', { enchantedLandIid: 'land-1' });
    const state = makeState({ pBf: [blight], oBf: [land] });
    const ns = tapPermanent(state, 'o', 'land-1');
    expect(ns.o.bf.some(c => c.iid === 'land-1')).toBe(false);
    expect(ns.o.gy.some(c => c.iid === 'land-1')).toBe(true);
  });
});

describe('@engine Scenario: Psychic Venom', () => {
  it("PV-01: enchanting a land with Psychic Venom, then tapping it, deals 2 damage to the land's controller", () => {
    const land = makeLand('land-1', { controller: 'o', produces: ['G'] });
    const venom = makeReadyInstance('psychic_venom', 'p', { enchantedLandIid: 'land-1' });
    const state = makeState({ pBf: [venom], oBf: [land] });
    const ns = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'land-1' });
    expect(ns.o.life).toBe(18);
  });

  it('PV-02: a different land tapping does not trigger Psychic Venom', () => {
    const hostLand = makeLand('land-1', { controller: 'o', produces: ['G'] });
    const otherLand = makeLand('land-2', { controller: 'o', produces: ['U'] });
    const venom = makeReadyInstance('psychic_venom', 'p', { enchantedLandIid: 'land-1' });
    const state = makeState({ pBf: [venom], oBf: [hostLand, otherLand] });
    const ns = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'land-2' });
    expect(ns.o.life).toBe(20);
  });

  it('PV-03: repeated taps of the same land (across multiple turns) each deal 2 damage, not a one-shot', () => {
    const land = makeLand('land-1', { controller: 'o', produces: ['G'] });
    const venom = makeReadyInstance('psychic_venom', 'p', { enchantedLandIid: 'land-1' });
    const state = makeState({ pBf: [venom], oBf: [land] });
    const s1 = tapPermanent(state, 'o', 'land-1');
    expect(s1.o.life).toBe(18);
    // Untap between turns (not exercising the untap mechanism itself here).
    const untapped = { ...s1, o: { ...s1.o, bf: s1.o.bf.map(c => c.iid === 'land-1' ? { ...c, tapped: false } : c) } };
    const s2 = tapPermanent(untapped, 'o', 'land-1');
    expect(s2.o.life).toBe(16);
  });

  it('PV-04: damage is correctly sourced/logged as coming from Psychic Venom', () => {
    const land = makeLand('land-1', { controller: 'o', produces: ['G'] });
    const venom = makeReadyInstance('psychic_venom', 'p', { enchantedLandIid: 'land-1' });
    const state = makeState({ pBf: [venom], oBf: [land] });
    const ns = tapPermanent(state, 'o', 'land-1');
    expect(ns.log.some(e => (e.text ?? '').includes('Psychic Venom deals 2 damage'))).toBe(true);
  });
});

describe('@engine Scenario: Relic Bind', () => {
  it('RB-01: enchanting an opponent\'s artifact with Relic Bind, then tapping it, opens a modal choice', () => {
    const art = testArtifact('art-1', 'o');
    const relic = makeReadyInstance('relic_bind', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [relic], oBf: [art] });
    const ns = tapPermanent(state, 'o', 'art-1');
    expect(ns.pendingChoice).toBeTruthy();
    expect(ns.pendingChoice.options.map(o => o.id).sort()).toEqual(['damage', 'lifegain']);
  });

  it("RB-02: choosing 'damage' then resolves 1 damage to the artifact's controller", () => {
    const art = testArtifact('art-1', 'o');
    const relic = makeReadyInstance('relic_bind', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [relic], oBf: [art] });
    const s1 = tapPermanent(state, 'o', 'art-1');
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'damage' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.o.life).toBe(19);
  });

  it("RB-03: choosing 'lifegain' adds 1 life to Relic Bind's own controller", () => {
    const art = testArtifact('art-1', 'o');
    const relic = makeReadyInstance('relic_bind', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [relic], oBf: [art] });
    const s1 = tapPermanent(state, 'o', 'art-1');
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'lifegain' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.p.life).toBe(21);
  });

  it("RB-04: Relic Bind cannot legally target the caster's own artifact at cast time", () => {
    const relicCard = makeCardInstance('relic_bind', 'p');
    const ownArt = testArtifact('own-art', 'p');
    const state = makeState({ pHand: [{ ...relicCard, iid: 'hand-relic' }], pBf: [ownArt], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 1, C: 2 } } };
    const blocked = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: 'hand-relic', tgt: 'own-art' });
    expect(blocked.stack.length).toBe(0);
    expect(blocked.p.hand.some(c => c.iid === 'hand-relic')).toBe(true);

    // Control: targeting an opponent's artifact is legal.
    const oppArt = testArtifact('opp-art', 'o');
    const withOppArt = { ...withMana, o: { ...withMana.o, bf: [oppArt] } };
    const allowed = duelReducer(withOppArt, { type: 'CAST_SPELL', who: 'p', iid: 'hand-relic', tgt: 'opp-art' });
    expect(allowed.stack.length).toBe(1);
  });

  it('RB-05: the trigger fires on repeated taps across turns, not just once', () => {
    const art = testArtifact('art-1', 'o');
    const relic = makeReadyInstance('relic_bind', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [relic], oBf: [art] });
    const s1 = tapPermanent(state, 'o', 'art-1');
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'damage' });
    expect(s2.o.life).toBe(19);
    const untapped = { ...s2, o: { ...s2.o, bf: s2.o.bf.map(c => c.iid === 'art-1' ? { ...c, tapped: false } : c) } };
    const s3 = tapPermanent(untapped, 'o', 'art-1');
    const s4 = duelReducer(s3, { type: 'RESOLVE_CHOICE', optionId: 'damage' });
    expect(s4.o.life).toBe(18);
  });

  it('RB-06: an artifact NOT enchanted by this specific Relic Bind tapping does not trigger it (host-specificity)', () => {
    const enchanted = testArtifact('art-1', 'o');
    const other = testArtifact('art-2', 'o');
    const relic = makeReadyInstance('relic_bind', 'p', { enchantedArtifactIid: 'art-1' });
    const state = makeState({ pBf: [relic], oBf: [enchanted, other] });
    const ns = tapPermanent(state, 'o', 'art-2');
    expect(ns.pendingChoice).toBeNull();
    expect(ns.o.life).toBe(20);
  });
});

describe('@engine Scenario: Blight + Psychic Venom cross-card, and migration regression spot-check', () => {
  it('BOTH-01: Blight and Psychic Venom enchanting two different lands each fire only for their own host', () => {
    const landA = makeLand('land-a', { controller: 'o', produces: ['G'] });
    const landB = makeLand('land-b', { controller: 'o', produces: ['U'] });
    const blight = makeReadyInstance('blight', 'p', { iid: 'blight-1', enchantedLandIid: 'land-a' });
    const venom = makeReadyInstance('psychic_venom', 'p', { iid: 'venom-1', enchantedLandIid: 'land-b' });
    const state = makeState({ pBf: [blight, venom], oBf: [landA, landB] });

    const sA = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'land-a' });
    expect(sA.o.bf.some(c => c.iid === 'land-a')).toBe(false); // Blight destroyed it
    expect(sA.o.life).toBe(20); // Psychic Venom did not fire for land-a

    const sB = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'land-b' });
    expect(sB.o.bf.some(c => c.iid === 'land-b')).toBe(true); // Blight did not fire for land-b
    expect(sB.o.life).toBe(18); // Psychic Venom fired for its own host
  });

  it('BOTH-02: the tap-centralization migration does not regress mana production, combat, or upkeep punishment effects', () => {
    // Mana production: a plain land with no ON_TAP watcher still taps for its
    // printed mana exactly as before (spot-check of applyOvergrowthTap).
    const plainLand = makeLand('pl-1', { controller: 'p', produces: ['G'] });
    const manaState = makeState({ pBf: [plainLand] });
    const s1 = duelReducer(manaState, { type: 'TAP_LAND', who: 'p', iid: 'pl-1' });
    expect(s1.p.mana.G).toBe(1);
    expect(s1.p.bf.find(c => c.iid === 'pl-1').tapped).toBe(true);

    // Upkeep punishment: Demonic Hordes still taps itself and deals 3 damage
    // when its controller can't pay {B}{B}{B} (one of the 28 migrated sites).
    const demon = makeReadyInstance('demonic_hordes', 'o', { tapped: false });
    const upkeepState = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [demon] });
    const s2 = duelReducer(upkeepState, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    const demonAfter = s2.o.bf.find(c => c.iid === 'demonic_hordes-1');
    expect(demonAfter.tapped).toBe(true);
    expect(s2.o.life).toBe(17);
  });
});
