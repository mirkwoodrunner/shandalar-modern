import { useState, useEffect } from 'react';
import { fetchOldestArt, getCachedArt } from './scryfallArt.js';

export default function useCardArt(cardName, scryfallId) {
  const cached = getCachedArt(cardName, scryfallId);

  const [state, setState] = useState(() =>
    cached ? { url: cached, loading: false, error: false } : { url: null, loading: true, error: false }
  );

  useEffect(() => {
    if (cached) return;

    let cancelled = false;

    fetchOldestArt(cardName, scryfallId).then(url => {
      if (cancelled) return;
      if (url) {
        setState({ url, loading: false, error: false });
      } else {
        setState({ url: null, loading: false, error: true });
      }
    });

    return () => { cancelled = true; };
  }, [cardName, scryfallId]);

  return state;
}
