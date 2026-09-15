// src/learn/engine/types.ts
// Learn Mode exercise data types. Pure type declarations, no runtime code.

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

export type CardSpec = string | { id: string; tapped?: boolean; summoningSick?: boolean };

export type SideSetup = { life?: number; hand?: CardSpec[]; bf?: CardSpec[] };

export type PuzzleSetup = {
  phase: 'MAIN_1' | 'COMBAT_ATTACKERS';
  p: SideSetup;
  o: SideSetup;
};

export type ActionKind = 'TAP_LAND' | 'PLAY_LAND' | 'CAST_SPELL' | 'UNDO_MANA_TAPS' | 'DECLARE_ATTACKER';

export type Step =
  | { type: 'TAP_LAND'; iid: string }
  | { type: 'PLAY_LAND'; iid: string }
  | { type: 'CAST_SPELL'; iid: string; tgt?: string }
  | { type: 'UNDO_MANA_TAPS' }
  | { type: 'ATTACK'; attackers: string[] };

export type Goal =
  | { kind: 'MANA_IN_POOL'; color: Color; amount: number }
  | { kind: 'CARD_ON_BATTLEFIELD'; cardId: string }
  | { kind: 'OPPONENT_DEAD_THIS_TURN' };

type ExerciseBase = {
  id: string;
  unit: string;
  skill: string;
  title: string;
  prompt: string;
  hint: string;
  explanation: string;
};

export type WrongLine = {
  steps: Step[];
  expect: 'rejected' | 'notLethal';
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

export type Unit = { id: string; title: string; exercises: Exercise[] };

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
