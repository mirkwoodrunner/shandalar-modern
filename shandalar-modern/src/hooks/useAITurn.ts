import { useEffect, useRef } from 'react';
import type { DuelState, LogEntry } from '../types/duel';
import type { CardData } from '../ui/Card/types';

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface AITurnOptions {
  state: DuelState;
  setState: React.Dispatch<React.SetStateAction<DuelState>>;
  flashCard: (iids: string[]) => void;
  setLandPlayed: (v: boolean) => void;
}

export function useAITurn({ state, setState, flashCard, setLandPlayed }: AITurnOptions) {
  const running = useRef(false);

  useEffect(() => {
    if (state.active !== 'o') return;
    if (running.current) return;
    running.current = true;

    let cancelled = false;

    async function run() {
      const addLog = (entry: LogEntry) =>
        setState(s => ({ ...s, log: [...s.log, entry].slice(-200) }));

      const setPhase = (phase: string) =>
        setState(s => ({ ...s, phase }));

      // UNTAP — untap all opp permanents
      await delay(350);
      if (cancelled) return;
      setState(s => ({
        ...s,
        phase: 'UNTAP',
        o: { ...s.o, bf: s.o.bf.map(c => ({ ...c, tapped: false })) },
      }));

      await delay(200);
      if (cancelled) return;
      setPhase('UPKEEP');

      await delay(200);
      if (cancelled) return;
      setPhase('DRAW');
      setState(s => ({ ...s, o: { ...s.o, lib: Math.max(0, s.o.lib - 1) } }));

      // MAIN_1 — play land or cast creature
      await delay(400);
      if (cancelled) return;
      setPhase('MAIN_1');
      addLog({ kind: 'turn', text: `Turn ${state.turn} — Opponent` });

      // Try to play a land
      await delay(500);
      if (cancelled) return;
      setState(s => {
        const land = (s.o.hand as CardData[]).find(c => c.type === 'Land');
        if (!land) return s;
        addLog({ kind: 'opp_play', text: `Opponent plays ${land.name}.` });
        return {
          ...s,
          o: {
            ...s.o,
            hand: (s.o.hand as CardData[]).filter(c => c.iid !== land.iid),
            bf: [...s.o.bf, { ...land, tapped: true }],
          },
        };
      });

      // Try to cast a creature
      await delay(600);
      if (cancelled) return;
      setState(s => {
        const creature = (s.o.hand as CardData[]).find(c => c.type === 'Creature');
        if (!creature) return s;
        flashCard([creature.iid]);
        return s;
      });
      await delay(600);
      if (cancelled) return;
      setState(s => {
        const creature = (s.o.hand as CardData[]).find(c => c.type === 'Creature');
        if (!creature) return s;
        addLog({ kind: 'opp_play', text: `Opponent casts ${creature.name}.` });
        return {
          ...s,
          o: {
            ...s.o,
            hand: (s.o.hand as CardData[]).filter(c => c.iid !== creature.iid),
            bf: [...s.o.bf, { ...creature, summoningSick: true }],
          },
        };
      });

      // COMBAT
      await delay(400);
      if (cancelled) return;
      setPhase('COMBAT_BEGIN');

      await delay(300);
      if (cancelled) return;
      setPhase('COMBAT_ATTACKERS');

      // Pick attackers: untapped non-sick creatures
      await delay(800);
      if (cancelled) return;
      let attackerIds: string[] = [];
      setState(s => {
        const attackers = s.o.bf.filter(
          c => c.type === 'Creature' && !c.tapped && !c.summoningSick
        );
        attackerIds = attackers.map(c => c.iid);
        if (attackers.length > 0) {
          addLog({ kind: 'opp_play', text: `Opponent attacks with ${attackers.map(c => c.name).join(', ')}.` });
        }
        return { ...s, attackers: attackerIds };
      });

      await delay(400);
      if (cancelled) return;
      setPhase('COMBAT_BLOCKERS');

      await delay(300);
      if (cancelled) return;
      setPhase('COMBAT_DAMAGE');

      // Apply damage
      await delay(600);
      if (cancelled) return;
      setState(s => {
        const totalDmg = s.o.bf
          .filter(c => attackerIds.includes(c.iid))
          .reduce((sum, c) => sum + (c.power ?? 0), 0);
        if (totalDmg === 0) return s;
        const newLife = Math.max(0, s.p.life - totalDmg);
        addLog({ kind: 'damage', text: `You take ${totalDmg} damage. (${newLife} life)` });
        return {
          ...s,
          p: { ...s.p, life: newLife, lifeAnim: 'damage' },
        };
      });
      setTimeout(() => setState(s => ({ ...s, p: { ...s.p, lifeAnim: null } })), 500);

      await delay(300);
      if (cancelled) return;
      setPhase('COMBAT_END');
      setState(s => ({ ...s, attackers: [] }));

      // MAIN_2 → END → CLEANUP
      for (const phase of ['MAIN_2', 'END', 'CLEANUP'] as const) {
        await delay(250);
        if (cancelled) return;
        setPhase(phase);
      }

      // Hand off to player
      await delay(350);
      if (cancelled) return;
      running.current = false;
      setLandPlayed(false);

      setState(s => ({
        ...s,
        active: 'p',
        turn: s.turn + 1,
        phase: 'UNTAP',
        attackers: [],
        // Untap player permanents
        p: {
          ...s.p,
          bf: s.p.bf.map(c => ({ ...c, tapped: false, summoningSick: false })),
        },
      }));

      // Quick player UNTAP→UPKEEP→DRAW
      await delay(300);
      if (cancelled) return;
      setState(s => ({ ...s, phase: 'UPKEEP' }));
      await delay(200);
      if (cancelled) return;
      setState(s => ({
        ...s,
        phase: 'DRAW',
        p: { ...s.p, lib: Math.max(0, s.p.lib - 1) },
      }));
      await delay(400);
      if (cancelled) return;
      setState(s => {
        addLog({ kind: 'phase', text: `Turn ${s.turn} — Your turn.` });
        return { ...s, phase: 'MAIN_1' };
      });
    }

    run().finally(() => { running.current = false; });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active, state.turn]);
}
