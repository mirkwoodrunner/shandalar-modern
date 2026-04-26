import { ActionButton } from './ActionButton';

const MAIN_PHASES = new Set(['MAIN_1', 'MAIN_2']);

interface ActionBarProps {
  phase: string;
  hasSelection: boolean;
  onCast?: () => void;
  onPassPriority?: () => void;
  onCancel?: () => void;
  onEndTurn?: () => void;
}

export function ActionBar({
  phase,
  hasSelection,
  onCast,
  onPassPriority,
  onCancel,
  onEndTurn,
}: ActionBarProps) {
  const inMain = MAIN_PHASES.has(phase);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: '10px 16px',
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
          ? Cast Spell
        </ActionButton>
      )}
      {hasSelection && (
        <ActionButton variant="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
      )}
      <ActionButton variant="default" onClick={onPassPriority}>
        Pass Priority
      </ActionButton>
      <ActionButton variant="end" onClick={onEndTurn}>
        End Turn ?
      </ActionButton>
    </div>
  );
}
