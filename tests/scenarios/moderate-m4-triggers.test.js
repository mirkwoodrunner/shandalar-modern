// tests/scenarios/moderate-m4-triggers.test.js
// Moderate-tier Alpha/Beta stub cards implemented from Card-Forge/forge reference
// scripts (GPL-3.0), sub-batch M4: triggered abilities.
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkDeath } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

describe('@engine-tier-moderate-2 Scenario: Moderate-tier Forge batch M4 -- triggered abilities', () => {

  it("Abu Ja'far: on death, destroys creatures blocking or blocked by it (no regeneration)", () => {
    const abu = makeCreature('aj-1', {
      id: 'abu_jasfar', name: "Abu Ja'far", controller: 'p', power: 0, toughness: 1, damage: 1,
      blocking: 'att-1',
      triggeredAbilities: [{ id: 'abu_jafar_dies', trigger: { event: 'ON_CREATURE_DIES', scope: 'self' }, effect: { type: 'destroyCombatPartners' } }],
    });
    const attacker = makeCreature('att-1', { controller: 'o', toughness: 3, regenerating: true });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'o', pBf: [abu], oBf: [attacker] });
    const s1 = checkDeath(base);
    expect(s1.p.bf.some(c => c.iid === 'aj-1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'att-1')).toBe(false); // destroyed despite regenerating flag
    expect(s1.o.gy.some(c => c.iid === 'att-1')).toBe(true);
  });

  it('Cyclopean Mummy: on death, moves itself from graveyard to exile', () => {
    const mummy = makeCreature('cm-1', {
      id: 'cyclopean_mummy', name: 'Cyclopean Mummy', controller: 'p', power: 2, toughness: 1, damage: 1,
      triggeredAbilities: [{ id: 'mummy_dies', trigger: { event: 'ON_CREATURE_DIES', scope: 'self' }, effect: { type: 'exileSelfFromGY' } }],
    });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [mummy] });
    const s1 = checkDeath(base);
    expect(s1.p.gy.some(c => c.iid === 'cm-1')).toBe(false);
    expect(s1.p.exile.some(c => c.iid === 'cm-1')).toBe(true);
  });

  it('Gauntlet of Might: red creatures get +1/+1; Mountain taps for an extra R', () => {
    const gauntlet = { iid: 'gm-1', id: 'gauntlet_of_might', name: 'Gauntlet of Might', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const redCre = makeCreature('rc-1', { controller: 'p', color: 'R', power: 2, toughness: 2 });
    const mountain = makeLand('mt-1', { id: 'mountain', subtype: 'Mountain', produces: ['R'], controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [gauntlet, redCre, mountain] });
    const s1 = duelReducer(base, { type: 'TAP_LAND', who: 'p', iid: 'mt-1' });
    expect(s1.p.mana.R).toBe(2); // base 1 + Gauntlet bonus 1
  });

  it("Ghazbán Ogre: control changes to the player with strictly more life at upkeep", () => {
    const ogre = makeCreature('go-1', {
      id: 'ghazban_ogre', name: 'Ghazbán Ogre', controller: 'o', power: 2, toughness: 2,
      triggeredAbilities: [{ id: 'ogre_upkeep', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'controlToHighestLife' } }],
    });
    const base = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [ogre] });
    const state = { ...base, p: { ...base.p, life: 25 }, o: { ...base.o, life: 15 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UPKEEP (o's own upkeep), fires the trigger
    expect(s1.p.bf.some(c => c.iid === 'go-1')).toBe(true);
    expect(s1.o.bf.some(c => c.iid === 'go-1')).toBe(false);
  });

  it("Goblin Rock Sled: can't attack unless defending player controls a Mountain", () => {
    const sled = makeCreature('grs-1', { id: 'goblin_rock_sled', name: 'Goblin Rock Sled', controller: 'p', power: 3, toughness: 1, attackRequiresDefenderLand: 'Mountain', doesNotUntapIfAttacked: true });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [sled] });
    const s1 = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: 'grs-1' });
    expect(s1.attackers).toEqual([]);
    const oMountain = makeLand('om-1', { id: 'mountain', subtype: 'Mountain', controller: 'o' });
    const base2 = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [sled], oBf: [oMountain] });
    const s2 = duelReducer(base2, { type: 'DECLARE_ATTACKER', iid: 'grs-1' });
    expect(s2.attackers).toEqual(['grs-1']);
    expect(s2.p.bf.find(c => c.iid === 'grs-1').skipNextUntap).toBe(true);
  });

  it('Kismet: opponent-controlled lands and creatures enter tapped', () => {
    const kismet = { iid: 'ks-1', id: 'kismet', name: 'Kismet', type: 'Enchantment', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const landCard = makeLand('l1');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [kismet], oHand: [landCard] });
    const s1 = duelReducer(base, { type: 'PLAY_LAND', who: 'o', iid: 'l1' });
    expect(s1.o.bf.find(c => c.iid === 'l1').tapped).toBe(true);
    // Player's own lands are unaffected.
    const ownLand = makeLand('l2');
    const base2 = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [kismet], pHand: [ownLand] });
    const s2 = duelReducer(base2, { type: 'PLAY_LAND', who: 'p', iid: 'l2' });
    expect(s2.p.bf.find(c => c.iid === 'l2').tapped).toBe(false);
  });

  it('Lifeblood: gains 1 life when an opponent taps a Mountain', () => {
    const lifeblood = { iid: 'lb-1', id: 'lifeblood', name: 'Lifeblood', type: 'Enchantment', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oMountain = makeLand('om-1', { id: 'mountain', subtype: 'Mountain', produces: ['R'], controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [lifeblood], oBf: [oMountain] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'om-1' });
    expect(s1.p.life).toBe(21);
  });

  it('Onulet: on death, controller gains 2 life', () => {
    const onulet = makeCreature('on-1', {
      id: 'onulet', name: 'Onulet', controller: 'p', power: 2, toughness: 2, damage: 2,
      triggeredAbilities: [{ id: 'onulet_dies', trigger: { event: 'ON_CREATURE_DIES', scope: 'self' }, effect: { type: 'gainLifeController', amount: 2 } }],
    });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [onulet] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = checkDeath(state);
    expect(s1.p.life).toBe(22);
  });

  it('Soul Net: on any creature death, may pay {1} to gain 1 life', () => {
    const soulNet = { iid: 'sn-1', id: 'soul_net', name: 'Soul Net', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      triggeredAbilities: [{ id: 'soulnet_trigger', trigger: { event: 'ON_CREATURE_DIES' }, requiresChoice: true, effect: { options: [
        { id: 'pay', label: 'Pay {1}: gain 1 life', effect: { type: 'payGenericGainLife', cost: 1, amount: 1 } },
        { id: 'decline', label: 'Decline', effect: { type: 'noop' } },
      ] } }],
    };
    const victim = makeCreature('v-1', { controller: 'o', toughness: 1, damage: 1 });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [soulNet], oBf: [victim] });
    const state = { ...base, p: { ...base.p, life: 20, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };
    const s1 = checkDeath(state);
    expect(s1.pendingChoice).not.toBeNull();
    expect(s1.pendingChoice.options.map(o => o.id)).toEqual(['pay', 'decline']);
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'pay' });
    expect(s2.p.life).toBe(21);
    expect(s2.p.mana.C).toBe(0);
  });

  it('Soul Net: declining the choice does nothing', () => {
    const soulNet = { iid: 'sn-1', id: 'soul_net', name: 'Soul Net', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      triggeredAbilities: [{ id: 'soulnet_trigger', trigger: { event: 'ON_CREATURE_DIES' }, requiresChoice: true, effect: { options: [
        { id: 'pay', label: 'Pay {1}: gain 1 life', effect: { type: 'payGenericGainLife', cost: 1, amount: 1 } },
        { id: 'decline', label: 'Decline', effect: { type: 'noop' } },
      ] } }],
    };
    const victim = makeCreature('v-1', { controller: 'o', toughness: 1, damage: 1 });
    const base = makeState({ phase: PHASE.COMBAT_DAMAGE, active: 'p', pBf: [soulNet], oBf: [victim] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = checkDeath(state);
    const s2 = duelReducer(s1, { type: 'RESOLVE_CHOICE', optionId: 'decline' });
    expect(s2.p.life).toBe(20);
  });

  it("Spiritual Sanctuary: gains the active player 1 life at upkeep if they control a Plains", () => {
    const sanctuary = { iid: 'ss-1', id: 'spiritual_sanctuary', name: 'Spiritual Sanctuary', type: 'Enchantment', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      triggeredAbilities: [{ id: 'sanctuary_upkeep', trigger: { event: 'ON_UPKEEP_START' }, effect: { type: 'gainLifeIfControlsPlains' } }],
    };
    const oPlains = makeLand('op-1', { id: 'plains', subtype: 'Plains', controller: 'o' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'o', pBf: [sanctuary], oBf: [oPlains] });
    const state = { ...base, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UPKEEP
    expect(s1.o.life).toBe(21);
  });
});
