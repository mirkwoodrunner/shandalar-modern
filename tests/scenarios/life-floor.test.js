// tests/scenarios/life-floor.test.js
import { describe, it, expect } from 'vitest';
import { hurt, getLifeFloor } from '../../src/engine/DuelCore.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine Life floor (Ali from Cairo)', () => {

  it('LF-01: getLifeFloor returns null with no lifeFloor permanents', () => {
    const state = makeState({ pBf: [makeCreature('c-1', { controller: 'p' })] });
    expect(getLifeFloor(state, 'p')).toBeNull();
  });

  it('LF-02: getLifeFloor returns the value from a single lifeFloor permanent', () => {
    const ali = makeCreature('ali-1', { controller: 'p', lifeFloor: 1 });
    const state = makeState({ pBf: [ali] });
    expect(getLifeFloor(state, 'p')).toBe(1);
  });

  it('LF-03: getLifeFloor returns the highest of multiple lifeFloor permanents', () => {
    const ali = makeCreature('ali-1', { controller: 'p', lifeFloor: 1 });
    const other = makeCreature('other-1', { controller: 'p', lifeFloor: 5 });
    const state = makeState({ pBf: [ali, other] });
    expect(getLifeFloor(state, 'p')).toBe(5);
  });

  it('LF-04: hurt() clamps lethal damage to the floor instead of killing via 0-life', () => {
    const ali = makeCreature('ali-1', { controller: 'p', lifeFloor: 1 });
    const base = makeState({ pBf: [ali] });
    const state = { ...base, p: { ...base.p, life: 3 } };
    const ns = hurt(state, 'p', 10, 'test damage');
    expect(ns.p.life).toBe(1);
    expect(ns.over).toBeNull();
  });

  it('LF-05: hurt() does not clamp when damage would not cross the floor', () => {
    const ali = makeCreature('ali-1', { controller: 'p', lifeFloor: 1 });
    const base = makeState({ pBf: [ali] });
    const state = { ...base, p: { ...base.p, life: 10 } };
    const ns = hurt(state, 'p', 3, 'test damage');
    expect(ns.p.life).toBe(7);
  });

  it('LF-06: hurt() does not clamp lifegain (negative amt)', () => {
    const ali = makeCreature('ali-1', { controller: 'p', lifeFloor: 1 });
    const base = makeState({ pBf: [ali] });
    const state = { ...base, p: { ...base.p, life: 3 } };
    const ns = hurt(state, 'p', -5, 'test heal');
    expect(ns.p.life).toBe(8);
  });

  it('LF-07: floor does not apply to the opponent who does not control Ali', () => {
    const ali = makeCreature('ali-1', { controller: 'p', lifeFloor: 1 });
    const base = makeState({ pBf: [ali] });
    const state = { ...base, o: { ...base.o, life: 3 } };
    const ns = hurt(state, 'o', 10, 'test damage');
    expect(ns.o.life).toBe(-7);
    expect(ns.over).toBeDefined();
  });

  it('LF-08: floor does not apply once Ali has left the battlefield', () => {
    const base = makeState({ pBf: [] });
    const state = { ...base, p: { ...base.p, life: 3 } };
    const ns = hurt(state, 'p', 10, 'test damage');
    expect(ns.p.life).toBe(-7);
    expect(ns.over).toBeDefined();
  });
});
