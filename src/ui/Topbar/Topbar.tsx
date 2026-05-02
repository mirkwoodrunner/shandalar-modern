import { PhaseBar } from '../Phase/PhaseBar';

interface TopbarProps {
  rulesetName: string;
  turn: number;
  active: 'p' | 'o';
  phase: string;
  onForfeit?: () => void;
}

export function Topbar({ rulesetName, turn, active, phase, onForfeit }: TopbarProps) {
  return (
    <div style={{
      flexShrink: 0,
      padding: '6px 14px',
      background: 'linear-gradient(180deg, rgba(0,0,0,.85), rgba(20,12,6,.7))',
      borderBottom: '1px solid rgba(180,140,70,.3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 13,
            fontFamily: 'var(--font-display)',
            color: 'var(--brass)',
            fontWeight: 700,
            letterSpacing: 2,
            textShadow: '0 0 8px rgba(196,160,64,.3)',
          }}>
            SHANDALAR
          </span>

          <span style={{ fontSize: 10, color: 'var(--ink-dim)' }}>·</span>

          <span style={{
            fontSize: 11, color: 'var(--ink-muted)',
            fontFamily: 'var(--font-display)', letterSpacing: 1,
          }}>
            {rulesetName}
          </span>

          <span style={{ fontSize: 10, color: 'var(--ink-dim)' }}>·</span>

          <span style={{
            fontSize: 11, color: 'var(--brass)',
            fontFamily: 'var(--font-mono)',
            padding: '2px 8px',
            background: 'rgba(196,160,64,.1)',
            border: '1px solid rgba(196,160,64,.3)',
            borderRadius: 2,
          }}>
            TURN {turn}
          </span>

          <span style={{
            fontSize: 10,
            color: active === 'p' ? 'var(--you)' : 'var(--opp)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 1,
          }}>
            {active === 'p' ? 'YOUR TURN' : 'Opponent thinking?'}
          </span>
        </div>

        <button
          onClick={onForfeit}
          style={{
            background: 'rgba(60,20,12,.5)',
            border: '1px solid rgba(168,80,48,.5)',
            color: '#e07050',
            padding: '4px 14px',
            borderRadius: 3,
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            letterSpacing: 1,
            cursor: 'pointer',
          }}
        >
          Forfeit
        </button>
      </div>

      <PhaseBar phase={phase} />
    </div>
  );
}
