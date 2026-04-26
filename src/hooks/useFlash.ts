import { useState, useCallback } from 'react';

export function useFlash(durationMs = 200) {
  const [flashIids, setFlashIids] = useState<Set<string>>(new Set());

  const flash = useCallback((iids: string[]) => {
    setFlashIids(new Set(iids));
    setTimeout(() => setFlashIids(new Set()), durationMs);
  }, [durationMs]);

  return { flashIids, flash };
}
