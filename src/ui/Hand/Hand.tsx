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
  cards: CardData[] | number;
  selCard?: string | null;
  playableIids?: Set<string>;
  onCardClick?: (card: CardData) => void;
  compact?: boolean;
}

export function Hand({ side, cards, selCard, playableIids, onCardClick, compact = false }: HandProps) {
  const isOpp = side === 'opp';
  const cardCount = typeof cards === 'number' ? cards : cards.length;
  const n = cardCount;

  // Compact mode uses `height` (not minHeight) so the container is truly constrained.
  // Fan effect is disabled in compact mode so overflowY:hidden clips cleanly.
  // Opponent: 36px strip — just a visual hint that cards exist.
  // Player: clamp(80px, 18vh, 138px) — full card portrait, top ~80px in landscape.
  return (
    <div style={{
      flexShrink: 0,
      padding: compact ? '0 8px' : (isOpp ? '8px 16px 4px' : '16px 16px 12px'),
      display: 'flex',
      justifyContent: 'center',
      alignItems: isOpp ? 'flex-start' : (compact ? 'flex-start' : 'flex-end'),
      background: isOpp
        ? 'linear-gradient(180deg, rgba(40,16,8,.4), transparent)'
        : 'linear-gradient(180deg, transparent, rgba(20,40,10,.35))',
      ...(compact ? {
        height: isOpp ? 36 : 'clamp(80px, 18vh, 138px)',
        overflowX: isOpp ? 'hidden' : 'auto',
        overflowY: 'hidden',
      } : {
        minHeight: isOpp ? 70 : 158,
        overflowX: 'auto',
        overflowY: 'visible',
      }),
      WebkitOverflowScrolling: 'touch',
    }}>
      {isOpp ? (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          // scaleY(-1) renders cards face-down; in compact mode skip translateY so cards
          // sit flush at the top of the 36px clip window rather than being pushed out.
          transform: compact ? 'scaleY(-1)' : 'scaleY(-1) translateY(20px)',
          paddingLeft: compact ? 8 : 16,
        }}>
          {Array.from({ length: n }).map((_, i) => {
            const { angle, y } = compact ? { angle: 0, y: 0 } : fanOffset(i, n);
            return <CardBack key={i} fanAngle={angle} fanY={y} size="sm" />;
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingLeft: compact ? 4 : 28 }}>
          {(cards as CardData[]).map((c, i) => {
            // Disable fan in compact: overflowY:hidden clips rotated cards unpredictably
            const { angle, y } = compact ? { angle: 0, y: 0 } : fanOffset(i, n);
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
