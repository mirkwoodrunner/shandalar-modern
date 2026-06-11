// src/types/duel.ts
// Canonical types for duel configuration.
// Imported by DuelScreen.tsx, DuelScreenMobile.tsx, and useDuelController.ts.
// Do not duplicate these in any other file.

export interface DuelRuleset {
  name: string;
  startingLife: number;
  manaBurn?: boolean;
  stackType?: string;
  deathtouch?: boolean;
  exileZone?: boolean;
}

export interface DuelConfig {
  pDeckIds: string[];
  oppArchKey: string;
  ruleset: DuelRuleset;
  overworldHP?: number;
  castleMod?: { name: string; desc: string } | null;
  anteEnabled?: boolean;
  context?: string;
  sandbox?: boolean;
  forcedHandIds?: string[];
  oppLife?: number | null;
  useGemini?: boolean;
}
