import { memo } from 'react';
import { Cost } from './Cost';
import { FilCorner } from './FilCorner';
import { ArtPlaceholder } from './ArtPlaceholder';
import { frameOf } from './frame';
import type { CardData } from './types';
import styles from './HandCard.module.css';

interface HandCardProps {
  card: CardData;
  selected?: boolean;
  playable?: boolean;
  fanAngle?: number;
  fanY?: number;
  onClick?: () => void;
}

function HandCardInner({ card, selected, playable, fanAngle = 0, fanY = 0, onClick }: HandCardProps) {
  const frame = frameOf(card);

  const borderColor = selected ? 'var(--brass)' : playable ? 'var(--you)' : frame.bd;
  const boxShadow = selected
    ? `0 0 18px rgba(196,160,64,.6), 0 -6px 22px rgba(255,208,96,.25), 0 6px 14px rgba(0,0,0,.7)`
    : playable
    ? `0 0 10px rgba(122,184,74,.45), 0 6px 14px rgba(0,0,0,.7)`
    : `0 6px 14px rgba(0,0,0,.8), inset 0 0 12px rgba(0,0,0,.4)`;

  const transform = selected
    ? `rotate(${fanAngle}deg) translateY(${fanY - 28}px) scale(1.08)`
    : `rotate(${fanAngle}deg) translateY(${fanY}px)`;

  return (
    <div
      className={styles.card}
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}\n${card.text ?? ''}`}
      style={{
        background: `linear-gradient(155deg, ${frame.bg}, #0a0806 80%)`,
        border: `2px solid ${borderColor}`,
        boxShadow,
        transform,
        zIndex: selected ? 100 : undefined,
      }}
    >
      <FilCorner corner="tl" color={frame.glow} />
      <FilCorner corner="tr" color={frame.glow} />
      <FilCorner corner="bl" color={frame.glow} />
      <FilCorner corner="br" color={frame.glow} />

      {/* Name bar */}
      <div
        className={styles.nameBar}
        style={{
          background: `linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`,
          borderBottomColor: `${frame.bd}88`,
        }}
      >
        <span className={styles.cardName}>{card.name}</span>
        {card.cost && <Cost cost={card.cost} size={10} />}
      </div>

      {/* Art window */}
      <div
        className={styles.artWindow}
        style={{ border: `1px solid ${frame.bd}aa` }}
      >
        <ArtPlaceholder frame={frame} label={`${card.type} art`} />
      </div>

      {/* Type bar */}
      <div
        className={styles.typeBar}
        style={{
          background: `linear-gradient(90deg, ${frame.bd}33, transparent)`,
          borderTopColor: `${frame.bd}66`,
          borderBottomColor: `${frame.bd}66`,
          color: frame.parch,
        }}
      >
        {card.subtype ? `${card.type} — ${card.subtype}` : card.type}
      </div>

      {/* Text box */}
      <div className={styles.textBox}>{card.text ?? ''}</div>

      {/* P/T plaque */}
      {card.type === 'Creature' && (
        <div
          className={styles.ptPlaque}
          style={{ border: `1px solid ${frame.bd}` }}
        >
          {card.power}/{card.toughness}
        </div>
      )}

      {/* Playable strip */}
      {playable && !selected && <div className={styles.playableStrip} />}
    </div>
  );
}

export const HandCard = memo(HandCardInner);
