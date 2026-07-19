// tests/scenarios/legendary-creatures-bugfixes.test.js
// Legendary Creatures Cleanup batch follow-up: three bugs surfaced (not fixed) by that
// batch's completion report. See docs/CURRENT_SPRINT.md and docs/MECHANICS_INDEX.md for
// the fix writeup.
//
// Bug 1: Ramses Overdark's destroyEnchantedCreature was registered in
// CREATURE_ONLY_TARGET_EFFECTS but missing from ACTIVATE_TARGET_EFFECTS, so
// beginActivateFlow never opened the targeting step for it.
// Bug 2: no `myTurnOnly`-style gate existed for "Activate only during your turn."
// abilities. Affects Gwendlyn Di Corci (new) and Rag Man (pre-existing, inherited gap).
// Bug 3: Regrowth/Adun Oakenshield never let a human player choose which graveyard
// card comes back when 2+ are eligible -- both silently took the most recent one.
// Fixed via a new `gyCardChoice` pendingChoice, same generic ChoiceModal/RESOLVE_CHOICE
// mechanism already used by legendRuleChoice/blazeOfGloryDamageOrder/primalClayChoice.
//
// Styled after tests/scenarios/legendary-creatures-cleanup.test.js: real CARD_DB-backed
// instances via makeCardInstance, not synthetic fixtures.

import { describe, it, expect } from 'vitest';
import { duelReducer, makeCardInstance } from '../../src/engine/DuelCore.js';
import { chooseGYCardReturn } from '../../src/engine/AI.js';
import { PHASE } from '../../src/engine/phases.js';
import { ACTIVATE_TARGET_EFFECTS } from '../../src/hooks/useDuelController';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], enchantments: [], ...overrides };
}

describe('@engine Scenario: legendary-creatures-bugfixes -- Bug 1: Ramses Overdark', () => {
  it('destroyEnchantedCreature is registered in ACTIVATE_TARGET_EFFECTS, so beginActivateFlow now opens a targeting step instead of activating with no target', () => {
    expect(ACTIVATE_TARGET_EFFECTS.has('destroyEnchantedCreature')).toBe(true);
  });

  it('destroyEnchantedCreature destroys a target creature with an aura attached, but fizzles against a creature with no enchantments', () => {
    const ramsesA = makeReadyInstance('ramses_overdark', 'p', { iid: 'ro-a' });
    const bare = makeCreature('bare-1', { controller: 'o' });
    const baseA = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ramsesA], oBf: [bare] });
    const sA1 = duelReducer(baseA, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ro-a', tgt: 'bare-1' });
    const sA2 = duelReducer(sA1, { type: 'RESOLVE_STACK' });
    expect(sA2.o.bf.some(c => c.iid === 'bare-1')).toBe(true);
    expect(sA2.o.gy.some(c => c.iid === 'bare-1')).toBe(false);

    const ramsesB = makeReadyInstance('ramses_overdark', 'p', { iid: 'ro-b' });
    const enchanted = makeCreature('en-1', { controller: 'o', enchantments: [{ iid: 'aura-1', name: 'Pacifism' }] });
    const baseB = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ramsesB], oBf: [enchanted] });
    const sB1 = duelReducer(baseB, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ro-b', tgt: 'en-1' });
    const sB2 = duelReducer(sB1, { type: 'RESOLVE_STACK' });
    expect(sB2.o.bf.some(c => c.iid === 'en-1')).toBe(false);
    expect(sB2.o.gy.some(c => c.iid === 'en-1')).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-bugfixes -- Bug 2: myTurnOnly gate', () => {
  it('Gwendlyn Di Corci: activating on the opponent\'s turn is rejected with an info log and no stack push', () => {
    const gwendlyn = makeReadyInstance('gwendlyn_di_corci', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [gwendlyn] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: gwendlyn.iid, tgt: 'o' });
    expect(s1.log[s1.log.length - 1].text).toContain('can only be activated during your turn');
    expect(s1.stack.length).toBe(0);
    expect(s1.p.bf.find(c => c.iid === gwendlyn.iid).tapped).toBe(false);
  });

  it('Gwendlyn Di Corci: still works normally on the controller\'s own turn', () => {
    const gwendlyn = makeReadyInstance('gwendlyn_di_corci', 'p');
    const oppCard = { iid: 'oc-1', id: 'forest', name: 'Forest', type: 'Land' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [gwendlyn], oHand: [oppCard] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: gwendlyn.iid, tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.hand.length).toBe(0);
    expect(s2.o.gy.some(c => c.iid === 'oc-1')).toBe(true);
  });

  it('Rag Man (pre-existing, already-shipped card): activating on the opponent\'s turn is rejected with an info log and no stack push', () => {
    const ragman = makeReadyInstance('rag_man', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [ragman] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 3 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ragman.iid });
    expect(s1.log[s1.log.length - 1].text).toContain('can only be activated during your turn');
    expect(s1.stack.length).toBe(0);
  });

  it('Rag Man: still works normally on the controller\'s own turn', () => {
    const ragman = makeReadyInstance('rag_man', 'p');
    const oppCreature = { iid: 'rm-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ragman], oHand: [oppCreature] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 3 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ragman.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.hand.length).toBe(0);
    expect(s2.o.gy.some(c => c.iid === 'rm-1')).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-bugfixes -- Bug 3: gyCardChoice picker', () => {
  it('Regrowth: 0 eligible graveyard cards fizzles -- no pendingChoice, no hand change', () => {
    const spell = { iid: 'rg-0', id: 'regrowth', name: 'Regrowth', type: 'Sorcery', color: 'G', cmc: 2, cost: '1G', effect: 'regrowth' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, G: 1, C: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'rg-0' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.p.hand.length).toBe(0);
  });

  it('Adun Oakenshield (regrowthCreature): 0 eligible creature cards fizzles -- a land-only graveyard is ignored, no pendingChoice, no hand change', () => {
    const adun = makeReadyInstance('adun_oakenshield', 'p');
    const land = { iid: 'gy-land-only', id: 'forest', name: 'Forest', type: 'Land' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [adun] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1, G: 1 }, gy: [land] } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: adun.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.p.hand.length).toBe(0);
    expect(s2.p.gy.some(c => c.iid === 'gy-land-only')).toBe(true);
  });

  it('Regrowth: exactly 1 eligible card still auto-selects immediately, no pendingChoice (regression)', () => {
    const spell = { iid: 'rg-1', id: 'regrowth', name: 'Regrowth', type: 'Sorcery', color: 'G', cmc: 2, cost: '1G', effect: 'regrowth' };
    const onlyCard = { iid: 'gy-only', id: 'forest', name: 'Forest', type: 'Land' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, G: 1, C: 1 }, gy: [onlyCard] } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'rg-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.p.hand.some(c => c.iid === 'gy-only')).toBe(true);
  });

  it('Regrowth: 2+ eligible cards opens a gyCardChoice pendingChoice; resolving it returns the chosen card and leaves the other in the graveyard', () => {
    const spell = { iid: 'rg-2', id: 'regrowth', name: 'Regrowth', type: 'Sorcery', color: 'G', cmc: 2, cost: '1G', effect: 'regrowth' };
    const cardA = { iid: 'gy-a', id: 'forest', name: 'Forest', type: 'Land' };
    const cardB = { iid: 'gy-b', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, G: 1, C: 1 }, gy: [cardA, cardB] } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'rg-2' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('gyCardChoice');
    expect(s2.pendingChoice.mode).toBe('regrowth');
    expect(s2.pendingChoice.controller).toBe('p');
    expect(s2.pendingChoice.options.map(o => o.id).sort()).toEqual(['gy-a', 'gy-b']);
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'gy-a' });
    expect(s3.pendingChoice).toBeNull();
    expect(s3.p.hand.some(c => c.iid === 'gy-a')).toBe(true);
    expect(s3.p.gy.some(c => c.iid === 'gy-b')).toBe(true);
  });

  it('Adun Oakenshield (regrowthCreature): 2+ eligible creature cards opens a gyCardChoice pendingChoice restricted to creatures; resolving it returns the chosen creature', () => {
    const adun = makeReadyInstance('adun_oakenshield', 'p');
    const land = { iid: 'gy-land', id: 'forest', name: 'Forest', type: 'Land' };
    const bear = { iid: 'gy-bear', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const wurm = { iid: 'gy-wurm', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [adun] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1, G: 1 }, gy: [land, bear, wurm] } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: adun.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('gyCardChoice');
    expect(s2.pendingChoice.mode).toBe('regrowthCreature');
    expect(s2.pendingChoice.options.map(o => o.id).sort()).toEqual(['gy-bear', 'gy-wurm']);
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'gy-wurm' });
    expect(s3.pendingChoice).toBeNull();
    expect(s3.p.hand.some(c => c.iid === 'gy-wurm')).toBe(true);
    expect(s3.p.gy.some(c => c.iid === 'gy-bear')).toBe(true);
    expect(s3.p.gy.some(c => c.iid === 'gy-land')).toBe(true);
  });

  it('gyCardChoice: the AI policy (chooseGYCardReturn) resolves deterministically, preferring the higher-value creature', () => {
    const adun = makeReadyInstance('adun_oakenshield', 'o');
    const weakBear = { iid: 'gy-weak', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', power: 2, toughness: 2, cmc: 2, keywords: [] };
    const strongWurm = { iid: 'gy-strong', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature', power: 6, toughness: 4, cmc: 6, keywords: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', oBf: [adun] });
    const funded = { ...base, o: { ...base.o, mana: { ...base.o.mana, B: 1, R: 1, G: 1 }, gy: [weakBear, strongWurm] } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'o', iid: adun.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const choice = s2.pendingChoice;
    expect(choice?.kind).toBe('gyCardChoice');

    const pick1 = chooseGYCardReturn(choice, s2);
    const pick2 = chooseGYCardReturn(choice, s2);
    expect(pick1).toBe(pick2);
    expect(pick1).toBe('gy-strong');
  });
});
