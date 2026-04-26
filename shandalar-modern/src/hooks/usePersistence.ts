import { useEffect } from 'react';
import type { DuelState } from '../types/duel';

const KEY = 'shandalar:duel';

export function loadSavedDuel(): DuelState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DuelState;
  } catch {
    return null;
  }
}

export function clearSavedDuel() {
  localStorage.removeItem(KEY);
}

export function usePersistence(state: DuelState) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // quota exceeded or private browsing — silently ignore
    }
  }, [state]);
}
