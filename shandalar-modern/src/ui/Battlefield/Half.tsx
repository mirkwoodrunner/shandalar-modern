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
  const lands = cards.filter(c => c.type === 'Land');
  const nonLands = cards.filter(c => c.type !== 'Land');

  const landLabelColor = isOpp ? 'var(--ink-faint)' : '#6a8848';
  const landBorderColor = isOpp ? 'rgba(120,90,40,.15)' : 'rgba(80,140,40,.2)';
  const landLabel = isOpp ? `LANDS · ${lands.length}` : `YOUR LANDS · ${lands.length}`;

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
      {/* Lands strip */}
      <div style={{
        flexShrink: 0,
        padding: '5px 14px 4px',
        borderBottom: `1px dashed ${landBorderColor}`,
        background: 'rgba(0,0,0,.25)',
      }}>
        <div style={{
          fontSize: 8.5, color: landLabelColor,
          fontFamily: 'var(--font-display)', letterSpacing: 1.5, marginBottom: 4,
        }}>
          {landLabel}
        </div>
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

      {/* Creature / permanent row */}
      <div style={{
        flex: isOpp ? undefined : 1,
        padding: '8px 14px',
        minHeight: isOpp ? 130 : undefined,
        display: 'flex',
        gap: 6,
        alignItems: 'flex-start',
        overflowX: isOpp ? 'auto' : undefined,
        overflow: isOpp ? undefined : 'auto',
      }}>
        {nonLands.map(c => (
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
      </div>
    </div>
  );
}
