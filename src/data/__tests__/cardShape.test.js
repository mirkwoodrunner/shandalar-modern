/**
 * Card-shape contract: every entry in every shipped card pool must satisfy the
 * shared shape that makeCardInstance's `pool` argument assumes.
 *
 * @module-tag engine
 */
import { describe, it, expect } from 'vitest';
import { CARD_DB } from '../cards.js';
import { CARD_DB_PREMODERN } from '../cardsPremodern.js';
import { CARD_DB_LEARN } from '../cardsLearn.js';
import { REQUIRED_CARD_FIELDS, validateCardShape } from '../cardShape.js';

describe('@engine Card shape contract', () => {
  it('REQUIRED_CARD_FIELDS is the agreed field set', () => {
    expect(REQUIRED_CARD_FIELDS).toEqual([
      'id', 'name', 'type', 'color', 'cmc', 'cost', 'text', 'rarity',
    ]);
  });

  it('every CARD_DB entry satisfies the shape', () => {
    const bad = CARD_DB
      .map(c => ({ id: c && c.id, ...validateCardShape(c) }))
      .filter(r => !r.valid);
    expect(bad).toEqual([]);
  });

  it('every CARD_DB_PREMODERN entry satisfies the shape', () => {
    const bad = CARD_DB_PREMODERN
      .map(c => ({ id: c && c.id, ...validateCardShape(c) }))
      .filter(r => !r.valid);
    expect(bad).toEqual([]);
  });

  it('every CARD_DB_LEARN entry satisfies the shape', () => {
    const bad = CARD_DB_LEARN
      .map(c => ({ id: c && c.id, ...validateCardShape(c) }))
      .filter(r => !r.valid);
    expect(bad).toEqual([]);
  });

  it('reports the specific missing fields', () => {
    expect(validateCardShape({ id: 'x', name: 'X' }).valid).toBe(false);
    expect(validateCardShape({ id: 'x', name: 'X' }).missing)
      .toEqual(['type', 'color', 'cmc', 'cost', 'text', 'rarity']);
    expect(validateCardShape(null).valid).toBe(false);
  });

  it('treats null and undefined values as missing, but empty string as present', () => {
    const base = { id: 'x', name: 'X', type: 'Creature', color: 'W', cmc: 1, cost: 'W', text: '', rarity: 'common' };
    expect(validateCardShape(base).valid).toBe(true);
    expect(validateCardShape({ ...base, cost: null }).missing).toEqual(['cost']);
    expect(validateCardShape({ ...base, rarity: undefined }).missing).toEqual(['rarity']);
  });
});
