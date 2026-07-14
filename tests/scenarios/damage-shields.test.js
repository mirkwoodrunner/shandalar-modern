// tests/scenarios/damage-shields.test.js
// Damage Shields + hurt() Source Metadata (Part 2): turnState.damageShields --
// a one-time, exact-identity shield against a specific chosen source, backing
// Circle of Protection (x6), Eye for an Eye, and Greater Realm of Preservation.
// See docs/SYSTEMS.md -- Damage Shields.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

function makeCoPBlack(iid, overrides = {}) {
  return {
    iid, id: 'circle_of_protection_black', name: 'Circle of Protection: Black', type: 'Enchantment',
    color: 'W', cmc: 2, cost: '1W', tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    activated: { cost: '1', effect: 'chooseDamageShieldSource' },
    damageShieldColors: ['B'], damageShieldMode: 'prevent',
    ...overrides,
  };
}

function makeEyeForAnEye(iid, overrides = {}) {
  return makeSpell(iid, {
    id: 'eye_for_an_eye', name: 'Eye for an Eye', type: 'Instant', color: 'W', cost: 'WW', cmc: 2,
    effect: 'chooseDamageShieldSource', damageShieldMode: 'redirect',
    ...overrides,
  });
}

describe('@engine-combat-2 Scenario: damage shields -- choosing a source', () => {
  it('activating Circle of Protection: Black opens a pool of matching permanents and stack spells only', () => {
    const cop = makeCoPBlack('cop-1');
    const blackCreature = makeCreature('bc-1', { id: 'sengir_vampire', name: 'Sengir Vampire', color: 'B', controller: 'o' });
    const whiteCreature = makeCreature('wc-1', { id: 'serra_angel', name: 'Serra Angel', color: 'W', controller: 'o' });
    const blackSpell = makeSpell('bs-1', { id: 'dark_ritual', name: 'Dark Ritual', color: 'B', caster: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cop, whiteCreature], oBf: [blackCreature] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } }, stack: [{ id: 'stk-1', card: blackSpell, caster: 'o', targets: [], xVal: 1 }] };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cop-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingDamageShieldChoice).not.toBeNull();
    expect(s2.pendingDamageShieldChoice.caster).toBe('p');
    expect(s2.pendingDamageShieldChoice.mode).toBe('prevent');
    const iids = s2.pendingDamageShieldChoice.pool.map(c => c.iid).sort();
    expect(iids).toEqual(['bc-1', 'bs-1']);
    expect(iids).not.toContain('wc-1');
  });

  it('fizzles with no pendingDamageShieldChoice when no legal source exists', () => {
    const cop = makeCoPBlack('cop-1');
    const whiteCreature = makeCreature('wc-1', { id: 'serra_angel', name: 'Serra Angel', color: 'W', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cop], oBf: [whiteCreature] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cop-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingDamageShieldChoice).toBeNull();
  });

  it('RESOLVE_DAMAGE_SHIELD_CHOICE records the chosen permanent\'s iid and controller', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      pendingDamageShieldChoice: {
        caster: 'p', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black',
        pool: [{ iid: 'bc-1', name: 'Sengir Vampire', controller: 'o', color: 'B', type: 'Creature' }],
      },
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'bc-1' });

    expect(s1.pendingDamageShieldChoice).toBeNull();
    expect(s1.turnState.damageShields.p).toEqual([
      { chosenSourceIid: 'bc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black' },
    ]);
  });

  it('DECLINE_DAMAGE_SHIELD_CHOICE clears the pending choice without recording a shield', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = { ...base, pendingDamageShieldChoice: { caster: 'p', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black', pool: [] } };
    const s1 = duelReducer(state, { type: 'DECLINE_DAMAGE_SHIELD_CHOICE' });
    expect(s1.pendingDamageShieldChoice).toBeNull();
    expect(s1.turnState.damageShields?.p ?? []).toEqual([]);
  });

  it('the opponent (o) auto-chooses the first legal source instead of opening a pending choice', () => {
    const cop = makeCoPBlack('cop-1', { controller: 'o' });
    const blackCreature = makeCreature('bc-1', { id: 'sengir_vampire', name: 'Sengir Vampire', color: 'B', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', oBf: [cop], pBf: [blackCreature] });
    const state = { ...base, o: { ...base.o, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'cop-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingDamageShieldChoice).toBeNull();
    expect(s2.turnState.damageShields.o).toEqual([
      { chosenSourceIid: 'bc-1', chosenSourceController: 'p', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black' },
    ]);
  });
});

describe('@engine-combat-2 Scenario: damage shields -- hurt() exact-identity matching', () => {
  it('prevents damage whose sourceIid exactly matches the chosen source, consuming the shield', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 20 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black' }], o: [] } },
    };
    const s1 = hurt(state, 'p', 4, 'Sengir Vampire', { sourceIid: 'bc-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(20); // fully prevented
    expect(s1.turnState.damageShields.p).toEqual([]); // one-time -- consumed
  });

  it('does NOT trigger for a same-color, different permanent (exact iid match only, not a color re-check)', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 20 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black' }], o: [] } },
    };
    // A different black creature (bc-2) deals damage -- must NOT be prevented.
    const s1 = hurt(state, 'p', 4, 'Another Black Creature', { sourceIid: 'bc-2', sourceType: 'creature', combat: true, unblocked: true });
    expect(s1.p.life).toBe(16);
    expect(s1.turnState.damageShields.p).toHaveLength(1); // untouched, still armed
  });

  it('a second hit from the same shielded source is not prevented (one-time consumption)', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 20 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black' }], o: [] } },
    };
    const meta = { sourceIid: 'bc-1', sourceType: 'creature', combat: true, unblocked: true };
    const s1 = hurt(state, 'p', 4, 'Sengir Vampire', meta);
    expect(s1.p.life).toBe(20);
    const s2 = hurt(s1, 'p', 4, 'Sengir Vampire', meta);
    expect(s2.p.life).toBe(16); // shield already spent -- this hit lands
  });

  it('CLEANUP expires an unused shield', () => {
    const base = makeState({ phase: PHASE.END, active: 'p' });
    const state = { ...base, turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bc-1', chosenSourceController: 'o', mode: 'prevent', shieldSourceIid: 'cop-1', shieldSourceName: 'Circle of Protection: Black' }], o: [] } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.phase).toBe(PHASE.CLEANUP);
    expect(s1.turnState.damageShields).toEqual({ p: [], o: [] });
  });
});

describe('@engine-combat-2 Scenario: damage shields -- redirect mode (Eye for an Eye)', () => {
  it('applies the original damage normally, then deals an equal amount to the chosen source\'s controller from Eye for an Eye', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 20 },
      o: { ...base.o, life: 20 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bolt-1', chosenSourceController: 'o', mode: 'redirect', shieldSourceIid: 'efe-1', shieldSourceName: 'Eye for an Eye' }], o: [] } },
    };
    const s1 = hurt(state, 'p', 3, 'Lightning Bolt', { sourceIid: 'bolt-1', sourceType: 'spell' });
    expect(s1.p.life).toBe(17); // the original damage still lands on the caster of Eye for an Eye
    expect(s1.o.life).toBe(17); // Lightning Bolt's controller takes an equal hit from Eye for an Eye
    expect(s1.turnState.damageShields.p).toEqual([]); // one-time
  });

  it('survives Eye for an Eye itself already being in the graveyard (shieldSourceIid/-Name are captured at pick time)', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      p: { ...base.p, life: 20, gy: [{ iid: 'efe-1', id: 'eye_for_an_eye', name: 'Eye for an Eye' }] },
      o: { ...base.o, life: 20 },
      turnState: { ...base.turnState, damageShields: { p: [{ chosenSourceIid: 'bolt-1', chosenSourceController: 'o', mode: 'redirect', shieldSourceIid: 'efe-1', shieldSourceName: 'Eye for an Eye' }], o: [] } },
    };
    const s1 = hurt(state, 'p', 5, 'Lightning Bolt', { sourceIid: 'bolt-1', sourceType: 'spell' });
    expect(s1.p.life).toBe(15);
    expect(s1.o.life).toBe(15);
    expect(s1.log[s1.log.length - 1].text).toContain('Eye for an Eye');
  });

  it('the second, Eye-for-an-Eye-dealt damage instance is not itself checked against any shield (recursion guard)', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    // Both players have a redirect shield armed against each other's sources.
    // If the recursion guard failed, the second hurt() call (meta:null) could
    // spuriously match o's own shield and loop or double-redirect.
    const state = {
      ...base,
      p: { ...base.p, life: 20 },
      o: { ...base.o, life: 20 },
      turnState: {
        ...base.turnState,
        damageShields: {
          p: [{ chosenSourceIid: 'bolt-1', chosenSourceController: 'o', mode: 'redirect', shieldSourceIid: 'efe-1', shieldSourceName: 'Eye for an Eye' }],
          o: [{ chosenSourceIid: 'efe-1', chosenSourceController: 'p', mode: 'prevent', shieldSourceIid: 'cop-2', shieldSourceName: 'Circle of Protection: White' }],
        },
      },
    };
    const s1 = hurt(state, 'p', 3, 'Lightning Bolt', { sourceIid: 'bolt-1', sourceType: 'spell' });
    expect(s1.p.life).toBe(17); // original damage lands
    expect(s1.o.life).toBe(17); // Eye for an Eye's damage is NOT prevented by o's unrelated shield
    expect(s1.turnState.damageShields.o).toHaveLength(1); // o's shield (armed against efe-1, not bolt-1) is untouched
  });
});

describe('@engine-combat-2 Scenario: damage shields -- Eye for an Eye card resolution', () => {
  it('casting Eye for an Eye opens pendingDamageShieldChoice with mode "redirect" and an unrestricted pool', () => {
    const efe = makeEyeForAnEye('efe-1');
    const redCreature = makeCreature('rc-1', { id: 'shivan_dragon', name: 'Shivan Dragon', color: 'R', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [efe], oBf: [redCreature] });
    const state = { ...base, p: { ...base.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'efe-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingDamageShieldChoice).not.toBeNull();
    expect(s2.pendingDamageShieldChoice.mode).toBe('redirect');
    expect(s2.pendingDamageShieldChoice.pool.map(c => c.iid)).toEqual(['rc-1']);
    // Eye for an Eye itself has already resolved and moved to the graveyard.
    expect(s2.p.gy.some(c => c.iid === 'efe-1')).toBe(true);
  });
});
