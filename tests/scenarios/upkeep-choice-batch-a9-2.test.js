// tests/scenarios/upkeep-choice-batch-a9-2.test.js
// A9 upkeep-trigger batch 2: Safe Haven, Season of the Witch, Psychic
// Allergy -- optional and mandatory pendingUpkeepChoice shapes. See
// docs/CURRENT_SPRINT.md / docs/MECHANICS_INDEX.md for the full batch.
// Sibling files: upkeep-counter-batch-a9-2.test.js (self-referential counter
// accumulation), upkeep-aura-and-eachplayer-batch-a9-2.test.js (aura-tied-to-
// controller and each-player shapes).

import { describe, it, expect } from 'vitest';
import { duelReducer, getBF } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeSafeHaven(iid, overrides = {}) {
  return {
    iid, id: 'safe_haven', name: 'Safe Haven', type: 'Land', color: '',
    cmc: 0, cost: '', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], activatedAbilities: [{ id: 'safe_haven_exile', cost: { generic: 2 }, effect: 'safeHavenExile' }],
    upkeep: 'safeHavenUpkeep', controller: 'p',
    ...overrides,
  };
}

function makeSeasonOfTheWitch(iid, overrides = {}) {
  return {
    iid, id: 'season_of_the_witch', name: 'Season of the Witch', type: 'Enchantment', color: 'B',
    cmc: 3, cost: 'BBB', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], upkeep: 'seasonOfTheWitchUpkeep', controller: 'p',
    ...overrides,
  };
}

function makePsychicAllergy(iid, overrides = {}) {
  return {
    iid, id: 'psychic_allergy', name: 'Psychic Allergy', type: 'Enchantment', color: 'U',
    cmc: 5, cost: '3UU', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], effect: 'psychicAllergyETB', upkeep: 'psychicAllergyUpkeep', controller: 'p',
    ...overrides,
  };
}

describe('@engine Scenario: upkeep-choice-batch-a9-2 -- optional/mandatory choice shapes', () => {

  it('Safe Haven: {2},{T} exiles a target creature you control and tracks it', () => {
    const haven = makeSafeHaven('sh-1');
    const bear = makeCreature('bear-1', { name: 'Grizzly Bears', controller: 'p' });
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [haven, bear] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, C: 2 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'sh-1', tgt: 'bear-1', abilityId: 'safe_haven_exile' });
    expect(s1.p.exile.some(c => c.iid === 'bear-1')).toBe(true);
    expect(getBF(s1, 'sh-1').exiledIids).toEqual(['bear-1']);
  });

  it('Safe Haven: sacrificing at upkeep returns every card exiled with it to the battlefield', () => {
    const haven = makeSafeHaven('sh-2', { exiledIids: ['bear-2', 'cat-1'] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [haven] });
    state.p.exile.push(
      { iid: 'bear-2', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', color: 'G', power: 2, toughness: 2, keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' },
      { iid: 'cat-1', id: 'savannah_lions', name: 'Savannah Lions', type: 'Creature', color: 'W', power: 2, toughness: 1, keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' },
    );
    const s1 = duelReducer({ ...state, phase: PHASE.UNTAP }, { type: 'ADVANCE_PHASE' });
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('safeHavenUpkeep');
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'SACRIFICE' });
    expect(getBF(s2, 'sh-2')).toBeNull();
    expect(s2.p.bf.some(c => c.iid === 'bear-2')).toBe(true);
    expect(s2.p.bf.some(c => c.iid === 'cat-1')).toBe(true);
    expect(s2.p.exile.length).toBe(0);
  });

  it('Safe Haven: declining the sacrifice leaves it in play, unchanged', () => {
    const haven = makeSafeHaven('sh-3', { exiledIids: ['bear-3'] });
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [haven] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(getBF(s2, 'sh-3')).toBeTruthy();
  });

  it('Season of the Witch: the AI pays 2 life to avoid sacrificing it when it can afford to', () => {
    const enc = makeSeasonOfTheWitch('sw-1', { controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [enc] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.o.life).toBe(18);
    expect(getBF(s1, 'sw-1')).toBeTruthy();
  });

  it("Season of the Witch: the AI can't safely pay from 2 life or less -- sacrifices instead", () => {
    let enc = makeSeasonOfTheWitch('sw-2', { controller: 'o' });
    let state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [enc] });
    state = { ...state, o: { ...state.o, life: 2 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(getBF(s1, 'sw-2')).toBeNull();
    expect(s1.o.life).toBe(2);
  });

  it("Season of the Witch: at the end step, destroys untapped creatures that didn't attack, sparing attackers and creatures that couldn't attack", () => {
    const untapped = makeCreature('u-1', { name: 'Grizzly Bears', controller: 'p', tapped: false, summoningSick: false });
    const attacked = makeCreature('a-1', { name: 'Savannah Lions', controller: 'p', tapped: true, summoningSick: false });
    const sick = makeCreature('s-1', { name: 'Serra Angel', controller: 'p', tapped: false, summoningSick: true });
    const enc = makeSeasonOfTheWitch('sw-3', { controller: 'o' });
    let state = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [untapped, attacked, sick], oBf: [enc] });
    state = { ...state, turnState: { ...state.turnState, attackedThisCombat: ['a-1'] } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> END
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> CLEANUP (sweep runs here)
    expect(getBF(s2, 'u-1')).toBeNull();
    expect(getBF(s2, 'a-1')).toBeTruthy();
    expect(getBF(s2, 's-1')).toBeTruthy();
  });

  it('Psychic Allergy: ETB queues a color choice and sets chosenColor on resolution', () => {
    const pa = makePsychicAllergy('pa-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [pa] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 2, C: 3 } } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'pa-1', tgt: null, xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice?.kind).toBe('jihadColorChoice');
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'R' });
    expect(getBF(s3, 'pa-1').chosenColor).toBe('R');
  });

  it("Psychic Allergy: deals damage on each opponent's upkeep equal to their nontoken permanents of the chosen color", () => {
    const pa = makePsychicAllergy('pa-2', { chosenColor: 'R', controller: 'p' });
    const redCreature = makeCreature('rc-1', { name: 'Ball Lightning', color: 'R', controller: 'o' });
    const otherRed = makeCreature('rc-2', { name: 'Shivan Dragon', color: 'R', controller: 'o' });
    const blueCreature = makeCreature('bc-1', { name: 'Merfolk of the Pearl Trident', color: 'U', controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [pa], oBf: [redCreature, otherRed, blueCreature] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UPKEEP (o's, the opponent)
    expect(s1.o.life).toBe(18); // 2 red permanents
  });

  it('Psychic Allergy: at its own controller\'s upkeep, sacrifices unless two Islands are sacrificed', () => {
    const pa = makePsychicAllergy('pa-3', { chosenColor: 'R', controller: 'o' });
    const isl1 = makeLand('isl-1', { name: 'Island', subtype: 'Island', controller: 'o' });
    const isl2 = makeLand('isl-2', { name: 'Island', subtype: 'Island', controller: 'o' });
    const state = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [pa, isl1, isl2] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.o.bf.some(c => c.iid === 'isl-1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'isl-2')).toBe(false);
    expect(getBF(s1, 'pa-3')).toBeTruthy();

    const pa2 = makePsychicAllergy('pa-4', { chosenColor: 'R', controller: 'o' });
    const state2 = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [pa2] });
    const s2 = duelReducer(state2, { type: 'ADVANCE_PHASE' });
    expect(getBF(s2, 'pa-4')).toBeNull();
  });

});
