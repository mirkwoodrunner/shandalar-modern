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

/**
 * What a scenario's lesson chrome is handed when the duel screen renders it.
 * The screen supplies the LIVE GameState here -- the lesson chrome never keeps
 * its own copy, so there is only ever one answer to "what is on the board".
 */
export interface ScenarioPanelContext {
  /** The live GameState from DuelCore. Read-only to the panel. */
  state: unknown;
  /** True when the scenario offers this action kind. See DuelConfig.allowedActions. */
  isActionAllowed: (kind: string) => boolean;
  /** True on the mobile layout, so the chrome can size itself for the HUD. */
  isMobile: boolean;
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
  /** Snapshot of the player's binder card IDs (Ring of Ma'ruf's "outside the game"). */
  binderIds?: string[];

  // -- Scenario mode (Learn Mode L3) -----------------------------------------
  // All three are optional and absent on every campaign/sandbox path. With
  // `initialState` absent and `scenario` unset, every duel behaves exactly as
  // it did before scenario mode existed.

  /**
   * A pre-built GameState to start the duel from, in place of the state
   * `buildDuelState` would construct from `pDeckIds`/`oppArchKey`. Supplied by
   * Learn Mode's `buildPuzzleState`. Typed `unknown` because GameState has no
   * TypeScript declaration yet -- DuelCore.js is untyped JavaScript.
   */
  initialState?: unknown;

  /**
   * Marks a non-campaign duel: campaign and ante chrome are suppressed, the
   * campaign save layer is not written, the AI loop is suppressed unless the
   * scenario opts back into it, and only `allowedActions` are offered.
   */
  scenario?: boolean;

  /**
   * The exercise's `allowed` list -- the action kinds a scenario offers the
   * player (e.g. TAP_LAND, PLAY_LAND, CAST_SPELL, UNDO_MANA_TAPS,
   * DECLARE_ATTACKER). Omitted in scenario mode means "nothing is restricted";
   * an empty array means "no player action is offered".
   *
   * This restricts what the UI OFFERS. It is not a rules check -- DuelCore
   * remains the sole authority on whether an action is legal.
   */
  allowedActions?: string[];

  /**
   * Called when a scenario refuses an action because its kind is not in
   * `allowedActions`. Lets the lesson chrome say "that isn't part of this
   * lesson" instead of the click silently doing nothing. Never called outside
   * scenario mode.
   */
  onActionRefused?: (kind: string) => void;
}
