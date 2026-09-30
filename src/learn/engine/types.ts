// src/learn/engine/types.ts
// Learn Mode exercise data types. Pure type declarations, no runtime code.

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

// attacking is valid only on the opponent's battlefield in a COMBAT_BLOCKERS
// setup: the runner declares that creature as an attacker before handing the
// board over. Anywhere else it is a build error (LEARN_ATTACKING_*).
export type CardSpec = string | { id: string; tapped?: boolean; summoningSick?: boolean; attacking?: boolean };

export type SideSetup = { life?: number; hand?: CardSpec[]; bf?: CardSpec[] };

// Which card database every id in this setup resolves against. Omitted means
// 'shandalar' -- the CARD_DB behaviour every exercise had before L4a, unchanged.
// 'learn' selects CARD_DB_LEARN (src/data/cardsLearn.js), which is self-contained:
// a setup that opts in resolves its lands there too.
export type PoolName = 'shandalar' | 'learn';

export type PuzzleSetup = {
  // COMBAT_BLOCKERS (L5 slice 1): the opponent is the active player, its
  // attackers (flagged `attacking` in o.bf) are already declared, and the
  // learner declares blockers.
  phase: 'MAIN_1' | 'COMBAT_ATTACKERS' | 'COMBAT_BLOCKERS';
  pool?: PoolName;
  p: SideSetup;
  o: SideSetup;
};

export type ActionKind = 'TAP_LAND' | 'PLAY_LAND' | 'CAST_SPELL' | 'UNDO_MANA_TAPS' | 'DECLARE_ATTACKER' | 'DECLARE_BLOCKER';

export type Step =
  // color picks which mana a multi-colour land makes. Omitted, the land makes
  // its first listed colour, which is the only option for a basic.
  | { type: 'TAP_LAND'; iid: string; color?: Color }
  | { type: 'PLAY_LAND'; iid: string }
  | { type: 'CAST_SPELL'; iid: string; tgt?: string }
  | { type: 'UNDO_MANA_TAPS' }
  | { type: 'ATTACK'; attackers: string[] }
  // The whole block assignment, committed at once like ATTACK. An empty list
  // is a legal line: "don't block".
  | { type: 'BLOCK'; blocks: BlockPair[] };

// Combat goals (L5 slice 1). Graded once combat has resolved. Creature goals
// are keyed by the deterministic setup iid (o-bf-0, p-bf-1), not the card id,
// because a board can hold two copies of one card.
export type CombatGoal =
  | { kind: 'SURVIVE_COMBAT' }
  | { kind: 'LIFE_AT_LEAST'; amount: number }
  | { kind: 'CREATURE_DIES'; iid: string }
  | { kind: 'CREATURE_SURVIVES'; iid: string };

export type Goal =
  | { kind: 'MANA_IN_POOL'; color: Color; amount: number }
  | { kind: 'CARD_ON_BATTLEFIELD'; cardId: string }
  | { kind: 'OPPONENT_DEAD_THIS_TURN' }
  | CombatGoal
  // One level deep, combat goals only.
  | { kind: 'ALL_OF'; goals: CombatGoal[] };

type ExerciseBase = {
  id: string;
  // Permanent save key. Set once at authoring time to the exercise's id at
  // that moment, then frozen -- id may be renumbered (L2), stableId never
  // is. See docs/LEARN_L1_SPEC.md section 1.
  stableId: string;
  unit: string;
  skill: string;
  title: string;
  prompt: string;
  hint: string;
  explanation: string;
};

export type WrongLine = {
  steps: Step[];
  // goalNotMet: a BLOCK line that is legal but loses. Its reason is the combat
  // summary resolveBlocks produced.
  expect: 'rejected' | 'notLethal' | 'goalNotMet';
  reasonIncludes: string;
};

export type EngineExercise = ExerciseBase & {
  kind: 'engine';
  // A first-step exercise where every legal line is correct by design.
  // Silences the puzzleChecker 'discriminating' error for this exercise.
  guided?: boolean;
  setup: PuzzleSetup;
  allowed: ActionKind[];
  goal: Goal;
  highlight?: string[];
  solutions: Step[][];
  wrongLines?: WrongLine[];
};

export type MultiSelectExercise = ExerciseBase & {
  kind: 'multiSelect';
  lands: string[];
  options: string[];
  answer: string[];
};

export type Exercise = EngineExercise | MultiSelectExercise;

// listed: false keeps a unit off the unit list (and away from the bespoke
// lesson player) while tests, learn:check and ?scenario= still see it.
// Omitted means listed.
export type Unit = { id: string; title: string; listed?: boolean; exercises: Exercise[] };

export type ActionResult = { ok: true; state: any } | { ok: false; reason: string };

export type BlockPair = { blockerIid: string; attackerIid: string };

export type AttackResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      lethal: boolean;
      outcomes: number;
      worstCase: { blocks: BlockPair[]; oppLifeAfter: number; finalState: any };
      summary: string;
    };

export type BlockResult =
  | { ok: false; reason: string }
  | { ok: true; finalState: any; blocks: BlockPair[]; summary: string };
