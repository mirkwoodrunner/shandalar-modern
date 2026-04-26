import { memo } from 'react';
import type { CardData, ManaSym } from './types';

const MANA_BG: Record<ManaSym, string> = {
  W: 'var(--w)',
  U: 'var(--u)',
  B: 'var(--b)',
  R: 'var(--r)',
  G: 'var(--g)',
  C: 'var(--c)',
};

const GLYPH: Record<ManaSym, string> = {
  W: '?', U: '?', B: '?', R: '?', G: '?', C: '?',
};

interface LandPipProps {
  card: CardData;
  tapped?: boolean;
  selected?: boolean;
  flashing?: boolean;
  isPlayer?: boolean;
  onClick?: () => void;
}

function LandPipInner({ card, tapped, selected, flashing, isPlayer = false, onClick }: LandPipProps) {
  const manaColor = (card.produces?.[0] ?? 'C') as ManaSym;
  const bg = MANA_BG[manaColor] ?? 'var(--c)';
  const sym = GLYPH[manaColor] ?? '?';
  const selColor = isPlayer ? 'var(--you)' : 'var(--opp)';

  const borderColor = flashing ? 'var(--brass)' : selected ? selColor : 'rgba(180,140,70,.4)';
  const boxShadow = flashing
    ? '0 0 10px var(--brass-glow), 0 0 3px var(--brass)'
    : selected
    ? `0 0 8px ${selColor}`
    : tapped
    ? 'none'
    : `0 0 5px ${bg}66, inset 0 1px 1px rgba(255,255,255,.15)`;

  return (
    <div
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}${tapped ? ' (tapped)' : ''}`}
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        borderRadius: 5,
        background: tapped ? `${bg}55` : `linear-gradient(155deg, ${bg}dd, ${bg}77)`,
        border: `1.5px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transform: tapped ? 'rotate(90deg)' : 'none',
        transition: 'transform .3s cubic-bezier(.4,1.4,.6,1), border-color var(--t-fast), box-shadow var(--t-fast)',
        boxShadow,
        opacity: tapped ? 0.55 : 1,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, userSelect: 'none' }}>{sym}</span>
    </div>
  );
}

export const LandPip = memo(LandPipInner);
