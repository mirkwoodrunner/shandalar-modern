import { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import s from './styles.module.css';

type LogKind = 'turn' | 'phase' | 'play' | 'opp_play' | 'damage' | 'heal' | 'info' | 'system';

export interface LogEntry {
  kind: LogKind;
  text: string;
}

const KIND_CLASS: Record<LogKind, string> = {
  turn:     s.logEntryTurn,
  phase:    s.logEntryPhase,
  play:     s.logEntryPlay,
  opp_play: s.logEntryOpp,
  damage:   s.logEntryDamage,
  heal:     s.logEntryHeal,
  info:     s.logEntryInfo,
  system:   s.logEntryTurn,
};

interface LogSheetProps {
  open: boolean;
  onClose: () => void;
  log: LogEntry[];
}

export function LogSheet({ open, onClose, log }: LogSheetProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [open, log.length]);

  const content = (
    <div
      className={`${s.logBackdrop} ${open ? s.logBackdropOpen : s.logBackdropClosed}`}
      onClick={onClose}
    >
      <div
        className={`${s.logSheet} ${open ? s.logSheetOpen : s.logSheetClosed}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={s.logSheetHeader}>
          <div>
            <div className={s.logTitle}>CHRONICLE</div>
            <div className={s.logSub}>The duel unfolds…</div>
          </div>
          <button className={s.logCloseBtn} onClick={onClose}>✕ CLOSE</button>
        </div>

        <div ref={bodyRef} className={s.logBody}>
          {log.map((entry, i) => (
            <div
              key={i}
              className={`${s.logEntry} ${KIND_CLASS[entry.kind] ?? s.logEntryInfo}`}
              style={{ opacity: i === log.length - 1 ? 1 : 0.85 }}
            >
              {entry.kind === 'turn' && '═══ '}
              {entry.text}
              {entry.kind === 'turn' && ' ═══'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
