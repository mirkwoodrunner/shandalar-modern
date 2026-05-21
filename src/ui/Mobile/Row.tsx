import type { ReactNode, CSSProperties } from 'react';
import s from './styles.module.css';

interface RowProps {
  label: string;
  count: number;
  accent: string;
  minHeight: number;
  bgFade?: string;
  children?: ReactNode;
}

export function Row({ label, count, accent, minHeight, bgFade, children }: RowProps) {
  const isEmpty = !children || (Array.isArray(children) && children.filter(Boolean).length === 0);

  return (
    <div className={s.row} style={{ background: bgFade ?? 'transparent' }}>
      <div className={s.rowHeader}>
        <span className={s.rowLabel} style={{ color: accent }}>{label}</span>
        <span className={s.rowCount}>{count}</span>
      </div>
      <div className={s.rowBody} style={{ minHeight } as CSSProperties}>
        {isEmpty
          ? <span className={`${s.rowEmpty} ${minHeight >= 90 ? s.rowCreatureEmpty : ''}`}>none</span>
          : children}
      </div>
    </div>
  );
}
