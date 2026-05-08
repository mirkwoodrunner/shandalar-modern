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

export function Half({ side, cards, selCard, selTgt, attackers, flashIids, onCardClick, onCardHover }: HalfProps) {
  const isOpp = side === 'opp';
  const lands = cards.filter(c => c.type === 'Land' && !(c as any).isAnimatedLand);
  const nonLands = cards.filter(c => c.type !== 'Land' || (c as any).isAnimatedLand);
  const creatures        = nonLands.filter(c => c.type === 'Creature' || c.type?.startsWith('Creature'));
  const nonCreaturePerms = nonLands.filter(c => !(c.type === 'Creature' || c.type?.startsWith('Creature')));

  const landBorderColor = isOpp ? 'rgba(120,90,40,.15)' : 'rgba(80,140,40,.2)';
  const landLabel = isOpp ? `LANDS (${lands.length})` : `YOUR LANDS (${lands.length})`;

  const isSelected = (iid: string) => selCard === iid || selTgt === iid;

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
      {/* Land row */}
      <div style={{
        flexShrink: 0,
        padding: '5px 14px 4px',
        borderBottom: `1px dashed ${landBorderColor}`,
        background: 'rgba(0,0,0,.25)',
      }}>
        <div style={{
          fontSize: 8,
          fontFamily: 'var(--font-display)',
          letterSpacing: 1.5,
          marginBottom: 3,
          flexShrink: 0,
          textTransform: 'uppercase' as const,
          color: isOpp ? 'var(--ink-faint)' : '#6a8848',
        }}>{landLabel}</div>
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

      {/* Creature row — always present */}
      <div style={{
        flex: isOpp ? undefined : 1,
        padding: '8px 14px 4px',
        minHeight: isOpp ? 130 : undefined,
        display: 'flex',
        gap: 6,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        overflow: 'auto',
      }}>
        {creatures.map(c => (
          <div
            key={c.iid}
            onMouseEnter={() => onCardHover?.(c.iid)}
            onMouseLeave={() => onCardHover?.(null)}
          >
            <FieldCard
              card={c}
              sm={isOpp}
              selected={isSelected(c.iid)}
              attacking={attackers.includes(c.iid)}
              tapped={c.tapped}
              casting={flashIids?.has(c.iid)}
              onClick={() => onCardClick?.(c)}
            />
          </div>
        ))}
        {creatures.length === 0 && (
          <span style={{ fontSize: 9, color: 'var(--ink-faint)', fontStyle: 'italic', alignSelf: 'center' }}>
            —
          </span>
        )}
      </div>

      {/* Non-creature permanents row — only when populated */}
      {nonCreaturePerms.length > 0 && (
        <div style={{
          flexShrink: 0,
          padding: '4px 14px 8px',
          borderTop: `1px dashed ${isOpp ? 'rgba(120,90,40,.15)' : 'rgba(80,140,40,.2)'}`,
          display: 'flex',
          gap: 6,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          overflow: 'auto',
        }}>
          {nonCreaturePerms.map(c => (
            <div
              key={c.iid}
              onMouseEnter={() => onCardHover?.(c.iid)}
              onMouseLeave={() => onCardHover?.(null)}
            >
              <FieldCard
                card={c}
                sm={isOpp}
                selected={isSelected(c.iid)}
                attacking={false}
                tapped={c.tapped}
                casting={flashIids?.has(c.iid)}
                onClick={() => onCardClick?.(c)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
