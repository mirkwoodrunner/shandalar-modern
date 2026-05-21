import type { ReactNode } from 'react';
import s from './styles.module.css';

interface PipRowProps {
  label: string;
  count: number;
  accent: string;
  children?: ReactNode;
}

export function PipRow({ label, count, accent, children }: PipRowProps) {
  return (
    <div className={s.row}>
      <div className={s.rowHeader}>
        <span className={s.rowLabel} style={{ color: accent }}>{label}</span>
        <span className={s.rowCount}>{count}</span>
      </div>
      <div className={s.pipBody}>{children}</div>
    </div>
  );
}
