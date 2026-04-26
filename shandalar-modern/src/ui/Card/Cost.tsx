import React from 'react';
import type { ManaSym } from './types';

export type { ManaSym };

const MANA_BG: Record<ManaSym, string> = {
  W: 'var(--w)',
  U: 'var(--u)',
  B: 'var(--b)',
  R: 'var(--r)',
  G: 'var(--g)',
  C: 'var(--c)',
};

interface PipProps {
  sym: ManaSym;
  size?: number;
}

export function Pip({ sym, size = 13 }: PipProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: MANA_BG[sym] ?? '#5a4a32',
      color: sym === 'W' ? '#3a2f10' : '#f4ecd0',
      fontSize: size * 0.58, fontWeight: 700,
      border: '1px solid rgba(20,12,4,.7)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,.15), inset 0 -1px 1px rgba(0,0,0,.4)',
      flexShrink: 0, lineHeight: 1,
      fontFamily: 'var(--font-mono)',
    }}>{sym || '?'}</span>
  );
}

interface NumPipProps {
  n: number | string;
  size?: number;
}

export function NumPip({ n, size = 13 }: NumPipProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: '#4a3e2a', color: '#e8dcc0',
      fontSize: size * 0.6, fontWeight: 700,
      border: '1px solid rgba(20,12,4,.7)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,.1), inset 0 -1px 1px rgba(0,0,0,.4)',
      fontFamily: 'var(--font-mono)', lineHeight: 1, flexShrink: 0,
    }}>{n}</span>
  );
}

interface CostProps {
  cost: string;
  size?: number;
}

export function Cost({ cost, size = 12 }: CostProps) {
  if (!cost) return null;

  const norm = cost.replace(/\{([^}]+)\}/g, '$1').replace(/\//g, '');
  const parts: React.ReactNode[] = [];
  let i = 0;

  while (i < norm.length) {
    const ch = norm[i];
    if ('WUBRG'.includes(ch)) {
      parts.push(<Pip key={`p${i}`} sym={ch as ManaSym} size={size} />);
      i++;
    } else if (ch === 'C') {
      parts.push(<Pip key={`c${i}`} sym="C" size={size} />);
      i++;
    } else if (!isNaN(parseInt(ch, 10))) {
      let n = '';
      while (i < norm.length && !isNaN(parseInt(norm[i], 10))) {
        n += norm[i];
        i++;
      }
      parts.push(<NumPip key={`n${i}`} n={n} size={size} />);
    } else {
      i++;
    }
  }

  return <span style={{ display: 'inline-flex', gap: 2 }}>{parts}</span>;
}

interface PoolDisplayProps {
  pool: Partial<Record<ManaSym, number>>;
  size?: number;
}

export function PoolDisplay({ pool, size = 14 }: PoolDisplayProps) {
  const tot = Object.values(pool).reduce((a, b) => a + (b ?? 0), 0);
  if (!tot) {
    return (
      <span style={{ fontSize: 10, color: 'var(--ink-dim)', fontFamily: 'var(--font-display)' }}>
        —
      </span>
    );
  }

  const syms: ManaSym[] = ['W', 'U', 'B', 'R', 'G', 'C'];

  return (
    <span style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap' }}>
      {syms.map(c =>
        (pool[c] ?? 0) > 0
          ? Array.from({ length: pool[c]! }).map((_, idx) => (
              <Pip key={`${c}${idx}`} sym={c} size={size} />
            ))
          : null
      )}
    </span>
  );
}
