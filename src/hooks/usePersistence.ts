import { useEffect } from 'react';

const KEY = 'shandalar:duel';

export function usePersistence(state: unknown) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // quota exceeded or private browsing
    }
  }, [state]);
}
