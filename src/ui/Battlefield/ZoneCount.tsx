interface ZoneCountProps {
  glyph: string;
  label: string;
  count: number;
  onClick?: () => void;
}

export function ZoneCount({ glyph, label, count, onClick }: ZoneCountProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'linear-gradient(180deg, #1a1610, var(--bg-deep))',
        border: '1px solid rgba(120,90,40,.4)',
        borderRadius: 4,
        padding: '5px 9px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: 'inset 0 1px 0 rgba(180,140,70,.15), 0 2px 4px rgba(0,0,0,.7)',
        minWidth: 44,
        fontFamily: 'inherit',
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{glyph}</span>
      <span style={{
        fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 700,
        color: 'var(--ink-parchment)', lineHeight: 1,
      }}>{count}</span>
      <span style={{
        fontSize: 7.5, color: 'var(--ink-faint)',
        fontFamily: 'var(--font-display)', letterSpacing: 1, textTransform: 'uppercase',
      }}>{label}</span>
    </button>
  );
}
