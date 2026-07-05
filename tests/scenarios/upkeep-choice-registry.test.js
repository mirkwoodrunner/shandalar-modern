// tests/scenarios/upkeep-choice-registry.test.js
// Generalize Existing Choice Mechanisms (Part 3): pendingUpkeepChoice is now
// backed by a small handlerKey-keyed registry (UPKEEP_CHOICE_HANDLERS) plus a
// pendingUpkeepChoiceQueue for more than one choice queued in the same untap
// step. Force of Nature (forceOfNatureUpkeep) is unchanged; Ashnod's Battle
// Gear / Tawnos's Weaponry (optionalUntap) are new registry entries. See
// THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, getPow, getTou } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function makeArt(iid, overrides = {}) {
  return {
    iid, id: 'ashnodss_battle_gear', name: "Ashnod's Battle Gear", type: 'Artifact', controller: 'p',
    tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 2, optionalUntap: true,
    ...overrides,
  };
}

describe('@engine Scenario: upkeep-choice registry (Part 3)', () => {

  it('Force of Nature still works unchanged: pay GGGG', () => {
    // Constructed directly at the pendingUpkeepChoice-already-queued state so the
    // test isn't affected by advPhase's end-of-phase mana burn (which empties
    // mana pools before the UPKEEP handler runs -- see phase6.test.js FN-02).
    const fon = makeCreature('fon-1', { id: 'force_of_nature', name: 'Force of Nature', controller: 'p', upkeep: 'forceOfNatureUpkeep' });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [fon] });
    const state = {
      ...base,
      pendingUpkeepChoice: { cardName: 'Force of Nature', handlerKey: 'forceOfNatureUpkeep', options: ['PAY_GGGG', 'TAKE_DAMAGE'] },
      p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 4, C: 0 }, life: 20 },
    };
    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY_GGGG' });
    expect(s1.pendingUpkeepChoice).toBeNull();
    expect(s1.p.mana.G).toBe(0);
    expect(s1.p.life).toBe(20);
  });

  it('Force of Nature still works unchanged: take 8 damage', () => {
    const fon = makeCreature('fon-1', { id: 'force_of_nature', name: 'Force of Nature', controller: 'p', upkeep: 'forceOfNatureUpkeep' });
    const base = makeState({ phase: PHASE.UPKEEP, active: 'p', pBf: [fon] });
    const state = {
      ...base,
      pendingUpkeepChoice: { cardName: 'Force of Nature', handlerKey: 'forceOfNatureUpkeep', options: ['PAY_GGGG', 'TAKE_DAMAGE'] },
      p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, life: 20 },
    };
    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'TAKE_DAMAGE' });
    expect(s1.p.life).toBe(12);
  });

  it('Force of Nature: ADVANCE_PHASE into UPKEEP still queues the choice and blocks further advancement', () => {
    const fon = makeCreature('fon-1', { id: 'force_of_nature', name: 'Force of Nature', controller: 'p', upkeep: 'forceOfNatureUpkeep' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [fon] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.pendingUpkeepChoice).not.toBeNull();
    expect(s1.pendingUpkeepChoice.handlerKey).toBe('forceOfNatureUpkeep');
    const blocked = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(blocked.phase).toBe(PHASE.UPKEEP);
  });

  it("Ashnod's Battle Gear: activating the pump queues an optionalUntap choice next untap step while tapped with an active bonus", () => {
    const gear = makeArt('gear-1', { activated: { cost: '2,T', effect: 'pumpWhileTapped' }, pumpRequiresControl: true, pumpPower: 2, pumpToughness: -2 });
    const bear = makeCreature('bear-1', { controller: 'p', power: 2, toughness: 2 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [gear, bear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'gear-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const gearAfter = s2.p.bf.find(c => c.iid === 'gear-1');
    expect(gearAfter.tapped).toBe(true);
    expect(gearAfter.whileTappedPump).toEqual({ targetIid: 'bear-1', power: 2, toughness: -2 });
    // Bonus applies immediately while tapped.
    const bearAfter = s2.p.bf.find(c => c.iid === 'bear-1');
    expect(getPow(bearAfter, s2)).toBe(4);
    expect(getTou(bearAfter, s2)).toBe(0);

    // Advance through the rest of the turn to p's next untap step. Each
    // CLEANUP -> ADVANCE_PHASE transition flips the active player and lands on
    // UNTAP for whoever's turn is beginning (see moderate-m1-activated.test.js
    // Barl's Cage precedent), so two transitions are needed to get back to p.
    let s3 = { ...s2, phase: PHASE.CLEANUP }; // active still 'p' (ending p's turn)
    s3 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> UNTAP, active flips to 'o'
    expect(s3.active).toBe('o');
    s3 = { ...s3, phase: PHASE.CLEANUP }; // ending o's turn
    s3 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> UNTAP, active flips back to 'p'

    expect(s3.active).toBe('p');
    expect(s3.pendingUpkeepChoice).not.toBeNull();
    expect(s3.pendingUpkeepChoice.handlerKey).toBe('optionalUntap');
    expect(s3.pendingUpkeepChoice.iid).toBe('gear-1');
    // Still tapped -- untap is suspended pending the player's choice.
    expect(s3.p.bf.find(c => c.iid === 'gear-1').tapped).toBe(true);
  });

  it("declining to untap keeps Ashnod's Battle Gear tapped and its bonus active", () => {
    const gear = makeArt('gear-1', { tapped: true, whileTappedPump: { targetIid: 'bear-1', power: 2, toughness: -2 } });
    const bear = makeCreature('bear-1', { controller: 'p', power: 2, toughness: 2 });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [gear, bear] });
    const state = { ...base, pendingUpkeepChoice: { cardName: gear.name, handlerKey: 'optionalUntap', iid: 'gear-1' } };

    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'KEEP_TAPPED' });
    expect(s1.pendingUpkeepChoice).toBeNull();
    const gearAfter = s1.p.bf.find(c => c.iid === 'gear-1');
    expect(gearAfter.tapped).toBe(true);
    expect(getPow(s1.p.bf.find(c => c.iid === 'bear-1'), s1)).toBe(4);
  });

  it("accepting the untap on Ashnod's Battle Gear untaps it and the bonus ends automatically (tapped-gated Layer 7c)", () => {
    const gear = makeArt('gear-1', { tapped: true, whileTappedPump: { targetIid: 'bear-1', power: 2, toughness: -2 } });
    const bear = makeCreature('bear-1', { controller: 'p', power: 2, toughness: 2 });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [gear, bear] });
    const state = { ...base, pendingUpkeepChoice: { cardName: gear.name, handlerKey: 'optionalUntap', iid: 'gear-1' } };

    const s1 = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });
    expect(s1.pendingUpkeepChoice).toBeNull();
    const gearAfter = s1.p.bf.find(c => c.iid === 'gear-1');
    expect(gearAfter.tapped).toBe(false);
    // Bonus is gone -- no expiry tracking needed, just gated on tapped.
    expect(getPow(s1.p.bf.find(c => c.iid === 'bear-1'), s1)).toBe(2);
    expect(getTou(s1.p.bf.find(c => c.iid === 'bear-1'), s1)).toBe(2);
  });

  it('Ashnod\'s Battle Gear and Tawnos\'s Weaponry both queue in the same untap step when both are tapped with active bonuses', () => {
    const gear = makeArt('gear-1', {
      id: 'ashnodss_battle_gear', name: "Ashnod's Battle Gear",
      tapped: true, whileTappedPump: { targetIid: 'bear-1', power: 2, toughness: -2 },
    });
    const weaponry = makeArt('weap-1', {
      id: 'tawnosss_weaponry', name: "Tawnos's Weaponry",
      tapped: true, whileTappedPump: { targetIid: 'bear-1', power: 1, toughness: 1 },
    });
    const bear = makeCreature('bear-1', { controller: 'p', power: 2, toughness: 2 });
    // active: 'o' + phase: CLEANUP so the ADVANCE_PHASE transition ends o's turn
    // and lands on p's UNTAP step, where p's own permanents (gear, weaponry) are
    // the ones evaluated by the untap-step loop.
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [gear, weaponry, bear] });

    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' });
    expect(s1.active).toBe('p');
    expect(s1.pendingUpkeepChoice).not.toBeNull();
    expect(s1.pendingUpkeepChoice.handlerKey).toBe('optionalUntap');
    expect(s1.pendingUpkeepChoiceQueue).toHaveLength(1);
    expect(s1.pendingUpkeepChoiceQueue[0].handlerKey).toBe('optionalUntap');
    const queuedIids = [s1.pendingUpkeepChoice.iid, s1.pendingUpkeepChoiceQueue[0].iid].sort();
    expect(queuedIids).toEqual(['gear-1', 'weap-1']);
    // Both permanents remain tapped -- untap is suspended pending the choices.
    expect(s1.p.bf.find(c => c.iid === 'gear-1').tapped).toBe(true);
    expect(s1.p.bf.find(c => c.iid === 'weap-1').tapped).toBe(true);
    // Further phase advancement is blocked while any choice is queued.
    const blocked = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(blocked.phase).toBe(s1.phase);

    // Resolve the first (decline -- keep tapped), then the second (accept -- untap).
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'KEEP_TAPPED' });
    expect(s2.pendingUpkeepChoice).not.toBeNull();
    expect(s2.pendingUpkeepChoiceQueue).toHaveLength(0);
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'UNTAP' });
    expect(s3.pendingUpkeepChoice).toBeNull();

    const stillTapped = s3.p.bf.find(c => c.iid === s1.pendingUpkeepChoice.iid);
    const nowUntapped = s3.p.bf.find(c => c.iid === s1.pendingUpkeepChoiceQueue[0].iid);
    expect(stillTapped.tapped).toBe(true);
    expect(nowUntapped.tapped).toBe(false);
  });
});
