import type { CardData } from '../Card/types';
import { HandCard } from '../Card/HandCard';
import styles from './MulliganModal.module.css';

interface MulliganModalProps {
  hand: CardData[];
  mulliganCount: number;
  onKeep: () => void;
  onMulligan: () => void;
}

export function MulliganModal({ hand, mulliganCount, onKeep, onMulligan }: MulliganModalProps) {
  const nextSize = hand.length - 1;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true"
      aria-label="Opening hand — keep or mulligan">
      <div className={styles.modal}>
        <div className={styles.title}>Opening Hand</div>
        {mulliganCount > 0 && (
          <div className={styles.sub}>Mulligan #{mulliganCount}</div>
        )}

        <div className={styles.handRow}>
          {hand.map((card, i) => (
            <div key={card.iid} className={styles.cardWrapper} style={{
              transform: `rotate(${(i - (hand.length - 1) / 2) * 3}deg)`,
              zIndex: i,
            }}>
              <HandCard card={card} />
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.keepBtn} onClick={onKeep} autoFocus>
            Keep
          </button>
          {nextSize >= 4 && (
            <button className={styles.mulliganBtn} onClick={onMulligan}>
              Mulligan to {nextSize}
            </button>
          )}
        </div>

        <div className={styles.hint}>
          {mulliganCount === 0
            ? 'This is your opening hand.'
            : `You have taken ${mulliganCount} mulligan${mulliganCount > 1 ? 's' : ''}.`}
        </div>
      </div>
    </div>
  );
}
