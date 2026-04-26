import { useRef, useEffect } from 'react';
import type { LogEntry, LogKind } from '../../types/duel';

const TONE_COLOR: Record<LogKind, string> = {
  turn:     'var(--brass)',
  phase:    '#7a8a9a',
  play:     '#a8e070',
  opp_play: '#ff9070',
  damage:   '#ff5a3a',
  heal:     '#7ad0a0',
  info:     'var(--ink-muted)',
  system:   'var(--brass)',
};

interface DuelLogProps {
  log: LogEntry[];
}

export function DuelLog({ log }: DuelLogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [log.length]);

  return (
    <div ref={ref} style={{
      flex: 1,
      overflow: 'auto',
      padding: '6px 10px',
      fontFamily: 'var(--font-body)',
      fontSize: 11,
      lineHeight: 1.4,
      background: 'linear-gradient(180deg, #0c0806, #080604)',
      borderTop: '1px solid rgba(120,90,40,.2)',
    }}>
      {log.map((entry, i) => {
        const tone = entry.kind;
        const color = TONE_COLOR[tone] ?? 'var(--ink-muted)';
        const isTurn = tone === 'turn';
        const isPhase = tone === 'phase';
        return (
          <div
            key={i}
            style={{
              color,
              marginBottom: 3,
              opacity: i === log.length - 1 ? 1 : 0.85,
              paddingLeft: isTurn ? 0 : 8,
              borderLeft: isTurn ? 'none' : `2px solid ${color}33`,
              fontStyle: isPhase ? 'italic' : 'normal',
              fontWeight: isTurn ? 700 : 400,
              textTransform: isTurn ? 'uppercase' : 'none',
              letterSpacing: isTurn ? 1.2 : 0,
              fontSize: isTurn ? 10 : 11,
              fontFamily: isTurn ? 'var(--font-display)' : 'var(--font-body)',
            }}
          >
            {isTurn && '═══ '}{entry.text}{isTurn && ' ═══'}
          </div>
        );
      })}
    </div>
  );
}
