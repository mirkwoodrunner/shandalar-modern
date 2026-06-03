import { isLand, isInst } from '../../engine/DuelCore.js';
import { ActionButton } from './ActionButton';

const MAIN_PHASES = new Set(['MAIN_1', 'MAIN_2']);

interface ActionBarProps {
  phase: string;
  hasSelection: boolean;
  selectedCard?: { type?: string; subtype?: string; name?: string } | null;
  isPlayerTurn?: boolean;
  isWaitingForAI?: boolean;
  priorityWindowOpen?: boolean;
  onCast?: () => void;
  onPassPriority?: () => void;
  onCancel?: () => void;
  onEndTurn?: () => void;
  onDoneBlocking?: () => void;
  compact?: boolean;
  canUndo?: boolean;
  onUndo?: () => void;
}

export function ActionBar({
  phase,
  hasSelection,
  selectedCard,
  isPlayerTurn = true,
  isWaitingForAI = false,
  priorityWindowOpen = false,
  onCast,
  onPassPriority,
  onCancel,
  onEndTurn,
  onDoneBlocking,
  compact = false,
  canUndo,
  onUndo,
}: ActionBarProps) {
  const inMain = MAIN_PHASES.has(phase);

  const passPriorityLabel = isWaitingForAI ? 'Waiting...' : 'Pass Priority';
  // PP is disabled when: player already passed in priority window (Waiting), OR
  // it's the AI turn AND no priority window is open (no valid reason to press PP).
  // PP remains enabled on AI turn when a priority window IS open — the player
  // must still pass for 'p' to close the window (PASS_PRIORITY requires both sides).
  const passPriorityDisabled = isWaitingForAI || (!isPlayerTurn && !priorityWindowOpen);

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

      {hasSelection && isPlayerTurn && (inMain || (priorityWindowOpen && selectedCard && isInst(selectedCard))) && (
        <ActionButton variant="primary" onClick={onCast} data-testid="cast-button">
          {selectedCard && isLand(selectedCard) ? '⧁ Play' : '✦ Cast'}{selectedCard ? ` ${selectedCard.name}` : ' Spell'}
        </ActionButton>
      )}
      {hasSelection && (
        <ActionButton variant="ghost" onClick={onCancel} data-testid="cancel-button">
          Cancel
        </ActionButton>
      )}

      {canUndo && (
        <ActionButton variant="ghost" onClick={onUndo} data-testid="undo-taps-button">
          {'↩'} Undo Taps
        </ActionButton>
      )}

      <ActionButton
        variant="default"
        onClick={passPriorityDisabled ? undefined : onPassPriority}
        disabled={passPriorityDisabled}
        data-testid="pass-priority-button"
      >
        {passPriorityLabel}
      </ActionButton>

      {phase === 'COMBAT_BLOCKERS' && !isPlayerTurn && (
        <ActionButton
          variant="primary"
          onClick={onDoneBlocking}
          data-testid="done-blocking-button"
        >
          Done Blocking {'✓'}
        </ActionButton>
      )}

      <ActionButton
        variant="end"
        onClick={!isPlayerTurn ? undefined : onEndTurn}
        disabled={!isPlayerTurn}
        data-testid="end-turn-button"
      >
        End Turn {'→'}
      </ActionButton>
    </div>
  );
}
