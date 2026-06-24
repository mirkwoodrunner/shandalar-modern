// src/hooks/__tests__/usePersistence.test.ts
// Unit tests for saveDuel / loadDuel / clearDuel (PERSIST-UNIT-01 through PERSIST-UNIT-06).
// Tests pure exported functions -- no hook rendering required.

import { describe, it, expect, beforeEach } from 'vitest';
import { saveDuel, loadDuel, clearDuel } from '../usePersistence';
import { makeState } from '../../engine/__tests__/_factory.js';

// -- localStorage mock (node test environment has no DOM) ----------------------

const _store: Record<string, string> = {};
const _localStorageMock = {
  getItem: (key: string): string | null => Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null,
  setItem: (key: string, value: string): void => { _store[key] = value; },
  removeItem: (key: string): void => { delete _store[key]; },
  clear: (): void => { for (const k of Object.keys(_store)) delete _store[k]; },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: _localStorageMock,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  _localStorageMock.clear();
});

const KEY = 'shandalar:duel';

// -- PERSIST-UNIT-01 -----------------------------------------------------------

describe('saveDuel', () => {
  it('PERSIST-UNIT-01: writes JSON-serialized state to the correct localStorage key', () => {
    const state = { phase: 'MAIN_1', turn: 3 };
    saveDuel(state);
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(state);
  });
});

// -- PERSIST-UNIT-02 -----------------------------------------------------------

describe('loadDuel', () => {
  it('PERSIST-UNIT-02: returns the saved object deserialized correctly', () => {
    const state = makeState({ turn: 7, phase: 'COMBAT_ATTACKERS' });
    localStorage.setItem(KEY, JSON.stringify(state));
    expect(loadDuel()).toEqual(state);
  });

  // -- PERSIST-UNIT-03 ---------------------------------------------------------

  it('PERSIST-UNIT-03: returns null when nothing is saved', () => {
    expect(loadDuel()).toBeNull();
  });

  // -- PERSIST-UNIT-04 ---------------------------------------------------------

  it('PERSIST-UNIT-04: returns null (does not throw) when stored value is malformed JSON', () => {
    localStorage.setItem(KEY, '{{not valid json}}');
    expect(() => loadDuel()).not.toThrow();
    expect(loadDuel()).toBeNull();
  });
});

// -- PERSIST-UNIT-05 -----------------------------------------------------------

describe('clearDuel', () => {
  it('PERSIST-UNIT-05: removes the key; subsequent loadDuel returns null', () => {
    saveDuel(makeState({ turn: 1 }));
    expect(loadDuel()).not.toBeNull();
    clearDuel();
    expect(loadDuel()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

// -- PERSIST-UNIT-06 -----------------------------------------------------------

describe('round-trip', () => {
  it('PERSIST-UNIT-06: saveDuel then loadDuel returns a deep-equal copy of a realistic GameState', () => {
    const state = makeState({
      turn: 4,
      phase: 'MAIN_2',
      active: 'o',
    });
    saveDuel(state);
    const loaded = loadDuel();
    expect(loaded).toEqual(state);
  });
});

// -- PERSIST-UNIT-07 -----------------------------------------------------------

describe('shape validation — missing top-level key', () => {
  it('PERSIST-UNIT-07: returns null when a required top-level key is absent', () => {
    // Missing `p`, `o`, `stack`, `log`, etc. — only `phase` is present.
    localStorage.setItem(KEY, JSON.stringify({ phase: 'MAIN_1' }));
    expect(loadDuel()).toBeNull();
  });
});

// -- PERSIST-UNIT-08 -----------------------------------------------------------

describe('shape validation — missing player sub-key', () => {
  it('PERSIST-UNIT-08: returns null when a required p/o sub-key is absent', () => {
    const state = makeState();
    // Remove `hand` from player `p` to simulate a stale save shape.
    const stale = { ...state, p: { life: 20, lib: [], bf: [], gy: [], exile: [], mana: {} } };
    localStorage.setItem(KEY, JSON.stringify(stale));
    expect(loadDuel()).toBeNull();
  });
});

// -- PERSIST-UNIT-09 -----------------------------------------------------------

describe('shape validation — non-object values', () => {
  it('PERSIST-UNIT-09: returns null when the stored value is a JSON string', () => {
    localStorage.setItem(KEY, JSON.stringify('hello'));
    expect(loadDuel()).toBeNull();
  });

  it('PERSIST-UNIT-09b: returns null when the stored value is a JSON number', () => {
    localStorage.setItem(KEY, JSON.stringify(42));
    expect(loadDuel()).toBeNull();
  });

  it('PERSIST-UNIT-09c: returns null when the stored value is a JSON array', () => {
    localStorage.setItem(KEY, JSON.stringify([{ phase: 'MAIN_1' }]));
    expect(loadDuel()).toBeNull();
  });
});

// -- PERSIST-UNIT-10 -----------------------------------------------------------

describe('shape validation — auto-clear on rejection', () => {
  it('PERSIST-UNIT-10: clears the localStorage key when an invalid value is rejected', () => {
    localStorage.setItem(KEY, JSON.stringify({ garbage: true }));
    expect(loadDuel()).toBeNull();
    // Key must be gone — not just null-returning on this call but still present for next.
    expect(localStorage.getItem(KEY)).toBeNull();
    // Second call also returns null and does not throw.
    expect(loadDuel()).toBeNull();
  });
});
