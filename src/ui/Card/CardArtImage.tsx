import React from 'react';
import useCardArt from '../../utils/useCardArt.js';

interface CardArtImageProps {
  cardName: string;
  frameColor: string;
}

export function CardArtImage({ cardName, frameColor }: CardArtImageProps) {
  const { url, loading } = useCardArt(cardName);

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
