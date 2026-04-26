import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FieldCard } from './FieldCard';
import type { CardData } from './types';

const creature: CardData = {
  iid: 'test-1',
  name: 'Test Creature',
  type: 'Creature',
  color: 'G',
  cost: '2G',
  power: 3,
  toughness: 3,
  text: 'Trample',
};

const land: CardData = {
  iid: 'test-2',
  name: 'Forest',
  type: 'Land',
  produces: ['G'],
};

const instant: CardData = {
  iid: 'test-3',
  name: 'Lightning Bolt',
  type: 'Instant',
  color: 'R',
  cost: 'R',
  text: 'Deal 3 damage.',
};

describe('FieldCard', () => {
  it('renders P/T for Creature', () => {
    render(<FieldCard card={creature} />);
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('hides P/T for non-Creature', () => {
    const { container } = render(<FieldCard card={instant} />);
    expect(container.querySelector('[class*="ptPlaque"]')).toBeNull();
  });

  it('hides P/T for Land', () => {
    const { container } = render(<FieldCard card={land} />);
    expect(container.querySelector('[class*="ptPlaque"]')).toBeNull();
  });

  it('applies rotate(90deg) transform when tapped', () => {
    const { container } = render(<FieldCard card={creature} tapped />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.transform).toBe('rotate(90deg)');
  });

  it('applies no rotation when not tapped', () => {
    const { container } = render(<FieldCard card={creature} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.transform).toBe('none');
  });

  it('renders data-iid attribute', () => {
    const { container } = render(<FieldCard card={creature} />);
    const card = container.firstChild as HTMLElement;
    expect(card.getAttribute('data-iid')).toBe('test-1');
  });

  it('shows summoning sickness overlay', () => {
    render(<FieldCard card={{ ...creature, summoningSick: true }} />);
    expect(screen.getByText('SUMMONING')).toBeInTheDocument();
  });

  it('hides summoning sickness overlay by default', () => {
    render(<FieldCard card={creature} />);
    expect(screen.queryByText('SUMMONING')).toBeNull();
  });

  it('uses sm sizing when sm=true', () => {
    const { container } = render(<FieldCard card={creature} sm />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.width).toBe('78px');
    expect(card.style.height).toBe('109px');
  });

  it('uses lg sizing by default', () => {
    const { container } = render(<FieldCard card={creature} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.width).toBe('96px');
    expect(card.style.height).toBe('134px');
  });
});
