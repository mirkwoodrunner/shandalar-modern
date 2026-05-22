import { isLand } from '../../engine/DuelCore.js';
import { ActionButton } from './ActionButton';

const MAIN_PHASES = new Set(['MAIN_1', 'MAIN_2']);

interface ActionBarProps {
  phase: string;
  hasSelection: boolean;
  selectedCard?: { type?: string; subtype?: string; name?: string } | null;
  isPlayerPriority?: boolean;
  onCast?: () => void;
  onPassPriority?: () => void;
  onCancel?: () => void;
  onEndTurn?: () => void;
  compact?: boolean;
}

export function ActionBar({
  phase,
  hasSelection,
  selectedCard,
  isPlayerPriority = true,
  onCast,
  onPassPriority,
  onCancel,
  onEndTurn,
  compact = false,
}: ActionBarProps) {
  const inMain = MAIN_PHASES.has(phase);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 6 : 10,
      padding: compact ? '6px 10px' : '10px 16px',
      background: 'linear-gradient(180deg, var(--bg-panel-hi) 0%, #0c0806 100%)',
      borderTop: '1px solid rgba(180,140,70,.25)',
      borderBottom: '1px solid rgba(180,140,70,.25)',
      boxShadow: 'inset 0 1px 0 rgba(180,140,70,.1), 0 2px 8px rgba(0,0,0,.6)',
      position: 'relative',
      flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 200, height: 2,
        background: 'linear-gradient(90deg, transparent, var(--brass), transparent)',
      }} />

      {hasSelection && inMain && (
        <ActionButton variant="primary" onClick={onCast}>
          {selectedCard && isLand(selectedCard) ? '⧁ Play' : '✦ Cast'}{selectedCard ? ` ${selectedCard.name}` : ' Spell'}
        </ActionButton>
      )}
      {hasSelection && (
        <ActionButton variant="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div style={{
          fontSize: 10,
          fontFamily: 'var(--font-display)',
          color: isPlayerPriority ? '#c0a040' : '#606060',
          letterSpacing: 0.5,
        }}>
          {isPlayerPriority ? 'YOUR PRIORITY' : 'WAITING...'}
        </div>
        <button
          onClick={onPassPriority}
          style={{
            background: isPlayerPriority ? 'rgba(180,140,40,.25)' : 'rgba(60,60,60,.2)',
            border: `1.5px solid ${isPlayerPriority ? 'rgba(200,160,60,.6)' : 'rgba(100,100,100,.3)'}`,
            color: isPlayerPriority ? '#f0d060' : '#606060',
            opacity: isPlayerPriority ? 1 : 0.5,
            cursor: isPlayerPriority ? 'pointer' : 'default',
            padding: '8px 18px',
            borderRadius: 3,
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            transition: 'all var(--t-fast)',
            textShadow: '0 1px 2px rgba(0,0,0,.7)',
          }}
        >
          Pass Priority
        </button>
      </div>

      <ActionButton variant="end" onClick={onEndTurn}>
        End Turn {'→'}
      </ActionButton>
    </div>
  );
}
