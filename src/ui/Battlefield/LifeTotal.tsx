type LifeSide = 'you' | 'opp';
type LifeAnim = 'damage' | 'heal' | null;

interface LifeTotalProps {
  life: number;
  max: number;
  label: string;
  side: LifeSide;
  anim?: LifeAnim;
  onClick?: () => void;
}

export function LifeTotal({ life, max, label, side, anim, onClick }: LifeTotalProps) {
  const isOpp = side === 'opp';
  const accent = isOpp ? 'var(--opp)' : 'var(--you)';
  const accentRaw = isOpp ? '#c45040' : '#7ab84a';

  const lifeColor = life <= 5 ? '#ff3030' : life <= 10 ? '#e0703a' : (isOpp ? '#ff9070' : '#a8e070');

  const animation = life <= 5
    ? 'pulse 1s infinite'
    : anim === 'damage'
    ? 'damageFlash .4s ease-out'
    : anim === 'heal'
    ? 'healFlash .4s ease-out'
    : 'none';

  const barColor = life <= 5
    ? 'linear-gradient(90deg, #c41818, #ee3030)'
    : isOpp
    ? 'linear-gradient(90deg, #8a2818, #c45028)'
    : 'linear-gradient(90deg, #2a8030, #5ac040)';

  return (
    <div
      data-iid={isOpp ? 'player-o' : 'player-p'}
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '8px 16px',
        background: 'linear-gradient(180deg, rgba(20,16,10,.7), rgba(10,8,6,.85))',
        border: `1px solid ${isOpp ? 'rgba(180,80,30,.4)' : 'rgba(80,140,40,.4)'}`,
        borderRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(180,140,70,.15), 0 2px 6px rgba(0,0,0,.6)',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${accentRaw}55, transparent)`,
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
        <span style={{
          fontSize: 9, color: accent,
          fontFamily: 'var(--font-display)', letterSpacing: 2,
          fontWeight: 700, textTransform: 'uppercase',
          textShadow: `0 0 6px ${accentRaw}66`,
        }}>{label}</span>
        <span style={{
          fontSize: 11, color: 'var(--ink-faint)',
          fontFamily: 'var(--font-body)', fontStyle: 'italic',
        }}>Life</span>
      </div>

      <div style={{
        position: 'relative',
        fontSize: 52, fontFamily: 'var(--font-display)', fontWeight: 700,
        color: lifeColor, lineHeight: 1,
        textShadow: `0 0 14px ${lifeColor}55, 0 2px 4px rgba(0,0,0,.9)`,
        animation,
        minWidth: 64, textAlign: 'center',
      }}>
        {life}
        <span style={{
          position: 'absolute', top: 6, right: -8,
          fontSize: 12, color: 'var(--ink-dim)',
          fontFamily: 'var(--font-body)',
        }}>/{max}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
        <div style={{
          height: 10, background: 'var(--bg-deep)', borderRadius: 2,
          border: '1px solid rgba(120,90,40,.4)',
          overflow: 'hidden', boxShadow: 'inset 0 1px 3px rgba(0,0,0,.8)',
        }}>
          <div style={{
            width: `${Math.max(0, (life / max) * 100)}%`,
            height: '100%',
            background: barColor,
            transition: 'width .5s',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,.2)',
          }} />
        </div>
      </div>
    </div>
  );
}
