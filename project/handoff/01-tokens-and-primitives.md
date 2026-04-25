# Chunk 1 — Tokens & Primitives

**Goal:** Land the design token system, fonts, keyframes, and the small reusable primitives every other component needs.

## Read first
- `duel-screen/Duel Battlefield.html` — `<style>` block with all `@keyframes`.
- `duel-screen/components/cards.jsx` — `Pip`, `NumPip`, `Cost`, `PoolDisplay`, `FilCorner`, `ArtPlaceholder`, `CFRAME`, `CCOLOR`, `MANA_BG`.

## Tasks

### 1. `src/ui/tokens.css`
Copy the full token block from `handoff/README.md`, then append the keyframes:

```css
@keyframes pulse        { 0%,100%{opacity:.8;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
@keyframes damageFlash  { 0%{filter:none;transform:translateX(0)} 20%{filter:brightness(2.5) saturate(.2);transform:translateX(-3px)} 60%{transform:translateX(2px)} 100%{filter:none;transform:translateX(0)} }
@keyframes healFlash    { 0%,100%{filter:none;transform:scale(1)} 50%{filter:brightness(1.5) hue-rotate(100deg);transform:scale(1.05)} }
@keyframes phaseGlow    { 0%,100%{box-shadow:0 0 8px rgba(196,160,64,.5)} 50%{box-shadow:0 0 16px rgba(196,160,64,.9)} }
@keyframes fadeIn       { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
```

Import once from `main.tsx`: `import './ui/tokens.css';`

### 2. Fonts
Add to `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
```

Set `body { font-family: var(--font-body); background: var(--bg-void); color: var(--ink-parchment); }`.

### 3. `src/ui/Card/frame.ts`
Typed lookup ported from `CFRAME`:

```ts
export type FrameKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'A';
export const FRAME: Record<FrameKey, { bg: string; bd: string; glow: string; parch: string }> = {
  W: { bg: 'var(--frame-w-bg)', bd: 'var(--frame-w-bd)', glow: 'var(--frame-w-glow)', parch: '#d8cfa6' },
  U: { bg: 'var(--frame-u-bg)', bd: 'var(--frame-u-bd)', glow: 'var(--frame-u-glow)', parch: '#aac4dc' },
  B: { bg: 'var(--frame-b-bg)', bd: 'var(--frame-b-bd)', glow: 'var(--frame-b-glow)', parch: '#b8a4c4' },
  R: { bg: 'var(--frame-r-bg)', bd: 'var(--frame-r-bd)', glow: 'var(--frame-r-glow)', parch: '#d4b0a0' },
  G: { bg: 'var(--frame-g-bg)', bd: 'var(--frame-g-bd)', glow: 'var(--frame-g-glow)', parch: '#b4c8a4' },
  A: { bg: 'var(--frame-a-bg)', bd: 'var(--frame-a-bd)', glow: 'var(--frame-a-glow)', parch: '#bcc0c8' },
};

export function frameOf(card: { type: string; color?: string }): typeof FRAME[FrameKey] {
  if (card.type === 'Artifact') return FRAME.A;
  return FRAME[(card.color as FrameKey) ?? 'A'] ?? FRAME.A;
}
```

### 4. Primitives — `src/ui/Card/Cost.tsx`

Port directly from `cards.jsx`:

- `<Pip sym size>` — round, color-coded mana pip. WUBRGC supported.
- `<NumPip n size>` — generic-cost numeric pip.
- `<Cost cost size>` — parses a cost string like `"2GG"` and renders pips.
- `<PoolDisplay pool size>` — renders a `Record<ManaSym, number>` as a flat row of pips.

Mana pip backgrounds come from `--w`/`--u`/`--b`/`--r`/`--g`/`--c` tokens; W's foreground stays dark, others stay parchment.

### 5. `src/ui/Card/FilCorner.tsx`

Port the SVG filigree corner ornament. Props: `corner: 'tl' | 'tr' | 'bl' | 'br'`, `color: string`. Used in all card frames.

### 6. `src/ui/Card/ArtPlaceholder.tsx`

Port the diagonal-stripe placeholder. Props: `frame: FrameValue`, `label: string`, `sm?: boolean`. **Never** draw fake art — placeholders only.

## Definition of Done

- [ ] All token names from `handoff/README.md` resolve.
- [ ] Five `@keyframes` registered globally.
- [ ] Fonts loaded; body uses Crimson Text.
- [ ] `Cost` + `PoolDisplay` storybook (or test) renders all 6 mana symbols at sizes 10/13/16.
- [ ] No raw hex codes anywhere except inside `tokens.css`.

## Out of scope
Card frames, layout, interaction.
