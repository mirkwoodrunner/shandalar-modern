import type { CardData } from '../ui/Card/types';
import type { ManaSym } from '../ui/Card/types';

export type Side = 'p' | 'o';

export type LogKind = 'turn' | 'phase' | 'play' | 'opp_play' | 'damage' | 'heal' | 'info' | 'system';

export interface LogEntry {
  kind: LogKind;
  text: string;
}

export interface PlayerState {
  life: number;
  lifeAnim: 'damage' | 'heal' | null;
  max: number;
  mana: Record<ManaSym, number>;
  lib: number;
  gy: number;
  exile: number;
  hand: CardData[];
  bf: CardData[];
}

export interface DuelState {
  turn: number;
  active: Side;
  phase: string;
  selCard: string | null;
  selTgt: string | null;
  attackers: string[];
  ruleset: { name: string; startingLife: number; manaBurn: boolean };
  p: PlayerState;
  o: PlayerState;
  log: LogEntry[];
}
