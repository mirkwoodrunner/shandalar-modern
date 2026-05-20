import s from './styles.module.css';

interface ZoneChipProps {
  glyph: string;
  count: number;
  label: string;
}

export function ZoneChip({ glyph, count, label }: ZoneChipProps) {
  return (
    <div className={s.zoneChip}>
      <span className={s.zoneGlyph}>{glyph}</span>
      <div className={s.zoneStack}>
        <span className={s.zoneCount}>{count}</span>
        <span className={s.zoneLabel}>{label}</span>
      </div>
    </div>
  );
}
