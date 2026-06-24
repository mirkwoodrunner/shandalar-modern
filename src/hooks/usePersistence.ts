import { useEffect } from 'react';

const KEY = 'shandalar:duel';

export function saveDuel(state: unknown): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or private browsing
  }
}

export function loadDuel(): unknown | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDuel(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // private browsing
  }
}

export function usePersistence(state: unknown, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    saveDuel(state);
  }, [state, enabled]);
}
