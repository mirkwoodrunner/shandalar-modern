// src/learn/ui/LearnCard.tsx
// Presentation only. Renders either a GameState battlefield/hand card or a
// display-only CardView (multiSelect lands/options, which carry no iid).

import React from 'react';

type AnyCard = {
  iid?: string;
  id?: string;
  name: string;
  cost?: string;
  type?: string;
  text?: string;
  power?: number;
  toughness?: number;
  tapped?: boolean;
  summoningSick?: boolean;
};

type LearnCardProps = {
  card: AnyCard;
  selected?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
};

export function LearnCard({ card, selected = false, highlighted = false, onClick }: LearnCardProps) {
  const hasEngineState = typeof card.iid === 'string';
  const tapped = hasEngineState ? !!card.tapped : false;
  const isCreature = !!card.type?.includes('Creature');

  const classes = ['learn-card'];
  if (tapped) classes.push('learn-card-tapped');
  if (highlighted) classes.push('learn-card-highlighted');
  if (hasEngineState && selected) classes.push('learn-card-selected');
  if (onClick) classes.push('learn-card-clickable');

  const props: Record<string, unknown> = { className: classes.join(' ') };
  if (hasEngineState) {
    props['data-testid'] = `card-${card.iid}`;
    props['data-tapped'] = tapped ? 'true' : 'false';
    props['data-selected'] = selected ? 'true' : 'false';
  }
  if (onClick) {
    props.onClick = onClick;
    props.role = 'button';
    props.tabIndex = 0;
  }

  return (
    <div {...props}>
      {tapped && <span className="learn-card-badge learn-card-badge-tapped">Tapped</span>}
      {hasEngineState && card.summoningSick && <span className="learn-card-badge learn-card-badge-new">New</span>}
      <div className="learn-card-name-row">
        <span className="learn-card-name">{card.name}</span>
        {card.cost ? <span className="learn-card-cost">{card.cost}</span> : null}
      </div>
      <div className="learn-card-type">{card.type}</div>
      {card.text ? <div className="learn-card-text">{card.text}</div> : null}
      {isCreature && (
        <div className="learn-card-pt">
          {card.power}/{card.toughness}
        </div>
      )}
    </div>
  );
}
