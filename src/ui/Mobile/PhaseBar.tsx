import { useRef, useEffect } from 'react';
import { PHASE_SEQUENCE } from '../../engine/phases.js';
import s from './styles.module.css';

const SHORT: Record<string, string> = {
  UNTAP: 'UNT', UPKEEP: 'UPK', DRAW: 'DRW',
  MAIN_1: 'M1', COMBAT_BEGIN: 'CB', COMBAT_ATTACKERS: 'ATK',
  COMBAT_BLOCKERS: 'BLK', COMBAT_DAMAGE: 'DMG', COMBAT_END: 'CE',
  MAIN_2: 'M2', END: 'END', CLEANUP: 'CLN',
};

interface PhaseBarProps {
  phase: string;
}

export function PhaseBar({ phase }: PhaseBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const active = activeRef.current;
    if (!bar || !active) return;
    const left = active.offsetLeft - bar.offsetWidth / 2 + active.offsetWidth / 2;
    bar.scrollTo({ left, behavior: 'smooth' });
  }, [phase]);

  return (
    <div ref={barRef} className={s.phaseBar}>
      {PHASE_SEQUENCE.map((p: string) => {
        const active = p === phase;
        const combat = p.startsWith('COMBAT');
        const cls = active
          ? `${s.phasePill} ${combat ? s.phasePillCombat : s.phasePillActive}`
          : s.phasePill;
        return (
          <div
            key={p}
            ref={active ? activeRef : undefined}
            className={cls}
            aria-current={active ? 'step' : undefined}
          >
            {SHORT[p] ?? p}
          </div>
        );
      })}
    </div>
  );
}
