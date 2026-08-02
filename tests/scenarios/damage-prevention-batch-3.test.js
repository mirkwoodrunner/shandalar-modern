/**
 * @module-tag engine
 */
// tests/scenarios/damage-prevention-batch-3.test.js
// A9 Damage Prevention/Redirect bucket, sub-batch 3 (6 cards): Bronze Horse,
// Enchanted Being, Demonic Torment, Wall of Putrid Flesh, Wall of Shadows,
// Wall of Vapor. See docs/MECHANICS_INDEX.md for the full batch writeup.
// Declared test count: 19 Vitest cases.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurtCreature, resolveCombat } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { getCardById } from '../../src/data/cards.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function toBlockersPhase(state) {
  const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
  return duelReducer(s1, { type: 'ADVANCE_PHASE' });        // -> COMBAT_BLOCKERS
}

describe('@engine Scenario: Bronze Horse', () => {
  it('prevents damage from a targeting spell while its controller controls another creature', () => {
    const bronze = { ...getCardById('bronze_horse'), iid: 'bh-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const other = makeCreature('other-1', { controller: 'p' });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [bronze, other] });
    const s1 = hurtCreature(state, 'bh-1', 5, 'Test Spell', { sourceIid: 'spell-1', sourceType: 'spell' });
    expect(s1.p.bf.find(c => c.iid === 'bh-1').damage).toBe(0);
  });

  it('does NOT prevent spell damage when it is the only creature its controller controls', () => {
    const bronze = { ...getCardById('bronze_horse'), iid: 'bh-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], toughness: 20 };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [bronze] });
    const s1 = hurtCreature(state, 'bh-1', 5, 'Test Spell', { sourceIid: 'spell-1', sourceType: 'spell' });
    expect(s1.p.bf.find(c => c.iid === 'bh-1').damage).toBe(5);
  });

  it('combat damage to it is unaffected even while another creature is controlled', () => {
    const bronze = { ...getCardById('bronze_horse'), iid: 'bh-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1', toughness: 20 };
    const other = makeCreature('other-1', { controller: 'p' });
    const attacker = makeCreature('att-1', { controller: 'o', power: 5, toughness: 5, attacking: true, tapped: true });
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [bronze, other] }), attackers: ['att-1'], blockers: { 'bh-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'bh-1').damage).toBe(5);
  });
});

describe('@engine Scenario: Enchanted Being', () => {
  it('prevents combat damage dealt to it by an enchanted attacker while it blocks', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true, enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] });
    const eb = { ...getCardById('enchanted_being'), iid: 'eb-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1' };
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [eb] }), attackers: ['att-1'], blockers: { 'eb-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'eb-1').damage).toBe(0);
  });

  it('prevents combat damage dealt to it by an enchanted blocker while it attacks', () => {
    const eb = { ...getCardById('enchanted_being'), iid: 'eb-1', controller: 'p', tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [], attacking: true };
    const blocker = makeCreature('bl-1', { controller: 'o', power: 2, toughness: 2, blocking: 'eb-1', enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] });
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [eb], oBf: [blocker] }), attackers: ['eb-1'], blockers: { 'bl-1': 'eb-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'eb-1').damage).toBe(0);
  });

  it('does NOT prevent combat damage from a non-enchanted creature', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 3, toughness: 3, attacking: true, tapped: true });
    const eb = { ...getCardById('enchanted_being'), iid: 'eb-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1', toughness: 20 };
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [eb] }), attackers: ['att-1'], blockers: { 'eb-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'eb-1').damage).toBe(3);
  });

  it('does NOT prevent non-combat damage from an enchanted creature source (combat-only scope)', () => {
    const eb = { ...getCardById('enchanted_being'), iid: 'eb-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], toughness: 20 };
    const enchantedSource = makeCreature('src-1', { controller: 'o', enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [eb], oBf: [enchantedSource] });
    const s1 = hurtCreature(state, 'eb-1', 4, 'Test Ping', { sourceIid: 'src-1' });
    expect(s1.p.bf.find(c => c.iid === 'eb-1').damage).toBe(4);
  });
});

describe('@engine Scenario: Demonic Torment', () => {
  it("rejects the enchanted creature's attack via DECLARE_ATTACKER", () => {
    const target = makeCreature('t-1', { controller: 'o', enchantments: [{ iid: 'dt-1', name: 'Demonic Torment', mod: { cantAttack: true, preventCombatDamageBySelf: true } }] });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [target] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 't-1' });
    expect(s1.attackers).toEqual([]);
  });

  it('still allows the enchanted creature to be declared as a blocker', () => {
    const attacker = makeCreature('att-1', { controller: 'p' });
    const target = makeCreature('t-1', { controller: 'o', enchantments: [{ iid: 'dt-1', name: 'Demonic Torment', mod: { cantAttack: true, preventCombatDamageBySelf: true } }] });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [attacker], oBf: [target] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = toBlockersPhase(s1);
    const s3 = duelReducer(s2, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 't-1' });
    expect(s3.blockers['t-1']).toBe('att-1');
  });

  it("prevents the enchanted creature's own combat damage while it blocks", () => {
    const attacker = makeCreature('att-1', { controller: 'p', power: 3, toughness: 3, attacking: true, tapped: true });
    const target = makeCreature('t-1', { controller: 'o', power: 2, toughness: 2, blocking: 'att-1', enchantments: [{ iid: 'dt-1', name: 'Demonic Torment', mod: { cantAttack: true, preventCombatDamageBySelf: true } }] });
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [attacker], oBf: [target] }), attackers: ['att-1'], blockers: { 't-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'att-1').damage).toBe(0);
  });

  it('does NOT prevent damage dealt TO the enchanted creature by the attacker it blocks', () => {
    const attacker = makeCreature('att-1', { controller: 'p', power: 3, toughness: 3, attacking: true, tapped: true });
    const target = makeCreature('t-1', { controller: 'o', power: 2, toughness: 5, blocking: 'att-1', enchantments: [{ iid: 'dt-1', name: 'Demonic Torment', mod: { cantAttack: true, preventCombatDamageBySelf: true } }] });
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [attacker], oBf: [target] }), attackers: ['att-1'], blockers: { 't-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.o.bf.find(c => c.iid === 't-1').damage).toBe(3);
  });
});

describe('@engine Scenario: Wall of Putrid Flesh', () => {
  it('prevents combat damage from an enchanted attacker', () => {
    const attacker = makeCreature('att-1', { controller: 'o', color: 'G', power: 3, toughness: 3, attacking: true, tapped: true, enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] });
    const wpf = { ...getCardById('wall_of_putrid_flesh'), iid: 'wpf-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1' };
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [wpf] }), attackers: ['att-1'], blockers: { 'wpf-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'wpf-1').damage).toBe(0);
  });

  it('prevents non-combat damage from an enchanted creature source too ("all" scope)', () => {
    const wpf = { ...getCardById('wall_of_putrid_flesh'), iid: 'wpf-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const enchantedSource = makeCreature('src-1', { controller: 'o', enchantments: [{ iid: 'aura-1', name: 'Test Aura', mod: {} }] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wpf], oBf: [enchantedSource] });
    const s1 = hurtCreature(state, 'wpf-1', 4, 'Test Ping', { sourceIid: 'src-1' });
    expect(s1.p.bf.find(c => c.iid === 'wpf-1').damage).toBe(0);
  });

  it('does NOT prevent combat damage from a non-enchanted attacker', () => {
    const attacker = makeCreature('att-1', { controller: 'o', color: 'G', power: 3, toughness: 3, attacking: true, tapped: true });
    const wpf = { ...getCardById('wall_of_putrid_flesh'), iid: 'wpf-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1' };
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [wpf] }), attackers: ['att-1'], blockers: { 'wpf-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'wpf-1').damage).toBe(3);
  });

  it('protection from white still functions unchanged (regression sanity)', () => {
    const attacker = makeCreature('att-1', { controller: 'o', color: 'W', power: 3, toughness: 3, attacking: true, tapped: true });
    const wpf = { ...getCardById('wall_of_putrid_flesh'), iid: 'wpf-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1' };
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [wpf] }), attackers: ['att-1'], blockers: { 'wpf-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'wpf-1').damage).toBe(0);
  });
});

describe('@engine Scenario: Wall of Shadows', () => {
  it("prevents damage from the specific creature it's blocking", () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 2, toughness: 2, attacking: true, tapped: true });
    const wos = { ...getCardById('wall_of_shadows'), iid: 'wos-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1' };
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [wos] }), attackers: ['att-1'], blockers: { 'wos-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'wos-1').damage).toBe(0);
  });

  it("does NOT prevent damage from a different creature than the one it's blocking", () => {
    // Banding scenario (CR 702.22h): both attackers share a bandId, so a wall
    // recorded as blocking only att-1 (its own `.blocking` field) is treated
    // as an effective blocker of the whole band (att-1 AND att-2) --
    // demonstrating that the prevention is keyed off the specific attacker
    // identity, not "any attacker this wall is engaged with in combat."
    // combatDamageOrders answers the CR 702.22k damage-division choice that
    // would otherwise pause resolveCombat before any damage is dealt (the
    // wall's own 0 power makes the chosen order immaterial here).
    const attacker1 = makeCreature('att-1', { controller: 'o', power: 2, toughness: 2, attacking: true, tapped: true, bandId: 'band1', keywords: ['BANDING'] });
    const attacker2 = makeCreature('att-2', { controller: 'o', power: 2, toughness: 2, attacking: true, tapped: true, bandId: 'band1' });
    const wos = { ...getCardById('wall_of_shadows'), iid: 'wos-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1', toughness: 20 };
    const state = {
      ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker1, attacker2], pBf: [wos] }),
      attackers: ['att-1', 'att-2'],
      blockers: { 'wos-1': 'att-1' },
      turnState: { damageLog: [], combatDamageOrders: { 'blk_wos-1': ['att-1', 'att-2'] } },
    };
    const s1 = resolveCombat(state);
    // att-1's damage is prevented (it's the creature wos.blocking names);
    // att-2's damage is not -- total marked damage is att-2's power alone.
    expect(s1.p.bf.find(c => c.iid === 'wos-1').damage).toBe(2);
  });
});

describe('@engine Scenario: Wall of Vapor', () => {
  it("prevents damage from the specific creature it's blocking", () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 2, toughness: 2, attacking: true, tapped: true });
    const wov = { ...getCardById('wall_of_vapor'), iid: 'wov-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1' };
    const state = { ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker], pBf: [wov] }), attackers: ['att-1'], blockers: { 'wov-1': 'att-1' } };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'wov-1').damage).toBe(0);
  });

  it("does NOT prevent damage from a different creature than the one it's blocking", () => {
    // Same banding construction as the Wall of Shadows equivalent above.
    const attacker1 = makeCreature('att-1', { controller: 'o', power: 2, toughness: 2, attacking: true, tapped: true, bandId: 'band1', keywords: ['BANDING'] });
    const attacker2 = makeCreature('att-2', { controller: 'o', power: 2, toughness: 2, attacking: true, tapped: true, bandId: 'band1' });
    const wov = { ...getCardById('wall_of_vapor'), iid: 'wov-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], blocking: 'att-1', toughness: 20 };
    const state = {
      ...makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', oBf: [attacker1, attacker2], pBf: [wov] }),
      attackers: ['att-1', 'att-2'],
      blockers: { 'wov-1': 'att-1' },
      turnState: { damageLog: [], combatDamageOrders: { 'blk_wov-1': ['att-1', 'att-2'] } },
    };
    const s1 = resolveCombat(state);
    expect(s1.p.bf.find(c => c.iid === 'wov-1').damage).toBe(2);
  });
});
