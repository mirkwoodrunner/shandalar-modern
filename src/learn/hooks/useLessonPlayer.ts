// src/learn/hooks/useLessonPlayer.ts
// Orchestration hook for the Learn Mode lesson player. Holds React state and
// calls runner functions from src/learn/engine/puzzleRunner.ts. No rules logic.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildPuzzleState,
  canAttackReason,
  cardInfo,
  checkGoal,
  resolveAttack,
  tryAction,
} from '../engine/puzzleRunner';
import { recordAttemptAndPersist } from '../persistence';
import type { EngineExercise, Exercise, Unit } from '../engine/types';

export type CardView = { id: string } & ReturnType<typeof cardInfo>;

type Feedback = null | { result: 'success' | 'fail' | 'rejected'; text: string };

const SOMETHING_WRONG = "Something went wrong with this puzzle.";

function isLearnError(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith('LEARN_');
}

export function useLessonPlayer(unit: Unit, startIndex = 0) {
  const [index, setIndex] = useState(startIndex);
  const [state, setState] = useState<any | null>(null);
  const [selectedAttackers, setSelectedAttackers] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hintShown, setHintShown] = useState(false);

  const total = unit.exercises.length;
  const done = index >= total;
  const exercise: Exercise | undefined = unit.exercises[index];

  const load = useCallback((ex: Exercise | undefined) => {
    setSelectedAttackers([]);
    setSelectedOptions([]);
    setFeedback(null);
    setHintShown(false);
    if (ex && ex.kind === 'engine') {
      try {
        setState(buildPuzzleState(ex.setup));
      } catch (e) {
        console.error(e);
        setState(null);
      }
    } else {
      setState(null);
    }
  }, []);

  useEffect(() => {
    load(exercise);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id]);

  const msLands: CardView[] = useMemo(() => {
    if (!exercise || exercise.kind !== 'multiSelect') return [];
    return exercise.lands.map(id => ({ id, ...cardInfo(id) }));
  }, [exercise]);

  const msOptions: CardView[] = useMemo(() => {
    if (!exercise || exercise.kind !== 'multiSelect') return [];
    return exercise.options.map(id => ({ id, ...cardInfo(id) }));
  }, [exercise]);

  const tapCard = useCallback((iid: string) => {
    if (!exercise || exercise.kind !== 'engine' || !state) return;
    if (feedback?.result === 'success' || feedback?.result === 'fail') return;
    const ex = exercise as EngineExercise;

    try {
      if (state.phase === 'MAIN_1') {
        const bfCard = state.p.bf.find((c: any) => c.iid === iid);
        const handCard = state.p.hand.find((c: any) => c.iid === iid);
        let result;
        if (bfCard) {
          result = tryAction(state, { type: 'TAP_LAND', iid }, ex.allowed);
        } else if (handCard) {
          const isLandCard = handCard.type === 'Land' || handCard.type?.includes('Land');
          result = isLandCard
            ? tryAction(state, { type: 'PLAY_LAND', iid }, ex.allowed)
            : tryAction(state, { type: 'CAST_SPELL', iid }, ex.allowed);
        } else {
          return;
        }
        if (!result.ok) {
          setFeedback({ result: 'rejected', text: result.reason });
          return;
        }
        setState(result.state);
        setFeedback(null);
        if (checkGoal(result.state, ex.goal)) {
          setFeedback({ result: 'success', text: ex.explanation });
          // Write happens here, in the event handler, never inside a
          // setState updater -- see docs/LEARN_L1_SPEC.md section 3,
          // correction C1.
          recordAttemptAndPersist(ex.stableId, 'success', hintShown);
        }
      } else if (state.phase === 'COMBAT_ATTACKERS') {
        const bfCard = state.p.bf.find((c: any) => c.iid === iid);
        if (!bfCard) return;
        if (selectedAttackers.includes(iid)) {
          setSelectedAttackers(prev => prev.filter(x => x !== iid));
          return;
        }
        const reason = canAttackReason(state, iid);
        if (reason) {
          setFeedback({ result: 'rejected', text: reason });
          return;
        }
        setFeedback(null);
        setSelectedAttackers(prev => [...prev, iid]);
      }
    } catch (e) {
      if (isLearnError(e)) {
        console.error(e);
        setFeedback({ result: 'rejected', text: SOMETHING_WRONG });
      } else {
        throw e;
      }
    }
  }, [exercise, state, feedback, selectedAttackers, hintShown]);

  const undoTaps = useCallback(() => {
    if (!exercise || exercise.kind !== 'engine' || !state) return;
    const ex = exercise as EngineExercise;
    try {
      const result = tryAction(state, { type: 'UNDO_MANA_TAPS' }, ex.allowed);
      if (!result.ok) {
        setFeedback({ result: 'rejected', text: result.reason });
        return;
      }
      setState(result.state);
      setFeedback(null);
    } catch (e) {
      if (isLearnError(e)) {
        console.error(e);
        setFeedback({ result: 'rejected', text: SOMETHING_WRONG });
      } else {
        throw e;
      }
    }
  }, [exercise, state]);

  const attack = useCallback(() => {
    if (!exercise || exercise.kind !== 'engine' || !state) return;
    const ex = exercise as EngineExercise;
    try {
      const result = resolveAttack(state, selectedAttackers);
      if (!result.ok) {
        setFeedback({ result: 'rejected', text: result.reason });
        return;
      }
      setState(result.worstCase.finalState);
      if (result.lethal) {
        setFeedback({ result: 'success', text: ex.explanation });
        recordAttemptAndPersist(ex.stableId, 'success', hintShown);
      } else {
        setFeedback({ result: 'fail', text: result.summary });
        recordAttemptAndPersist(ex.stableId, 'fail', hintShown);
      }
    } catch (e) {
      if (isLearnError(e)) {
        console.error(e);
        setFeedback({ result: 'rejected', text: SOMETHING_WRONG });
      } else {
        throw e;
      }
    }
  }, [exercise, state, selectedAttackers, hintShown]);

  const toggleOption = useCallback((cardId: string) => {
    if (feedback?.result === 'success' || feedback?.result === 'fail') return;
    setSelectedOptions(prev => (prev.includes(cardId) ? prev.filter(x => x !== cardId) : [...prev, cardId]));
  }, [feedback]);

  const checkMultiSelect = useCallback(() => {
    if (!exercise || exercise.kind !== 'multiSelect') return;
    const a = [...selectedOptions].sort();
    const b = [...exercise.answer].sort();
    const match = a.length === b.length && a.every((x, i) => x === b[i]);
    setFeedback({ result: match ? 'success' : 'fail', text: exercise.explanation });
    recordAttemptAndPersist(exercise.stableId, match ? 'success' : 'fail', hintShown);
  }, [exercise, selectedOptions, hintShown]);

  const showHint = useCallback(() => setHintShown(true), []);

  const retry = useCallback(() => load(exercise), [load, exercise]);

  const next = useCallback(() => setIndex(prev => prev + 1), []);

  if (done || !exercise) {
    return {
      exercise: undefined as unknown as Exercise,
      index, total, state: null,
      selectedAttackers: [], selectedOptions: [],
      msLands: [] as CardView[], msOptions: [] as CardView[],
      feedback: null, hintShown: false, done: true,
      tapCard: () => {}, undoTaps: () => {}, attack: () => {},
      toggleOption: () => {}, checkMultiSelect: () => {}, showHint: () => {},
      retry: () => {}, next: () => {},
    };
  }

  return {
    exercise, index, total, state,
    selectedAttackers, selectedOptions,
    msLands, msOptions,
    feedback, hintShown, done,
    tapCard, undoTaps, attack,
    toggleOption, checkMultiSelect, showHint,
    retry, next,
  };
}
