import { useEffect } from 'react';

const KEY = 'shandalar:duel';

function isValidDuelState(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const topLevelKeys = ['ruleset', 'phase', 'active', 'turn', 'p', 'o', 'stack', 'log'];
  for (const key of topLevelKeys) {
    if (!(key in v)) return false;
  }
  for (const side of ['p', 'o'] as const) {
    const player = v[side];
    if (typeof player !== 'object' || player === null) return false;
    const p = player as Record<string, unknown>;
    const playerKeys = ['life', 'lib', 'hand', 'bf', 'gy', 'exile', 'mana'];
    for (const key of playerKeys) {
      if (!(key in p)) return false;
    }
  }
  return true;
}

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
    const parsed = JSON.parse(raw);
    if (!isValidDuelState(parsed)) {
      clearDuel();
      return null;
    }
    return parsed;
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
