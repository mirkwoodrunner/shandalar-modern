type Corner = 'tl' | 'tr' | 'bl' | 'br';

const TRANSFORMS: Record<Corner, string> = {
  tl: 'rotate(0)',
  tr: 'scaleX(-1)',
  bl: 'scaleY(-1)',
  br: 'scale(-1,-1)',
};

const POSITIONS: Record<Corner, React.CSSProperties> = {
  tl: { top: 2, left: 2 },
  tr: { top: 2, right: 2 },
  bl: { bottom: 2, left: 2 },
  br: { bottom: 2, right: 2 },
};

interface FilCornerProps {
  corner: Corner;
  color: string;
}

import React from 'react';

export function FilCorner({ corner, color }: FilCornerProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{
        position: 'absolute',
        ...POSITIONS[corner],
        transform: TRANSFORMS[corner],
        pointerEvents: 'none',
        opacity: 0.85,
      }}
    >
      <path
        d="M1 1 L7 1 M1 1 L1 7 M1 1 Q5 2 6 5 Q3 6 1 7"
        stroke={color}
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="6" cy="5" r="0.7" fill={color} opacity="0.9" />
    </svg>
  );
}
