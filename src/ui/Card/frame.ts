export type FrameKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'A';

export interface FrameValue {
  bg: string;
  bd: string;
  glow: string;
  parch: string;
}

export const FRAME: Record<FrameKey, FrameValue> = {
  W: { bg: 'var(--frame-w-bg)', bd: 'var(--frame-w-bd)', glow: 'var(--frame-w-glow)', parch: '#d8cfa6' },
  U: { bg: 'var(--frame-u-bg)', bd: 'var(--frame-u-bd)', glow: 'var(--frame-u-glow)', parch: '#aac4dc' },
  B: { bg: 'var(--frame-b-bg)', bd: 'var(--frame-b-bd)', glow: 'var(--frame-b-glow)', parch: '#b8a4c4' },
  R: { bg: 'var(--frame-r-bg)', bd: 'var(--frame-r-bd)', glow: 'var(--frame-r-glow)', parch: '#d4b0a0' },
  G: { bg: 'var(--frame-g-bg)', bd: 'var(--frame-g-bd)', glow: 'var(--frame-g-glow)', parch: '#b4c8a4' },
  A: { bg: 'var(--frame-a-bg)', bd: 'var(--frame-a-bd)', glow: 'var(--frame-a-glow)', parch: '#bcc0c8' },
};

export function frameOf(card: { type: string; color?: string }): FrameValue {
  if (card.type === 'Artifact' || card.type?.startsWith('Artifact')) return FRAME.A;
  return FRAME[(card.color as FrameKey) ?? 'A'] ?? FRAME.A;
}
