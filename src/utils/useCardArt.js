import { useState, useEffect } from 'react';
import { fetchOldestArt, subscribeCachedArt } from './scryfallArt.js';

export default function useCardArt(cardName) {
  const [state, setState] = useState(() => {
    const resolved = subscribeCachedArt(cardName);
    if (resolved) return { url: resolved, loading: false };
    return { url: null, loading: true };
  });

  useEffect(() => {
    // If already resolved on mount, nothing to do.
    if (state.url) return;

    let cancelled = false;

    fetchOldestArt(cardName).then(url => {
      if (cancelled) return;
      setState({ url: url || null, loading: false });
    });

    return () => { cancelled = true; };
  }, [cardName]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
