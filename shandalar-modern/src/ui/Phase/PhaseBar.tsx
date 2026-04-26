import styles from './PhaseBar.module.css';

export const PHASE_SEQ = [
  'UNTAP', 'UPKEEP', 'DRAW',
  'MAIN_1',
  'COMBAT_BEGIN', 'COMBAT_ATTACKERS', 'COMBAT_BLOCKERS', 'COMBAT_DAMAGE', 'COMBAT_END',
  'MAIN_2', 'END', 'CLEANUP',
] as const;

export type Phase = typeof PHASE_SEQ[number];

const PHASE_LBL: Record<Phase, string> = {
  UNTAP: 'Untap', UPKEEP: 'Upkeep', DRAW: 'Draw',
  MAIN_1: 'Main 1',
  COMBAT_BEGIN: 'Begin Combat', COMBAT_ATTACKERS: 'Declare Attackers',
  COMBAT_BLOCKERS: 'Declare Blockers', COMBAT_DAMAGE: 'Damage', COMBAT_END: 'End Combat',
  MAIN_2: 'Main 2', END: 'End', CLEANUP: 'Cleanup',
};

const COMBAT_PHASES = new Set<Phase>([
  'COMBAT_BEGIN', 'COMBAT_ATTACKERS', 'COMBAT_BLOCKERS', 'COMBAT_DAMAGE', 'COMBAT_END',
]);

interface PhaseBarProps {
  phase: string;
}

export function PhaseBar({ phase }: PhaseBarProps) {
  return (
    <div className={styles.bar}>
      {PHASE_SEQ.map(p => {
        const active = p === phase;
        const combat = COMBAT_PHASES.has(p);
        const variantClass = combat ? styles.pillCombat : styles.pillBrass;
        return (
          <div
            key={p}
            className={`${styles.pill} ${active ? variantClass : ''}`}
            aria-current={active ? 'step' : undefined}
          >
            {PHASE_LBL[p]}
          </div>
        );
      })}
    </div>
  );
}
