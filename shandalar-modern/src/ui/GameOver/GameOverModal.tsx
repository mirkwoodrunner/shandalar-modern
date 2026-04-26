import styles from './GameOverModal.module.css';

interface GameStats {
  turns: number;
  maxDamage: number;
  cardsCast: number;
}

interface GameOverModalProps {
  outcome: 'victory' | 'defeat';
  stats: GameStats;
  onNewDuel: () => void;
}

export function GameOverModal({ outcome, stats, onNewDuel }: GameOverModalProps) {
  const isVictory = outcome === 'victory';

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true"
      aria-label={isVictory ? 'Victory' : 'Defeat'}>
      <div className={styles.modal}>
        <div className={`${styles.headline} ${isVictory ? styles.victory : styles.defeat}`}>
          {isVictory ? 'Victory' : 'Defeat'}
        </div>

        <div className={styles.flavour}>
          {isVictory
            ? 'The realm bows before your mastery.'
            : 'Darkness claims the fallen.'}
        </div>

        <div className={styles.divider} />

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Turns Played</span>
            <span className={styles.statValue}>{stats.turns}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Peak Damage</span>
            <span className={styles.statValue}>{stats.maxDamage}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Cards Cast</span>
            <span className={styles.statValue}>{stats.cardsCast}</span>
          </div>
        </div>

        <div className={styles.divider} />

        <button className={styles.newDuelBtn} onClick={onNewDuel} autoFocus>
          New Duel
        </button>
      </div>
    </div>
  );
}
