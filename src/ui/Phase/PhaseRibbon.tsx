const PHASE_DISPLAY: Record<string, string> = {
  MAIN_1: 'Main · 1', MAIN_2: 'Main · 2',
  UNTAP: 'Untap', UPKEEP: 'Upkeep', DRAW: 'Draw',
  COMBAT_BEGIN: 'Begin Combat', COMBAT_ATTACKERS: 'Declare Attackers',
  COMBAT_BLOCKERS: 'Declare Blockers', COMBAT_DAMAGE: 'Combat Damage',
  COMBAT_END: 'End of Combat', END: 'End Step', CLEANUP: 'Cleanup',
};

interface PhaseRibbonProps {
  phase: string;
}

export function PhaseRibbon({ phase }: PhaseRibbonProps) {
  const label = PHASE_DISPLAY[phase] ?? phase;

  return (
    <div style={{
      flexShrink: 0,
      position: 'relative',
      height: 40,
      background: 'linear-gradient(180deg, rgba(60,20,10,.4), rgba(20,16,8,.6), rgba(20,40,10,.4))',
      borderTop: '1px solid rgba(180,140,70,.4)',
      borderBottom: '1px solid rgba(180,140,70,.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: 'inset 0 0 16px rgba(0,0,0,.7)',
    }}>
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: '50%',
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(196,160,64,.5), transparent)',
      }} />

      <div style={{
        padding: '5px 22px',
        background: 'linear-gradient(180deg, #2a1c10, var(--bg-panel))',
        border: '1px solid #8a6830',
        borderRadius: 3,
        boxShadow: '0 0 16px rgba(196,160,64,.3), inset 0 1px 0 rgba(255,220,140,.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
      }}>
        <span style={{
          fontSize: 9, color: 'var(--ink-faint)',
          fontFamily: 'var(--font-display)', letterSpacing: 2,
        }}>PHASE</span>
        <span style={{ fontSize: 10, color: 'var(--ink-dim)' }}>{'›'}</span>
        <span style={{
          fontSize: 13,
          fontFamily: 'var(--font-display)',
          color: 'var(--brass-hi)',
          fontWeight: 700,
          letterSpacing: 1.5,
          textShadow: '0 0 8px rgba(255,224,128,.5)',
          textTransform: 'uppercase',
        }}>
          {label}
        </span>
      </div>
    </div>
  );
}
