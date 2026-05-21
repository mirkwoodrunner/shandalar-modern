import { FilCorner } from '../Card/FilCorner';
import { Cost } from '../Card/Cost';
import { CardArtImage } from '../Card/CardArtImage';
import { frameOf } from '../Card/frame';
import type { CardData } from '../Card/types';
import s from './styles.module.css';

interface FieldCardProps {
  card: CardData;
  selected?: boolean;
  attacking?: boolean;
  density?: 'creature' | 'perm';
  onClick?: () => void;
}

export function FieldCard({ card, selected, attacking, density = 'creature', onClick }: FieldCardProps) {
  const frame = frameOf(card);
  const isCre = card.type?.includes('Creature');
  const tapped = card.tapped;
  const w = density === 'perm' ? 50 : 64;
  const h = density === 'perm' ? 70 : 90;
  const nameFontSize = density === 'perm' ? 5.5 : 6.5;
  const typeFontSize = density === 'perm' ? 5 : 5.5;
  const ptFontSize = density === 'perm' ? 8.5 : 8.5;

  const borderColor = selected ? 'var(--brass)' : attacking ? 'var(--opp)' : frame.bd;
  const boxShadow = selected
    ? '0 0 10px rgba(255,208,96,.53), inset 0 0 12px rgba(0,0,0,.5)'
    : attacking
    ? '0 0 8px rgba(232,84,32,.7), inset 0 0 12px rgba(0,0,0,.5)'
    : '0 2px 5px rgba(0,0,0,.7), inset 0 0 10px rgba(0,0,0,.4)';

  return (
    <div
      className={s.fieldCard}
      onClick={onClick}
      data-iid={card.iid}
      style={{
        width: w,
        height: h,
        background: `linear-gradient(155deg, ${frame.bg}, var(--bg-deep) 75%)`,
        border: `1.5px solid ${borderColor}`,
        boxShadow,
        transform: tapped ? 'rotate(90deg)' : 'none',
      }}
    >
      <FilCorner corner="tl" color={frame.glow} />
      <FilCorner corner="tr" color={frame.glow} />
      <FilCorner corner="bl" color={frame.glow} />
      <FilCorner corner="br" color={frame.glow} />

      <div
        className={s.fieldName}
        style={{ background: `linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`, borderBottomColor: `${frame.bd}88` }}
      >
        <span className={s.fieldNameText} style={{ fontSize: nameFontSize }}>{card.name}</span>
        {card.cost && density !== 'perm' && <Cost cost={card.cost} size={7} />}
      </div>

      <div className={s.fieldArt} style={{ border: `1px solid ${frame.bd}aa` }}>
        <CardArtImage cardName={card.name} frameColor={frame.glow} />
      </div>

      <div
        className={s.fieldType}
        style={{ background: `linear-gradient(90deg, ${frame.bd}33, transparent)`, borderTop: `1px solid ${frame.bd}66`, fontSize: typeFontSize, color: frame.parch }}
      >
        {card.subtype ?? card.type}
      </div>

      {isCre && (
        <div
          className={s.ptBadge}
          style={{ border: `1px solid ${frame.bd}`, fontSize: ptFontSize, color: (card.damage ?? 0) > 0 ? 'var(--log-damage)' : 'var(--ink-parchment)' }}
        >
          {card.power}/{card.toughness}
        </div>
      )}

      {isCre && card.summoningSick && (
        <div className={s.summonVeil}>
          <span className={s.summonText}>SUMMONING</span>
        </div>
      )}
    </div>
  );
}
