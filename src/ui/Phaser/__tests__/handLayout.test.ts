/** @module-tag engine */
import { describe, it, expect } from 'vitest';
import { getHandLayoutConfig, layoutHand } from '../handLayout';

const DESKTOP = getHandLayoutConfig(1280, 800);
const MOBILE  = getHandLayoutConfig(390, 844);

describe('layoutHand', () => {
  it('returns an empty array for an empty hand', () => {
    expect(layoutHand([], DESKTOP)).toEqual([]);
  });

  it('centers a single card with zero rotation', () => {
    const [card] = layoutHand(['a'], DESKTOP);
    expect(card.x).toBeCloseTo(DESKTOP.viewportWidth / 2);
    expect(card.rotation).toBe(0);
  });

  it('is symmetric about center for seven cards', () => {
    const iids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const layout = layoutHand(iids, DESKTOP);
    const center = DESKTOP.viewportWidth / 2;
    const first = layout[0];
    const last = layout[layout.length - 1];
    expect(first.x - center).toBeCloseTo(-(last.x - center));
  });

  it('has monotonically increasing depth for seven cards', () => {
    const iids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const layout = layoutHand(iids, DESKTOP);
    for (let i = 1; i < layout.length; i++) {
      expect(layout[i].depth).toBeGreaterThan(layout[i - 1].depth);
    }
  });

  it('has symmetric rotation of equal magnitude and opposite sign at the ends', () => {
    const iids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const layout = layoutHand(iids, DESKTOP);
    const first = layout[0];
    const last = layout[layout.length - 1];
    expect(first.rotation).toBeCloseTo(-last.rotation);
  });

  it('desktop config at 1280 returns cardWidth 100', () => {
    expect(DESKTOP.cardWidth).toBe(100);
  });

  it('mobile config at 390 returns cardWidth 64', () => {
    expect(MOBILE.cardWidth).toBe(64);
  });

  it('overlaps cards rather than overflowing viewport at 12 cards on mobile', () => {
    const iids = Array.from({ length: 12 }, (_, i) => `card-${i}`);
    const layout = layoutHand(iids, MOBILE);
    for (const card of layout) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x).toBeLessThanOrEqual(MOBILE.viewportWidth);
    }
  });

  it('throws immediately on a non-string iid', () => {
    expect(() => layoutHand([1 as unknown as string], DESKTOP)).toThrow();
  });
});
