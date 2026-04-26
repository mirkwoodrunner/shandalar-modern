import type { FrameValue } from './frame';

interface ArtPlaceholderProps {
  frame: FrameValue;
  label: string;
  sm?: boolean;
}

export function ArtPlaceholder({ frame, label, sm }: ArtPlaceholderProps) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: `repeating-linear-gradient(45deg, ${frame.bg} 0 6px, ${frame.bg}cc 6px 12px)`,
      borderRadius: 2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 50% 30%, ${frame.glow}22, transparent 70%)`,
      }} />
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: sm ? 7 : 8.5,
        color: `${frame.parch}88`,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        position: 'relative',
      }}>{label}</span>
    </div>
  );
}
