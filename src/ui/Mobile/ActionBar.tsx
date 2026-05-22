import type { CardData } from '../Card/types';
import s from './styles.module.css';

type SelZone = 'hand' | 'bf';
export interface Selection {
  iid: string;
  zone: SelZone;
  card: CardData;
}

interface ActionBarProps {
  sel: Selection | null;
  onCast: () => void;
  onActivate: () => void;
  onCancel: () => void;
  onPass: () => void;
  onEnd: () => void;
  isPlayerPriority?: boolean;
}

export function ActionBar({ sel, onCast, onActivate, onCancel, onPass, onEnd, isPlayerPriority = true }: ActionBarProps) {
  if (!sel) {
    return (
      <div className={s.actionBar} style={{ borderTop: '1px solid rgba(180,140,70,.3)' }}>
        <button
          className={s.actionBtn}
          onClick={onPass}
          style={{
            background: isPlayerPriority
              ? 'rgba(60,50,20,.85)'
              : 'rgba(30,30,30,.6)',
            border: `1px solid ${isPlayerPriority ? 'rgba(200,160,60,.6)' : 'rgba(80,80,80,.35)'}`,
            color: isPlayerPriority ? '#f0d060' : '#555555',
            opacity: isPlayerPriority ? 1 : 0.55,
            transition: 'all 0.15s',
          }}
        >
          {isPlayerPriority ? 'Pass Priority' : 'Waiting...'}
        </button>
        <button
          className={s.actionBtn}
          onClick={onEnd}
          style={{
            background: 'linear-gradient(180deg, #3a2018, #1c0e0a)',
            border: '1px solid #a85030',
            color: 'var(--brass-hi)',
            boxShadow: '0 0 8px rgba(168,80,48,.55), inset 0 1px 0 rgba(255,255,255,.07)',
          }}
        >
          End Turn ▸
        </button>
      </div>
    );
  }

  if (sel.zone === 'hand') {
    const card = sel.card;
    const isLand = card.type === 'Land';
    const verb = isLand ? '▸ PLAY' : '✦ CAST';
    const accent = isLand ? 'var(--you)' : 'var(--brass)';
    const castBg = isLand
      ? 'linear-gradient(180deg, #2a4a18, #14280a)'
      : 'linear-gradient(180deg, #5a4218, #2a1e0a)';
    const castColor = isLand ? 'var(--you-faint)' : 'var(--brass-hi)';

    return (
      <div
        className={s.actionBar}
        style={{
          gap: 5,
          padding: '8px 8px',
          borderTop: `1.5px solid ${accent}88`,
          boxShadow: `inset 0 10px 22px -10px ${accent}40`,
        }}
      >
        <button
          className={`${s.actionBtn} ${s.actionBtnCast}`}
          onClick={onCast}
          style={{
            background: castBg,
            border: `1.5px solid ${accent}`,
            color: castColor,
          }}
        >
          <span style={{ fontSize: 13, letterSpacing: 1.2 }}>{verb}</span>
          <span className={s.actionBtnCastName}>{card.name}</span>
        </button>
        <button
          className={s.actionBtn}
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid rgba(120,90,40,.5)',
            color: 'var(--ink-parchment)',
            flex: 1,
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Battlefield selection
  return (
    <div className={s.actionBar} style={{ borderTop: '1px solid rgba(196,160,64,.4)' }}>
      <button
        className={s.actionBtn}
        onClick={onActivate}
        style={{
          flex: 3,
          background: 'linear-gradient(180deg, #4a3a18, #2a1e0a)',
          border: '1px solid var(--brass)',
          color: 'var(--brass-hi)',
          boxShadow: '0 0 8px rgba(196,160,64,.55), inset 0 1px 0 rgba(255,255,255,.07)',
        }}
      >
        ⚡ Activate
      </button>
      <button
        className={s.actionBtn}
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: '1px solid rgba(120,90,40,.5)',
          color: 'var(--ink-parchment)',
        }}
      >
        Cancel
      </button>
    </div>
  );
}
