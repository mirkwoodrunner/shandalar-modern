import { memo } from 'react';
import { Cost } from './Cost';
import { FilCorner } from './FilCorner';
import { CardArtImage } from './CardArtImage';
import { frameOf } from './frame';
import type { CardData } from './types';
import styles from './FieldCard.module.css';

interface FieldCardProps {
  card: CardData;
  selected?: boolean;
  attacking?: boolean;
  tapped?: boolean;
  casting?: boolean;
  sm?: boolean;
  onClick?: () => void;
}

function FieldCardInner({ card, selected, attacking, tapped, casting, sm = false, onClick }: FieldCardProps) {
  const frame = frameOf(card);
  const w = sm ? 78 : 96;
  const h = sm ? 109 : 134;
  const isCre = card.type?.includes('Creature') === true || (card as any).isAnimatedLand === true;
  const fontSize = sm ? 7.5 : 8.5;

  const borderColor = casting ? 'var(--brass-hi)' : selected ? 'var(--brass)' : attacking ? 'var(--opp)' : frame.bd;
  const boxShadow = casting
    ? `0 0 20px var(--brass-glow), 0 0 6px var(--brass-hi), inset 0 0 18px rgba(0,0,0,.5)`
    : selected
    ? `0 0 14px var(--brass-glow), 0 0 4px var(--brass), inset 0 0 18px rgba(0,0,0,.5)`
    : attacking
    ? `0 0 12px rgba(196,80,64,.7), inset 0 0 18px rgba(0,0,0,.5)`
    : `0 3px 8px rgba(0,0,0,.7), inset 0 0 14px rgba(0,0,0,.4)`;

  return (
    <div
      className={styles.card}
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}\n${card.text ?? ''}`}
      style={{
        width: w,
        height: h,
        background: `linear-gradient(155deg, ${frame.bg}, #0a0806 75%)`,
        border: `2px solid ${borderColor}`,
        boxShadow,
        transform: tapped ? 'rotate(90deg)' : 'none',
        padding: 3,
      }}
    >
      <FilCorner corner="tl" color={frame.glow} />
      <FilCorner corner="tr" color={frame.glow} />
      <FilCorner corner="bl" color={frame.glow} />
      <FilCorner corner="br" color={frame.glow} />

      <div
        className={styles.nameBar}
        style={{
          background: `linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`,
          borderBottomColor: `${frame.bd}88`,
        }}
      >
        <span className={styles.cardName} style={{ fontSize }}>
          {card.name}
        </span>
        {card.cost && <Cost cost={card.cost} size={sm ? 9 : 10} />}
      </div>

      <div
        className={styles.artWindow}
        style={{ border: `1px solid ${frame.bd}aa`, boxShadow: 'inset 0 0 8px rgba(0,0,0,.7)' }}
      >
        <CardArtImage cardName={card.name} frameColor={frame.glow} />
      </div>

      <div
        className={styles.typeBar}
        style={{
          background: `linear-gradient(90deg, ${frame.bd}33, transparent)`,
          borderTopColor: `${frame.bd}66`,
          borderBottomColor: `${frame.bd}66`,
          fontSize: sm ? 6.5 : 7.5,
          color: frame.parch,
        }}
      >
        {card.subtype ? `${card.type} ? ${card.subtype}` : card.type}
      </div>

      <div className={styles.textBox} style={{ minHeight: sm ? 16 : 22, fontSize: sm ? 6 : 7 }}>
        {card.text ?? ''}
      </div>

      {(card.damage ?? 0) > 0 && (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          background: 'rgba(180,20,20,0.85)',
          color: '#fff',
          borderRadius: '50%',
          width: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 'bold',
          fontFamily: "'Fira Code', monospace",
          border: '1px solid #ff4444',
          zIndex: 10,
          boxShadow: '0 0 4px rgba(255,0,0,0.5)',
          flexShrink: 0,
        }}>
          🩸{card.damage}
        </div>
      )}

      {isCre && (
        <div
          className={styles.ptPlaque}
          style={{
            border: `1px solid ${frame.bd}`,
            fontSize: sm ? 9.5 : 11,
            color: (card.damage ?? 0) > 0 ? 'var(--opp)' : '#f0e4b8',
          }}
        >
          {card.power}/{card.toughness}
        </div>
      )}

      {card.summoningSick && (
        <div className={styles.summoningOverlay}>
          <span className={styles.summoningLabel}>SUMMONING</span>
        </div>
      )}
    </div>
  );
}

export const FieldCard = memo(FieldCardInner);
