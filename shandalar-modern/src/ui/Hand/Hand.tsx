import { HandCard } from '../Card/HandCard';
import { CardBack } from '../Card/CardBack';
import type { CardData } from '../Card/types';

function fanOffset(i: number, n: number) {
  const center = (n - 1) / 2;
  const offset = i - center;
  return { angle: offset * 4, y: Math.abs(offset) * 6 };
}

interface HandProps {
  side: 'you' | 'opp';
  cards: CardData[] | number[];
  selCard?: string | null;
  playableIids?: Set<string>;
  onCardClick?: (card: CardData) => void;
}

export function Hand({ side, cards, selCard, playableIids, onCardClick }: HandProps) {
  const isOpp = side === 'opp';
  const n = cards.length;

  return (
    <div style={{
      flexShrink: 0,
      padding: isOpp ? '8px 16px 4px' : '16px 16px 12px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: isOpp ? 'flex-start' : 'flex-end',
      background: isOpp
        ? 'linear-gradient(180deg, rgba(40,16,8,.4), transparent)'
        : 'linear-gradient(180deg, transparent, rgba(20,40,10,.35))',
      minHeight: isOpp ? 70 : 158,
      overflow: 'visible',
    }}>
      {isOpp ? (
        /* Opponent hand — card backs flipped down */
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          transform: 'scaleY(-1) translateY(20px)',
          paddingLeft: 16,
        }}>
          {cards.map((_, i) => {
            const { angle, y } = fanOffset(i, n);
            return <CardBack key={i} fanAngle={angle} fanY={y} size="sm" />;
          })}
        </div>
      ) : (
        /* Player hand — full hand cards fanned */
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingLeft: 28 }}>
          {(cards as CardData[]).map((c, i) => {
            const { angle, y } = fanOffset(i, n);
            return (
              <HandCard
                key={c.iid}
                card={c}
                selected={selCard === c.iid}
                playable={playableIids?.has(c.iid)}
                fanAngle={angle}
                fanY={y}
                onClick={() => onCardClick?.(c)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
