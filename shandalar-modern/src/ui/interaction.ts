import type { CardData } from './Card/types';

export type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'selecting-target'; sourceIid: string; sourceCard: CardData }
  | { kind: 'selecting-attackers'; chosen: Set<string> }
  | { kind: 'defending'; blocks: Map<string, string> };

export interface UISlice {
  mode: InteractionMode;
  hoverTarget: string | null;
}

/** Returns true if the card text implies it needs a target. */
export function needsTarget(card: CardData): boolean {
  return !!(card.text?.toLowerCase().includes('target') || card.text?.toLowerCase().includes('any target'));
}
