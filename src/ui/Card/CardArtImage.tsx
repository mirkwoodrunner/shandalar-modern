import React, { useState, useEffect } from 'react';
import useCardArt from '../../utils/useCardArt.js';
import { subscribeCachedArt } from '../../utils/scryfallArt.js';

interface CardArtImageProps {
  cardName: string;
  frameColor: string;
}

export function CardArtImage({ cardName, frameColor }: CardArtImageProps) {
  const { url: hookUrl, loading } = useCardArt(cardName);
  const [polledUrl, setPolledUrl] = useState<string | null>(null);

  // Fallback: poll the shared art cache in case useCardArt raced with another
  // component's in-flight fetch and got null back from fetchOldestArt early.
  useEffect(() => {
    if (hookUrl || polledUrl) return;
    let cancelled = false;
    let attempts = 0;
    const id = setInterval(() => {
      if (cancelled) { clearInterval(id); return; }
      const cached = subscribeCachedArt(cardName);
      if (cached || ++attempts >= 12) {
        clearInterval(id);
        if (cached && !cancelled) setPolledUrl(cached);
      }
    }, 500);
    return () => { cancelled = true; clearInterval(id); };
  }, [cardName, hookUrl, polledUrl]);

  const url = hookUrl || polledUrl;

  if (url) {
    return (
      <img
        src={url}
        alt={cardName}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 2,
          opacity: loading ? 0 : 1,
          transition: 'opacity 0.3s ease',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, ${frameColor}55, rgba(0,0,0,0.4))`,
        borderRadius: 2,
        opacity: loading ? 0.3 : 0.6,
      }}
    />
  );
}
