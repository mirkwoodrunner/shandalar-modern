import { FilCorner } from '../Card/FilCorner';
import { Cost } from '../Card/Cost';
import { ArtPlaceholder } from '../Card/ArtPlaceholder';
import { frameOf } from '../Card/frame';
import type { CardData } from '../Card/types';
import s from './styles.module.css';

interface HandCardProps {
  card: CardData;
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
}

export function HandCard({ card, selected, playable, onClick }: HandCardProps) {
  const frame = frameOf(card);
  const isCre = card.type?.includes('Creature');

  const borderColor = selected ? 'var(--brass)' : playable ? 'var(--you)' : frame.bd;
  const boxShadow = selected
    ? '0 0 14px rgba(255,208,96,.6), 0 -4px 14px rgba(255,208,96,.25), 0 4px 10px rgba(0,0,0,.7)'
    : playable
    ? '0 0 8px rgba(122,184,74,.45), 0 3px 8px rgba(0,0,0,.7)'
    : '0 3px 8px rgba(0,0,0,.7), inset 0 0 10px rgba(0,0,0,.4)';

  return (
    <div
      className={s.handCard}
      onClick={onClick}
      data-iid={card.iid}
      style={{
        width: 88,
        height: 126,
        background: `linear-gradient(155deg, ${frame.bg}, var(--bg-deep) 80%)`,
        border: `1.5px solid ${borderColor}`,
        boxShadow,
        transform: selected ? 'translateY(-18px) scale(1.08)' : 'translateY(0)',
        zIndex: selected ? 10 : undefined,
      }}
    >
      <FilCorner corner="tl" color={frame.glow} />
      <FilCorner corner="tr" color={frame.glow} />
      <FilCorner corner="bl" color={frame.glow} />
      <FilCorner corner="br" color={frame.glow} />

      <div
        className={s.handNameRow}
        style={{ background: `linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`, borderBottomColor: `${frame.bd}88` }}
      >
        <span className={s.handNameText}>{card.name}</span>
        {card.cost && <Cost cost={card.cost} size={9.5} />}
      </div>

      <div className={s.handArt} style={{ border: `1px solid ${frame.bd}aa` }}>
        <ArtPlaceholder frame={frame} label={card.type ?? ''} />
      </div>

      <div
        className={s.handType}
        style={{ background: `linear-gradient(90deg, ${frame.bd}33, transparent)`, borderTop: `1px solid ${frame.bd}66`, color: frame.parch }}
      >
        {card.subtype ?? card.type}
      </div>

      <div className={s.handText}>{card.text ?? ''}</div>

      {isCre && (
        <div
          className={s.handPtBadge}
          style={{ border: `1px solid ${frame.bd}` }}
        >
          {card.power}/{card.toughness}
        </div>
      )}

      {playable && !selected && <div className={s.handPlayStrip} />}
    </div>
  );
}
