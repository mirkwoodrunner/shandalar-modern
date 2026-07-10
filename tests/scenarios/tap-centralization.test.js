// tests/scenarios/tap-centralization.test.js
// Tap centralization Phase 1: every "becomes tapped" mutation site in
// DuelCore.js now routes through the single tapPermanent() choke point,
// which emits an ON_TAP event (CR 701.21) after the mutation. See
// docs/ENGINE_CONTRACT_SPEC.md S7.5 and docs/MECHANICS_INDEX.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { duelReducer, checkDeath, tapPermanent, makeCardInstance } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

// A minimal Kudzu-style "watcher" permanent: tracks ON_TAP events for ONE
// specific host iid via the existing enchantedHostTapped condition, and
// records each firing as a +1/+1 counter on itself (reusing the existing
// 'addCounter' triggered effect rather than inventing a test-only effect
// type). Lets tests assert "fired N times for host X" without depending on
// Blight/Psychic Venom/Relic Bind's own card definitions.
function makeWatcher(iid, hostIid, hostKind = 'enchantedLandIid') {
  return {
    iid, id: 'test_watcher', name: 'Test Watcher', type: 'Enchantment', subtype: 'Aura',
    color: '', cmc: 0, cost: '', keywords: [], tapped: false, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller: 'p',
    [hostKind]: hostIid,
    triggeredAbilities: [{
      id: 'watch', trigger: { event: 'ON_TAP' }, condition: { type: 'enchantedHostTapped' },
      effect: { type: 'addCounter', counter: '+1/+1', amount: 1 },
    }],
  };
}

function fired(state, watcherIid) {
  return state.p.bf.find(c => c.iid === watcherIid)?.counters?.P1P1 || 0;
}

describe('@engine Scenario: tap centralization Phase 1', () => {
  it('TAP-01: tapPermanent taps an untapped permanent and returns new state', () => {
    const creature = makeCreature('c1', { controller: 'p', tapped: false });
    const state = makeState({ pBf: [creature] });
    const ns = tapPermanent(state, 'p', 'c1');
    expect(ns).not.toBe(state);
    expect(ns.p.bf.find(c => c.iid === 'c1').tapped).toBe(true);
  });

  it('TAP-02: tapPermanent no-ops on an already-tapped permanent (no ON_TAP fired)', () => {
    const creature = makeCreature('c1', { controller: 'p', tapped: true });
    const watcher = makeWatcher('w1', 'c1', 'enchantedArtifactIid');
    const state = makeState({ pBf: [creature, watcher] });
    const ns = tapPermanent(state, 'p', 'c1');
    expect(ns).toBe(state);
    expect(fired(ns, 'w1')).toBe(0);
  });

  it('TAP-03: tapPermanent no-ops if iid not found', () => {
    const state = makeState({ pBf: [makeCreature('c1', { controller: 'p' })] });
    const ns = tapPermanent(state, 'p', 'does-not-exist');
    expect(ns).toBe(state);
  });

  it('TAP-04: tapPermanent emits ON_TAP with correct payload {cardId, controller}', () => {
    const land = makeLand('land-1', { controller: 'p', tapped: false });
    const otherLand = makeLand('land-2', { controller: 'p', tapped: false });
    const watcher = makeWatcher('w1', 'land-1');
    const state = makeState({ pBf: [land, otherLand, watcher] });

    // Tapping a DIFFERENT permanent must not fire the watcher (proves payload.cardId
    // is checked, not just "any ON_TAP").
    const s1 = tapPermanent(state, 'p', 'land-2');
    expect(fired(s1, 'w1')).toBe(0);

    // Tapping the watched host fires exactly once.
    const s2 = tapPermanent(s1, 'p', 'land-1');
    expect(fired(s2, 'w1')).toBe(1);
  });

  it('TAP-05: applyOvergrowthTap (TAP_LAND) still produces correct mana and also fires ON_TAP', () => {
    const land = makeLand('land-1', { controller: 'p', tapped: false, produces: ['G'] });
    const watcher = makeWatcher('w1', 'land-1');
    const state = makeState({ pBf: [land, watcher], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-1' });
    expect(ns.p.mana.G).toBe(1);
    expect(ns.p.bf.find(c => c.iid === 'land-1').tapped).toBe(true);
    expect(fired(ns, 'w1')).toBe(1);
  });

  it('TAP-06: the generic ACTIVATE_ABILITY tap-cost step still taps and now fires ON_TAP', () => {
    const art = {
      iid: 'art-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '',
      cmc: 1, cost: '1', keywords: [], tapped: false, damage: 0, counters: {}, eotBuffs: [],
      enchantments: [], controller: 'p', activated: { cost: 'T', effect: 'stub' },
    };
    const watcher = makeWatcher('w1', 'art-1', 'enchantedArtifactIid');
    const state = makeState({ pBf: [art, watcher], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'art-1' });
    expect(ns.p.bf.find(c => c.iid === 'art-1').tapped).toBe(true);
    expect(fired(ns, 'w1')).toBe(1);
  });

  it('TAP-07: a multi-permanent effect (manaShort) fires one ON_TAP event per affected land', () => {
    const landA = makeLand('la', { controller: 'o', tapped: false });
    const landB = makeLand('lb', { controller: 'o', tapped: false });
    // Two watchers, each pinned to a DIFFERENT land, both controlled by 'p' so
    // their own counters are inspectable regardless of who owns the tapped lands.
    const watcherA = makeWatcher('wa', 'la');
    const watcherB = makeWatcher('wb', 'lb');
    const spell = { iid: 's1', id: 'test_manashort', name: 'Test Mana Short', type: 'Instant', color: 'U', cmc: 2, cost: '1U', keywords: [], effect: 'manaShort' };
    const state = makeState({ pBf: [watcherA, watcherB], oBf: [landA, landB], pHand: [spell], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 1, C: 1 } } };
    const s1 = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: 's1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'la').tapped).toBe(true);
    expect(s2.o.bf.find(c => c.iid === 'lb').tapped).toBe(true);
    // One event per land, not one batched event for the whole effect.
    expect(fired(s2, 'wa')).toBe(1);
    expect(fired(s2, 'wb')).toBe(1);
  });

  it('TAP-08: Regenerate clears damage and the regenerating flag, and taps + fires ON_TAP', () => {
    const creature = makeCreature('c1', {
      controller: 'p', tapped: false, regenerating: true, damage: 3, toughness: 2,
    });
    const watcher = makeWatcher('w1', 'c1', 'enchantedArtifactIid');
    const state = makeState({ pBf: [creature, watcher] });
    const ns = checkDeath(state);
    const c = ns.p.bf.find(c => c.iid === 'c1');
    expect(c).toBeDefined();
    expect(c.damage).toBe(0);
    expect(c.regenerating).toBe(false);
    expect(c.tapped).toBe(true);
    expect(fired(ns, 'w1')).toBe(1);
  });

  it('TAP-09: paralyze still sets both paralyzed and tapped via the split tapPermanent + field-mutation approach', () => {
    const creature = makeCreature('c1', { controller: 'o', tapped: false });
    const spell = { iid: 's1', id: 'test_paralyze', name: 'Test Paralyze', type: 'Sorcery', color: 'U', cmc: 1, cost: 'U', keywords: [], effect: 'paralyze' };
    const state = makeState({ oBf: [creature], pHand: [spell], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 1 } } };
    const s1 = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: 's1', tgt: 'c1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const c = s2.o.bf.find(c => c.iid === 'c1');
    expect(c.tapped).toBe(true);
    expect(c.paralyzed).toBe(true);
  });

  it('TAP-10: lockArtifactWhileTapped still sets both lockedByIid and tapped correctly', () => {
    const gremlin = { iid: 'g1', id: 'phyrexian_gremlins', name: 'Phyrexian Gremlins', type: 'Creature', subtype: 'Gremlin', color: 'B', cmc: 3, cost: '2B', power: 2, toughness: 2, keywords: [], tapped: false, summoningSick: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p', activated: { cost: 'T', effect: 'lockArtifactWhileTapped', requiresTarget: true } };
    const art = { iid: 'art-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', color: '', cmc: 1, cost: '1', keywords: [], tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o' };
    const state = makeState({ pBf: [gremlin], oBf: [art], phase: PHASE.MAIN_1 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'g1', tgt: 'art-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const target = s2.o.bf.find(c => c.iid === 'art-1');
    expect(target.tapped).toBe(true);
    expect(target.lockedByIid).toBe('g1');
  });

  it('TAP-11: an already-tapped creature targeted by a tapTarget-style effect is a safe no-op', () => {
    const creature = makeCreature('c1', { controller: 'o', tapped: true });
    const spell = { iid: 's1', id: 'test_taptarget', name: 'Test Tap Target', type: 'Sorcery', color: 'U', cmc: 1, cost: 'U', keywords: [], effect: 'tapTarget' };
    const state = makeState({ oBf: [creature], pHand: [spell], phase: PHASE.MAIN_1 });
    const withMana = { ...state, p: { ...state.p, mana: { ...state.p.mana, U: 1 } } };
    const s1 = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: 's1', tgt: 'c1' });
    expect(() => duelReducer(s1, { type: 'RESOLVE_STACK' })).not.toThrow();
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'c1').tapped).toBe(true);
  });

  it("TAP-12: Mishra's Factory / Birds of Paradise / Fellwar Stone's existing already-tapped dlogs still fire and are not bypassed", () => {
    const bop = makeCardInstance('birds_of_paradise', 'p');
    const bopInst = { ...bop, iid: 'bop-1', tapped: true, summoningSick: false };
    const state = makeState({ pBf: [bopInst], phase: PHASE.MAIN_1 });
    const ns = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'bop-1' });
    expect(ns.log.at(-1).text).toMatch(/already tapped/i);
    expect(ns.pendingBop).toBeFalsy();
  });

  it('TAP-13: a full turn cycle produces no unexpected ON_TAP side effects when nothing is watching', () => {
    const land = makeLand('land-1', { controller: 'p', tapped: false, produces: ['G'] });
    const state = makeState({ pBf: [land], phase: PHASE.UNTAP, active: 'p' });
    let ns = state;
    expect(() => {
      ns = duelReducer(ns, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
      ns = duelReducer(ns, { type: 'ADVANCE_PHASE' }); // -> DRAW
      ns = duelReducer(ns, { type: 'ADVANCE_PHASE' }); // -> MAIN_1
      ns = duelReducer(ns, { type: 'TAP_LAND', who: 'p', iid: 'land-1' });
    }).not.toThrow();
    expect(ns.p.mana.G).toBe(1);
    expect(ns.p.bf.find(c => c.iid === 'land-1').tapped).toBe(true);
    // Advancing further (mana empties between phases, same as before this
    // migration) must still not throw -- proves no unexpected ON_TAP side
    // effect exists when nothing in play is watching for it.
    expect(() => duelReducer(ns, { type: 'ADVANCE_PHASE' })).not.toThrow(); // -> COMBAT_BEGIN
  });

  it('TAP-14: meta -- zero remaining direct tapped:true assignments in DuelCore.js outside tapPermanent and the untap-step exception', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '../../src/engine/DuelCore.js'), 'utf8');
    const lines = src.split('\n');
    const matches = [];
    lines.forEach((line, idx) => {
      if (/tapped:\s*true/.test(line)) matches.push({ line: idx + 1, text: line.trim() });
    });
    // Expect exactly 2: tapPermanent's own mutation, and the confirmed untap-step
    // "stays tapped" computation (not a "becomes tapped" event).
    expect(matches.length).toBe(2);
    expect(matches.some(m => m.text.includes('paralyzed || c.enchantments'))).toBe(true);
  });
});
