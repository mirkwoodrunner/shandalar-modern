// tests/scenarios/layer1-copy-artifact.test.js
// Layer 1 (copy): Copy Artifact enters as a copy of a target artifact's
// printed (copiable) values from CARD_DB -- not the live battlefield object.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

const MUST_ATTACK = KEYWORDS.MUST_ATTACK.id;
const FLYING = KEYWORDS.FLYING.id;

// Minimal Copy Artifact card object as it would appear on the stack.
function makeCopyArtifact(iid = 'ca-1') {
  return {
    iid,
    id: 'copy_artifact',
    name: 'Copy Artifact',
    type: 'Enchantment',
    color: 'U',
    cmc: 2,
    cost: '1U',
    effect: 'copyPermanentCharacteristics',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'p',
  };
}

// Builds a state with the Copy Artifact card on the stack targeting a card iid.
function stateWithCopyOnStack(copyArtifact, oBf, targetIid) {
  const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf });
  return {
    ...base,
    stack: [{ id: 'si-1', card: copyArtifact, caster: 'p', targets: targetIid ? [targetIid] : [], xVal: 1 }],
  };
}

describe('@engine Scenario: Layer 1 -- Copy Artifact', () => {

  it('copies the printed P/T, type (adds Enchantment), and keywords from the target artifact', () => {
    const juggernaut = makeCreature('jug-1', {
      id: 'juggernaut',
      name: 'Juggernaut',
      type: 'Artifact Creature',
      subtype: 'Juggernaut',
      color: '',
      power: 5,
      toughness: 3,
      keywords: [MUST_ATTACK],
      controller: 'o',
    });
    const ca = makeCopyArtifact();
    const state = stateWithCopyOnStack(ca, [juggernaut], 'jug-1');
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const copy = s1.p.bf.find(c => c.iid === 'ca-1');
    expect(copy).toBeDefined();
    expect(copy.name).toBe('Juggernaut');
    expect(copy.power).toBe(5);
    expect(copy.toughness).toBe(3);
    // Enchantment must be added to the copied type string.
    expect(copy.type).toContain('Enchantment');
    expect(copy.type).toContain('Artifact Creature');
    // Printed keywords are copied.
    expect(copy.keywords).toContain(MUST_ATTACK);
  });

  it('does not copy +1/+1 counters from the live battlefield object', () => {
    const juggernaut = makeCreature('jug-1', {
      id: 'juggernaut',
      name: 'Juggernaut',
      type: 'Artifact Creature',
      subtype: 'Juggernaut',
      color: '',
      power: 5,
      toughness: 3,
      keywords: [MUST_ATTACK],
      controller: 'o',
      counters: { P1P1: 2 }, // live counter -- must NOT be copied
    });
    const ca = makeCopyArtifact();
    const state = stateWithCopyOnStack(ca, [juggernaut], 'jug-1');
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const copy = s1.p.bf.find(c => c.iid === 'ca-1');
    expect(copy).toBeDefined();
    // Counters from the live permanent are NOT copiable values.
    expect(copy.counters?.P1P1 ?? 0).toBe(0);
  });

  it('does not copy auras attached to the live battlefield object', () => {
    const auraRecord = {
      iid: 'aura-1',
      name: 'Flight',
      mod: { keywords: [FLYING] },
      controller: 'p',
      enterTs: 0,
    };
    const juggernaut = makeCreature('jug-1', {
      id: 'juggernaut',
      name: 'Juggernaut',
      type: 'Artifact Creature',
      subtype: 'Juggernaut',
      color: '',
      power: 5,
      toughness: 3,
      keywords: [MUST_ATTACK],
      controller: 'o',
      enchantments: [auraRecord], // live aura -- must NOT be copied
    });
    const ca = makeCopyArtifact();
    const state = stateWithCopyOnStack(ca, [juggernaut], 'jug-1');
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const copy = s1.p.bf.find(c => c.iid === 'ca-1');
    expect(copy).toBeDefined();
    // Attached auras are NOT copiable values.
    expect(copy.enchantments?.length ?? 0).toBe(0);
  });

  it('stays as a plain Enchantment when no artifact target is provided', () => {
    const ca = makeCopyArtifact();
    const state = stateWithCopyOnStack(ca, [], null);
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const onBf = s1.p.bf.find(c => c.iid === 'ca-1');
    expect(onBf).toBeDefined();
    // No copy happened -- card stays as its original identity.
    expect(onBf.name).toBe('Copy Artifact');
    expect(onBf.type).toBe('Enchantment');
  });

  it('throws when the target artifact id has no CARD_DB entry', () => {
    const unknownArtifact = makeCreature('ua-1', {
      id: 'totally_unknown_artifact',
      name: 'Unknown',
      type: 'Artifact',
      controller: 'o',
    });
    const ca = makeCopyArtifact();
    const state = stateWithCopyOnStack(ca, [unknownArtifact], 'ua-1');
    expect(() => duelReducer(state, { type: 'RESOLVE_STACK' })).toThrow('totally_unknown_artifact');
  });

});
