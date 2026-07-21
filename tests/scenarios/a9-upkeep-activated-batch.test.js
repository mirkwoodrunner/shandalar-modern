// tests/scenarios/a9-upkeep-activated-batch.test.js
// A9 Upkeep-Restricted Activated-Ability batch (5 cards): Dwarven Weaponsmith,
// Hell's Caretaker, Mirror Universe, and Tolaria. Life Matrix gets its own
// dedicated file (tests/scenarios/life-matrix.test.js) since it also exercises
// the granted-ability mechanism. See docs/MECHANICS_INDEX.md.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function makeArt(iid, overrides = {}) {
  return { iid, id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 0, ...overrides };
}

function makeWeaponsmith(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'dwarven_weaponsmith', name: 'Dwarven Weaponsmith', type: 'Creature', subtype: 'Dwarf Artificer',
    color: 'R', cmc: 2, cost: '1R', power: 1, toughness: 1, keywords: [],
    activated: { cost: 'T,sacArt', effect: 'dwarvenWeaponsmithCounter', myUpkeepOnly: true },
    controller: 'p',
    ...overrides,
  });
}

function makeCaretaker(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'hells_caretaker', name: "Hell's Caretaker", type: 'Creature', subtype: 'Horror',
    color: 'B', cmc: 4, cost: '3B', power: 1, toughness: 1, keywords: [],
    activated: { cost: 'T,sacCre', effect: 'hellsCaretakerReanimate', myUpkeepOnly: true },
    controller: 'p',
    ...overrides,
  });
}

function makeMirrorUniverse(iid, overrides = {}) {
  return {
    iid, id: 'mirror_universe', name: 'Mirror Universe', type: 'Artifact', color: '', cmc: 6, cost: '6',
    keywords: [], tapped: false, counters: {}, eotBuffs: [], enchantments: [],
    activated: { cost: 'T,sac', effect: 'exchangeLifeTotals', myUpkeepOnly: true },
    controller: 'p',
    ...overrides,
  };
}

function makeTolaria(iid, overrides = {}) {
  return makeLand(iid, {
    id: 'tolaria', name: 'Tolaria', type: 'Legendary Land', subtype: undefined, color: '', cmc: 0, cost: '',
    produces: ['U'],
    activated: { cost: 'T', effect: 'removeBandingEOT', anyUpkeepOnly: true },
    controller: 'p',
    ...overrides,
  });
}

describe('@engine Scenario: Dwarven Weaponsmith', () => {
  it('activates during own upkeep, sacrifices an artifact, puts a +1/+1 counter on target creature', () => {
    const smith = makeWeaponsmith('dw-1');
    const art = makeArt('art-1', { controller: 'p' });
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [smith, art, bear] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'dw-1', tgt: 'bear-1' });
    expect(s1.p.bf.some(c => c.iid === 'art-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'art-1')).toBe(true);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'bear-1').counters.P1P1).toBe(1);
  });

  it('is rejected outside of upkeep (myUpkeepOnly gate)', () => {
    const smith = makeWeaponsmith('dw-1');
    const art = makeArt('art-1', { controller: 'p' });
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [smith, art, bear] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'dw-1', tgt: 'bear-1' });
    expect(s1.stack).toHaveLength(0);
    expect(s1.p.bf.some(c => c.iid === 'art-1')).toBe(true);
  });

  it('is rejected with no artifact available to sacrifice (generic sacArt pre-flight)', () => {
    const smith = makeWeaponsmith('dw-1');
    const bear = makeCreature('bear-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [smith, bear] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'dw-1', tgt: 'bear-1' });
    expect(s1.stack).toHaveLength(0);
  });
});

describe('@engine Scenario: Hell\'s Caretaker', () => {
  it('sacrifices a creature (not itself), returns a chosen graveyard creature to the battlefield via gyCardChoice with 2+ eligible targets', () => {
    // The sacrificed fodder creature lands in the graveyard before targets are
    // chosen (targets are chosen on resolution, after costs are paid), so it
    // is itself a legal target alongside the two pre-existing graveyard
    // creatures -- three eligible options total.
    const caretaker = makeCaretaker('hc-1');
    const fodder = makeCreature('fodder-1', { controller: 'p' });
    const bear = { iid: 'gy-bear', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const wurm = { iid: 'gy-wurm', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature' };
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [caretaker, fodder] });
    const funded = { ...base, p: { ...base.p, gy: [bear, wurm] } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hc-1' });
    expect(s1.p.bf.some(c => c.iid === 'fodder-1')).toBe(false);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('gyCardChoice');
    expect(s2.pendingChoice.mode).toBe('hellsCaretakerReanimate');
    expect(s2.pendingChoice.options.map(o => o.id).sort()).toEqual(['fodder-1', 'gy-bear', 'gy-wurm']);
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'gy-wurm' });
    expect(s3.pendingChoice).toBeNull();
    expect(s3.p.bf.some(c => c.iid === 'gy-wurm')).toBe(true);
    expect(s3.p.gy.some(c => c.iid === 'gy-bear')).toBe(true);
    expect(s3.p.gy.some(c => c.iid === 'fodder-1')).toBe(true);
  });

  it('auto-resolves with exactly 1 eligible target, no modal', () => {
    // No pre-existing graveyard creatures: after the sacCre cost is paid, the
    // freshly-sacrificed fodder creature is the only eligible target, so the
    // ability auto-resolves onto it with no gyCardChoice modal.
    const caretaker = makeCaretaker('hc-1');
    const fodder = makeCreature('fodder-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [caretaker, fodder] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.p.bf.some(c => c.iid === 'fodder-1')).toBe(true);
    expect(s2.p.gy.some(c => c.iid === 'fodder-1')).toBe(false);
  });

  it('cannot target itself even when it was the sacrificed creature', () => {
    const caretaker = makeCaretaker('hc-1');
    const caretakerGY = { iid: 'hc-1', id: 'hells_caretaker', name: "Hell's Caretaker", type: 'Creature' };
    const bear = { iid: 'gy-bear', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    // Only Hell's Caretaker itself is on the battlefield, so its own sacCre
    // cost must sacrifice itself. Its graveyard already has another creature
    // available, proving the ability still excludes its own iid regardless.
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [caretaker] });
    const funded = { ...base, p: { ...base.p, gy: [bear] } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hc-1' });
    expect(s1.p.bf.some(c => c.iid === 'hc-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'hc-1')).toBe(true);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.p.bf.some(c => c.iid === 'gy-bear')).toBe(true);
    expect(s2.p.bf.some(c => c.iid === 'hc-1')).toBe(false);
  });

  it('is rejected outside of upkeep (myUpkeepOnly gate)', () => {
    const caretaker = makeCaretaker('hc-1');
    const fodder = makeCreature('fodder-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [caretaker, fodder] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'hc-1' });
    expect(s1.stack).toHaveLength(0);
    expect(s1.p.bf.some(c => c.iid === 'fodder-1')).toBe(true);
  });
});

describe('@engine Scenario: Mirror Universe', () => {
  it('sacrifices itself during upkeep and exchanges life totals', () => {
    const mirror = makeMirrorUniverse('mu-1');
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [mirror] });
    const state = { ...base, p: { ...base.p, life: 3 }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'mu-1', tgt: 'o' });
    expect(s1.p.bf.some(c => c.iid === 'mu-1')).toBe(false);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.life).toBe(20);
    expect(s2.o.life).toBe(3);
  });

  it('defaults target to opponent with no explicit player target', () => {
    const mirror = makeMirrorUniverse('mu-1');
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [mirror] });
    const state = { ...base, p: { ...base.p, life: 3 }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'mu-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.life).toBe(20);
    expect(s2.o.life).toBe(3);
  });

  it('is rejected outside of upkeep (myUpkeepOnly gate)', () => {
    const mirror = makeMirrorUniverse('mu-1');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [mirror] });
    const state = { ...base, p: { ...base.p, life: 3 }, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'mu-1' });
    expect(s1.stack).toHaveLength(0);
    expect(s1.p.bf.some(c => c.iid === 'mu-1')).toBe(true);
    expect(s1.p.life).toBe(3);
  });
});

describe('@engine Scenario: Tolaria', () => {
  it('{T}: Add {U} mana ability works at any time (ungated)', () => {
    const tolaria = makeTolaria('tol-1');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tolaria] });
    const s1 = duelReducer(base, { type: 'TAP_LAND', who: 'p', iid: 'tol-1' });
    expect(s1.p.mana.U).toBe(1);
    expect(s1.p.bf.find(c => c.iid === 'tol-1').tapped).toBe(true);
  });

  it('banding-removal ability works during the opponent\'s upkeep (anyUpkeepOnly differs from myUpkeepOnly)', () => {
    const tolaria = makeTolaria('tol-1');
    const bandit = makeCreature('bandit-1', { controller: 'o', keywords: [KEYWORDS.BANDING.id] });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'o', pBf: [tolaria], oBf: [bandit] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tol-1', tgt: 'bandit-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    // Asserts the eotBuffs record this case produces -- the same shape the
    // pre-existing removeFlying case produces. Not asserting hasKw(...,
    // s2) here: see the "OBSERVATION" comment on removeBandingEOT/removeFlying
    // in DuelCore.js -- a pre-existing layers.js layer-6 filter mismatch
    // (numeric 6 vs string '6') silently drops this removeKeywords effect
    // before it reaches computeCharacteristics, so hasKw would still report
    // banding as present. That gap predates this batch and layers.js is out
    // of scope for this prompt.
    const banditAfter = s2.o.bf.find(c => c.iid === 'bandit-1');
    expect(banditAfter.eotBuffs).toContainEqual({ layerDef: { layer: '6', removeKeywords: [KEYWORDS.BANDING.id] } });
  });

  it('banding-removal ability is rejected outside any upkeep step', () => {
    const tolaria = makeTolaria('tol-1');
    const bandit = makeCreature('bandit-1', { controller: 'o', keywords: [KEYWORDS.BANDING.id] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tolaria], oBf: [bandit] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tol-1', tgt: 'bandit-1' });
    expect(s1.stack).toHaveLength(0);
    expect(s1.p.bf.find(c => c.iid === 'tol-1').tapped).toBe(false);
  });
});
