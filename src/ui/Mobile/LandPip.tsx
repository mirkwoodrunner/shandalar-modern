import type { CardData, ManaSym } from '../Card/types';
import s from './styles.module.css';

const MANA_BG: Record<string, string> = {
  W: 'var(--w)', U: 'var(--u)', B: 'var(--b)',
  R: 'var(--r)', G: 'var(--g)', C: 'var(--c)',
};
const GLYPH: Record<string, string> = {
  W: '☀', U: '💧', B: '💀', R: '🔥', G: '🌿', C: '◆',
};

interface LandPipProps {
  card: CardData;
  tapped?: boolean;
  selected?: boolean;
  isPlayer?: boolean;
  onClick?: () => void;
}

export function LandPip({ card, tapped, selected, isPlayer = false, onClick }: LandPipProps) {
  const mana = (card.produces?.[0] ?? 'C') as ManaSym;
  const bg = MANA_BG[mana] ?? 'var(--c)';
  const sym = GLYPH[mana] ?? '◆';
  const selColor = isPlayer ? 'var(--you)' : 'var(--opp)';

  const border = `1.5px solid ${selected ? selColor : 'rgba(180,140,70,.4)'}`;
  const boxShadow = selected
    ? `0 0 6px ${selColor}`
    : tapped
    ? 'none'
    : `0 0 4px ${bg}66, inset 0 1px 1px rgba(255,255,255,.15)`;

  return (
    <div
      className={s.landPip}
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}${tapped ? ' (tapped)' : ''}`}
      style={{
        background: tapped ? `${bg}55` : `linear-gradient(155deg, ${bg}dd, ${bg}77)`,
        border,
        boxShadow,
        transform: tapped ? 'rotate(90deg)' : 'none',
        opacity: tapped ? 0.55 : 1,
      }}
    >
      <span className={s.landPipGlyph}>{sym}</span>
    </div>
  );
}
