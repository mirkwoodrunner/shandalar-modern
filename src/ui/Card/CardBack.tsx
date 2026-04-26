type CardBackSize = 'lg' | 'sm';

interface CardBackProps {
  fanAngle?: number;
  fanY?: number;
  size?: CardBackSize;
}

const DIMS: Record<CardBackSize, { w: number; h: number; sigil: number; marginLeft: number }> = {
  lg: { w: 96, h: 134, sigil: 44, marginLeft: -28 },
  sm: { w: 42, h: 60, sigil: 20, marginLeft: -16 },
};

export function CardBack({ fanAngle = 0, fanY = 0, size = 'lg' }: CardBackProps) {
  const d = DIMS[size];

  return (
    <div style={{
      width: d.w,
      height: d.h,
      background: 'radial-gradient(ellipse at 50% 50%, #2a1a0e 0%, #14080a 60%, #0a0406 100%)',
      border: '2px solid #4a2818',
      borderRadius: 6,
      flexShrink: 0,
      transform: `rotate(${fanAngle}deg) translateY(${fanY}px)`,
      transformOrigin: '50% 130%',
      marginLeft: d.marginLeft,
      position: 'relative',
      boxShadow: '0 4px 10px rgba(0,0,0,.8), inset 0 0 14px rgba(0,0,0,.6)',
      overflow: 'hidden',
      transition: 'transform .25s cubic-bezier(.3,1.3,.5,1)',
    }}>
      <div style={{
        position: 'absolute',
        inset: 4,
        border: '1px solid #6a3820',
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'repeating-linear-gradient(45deg, transparent 0 3px, rgba(106,56,32,.08) 3px 6px)',
      }}>
        <svg width={d.sigil} height={d.sigil} viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" stroke="#7a4828" strokeWidth="0.8" fill="none" opacity="0.7" />
          <circle cx="22" cy="22" r="13" stroke="#7a4828" strokeWidth="0.6" fill="none" opacity="0.5" />
          <path d="M22 6 L26 22 L22 38 L18 22 Z" fill="#5a3018" stroke="#8a5028" strokeWidth="0.5" opacity="0.85" />
          <path d="M6 22 L22 18 L38 22 L22 26 Z" fill="#5a3018" stroke="#8a5028" strokeWidth="0.5" opacity="0.85" />
          <circle cx="22" cy="22" r="2.5" fill="#a26830" />
        </svg>
      </div>
      <div style={{
        position: 'absolute',
        inset: 0,
        boxShadow: 'inset 0 1px 0 rgba(160,100,50,.3)',
        borderRadius: 4,
        pointerEvents: 'none',
      }} />
    </div>
  );
}
