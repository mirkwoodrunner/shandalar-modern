import { useState, useEffect } from 'react';
import { fetchOldestArt, peekCachedArt, CLASSIC_PRINTING_SETS } from './scryfallArt.js';

export default function useCardArt(cardName, { sets = CLASSIC_PRINTING_SETS } = {}) {
  const [state, setState] = useState(() => {
    const resolved = peekCachedArt(cardName, { sets });
    if (resolved && resolved.url) return { url: resolved.url, artist: resolved.artist, loading: false };
    return { url: null, artist: null, loading: true };
  });

  // Stable dependency for the printing preference (callers may pass a fresh array).
  const setsKey = sets ? sets.join(',') : '';

  useEffect(() => {
    // If already resolved on mount, nothing to do.
    if (state.url) return;

    let cancelled = false;

    fetchOldestArt(cardName, { sets }).then(({ url, artist }) => {
      if (cancelled) return;
      setState({ url: url || null, artist, loading: false });
    });

    return () => { cancelled = true; };
  }, [cardName, setsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
