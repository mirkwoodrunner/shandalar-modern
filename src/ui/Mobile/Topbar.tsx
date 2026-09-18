import { PhaseBar } from './PhaseBar';
import { PhaseRibbon } from './PhaseRibbon';
import s from './styles.module.css';

interface TopbarProps {
  turn: number;
  phase: string;
  active: 'p' | 'o';
  onOpenLog: () => void;
  onOpenMenu: () => void;
  /**
   * Scenario mode (Learn Mode L3). Default true, so every campaign and sandbox
   * duel is unchanged. False drops the campaign identity row -- wordmark, turn
   * pill, log and menu buttons -- and keeps the phase bar and ribbon, which are
   * teaching material. Desktop Topbar carries the same prop; keep them in step.
   */
  showCampaignChrome?: boolean;
}

export function Topbar({ turn, phase, active, onOpenLog, onOpenMenu, showCampaignChrome = true }: TopbarProps) {
  return (
    <div className={s.topbar}>
      {showCampaignChrome && (
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
      )}
      <PhaseBar phase={phase} />
      <PhaseRibbon phase={phase} />
    </div>
  );
}
