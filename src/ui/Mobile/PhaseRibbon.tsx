import s from './styles.module.css';

const LONG: Record<string, string> = {
  UNTAP: 'Untap', UPKEEP: 'Upkeep', DRAW: 'Draw',
  MAIN_1: 'Main · 1', COMBAT_BEGIN: 'Begin Combat', COMBAT_ATTACKERS: 'Declare Attackers',
  COMBAT_AFTER_ATTACKERS: 'After Attackers', COMBAT_BLOCKERS: 'Declare Blockers',
  COMBAT_AFTER_BLOCKERS: 'After Blockers', COMBAT_DAMAGE: 'Combat Damage', COMBAT_END: 'End of Combat',
  MAIN_2: 'Main · 2', END: 'End Step', CLEANUP: 'Cleanup',
};

interface PhaseRibbonProps {
  phase: string;
}

export function PhaseRibbon({ phase }: PhaseRibbonProps) {
  return (
    <div className={s.phaseRibbon}>
      <span className={s.ribbonLabel}>PHASE</span>
      <span className={s.ribbonSep}>·</span>
      <span className={s.ribbonCurrent}>{LONG[phase] ?? phase}</span>
    </div>
  );
}
