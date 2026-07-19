// tests/scenarios/legendary-creatures-cleanup.test.js
// Legendary Creatures Cleanup batch: the 5 cards deferred from Batch 1+2 (Xira Arien,
// Tor Wauki, Lady Caleria, Gwendlyn Di Corci, Adun Oakenshield) plus Kei Takahashi
// (left out of Batch 1+2's scope by a counting mistake, unrelated to the other 5's
// deferral). See docs/CURRENT_SPRINT.md and docs/MECHANICS_INDEX.md for the fix
// writeup: each card gets a new sibling DuelCore.js case (or an in-place fix proven
// safe for the pre-existing card that used it) plus new targeting registrations in
// useDuelController.ts.
//
// Styled after tests/scenarios/legendary-creatures-batch-1-2.test.js: real CARD_DB-backed
// instances via makeCardInstance, not synthetic fixtures.

import { describe, it, expect } from 'vitest';
import { duelReducer, makeCardInstance } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], enchantments: [], ...overrides };
}

function fillerLib(prefix, n = 3) {
  return Array.from({ length: n }, (_, i) => ({ iid: `${prefix}-lib-${i}`, id: 'forest', name: 'Forest', type: 'Land' }));
}

describe('@engine Scenario: legendary-creatures-cleanup -- Xira Arien', () => {
  it('draw1Tgt: draws a card for the chosen opponent target, not the caster', () => {
    const xira = makeReadyInstance('xira_arien', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [xira] });
    const funded = {
      ...base,
      p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1, G: 1 }, lib: fillerLib('p') },
      o: { ...base.o, lib: fillerLib('o') },
    };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: xira.iid, tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.hand.length).toBe(1);
    expect(s2.p.hand.length).toBe(0);
  });

  it('draw1Tgt: draws a card for the caster when self is the chosen target', () => {
    const xira = makeReadyInstance('xira_arien', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [xira] });
    const funded = {
      ...base,
      p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1, G: 1 }, lib: fillerLib('p') },
      o: { ...base.o, lib: fillerLib('o') },
    };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: xira.iid, tgt: 'p' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.length).toBe(1);
    expect(s2.o.hand.length).toBe(0);
  });
});

describe('@engine Scenario: legendary-creatures-cleanup -- Tor Wauki', () => {
  it('pingCombatant2: deals 2 damage to a target attacking creature', () => {
    const tor = makeReadyInstance('tor_wauki', 'p');
    const attacker = makeCreature('atk-1', { controller: 'o', toughness: 4 });
    const base = { ...makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tor], oBf: [attacker] }), attackers: ['atk-1'] };
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: tor.iid, tgt: 'atk-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'atk-1').damage).toBe(2);
  });

  it('pingCombatant2: fizzles against a creature that is neither attacking nor blocking', () => {
    const tor = makeReadyInstance('tor_wauki', 'p');
    const bystander = makeCreature('by-1', { controller: 'o', toughness: 4 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tor], oBf: [bystander] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: tor.iid, tgt: 'by-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'by-1').damage).toBe(0);
    expect(s2.log[s2.log.length - 1].text).toContain('fizzles');
  });
});

describe('@engine Scenario: legendary-creatures-cleanup -- Lady Caleria', () => {
  it('pingCombatant3: deals 3 damage to a target blocking creature', () => {
    const caleria = makeReadyInstance('lady_caleria', 'p');
    const blocker = makeCreature('bl-1', { controller: 'o', toughness: 6, blocking: 'atk-1' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [caleria], oBf: [blocker] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: caleria.iid, tgt: 'bl-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'bl-1').damage).toBe(3);
  });

  it('pingCombatant3: fizzles against a creature that is neither attacking nor blocking', () => {
    const caleria = makeReadyInstance('lady_caleria', 'p');
    const bystander = makeCreature('by-2', { controller: 'o', toughness: 6 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [caleria], oBf: [bystander] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: caleria.iid, tgt: 'by-2' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'by-2').damage).toBe(0);
    expect(s2.log[s2.log.length - 1].text).toContain('fizzles');
  });
});

describe('@engine Scenario: legendary-creatures-cleanup -- Gwendlyn Di Corci', () => {
  it('discardOneTgt: discards from the chosen opponent target', () => {
    const gwendlyn = makeReadyInstance('gwendlyn_di_corci', 'p');
    const oppCard = { iid: 'oc-1', id: 'forest', name: 'Forest', type: 'Land' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [gwendlyn], oHand: [oppCard] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: gwendlyn.iid, tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.hand.length).toBe(0);
    expect(s2.o.gy.some(c => c.iid === 'oc-1')).toBe(true);
  });

  it('discardOneTgt: discards from the caster when self is the chosen target', () => {
    const gwendlyn = makeReadyInstance('gwendlyn_di_corci', 'p');
    const ownCard = { iid: 'pc-1', id: 'forest', name: 'Forest', type: 'Land' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [gwendlyn], pHand: [ownCard] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: gwendlyn.iid, tgt: 'p' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.length).toBe(0);
    expect(s2.p.gy.some(c => c.iid === 'pc-1')).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-cleanup -- Adun Oakenshield', () => {
  it('regrowthCreature: returns the specifically targeted creature card, not just the most recent', () => {
    const adun = makeReadyInstance('adun_oakenshield', 'p');
    const older = { iid: 'gy-old', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const newer = { iid: 'gy-new', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [adun] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1, G: 1 }, gy: [older, newer] } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: adun.iid, tgt: 'gy-old' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.some(c => c.iid === 'gy-old')).toBe(true);
    expect(s2.p.gy.some(c => c.iid === 'gy-new')).toBe(true);
  });

  it('regrowthCreature: falls back to the most recent creature card when no tgt is given, ignoring noncreature cards', () => {
    const adun = makeReadyInstance('adun_oakenshield', 'p');
    const land = { iid: 'gy-land', id: 'forest', name: 'Forest', type: 'Land' };
    const creature = { iid: 'gy-cre', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [adun] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 1, R: 1, G: 1 }, gy: [land, creature] } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: adun.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.hand.some(c => c.iid === 'gy-cre')).toBe(true);
    expect(s2.p.gy.some(c => c.iid === 'gy-land')).toBe(true);
  });
});

describe('@engine Scenario: legendary-creatures-cleanup -- Kei Takahashi', () => {
  it('preventDamage2Creature: adds a 2-point damage shield to a target creature', () => {
    const kei = makeReadyInstance('kei_takahashi', 'p');
    const target = makeCreature('sh-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [kei, target] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: kei.iid, tgt: 'sh-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'sh-1').damageShield).toBe(2);
  });

  it('preventDamage2Creature: fizzles with a log message when there is no legal creature target', () => {
    const kei = makeReadyInstance('kei_takahashi', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [kei] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: kei.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.log[s2.log.length - 1].text).toContain('fizzles');
  });
});

describe('@engine Scenario: legendary-creatures-cleanup -- regression coverage', () => {
  // Ancestral Recall resolves through its own CARD_HANDLERS entry (checked before the
  // resolveEff switch, per cardHandlers.js), not through the draw3/draw1 switch cases
  // touched by this batch -- so it can't regress from the draw1/draw1Tgt change below.
  // Kept as a belt-and-suspenders check that its own targeting still works.
  it('Ancestral Recall still respects an explicit target', () => {
    const spell = { iid: 'ar-1', id: 'ancestral_recall', name: 'Ancestral Recall', type: 'Instant', color: 'U', cmc: 1, cost: 'U', effect: 'draw3' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const funded = {
      ...base,
      p: { ...base.p, mana: { ...base.p.mana, U: 1 }, lib: fillerLib('p', 5) },
      o: { ...base.o, lib: fillerLib('o', 5) },
    };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'ar-1', tgt: 'o' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.hand.length).toBe(3);
    expect(s2.p.hand.length).toBe(0);
  });

  it('Rag Man (discardOne) still always discards from the opponent, with no tgt available to it', () => {
    const ragman = makeReadyInstance('rag_man', 'p');
    const oppCreature = { iid: 'rm-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ragman], oHand: [oppCreature] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, B: 3 } } };
    const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: ragman.iid });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.hand.length).toBe(0);
    expect(s2.o.gy.some(c => c.iid === 'rm-1')).toBe(true);
  });

  it('Regrowth (regrowth) still ends up with the same chosen card in hand when no tgt is available to it', () => {
    // Bug 3 (legendary-creatures-bugfixes): with 2+ eligible graveyard cards,
    // Regrowth now opens a gyCardChoice pendingChoice instead of silently
    // taking the most recent card -- see tests/scenarios/legendary-creatures-bugfixes.test.js
    // for the choice mechanism itself. This test just confirms the surrounding
    // CAST_SPELL/RESOLVE_STACK flow still reaches that choice and resolves cleanly.
    const spell = { iid: 'rg-1', id: 'regrowth', name: 'Regrowth', type: 'Sorcery', color: 'G', cmc: 2, cost: '1G', effect: 'regrowth' };
    const older = { iid: 'gy-a', id: 'forest', name: 'Forest', type: 'Land' };
    const newer = { iid: 'gy-b', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, G: 1, C: 1 }, gy: [older, newer] } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'rg-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('gyCardChoice');
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'gy-b' });
    expect(s3.p.hand.some(c => c.iid === 'gy-b')).toBe(true);
    expect(s3.p.gy.some(c => c.iid === 'gy-a')).toBe(true);
  });

  it('Oasis (preventDamage1Creature) still adds exactly a 1-point damage shield', () => {
    const oasis = makeReadyInstance('oasis', 'p');
    const target = makeCreature('ok-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [oasis, target] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: oasis.iid, tgt: 'ok-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'ok-1').damageShield).toBe(1);
  });
});
