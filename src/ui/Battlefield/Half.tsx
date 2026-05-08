import React from 'react';
import { FieldCard } from '../Card/FieldCard';
import { LandPip } from '../Card/LandPip';
import type { CardData } from '../Card/types';

interface HalfProps {
  side: 'you' | 'opp';
  cards: CardData[];
  selCard: string | null;
  selTgt: string | null;
  attackers: string[];
  flashIids?: Set<string>;
  onCardClick?: (card: CardData) => void;
  onCardHover?: (iid: string | null) => void;
}

// Returns true for any card currently acting as a creature on the battlefield,
// including Artifact Creatures and animated lands (Mishra's Factory).
function isCurrentCreature(c: CardData): boolean {
  return (
    c.type?.includes('Creature') === true ||
    (c as any).isAnimatedLand === true
  );
}

const ROW_LABEL: React.CSSProperties = {
  fontSize: 8,
  fontFamily: 'var(--font-display)',
  letterSpacing: 1.5,
  marginBottom: 3,
  flexShrink: 0,
  textTransform: 'uppercase' as const,
};

export function Half({ side, cards, selCard, selTgt, attackers, flashIids, onCardClick, onCardHover }: HalfProps) {
  const isOpp = side === 'opp';
  const lands = cards.filter(c => c.type === 'Land' && !(c as any).isAnimatedLand);
  const nonLands = cards.filter(c => c.type !== 'Land' || (c as any).isAnimatedLand);
  const creatures        = nonLands.filter(isCurrentCreature);
  const nonCreaturePerms = nonLands.filter(c => !isCurrentCreature(c));

  const landLabelColor  = isOpp ? 'var(--ink-faint)' : '#6a8848';
  const perm1LabelColor = isOpp ? 'var(--ink-faint)' : '#8a7040';
  const perm2LabelColor = isOpp ? 'var(--ink-faint)' : '#607070';
  const landBorderColor = isOpp ? 'rgba(120,90,40,.15)' : 'rgba(80,140,40,.2)';
  const landLabel = isOpp ? `LANDS (${lands.length})` : `YOUR LANDS (${lands.length})`;

  const isSelected = (iid: string) => selCard === iid || selTgt === iid;

  const renderCardRow = (rowCards: CardData[], allowAttacking = false) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start' }}>
      {rowCards.map(c => (
        <div
          key={c.iid}
          onMouseEnter={() => onCardHover?.(c.iid)}
          onMouseLeave={() => onCardHover?.(null)}
        >
          <FieldCard
            card={c}
            sm={isOpp}
            selected={isSelected(c.iid)}
            attacking={allowAttacking && attackers.includes(c.iid)}
            tapped={c.tapped}
            casting={flashIids?.has(c.iid)}
            onClick={() => onCardClick?.(c)}
          />
        </div>
      ))}
    </div>
  );

  const landRow = (
    <div style={{
      flexShrink: 0,
      padding: '5px 14px 4px',
      borderBottom: isOpp ? `1px dashed ${landBorderColor}` : undefined,
      borderTop: isOpp ? undefined : `1px dashed ${landBorderColor}`,
      background: 'rgba(0,0,0,.25)',
    }}>
      <div style={{ ...ROW_LABEL, color: landLabelColor }}>{landLabel}</div>
      <div style={{ display: 'flex', gap: 4, minHeight: 36 }}>
        {lands.map(c => (
          <LandPip
            key={c.iid}
            card={c}
            tapped={c.tapped}
            selected={isSelected(c.iid)}
            flashing={flashIids?.has(c.iid)}
            isPlayer={!isOpp}
            onClick={() => onCardClick?.(c)}
          />
        ))}
      </div>
    </div>
  );

  const permanentsArea = (
    <div style={{
      flex: isOpp ? undefined : 1,
      padding: '6px 14px 8px',
      minHeight: isOpp ? 130 : undefined,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      overflow: 'auto',
    }}>
      {creatures.length > 0 && (
        <div>
          <div style={{ ...ROW_LABEL, color: perm1LabelColor }}>
            {isOpp ? `CREATURES (${creatures.length})` : `YOUR CREATURES (${creatures.length})`}
          </div>
          {renderCardRow(creatures, true)}
        </div>
      )}
      {nonCreaturePerms.length > 0 && (
        <div>
          <div style={{ ...ROW_LABEL, color: perm2LabelColor }}>
            {isOpp ? `SPELLS / ARTIFACTS (${nonCreaturePerms.length})` : `YOUR SPELLS / ARTIFACTS (${nonCreaturePerms.length})`}
          </div>
          {renderCardRow(nonCreaturePerms)}
        </div>
      )}
      {creatures.length === 0 && nonCreaturePerms.length === 0 && (
        <span style={{ fontSize: 9, color: 'var(--ink-faint)', fontStyle: 'italic' }}>—</span>
      )}
    </div>
  );

  return (
    <div style={{
      flex: isOpp ? undefined : 1,
      background: isOpp
        ? 'linear-gradient(180deg, rgba(40,16,8,.5), rgba(20,8,6,.6))'
        : 'linear-gradient(180deg, rgba(20,28,12,.5), rgba(14,18,8,.6))',
      borderBottom: isOpp ? '1px solid rgba(120,90,40,.2)' : undefined,
      display: 'flex',
      flexDirection: 'column',
      overflow: isOpp ? undefined : 'hidden',
      minHeight: isOpp ? undefined : 0,
      flexShrink: isOpp ? 0 : undefined,
    }}>
      {isOpp ? (
        <>
          {landRow}
          {permanentsArea}
        </>
      ) : (
        <>
          {permanentsArea}
          {landRow}
        </>
      )}
    </div>
  );
}
