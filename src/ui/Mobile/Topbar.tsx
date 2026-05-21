import { PhaseBar } from './PhaseBar';
import { PhaseRibbon } from './PhaseRibbon';
import s from './styles.module.css';

interface TopbarProps {
  turn: number;
  phase: string;
  active: 'p' | 'o';
  onOpenLog: () => void;
  onOpenMenu: () => void;
}

export function Topbar({ turn, phase, active, onOpenLog, onOpenMenu }: TopbarProps) {
  return (
    <div className={s.topbar}>
      <div className={s.topbarRow}>
        <div className={s.topbarLeft}>
          <span className={s.wordmark}>SHANDALAR</span>
          <span className={s.dot}>·</span>
          <span className={s.turnPill}>T{turn}</span>
          {active === 'p'
            ? <span className={s.activeYou}>YOUR TURN</span>
            : <span className={s.activeOpp}>Opp thinking…</span>}
        </div>
        <div className={s.topbarBtns}>
          <button className={s.logBtn} onClick={onOpenLog}>
            <span>📜</span> LOG
          </button>
          <button className={s.menuBtn} onClick={onOpenMenu}>⋯</button>
        </div>
      </div>
      <PhaseBar phase={phase} />
      <PhaseRibbon phase={phase} />
    </div>
  );
}
