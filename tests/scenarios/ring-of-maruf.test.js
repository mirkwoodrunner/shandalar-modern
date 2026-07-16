// tests/scenarios/ring-of-maruf.test.js
// Ring of Ma'ruf: "{5}, {T}, Exile this artifact: The next time you would draw
// a card this turn, instead put a card you own from outside the game into your
// hand." "Outside the game" maps to the overworld binder, snapshotted as
// binderIds at duel launch; the AI opponent gets a pseudo-binder (its archetype
// deck list). See docs/ENGINE_CONTRACT_SPEC.md and docs/MECHANICS_INDEX.md.
//
// RM-01..04  plumbing (binder snapshot, activation, end-of-turn clearing)
// RM-05..09  consumption / fizzle
// RM-10..14  pick mechanics
// RM-15..18  AI policy + determinism
// RM-19..22  regression / meta

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { duelReducer, buildDuelState, drawD } from '../../src/engine/DuelCore.js';
import { chooseMarufFetch } from '../../src/engine/AI.js';
import { CARD_DB, ARCHETYPES } from '../../src/data/cards.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeSpell, makeLand } from '../../src/engine/__tests__/_factory.js';

const RULESET = { startingLife: 20, startingHandSize: 7, londonMulligan: false };
const MARUF_NAME = "Ring of Ma'r\u00fbf";

function makeRing(overrides = {}) {
  return {
    iid: 'ring-1',
    id: 'ring_of_maruf',
    name: MARUF_NAME,
    type: 'Artifact',
    color: '',
    cmc: 5,
    cost: '5',
    keywords: [],
    rarity: 'R',
    activated: { cost: '5,T,exile', effect: 'marufCharge' },
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'p',
    ...overrides,
  };
}

function libCard(iid, name = iid) {
  return makeSpell(iid, { id: 'lightning_bolt', name });
}

// Base state helper: charge(s) + binder + library, ready for drawD.
function chargedState({ who = 'p', charges = 1, binder = ['lightning_bolt'], lib = 3 } = {}) {
  const state = makeState();
  state[who].marufCharges = charges;
  state[who].binderIds = [...binder];
  state[who].lib = Array.from({ length: lib }, (_, i) => libCard(`lib-${i + 1}`, `Lib Card ${i + 1}`));
  return state;
}

describe('@engine-card-scenarios-2 Ring of Maruf -- binder plumbing', () => {
  it('RM-01: buildDuelState snapshots binderIds into p.binderIds; omitted argument defaults to []', () => {
    const binder = ['lightning_bolt', 'grizzly_bears'];
    const st = buildDuelState(['forest', 'forest', 'forest'], 'RED_BURN', RULESET, null, null, false, null, binder);
    expect(st.p.binderIds).toEqual(['lightning_bolt', 'grizzly_bears']);
    // Snapshot, not a shared reference: mutating the input must not leak in.
    binder.push('shivan_dragon');
    expect(st.p.binderIds).toEqual(['lightning_bolt', 'grizzly_bears']);
    const stDefault = buildDuelState(['forest', 'forest', 'forest'], 'RED_BURN', RULESET, null, null, false, null);
    expect(stDefault.p.binderIds).toEqual([]);
  });

  it('RM-02: o.binderIds is the opponent archetype deck list (pseudo-binder)', () => {
    const st = buildDuelState(['forest', 'forest', 'forest'], 'RED_BURN', RULESET, null, null, false, null, []);
    expect(st.o.binderIds).toEqual(ARCHETYPES.RED_BURN.deck);
    // Copy, not the ARCHETYPES array itself.
    expect(st.o.binderIds).not.toBe(ARCHETYPES.RED_BURN.deck);
  });

  it('RM-03: activation exiles the Ring via the existing cost token and increments marufCharges; Feldon\'s Cane regression', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [makeRing()] });
    state.p.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 };
    state.p.binderIds = [];
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ring-1' });
    // Exile-self happened at cost-payment time; the ability sits on the stack.
    expect(s1.p.bf.find(c => c.iid === 'ring-1')).toBeUndefined();
    expect(s1.p.exile.find(c => c.iid === 'ring-1')).toBeDefined();
    expect(s1.stack).toHaveLength(1);
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.marufCharges).toBe(1);
    expect(s2.log.some(l => l.text.includes('would draw this turn is replaced'))).toBe(true);

    // Regression: Feldon's Cane's own exile-cost activation is unchanged.
    const cane = makeRing({ iid: 'cane-1', id: 'feldonss_cane', name: "Feldon's Cane", cmc: 1, cost: '1', activated: { cost: 'T,exile', effect: 'shuffleGYIntoLibrary' } });
    const cs = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cane] });
    cs.p.gy = [libCard('gy-1', 'Dead Bolt')];
    const cs1 = duelReducer(cs, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cane-1' });
    expect(cs1.p.exile.find(c => c.iid === 'cane-1')).toBeDefined();
    const cs2 = duelReducer(cs1, { type: 'RESOLVE_STACK' });
    expect(cs2.p.gy).toHaveLength(0);
    expect(cs2.p.lib.find(c => c.iid === 'gy-1')).toBeDefined();
    expect(cs2.p.marufCharges ?? 0).toBe(0);
  });

  it('RM-04: unconsumed marufCharges are cleared at end of turn alongside lampCharges', () => {
    const state = makeState({ phase: PHASE.END, active: 'p' });
    state.p.marufCharges = 2;
    state.p.lampCharges = [3];
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.marufCharges).toBe(0);
    expect(s1.p.lampCharges).toEqual([]);
  });
});

describe('@engine-card-scenarios-2 Ring of Maruf -- consumption and fizzle', () => {
  it('RM-05: charge + non-empty binder + draw suspends into pendingMarufPicks; no card leaves the library', () => {
    const state = chargedState({ lib: 3 });
    const s1 = drawD(state, 'p', 2);
    expect(s1.pendingMarufPicks).toHaveLength(1);
    expect(s1.pendingMarufPicks[0]).toEqual({ who: 'p', remainingDraws: 1, followUps: [] });
    expect(s1.p.hand).toHaveLength(0);
    expect(s1.p.lib).toHaveLength(3);
    expect(s1.p.marufCharges).toBe(0);
  });

  it('RM-06: charge + EMPTY binder + draw fizzles to a normal top-card draw', () => {
    const state = chargedState({ binder: [], lib: 2 });
    const s1 = drawD(state, 'p', 1);
    expect(s1.pendingMarufPicks ?? []).toHaveLength(0);
    expect(s1.p.hand).toHaveLength(1);
    expect(s1.p.hand[0].iid).toBe('lib-1');
    expect(s1.p.lib).toHaveLength(1);
    expect(s1.p.marufCharges).toBe(0);
    expect(s1.log.some(l => l.text.includes('no cards outside the game'))).toBe(true);
  });

  it('RM-07: draw 3 with one charge -- first draw replaced, MARUF_PICK completes the remaining 2 draws', () => {
    const state = chargedState({ lib: 5 });
    const s1 = drawD(state, 'p', 3);
    expect(s1.pendingMarufPicks[0].remainingDraws).toBe(2);
    expect(s1.p.hand).toHaveLength(0);
    const s2 = duelReducer(s1, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    // 1 fetched + 2 drawn = hand grew by 3 total.
    expect(s2.p.hand).toHaveLength(3);
    expect(s2.p.lib).toHaveLength(3);
    expect(s2.pendingMarufPicks).toHaveLength(0);
  });

  it('RM-08: charge priority -- Ring consumes before Lamp; the resumed sequence still honors the lamp charge', () => {
    const state = chargedState({ lib: 4 });
    state.p.lampCharges = [2];
    const s1 = drawD(state, 'p', 2);
    // Ring first (documented ordering simplification): maruf suspends, lamp untouched.
    expect(s1.pendingMarufPicks).toHaveLength(1);
    expect(s1.pendingLampPicks ?? []).toHaveLength(0);
    expect(s1.p.lampCharges).toEqual([2]);
    const s2 = duelReducer(s1, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    // The resumed draw (1 remaining) is now replaced by the lamp charge.
    expect(s2.pendingLampPicks).toHaveLength(1);
    expect(s2.p.lampCharges).toEqual([]);
    const shownIid = s2.pendingLampPicks[0].cardIids[0];
    const s3 = duelReducer(s2, { type: 'LAMP_PICK', iid: shownIid });
    // Fetched card + lamp-picked draw = 2 cards, matching the original draw count.
    expect(s3.p.hand).toHaveLength(2);
    expect(s3.pendingLampPicks).toHaveLength(0);
  });

  it('RM-09: two charges + one draw -- one consumed, one remains for a later draw this turn', () => {
    const state = chargedState({ charges: 2, binder: ['lightning_bolt', 'grizzly_bears'], lib: 4 });
    const s1 = drawD(state, 'p', 1);
    expect(s1.pendingMarufPicks).toHaveLength(1);
    expect(s1.p.marufCharges).toBe(1);
    const s2 = duelReducer(s1, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    expect(s2.p.marufCharges).toBe(1);
    // A later draw this turn consumes the second charge.
    const s3 = drawD(s2, 'p', 1);
    expect(s3.pendingMarufPicks).toHaveLength(1);
    expect(s3.p.marufCharges).toBe(0);
  });
});

describe('@engine-card-scenarios-2 Ring of Maruf -- pick mechanics', () => {
  it('RM-10: MARUF_PICK mints a fresh instance into hand, removes ONE binder occurrence, logs the reveal', () => {
    const state = makeState();
    state.p.binderIds = ['lightning_bolt', 'forest'];
    state.pendingMarufPicks = [{ who: 'p', remainingDraws: 0, followUps: [] }];
    const s1 = duelReducer(state, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    expect(s1.p.hand).toHaveLength(1);
    const fetched = s1.p.hand[0];
    expect(fetched.id).toBe('lightning_bolt');
    expect(fetched.iid).toBeDefined();
    expect(fetched.iid).not.toBe('lightning_bolt');
    expect(fetched.controller).toBe('p');
    expect(s1.p.binderIds).toEqual(['forest']);
    expect(s1.pendingMarufPicks).toHaveLength(0);
    expect(s1.log.some(l => l.text.includes('reveals Lightning Bolt') && l.text.includes('puts it into their hand'))).toBe(true);
  });

  it('RM-11: duplicate binder ids -- fetching one leaves the second occurrence fetchable by a later charge', () => {
    const state = chargedState({ charges: 2, binder: ['lightning_bolt', 'lightning_bolt'], lib: 4 });
    const s1 = drawD(state, 'p', 1);
    const s2 = duelReducer(s1, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    expect(s2.p.binderIds).toEqual(['lightning_bolt']);
    const s3 = drawD(s2, 'p', 1);
    expect(s3.pendingMarufPicks).toHaveLength(1);
    const s4 = duelReducer(s3, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    expect(s4.p.binderIds).toEqual([]);
    expect(s4.p.hand.filter(c => c.id === 'lightning_bolt')).toHaveLength(2);
  });

  it('RM-12: MARUF_PICK with an id not in the binder is a rejected no-op; the pick stays pending', () => {
    const state = makeState();
    state.p.binderIds = ['lightning_bolt'];
    state.pendingMarufPicks = [{ who: 'p', remainingDraws: 0, followUps: [] }];
    const s1 = duelReducer(state, { type: 'MARUF_PICK', id: 'shivan_dragon' });
    expect(s1).toBe(state);
    expect(s1.pendingMarufPicks).toHaveLength(1);
    expect(s1.p.hand).toHaveLength(0);
  });

  it('RM-13: resume arithmetic -- no extra draw; total cards gained equals the original draw count', () => {
    const state = chargedState({ lib: 5 });
    const s1 = drawD(state, 'p', 2);
    expect(s1.pendingMarufPicks[0].remainingDraws).toBe(1);
    const s2 = duelReducer(s1, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    // 1 fetched + 1 drawn = 2 total (the fetched card satisfied the replaced draw).
    expect(s2.p.hand).toHaveLength(2);
    expect(s2.p.lib).toHaveLength(4);
  });

  it('RM-14: followUps survive the suspension -- a Jalum-Tome-style draw followup still runs after the pick resumes', () => {
    // drawThenDiscardOwn (Jalum Tome): performDraws(caster, 1, [discardLastDrawn]).
    const state = chargedState({ lib: 3 });
    const tome = makeRing({ iid: 'tome-1', id: 'jalum_tome', name: 'Jalum Tome', effect: 'drawThenDiscardOwn' });
    const s1 = duelReducer({ ...state, stack: [{ id: 'st-1', card: tome, caster: 'p', targets: [], xVal: 1, isAbility: true }] }, { type: 'RESOLVE_STACK' });
    expect(s1.pendingMarufPicks).toHaveLength(1);
    expect(s1.pendingMarufPicks[0].followUps).toEqual([{ id: 'discardLastDrawn', sourceName: 'Jalum Tome' }]);
    const s2 = duelReducer(s1, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    // The fetched card satisfied the (single) draw; the followup then discards
    // the most recently drawn card -- the fetched one -- leaving it in the GY.
    expect(s2.p.hand).toHaveLength(0);
    expect(s2.p.gy.some(c => c.id === 'lightning_bolt')).toBe(true);
  });
});

describe('@engine-card-scenarios-2 Ring of Maruf -- AI policy', () => {
  it('RM-15: chooseMarufFetch prefers highest-cmc castable nonland, then lowest-cmc nonland, then first id; deterministic', () => {
    const state = makeState();
    state.o.bf = [makeLand('l1', { controller: 'o' }), makeLand('l2', { controller: 'o' })];
    // 2 lands: lightning_bolt (1) and grizzly_bears (2) castable; air_elemental (5) not.
    const binder = ['lightning_bolt', 'grizzly_bears', 'air_elemental', 'forest'];
    expect(chooseMarufFetch(binder, state)).toBe('grizzly_bears');
    // No lands: nothing castable -> lowest-cmc nonland.
    const noLands = makeState();
    expect(chooseMarufFetch(['air_elemental', 'lightning_bolt'], noLands)).toBe('lightning_bolt');
    // All lands -> first id.
    expect(chooseMarufFetch(['forest', 'mountain'], state)).toBe('forest');
    // Empty -> null.
    expect(chooseMarufFetch([], state)).toBeNull();
    // Deterministic: identical calls, identical result.
    expect(chooseMarufFetch(binder, state)).toBe(chooseMarufFetch(binder, state));
  });

  it('RM-16: AI end-to-end -- the controller\'s dispatch pair puts the chosen card in o\'s hand and decrements o.binderIds', () => {
    const state = chargedState({ who: 'o', binder: ['lightning_bolt', 'air_elemental'], lib: 3 });
    state.o.bf = [makeLand('l1', { controller: 'o' })];
    const s1 = drawD(state, 'o', 1);
    expect(s1.pendingMarufPicks[0].who).toBe('o');
    // Replicates the useDuelController AI auto-resolution branch verbatim
    // (chooseMarufFetch -> MARUF_PICK); hooks cannot render under the node
    // test environment, so the exact dispatch pair is exercised directly.
    const chosen = chooseMarufFetch(s1.o.binderIds, s1);
    expect(chosen).toBe('lightning_bolt');
    const s2 = duelReducer(s1, { type: 'MARUF_PICK', id: chosen });
    expect(s2.o.hand.some(c => c.id === 'lightning_bolt')).toBe(true);
    expect(s2.o.binderIds).toEqual(['air_elemental']);
    expect(s2.pendingMarufPicks).toHaveLength(0);
  });

  it('RM-17: AI empty pseudo-binder -- fizzle path holds for o (constructed state)', () => {
    const state = chargedState({ who: 'o', binder: [], lib: 2 });
    const s1 = drawD(state, 'o', 1);
    expect(s1.pendingMarufPicks ?? []).toHaveLength(0);
    expect(s1.o.hand).toHaveLength(1);
    expect(s1.o.marufCharges).toBe(0);
  });

  it('RM-18: no Math.random in any of the new code (source inspection of the new function bodies)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const aiSrc = readFileSync(join(here, '../../src/engine/AI.js'), 'utf8');
    const coreSrc = readFileSync(join(here, '../../src/engine/DuelCore.js'), 'utf8');

    const marufFetchBody = aiSrc.slice(aiSrc.indexOf('export function chooseMarufFetch'), aiSrc.indexOf('function planAttack'));
    expect(marufFetchBody.length).toBeGreaterThan(0);
    expect(marufFetchBody).not.toMatch(/Math\.random/);

    const marufPickCase = coreSrc.slice(coreSrc.indexOf('case "MARUF_PICK"'), coreSrc.indexOf('case "RIVER_DIVIDE"'));
    expect(marufPickCase.length).toBeGreaterThan(0);
    expect(marufPickCase).not.toMatch(/Math\.random/);

    const marufChargeCase = coreSrc.slice(coreSrc.indexOf('case "marufCharge"'), coreSrc.indexOf('case "guardianAngel"'));
    expect(marufChargeCase.length).toBeGreaterThan(0);
    expect(marufChargeCase).not.toMatch(/Math\.random/);

    const performDrawsBody = coreSrc.slice(coreSrc.indexOf('function performDraws'), coreSrc.indexOf('export function drawD'));
    expect(performDrawsBody).toContain('marufCharges');
    expect(performDrawsBody).not.toMatch(/Math\.random/);
  });
});

describe('@engine-card-scenarios-2 Ring of Maruf -- regression and meta', () => {
  it('RM-19: Aladdin\'s Lamp alone (no maruf charges) keeps its shipped behavior, including the +1 resume', () => {
    const state = makeState();
    state.p.lampCharges = [2];
    state.p.lib = [libCard('c1', 'Card 1'), libCard('c2', 'Card 2'), libCard('c3', 'Card 3')];
    const s1 = drawD(state, 'p', 1);
    expect(s1.pendingLampPicks).toHaveLength(1);
    expect(s1.pendingLampPicks[0]).toMatchObject({ who: 'p', x: 2, cardIids: ['c1', 'c2'], remainingDraws: 0, followUps: [] });
    expect(s1.pendingMarufPicks ?? []).toHaveLength(0);
    expect(s1.p.hand).toHaveLength(0);
    // LAMP_PICK resumes with 1 + remainingDraws: the chosen card is drawn.
    const s2 = duelReducer(s1, { type: 'LAMP_PICK', iid: 'c2' });
    expect(s2.p.hand).toHaveLength(1);
    expect(s2.p.hand[0].iid).toBe('c2');
    expect(s2.pendingLampPicks).toHaveLength(0);
  });

  it('RM-20: plain draws with neither charge type follow the normal draw path unchanged', () => {
    const state = makeState();
    state.p.binderIds = ['lightning_bolt'];
    state.p.lib = [libCard('c1', 'Card 1'), libCard('c2', 'Card 2'), libCard('c3', 'Card 3')];
    const s1 = drawD(state, 'p', 2);
    expect(s1.p.hand.map(c => c.iid)).toEqual(['c1', 'c2']);
    expect(s1.p.lib.map(c => c.iid)).toEqual(['c3']);
    expect(s1.pendingMarufPicks ?? []).toHaveLength(0);
    expect(s1.pendingLampPicks ?? []).toHaveLength(0);
    expect(s1.p.binderIds).toEqual(['lightning_bolt']);
  });

  it('RM-21: pendingMarufPicks survives a LOAD_STATE round-trip (plain serializable state)', () => {
    const state = chargedState({ lib: 3 });
    const s1 = drawD(state, 'p', 1);
    expect(s1.pendingMarufPicks).toHaveLength(1);
    const restored = duelReducer(makeState(), { type: 'LOAD_STATE', state: JSON.parse(JSON.stringify(s1)) });
    expect(restored.pendingMarufPicks).toEqual(s1.pendingMarufPicks);
    // The restored pick still resolves normally.
    const s2 = duelReducer(restored, { type: 'MARUF_PICK', id: 'lightning_bolt' });
    expect(s2.p.hand.some(c => c.id === 'lightning_bolt')).toBe(true);
    expect(s2.pendingMarufPicks).toHaveLength(0);
  });

  it('RM-22: ring_of_maruf is no longer a STUB; blaze_of_glory still is', () => {
    const stubs = CARD_DB.filter(c => c.effect === 'STUB').map(c => c.id);
    expect(stubs).not.toContain('ring_of_maruf');
    expect(stubs).toContain('blaze_of_glory');
    const ring = CARD_DB.find(c => c.id === 'ring_of_maruf');
    expect(ring.activated).toEqual({ cost: '5,T,exile', effect: 'marufCharge' });
  });
});
