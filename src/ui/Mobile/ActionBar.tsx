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
  isPlayerTurn?: boolean;
  isWaitingForAI?: boolean;
  priorityWindowOpen?: boolean;
  canUndo?: boolean;
  onUndo?: () => void;
  phase?: string;
  targetingFor?: string | null;
  pendingTarget?: string | null;
  pendingBlocker?: string | null;
  blockers?: Record<string, string>;
}

export function ActionBar({ sel, onCast, onActivate, onCancel, onPass, onEnd, isPlayerTurn = true, isWaitingForAI = false, priorityWindowOpen = false, canUndo, onUndo, phase, targetingFor, pendingTarget, pendingBlocker, blockers }: ActionBarProps) {
  const ppDisabled = isWaitingForAI || (!isPlayerTurn && !priorityWindowOpen);
  const ppLabel = isWaitingForAI ? 'Waiting...' : 'Pass Priority';

  if (targetingFor) {
    const hasTarget = !!pendingTarget;
    return (
      <div
        data-testid="action-bar"
        className={s.actionBar}
        style={{
          gap: 5,
          padding: '8px 8px',
          borderTop: '1.5px solid var(--opp)88',
          boxShadow: 'inset 0 10px 22px -10px rgba(232,84,32,.3)',
        }}
      >
        <button
          className={`${s.actionBtn} ${s.actionBtnCast}`}
          onClick={hasTarget ? onCast : undefined}
          disabled={!hasTarget}
          style={{
            background: hasTarget
              ? 'linear-gradient(180deg, #5a2818, #2a0e0a)'
              : 'rgba(30,20,10,.7)',
            border: `1.5px solid ${hasTarget ? 'var(--opp)' : 'rgba(80,60,40,.4)'}`,
            color: hasTarget ? '#ff9060' : '#664433',
            opacity: hasTarget ? 1 : 0.65,
            cursor: hasTarget ? 'pointer' : 'not-allowed',
          }}
        >
          <span style={{ fontSize: 11 }}>{'\u{1F3AF}'}</span>
          <span style={{ fontSize: 11, letterSpacing: 0.8 }}>
            {hasTarget ? 'CAST' : 'SELECT TARGET'}
          </span>
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

  if (phase === 'COMBAT_BLOCKERS' && isPlayerTurn) {
    const blockerCount = Object.keys(blockers ?? {}).length;
    return (
      <div
        data-testid="action-bar"
        className={s.actionBar}
        style={{
          gap: 5,
          padding: '8px 8px',
          borderTop: '1.5px solid rgba(80,120,200,.5)',
          boxShadow: 'inset 0 10px 22px -10px rgba(80,120,200,.25)',
        }}
      >
        <div
          style={{
            flex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            color: 'rgba(140,180,255,.85)',
            fontSize: 9,
            fontFamily: 'var(--font-display)',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ fontSize: 10 }}>
            {pendingBlocker ? '▶ PICK ATTACKER' : 'PICK BLOCKER'}
          </span>
          {blockerCount > 0 && (
            <span style={{ color: 'rgba(120,160,255,.6)', fontSize: 8 }}>
              {blockerCount} assigned
            </span>
          )}
        </div>
        <button
          className={s.actionBtn}
          onClick={onEnd}
          style={{
            flex: 2,
            background: 'linear-gradient(180deg, #18283a, #0a1420)',
            border: '1px solid rgba(80,120,200,.7)',
            color: 'rgba(140,180,255,.9)',
            boxShadow: '0 0 8px rgba(80,120,200,.4)',
          }}
        >
          Done {'▸'}
        </button>
      </div>
    );
  }

  if (!sel) {
    return (
      <div data-testid="action-bar" className={s.actionBar} style={{ borderTop: '1px solid rgba(180,140,70,.3)' }}>
        {canUndo && (
          <button
            className={s.actionBtn}
            onClick={onUndo}
            data-testid="undo-taps-button"
            style={{
              background: 'transparent',
              border: '1px solid rgba(120,90,40,.5)',
              color: 'var(--ink-parchment)',
            }}
          >
            {'↩'} Undo Taps
          </button>
        )}
        <button
          className={s.actionBtn}
          onClick={ppDisabled ? undefined : onPass}
          disabled={ppDisabled}
          style={{
            background: ppDisabled
              ? 'rgba(30,30,30,.6)'
              : 'rgba(60,50,20,.85)',
            border: `1px solid ${ppDisabled ? 'rgba(80,80,80,.35)' : 'rgba(200,160,60,.6)'}`,
            color: ppDisabled ? '#555555' : '#f0d060',
            opacity: ppDisabled ? 0.55 : 1,
            cursor: ppDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {ppLabel}
        </button>
        <button
          className={s.actionBtn}
          onClick={!isPlayerTurn ? undefined : onEnd}
          disabled={!isPlayerTurn}
          style={{
            background: 'linear-gradient(180deg, #3a2018, #1c0e0a)',
            border: '1px solid #a85030',
            color: 'var(--brass-hi)',
            opacity: !isPlayerTurn ? 0.4 : 1,
            cursor: !isPlayerTurn ? 'not-allowed' : 'pointer',
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
        data-testid="action-bar"
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
    <div data-testid="action-bar" className={s.actionBar} style={{ borderTop: '1px solid rgba(196,160,64,.4)' }}>
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
