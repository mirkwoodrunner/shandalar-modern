// src/ui/overworld/Sprite.jsx
// Self-contained sprite system: CSS animations, SVG creature bodies, React components.
// Ported from WorldMap-refresh.html. Do not depend on external CSS or image assets.

import React from 'react';

// ---------------------------------------------------------------------------
// CSS — injected once into <head> via SpriteStyles component
// ---------------------------------------------------------------------------

const SPRITE_CSS = `
/* === SPRITES (Player + Wanderers) === */

/* Palette token classes */
.sprite.gold   { --c1:#f5d97a; --c2:#c4a040; --c3:#8a6010; --c4:#f0e8a0; }
.sprite.white  { --c1:#e8e8f0; --c2:#b0b0c8; --c3:#6060a0; --c4:#ffffff; }
.sprite.blue   { --c1:#6090e0; --c2:#2050b0; --c3:#102060; --c4:#90c0ff; }
.sprite.black  { --c1:#8060a0; --c2:#402060; --c3:#180820; --c4:#c090e0; }
.sprite.red    { --c1:#e05030; --c2:#a02010; --c3:#400808; --c4:#ff8060; }
.sprite.green  { --c1:#40a040; --c2:#206020; --c3:#082008; --c4:#80e080; }

/* Sprite wrapper */
.sprite {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 2px;
  z-index: 5;
  pointer-events: none;
  filter: drop-shadow(2px 4px 3px rgba(0,0,0,0.55));
}

/* Frame — the bounding box that sizes the sprite */
.sprite .frame {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

/* Per-kind frame dimensions */
.kind-mage .frame    { width: 22px; height: 28px; }
.kind-pegasus .frame { width: 28px; height: 20px; }
.kind-spider .frame  { width: 26px; height: 18px; }
.kind-zombie .frame  { width: 20px; height: 26px; }
.kind-goblin .frame  { width: 18px; height: 22px; }
.kind-fish .frame    { width: 24px; height: 18px; }

/* Aura — glow ring around frame */
.sprite .aura {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 60%, var(--c1, #f5d97a) 0%, transparent 70%);
  opacity: 0;
  animation: spriteAura 2.4s ease-in-out infinite;
}
.sprite.player .aura {
  opacity: 0.6;
}
.sprite.enemy .aura {
  opacity: 0.3;
  animation-duration: 3.1s;
}

/* Shadow under sprite */
.sprite .shadow {
  position: absolute;
  bottom: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 3px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
}

/* SVG body container */
.sprite .body-svg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sprite .body-svg svg {
  width: 100%;
  height: 100%;
}

/* SVG fill classes */
.sprite .f1 { fill: var(--c1, #f5d97a); }
.sprite .f2 { fill: var(--c2, #c4a040); }
.sprite .f3 { fill: var(--c3, #8a6010); }
.sprite .f4 { fill: var(--c4, #f0e8a0); }
.sprite .fe { fill: none; }
.sprite .s3 { stroke: var(--c3, #8a6010); }
.sprite .out { stroke: rgba(0,0,0,0.6); stroke-width: 0.5; fill: none; }

/* ---- Mage anatomy divs ---- */
.kind-mage .robe {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 18px;
  background: var(--c2, #c4a040);
  border-radius: 3px 3px 6px 6px;
  animation: spriteBob 1.8s ease-in-out infinite;
}
.kind-mage .hat {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 12px solid var(--c1, #f5d97a);
  animation: spriteBob 1.8s ease-in-out infinite;
}
.kind-mage .hat-brim {
  position: absolute;
  bottom: 15px;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 3px;
  background: var(--c1, #f5d97a);
  border-radius: 2px;
  animation: spriteBob 1.8s ease-in-out infinite;
}
.kind-mage .face {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 7px;
  background: var(--c4, #f0e8a0);
  border-radius: 40% 40% 50% 50%;
  animation: spriteBob 1.8s ease-in-out infinite;
}
.kind-mage .eye {
  position: absolute;
  top: 2px;
  width: 2px;
  height: 2px;
  background: var(--c3, #8a6010);
  border-radius: 50%;
  animation: spriteBlink 4s step-end infinite;
}
.kind-mage .eye.left  { left: 1px; }
.kind-mage .eye.right { right: 1px; }
.kind-mage .staff {
  position: absolute;
  bottom: 4px;
  right: 1px;
  width: 2px;
  height: 22px;
  background: linear-gradient(180deg, var(--c4, #f0e8a0), var(--c3, #8a6010));
  border-radius: 1px;
  animation: spriteBob 1.8s ease-in-out infinite;
}
.kind-mage .rune-ring {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 20px;
  border: 1px solid var(--c1, #f5d97a);
  border-radius: 50%;
  opacity: 0.5;
  animation: spriteSpin 3s linear infinite;
}
.kind-mage .hat-star {
  position: absolute;
  bottom: 26px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 5px;
  line-height: 1;
  animation: spriteTwinkle 2s ease-in-out infinite;
}

/* Fish bubbles */
.sprite .bubble {
  position: absolute;
  border-radius: 50%;
  border: 1px solid var(--c4, #90c0ff);
  opacity: 0;
  animation: spriteBubble 2.4s ease-in infinite;
}
.sprite .bubble.b1 { width: 4px; height: 4px; right: 0px; bottom: 14px; animation-delay: 0s; }
.sprite .bubble.b2 { width: 3px; height: 3px; right: 3px; bottom: 10px; animation-delay: 0.8s; }
.sprite .bubble.b3 { width: 2px; height: 2px; right: 1px; bottom: 8px;  animation-delay: 1.6s; }

/* ---- Keyframe animations ---- */
@keyframes spriteBob {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50%       { transform: translateX(-50%) translateY(-1.5px); }
}
@keyframes spriteMenace {
  0%, 100% { transform: translateY(0) scale(1); }
  50%       { transform: translateY(-2px) scale(1.05); }
}
@keyframes spriteAura {
  0%, 100% { opacity: 0; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(1.15); }
}
@keyframes spriteSpin {
  from { transform: translateX(-50%) rotate(0deg); }
  to   { transform: translateX(-50%) rotate(360deg); }
}
@keyframes spriteTwinkle {
  0%, 100% { opacity: 0.4; transform: translateX(-50%) scale(1); }
  50%       { opacity: 1;   transform: translateX(-50%) scale(1.4); }
}
@keyframes spriteOrb {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%       { opacity: 1;   transform: scale(1.2); }
}
@keyframes spriteBlink {
  0%, 90%, 100% { transform: scaleY(1); }
  95%            { transform: scaleY(0.1); }
}
@keyframes spriteGallop {
  0%, 100% { transform: rotate(-5deg) translateY(0); }
  25%       { transform: rotate(0deg)  translateY(-2px); }
  50%       { transform: rotate(5deg)  translateY(0); }
  75%       { transform: rotate(0deg)  translateY(-1px); }
}
@keyframes spriteScuttle {
  0%, 100% { transform: skewX(0deg); }
  25%       { transform: skewX(6deg) translateY(-1px); }
  75%       { transform: skewX(-6deg) translateY(-1px); }
}
@keyframes spriteShuffle {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  33%       { transform: translateX(-1px) rotate(-3deg); }
  66%       { transform: translateX(1px)  rotate(3deg); }
}
@keyframes spriteJitter {
  0%, 100% { transform: translate(0, 0); }
  20%       { transform: translate(-1px, 0); }
  40%       { transform: translate(1px, -1px); }
  60%       { transform: translate(-1px, 1px); }
  80%       { transform: translate(1px, 0); }
}
@keyframes spriteFloat {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50%       { transform: translateY(-3px) rotate(3deg); }
}
@keyframes spriteBubble {
  0%   { opacity: 0;   transform: translateY(0)   scale(1); }
  50%  { opacity: 0.7; transform: translateY(-5px) scale(1.1); }
  100% { opacity: 0;   transform: translateY(-10px) scale(0.8); }
}
`;

// ---------------------------------------------------------------------------
// SVG bodies for creature kinds
// ---------------------------------------------------------------------------

const SPRITE_SVG = {
  pegasus: `<svg viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg">
    <!-- body -->
    <ellipse class="f2" cx="14" cy="13" rx="9" ry="5"/>
    <!-- neck -->
    <rect class="f2" x="18" y="7" width="5" height="7" rx="2"/>
    <!-- head -->
    <ellipse class="f1" cx="22" cy="6" rx="4" ry="3"/>
    <!-- eye -->
    <circle class="f3" cx="23" cy="5" r="1"/>
    <!-- wing left -->
    <ellipse class="f4" cx="9" cy="8" rx="7" ry="3" transform="rotate(-20 9 8)" opacity="0.9"/>
    <!-- wing right -->
    <ellipse class="f1" cx="10" cy="9" rx="6" ry="2.5" transform="rotate(-15 10 9)" opacity="0.7"/>
    <!-- legs -->
    <rect class="f3" x="8"  y="17" width="3" height="3" rx="1"/>
    <rect class="f3" x="12" y="17" width="3" height="3" rx="1"/>
    <rect class="f3" x="16" y="17" width="3" height="3" rx="1"/>
    <rect class="f3" x="20" y="17" width="3" height="3" rx="1"/>
    <!-- mane -->
    <ellipse class="f4" cx="20" cy="5" rx="2" ry="4" opacity="0.8"/>
  </svg>`,

  spider: `<svg viewBox="0 0 26 18" xmlns="http://www.w3.org/2000/svg">
    <!-- body -->
    <ellipse class="f2" cx="13" cy="12" rx="6" ry="5"/>
    <!-- head -->
    <circle class="f1" cx="13" cy="7" r="4"/>
    <!-- eyes -->
    <circle class="f4" cx="11" cy="6" r="1"/>
    <circle class="f4" cx="13" cy="5.5" r="1"/>
    <circle class="f4" cx="15" cy="6" r="1"/>
    <!-- fangs -->
    <rect class="f3" x="11" y="10" width="1.5" height="2.5" rx="0.5"/>
    <rect class="f3" x="13.5" y="10" width="1.5" height="2.5" rx="0.5"/>
    <!-- legs left -->
    <line class="f3" x1="7" y1="10" x2="1"  y2="6"  stroke="var(--c3)" stroke-width="1.2"/>
    <line class="f3" x1="7" y1="12" x2="1"  y2="12" stroke="var(--c3)" stroke-width="1.2"/>
    <line class="f3" x1="7" y1="14" x2="1"  y2="17" stroke="var(--c3)" stroke-width="1.2"/>
    <!-- legs right -->
    <line class="f3" x1="19" y1="10" x2="25"  y2="6"  stroke="var(--c3)" stroke-width="1.2"/>
    <line class="f3" x1="19" y1="12" x2="25"  y2="12" stroke="var(--c3)" stroke-width="1.2"/>
    <line class="f3" x1="19" y1="14" x2="25"  y2="17" stroke="var(--c3)" stroke-width="1.2"/>
  </svg>`,

  zombie: `<svg viewBox="0 0 20 26" xmlns="http://www.w3.org/2000/svg">
    <!-- body -->
    <rect class="f2" x="5" y="12" width="10" height="10" rx="1"/>
    <!-- head -->
    <rect class="f1" x="5" y="4" width="10" height="9" rx="2"/>
    <!-- eye left -->
    <circle class="f4" cx="7.5" cy="8" r="1.5"/>
    <circle class="f3" cx="7.5" cy="8" r="0.7"/>
    <!-- eye right -->
    <circle class="f4" cx="12.5" cy="8" r="1.5"/>
    <circle class="f3" cx="12.5" cy="8" r="0.7"/>
    <!-- mouth -->
    <rect class="f3" x="7" y="11" width="6" height="1.5" rx="0.5"/>
    <!-- arms outstretched -->
    <rect class="f2" x="0"  y="13" width="5" height="3" rx="1" transform="rotate(-10 2 14)"/>
    <rect class="f2" x="15" y="13" width="5" height="3" rx="1" transform="rotate(10 18 14)"/>
    <!-- legs -->
    <rect class="f3" x="5"  y="22" width="4" height="4" rx="1"/>
    <rect class="f3" x="11" y="22" width="4" height="4" rx="1"/>
  </svg>`,

  goblin: `<svg viewBox="0 0 18 22" xmlns="http://www.w3.org/2000/svg">
    <!-- body -->
    <ellipse class="f2" cx="9" cy="14" rx="6" ry="7"/>
    <!-- head -->
    <ellipse class="f1" cx="9" cy="7" rx="5" ry="5"/>
    <!-- ears -->
    <ellipse class="f1" cx="4"  cy="6" rx="2" ry="3" transform="rotate(-20 4 6)"/>
    <ellipse class="f1" cx="14" cy="6" rx="2" ry="3" transform="rotate(20 14 6)"/>
    <!-- eyes -->
    <circle class="f4" cx="7"  cy="7" r="1.5"/>
    <circle class="f4" cx="11" cy="7" r="1.5"/>
    <circle class="f3" cx="7.3"  cy="6.8" r="0.6"/>
    <circle class="f3" cx="11.3" cy="6.8" r="0.6"/>
    <!-- nose -->
    <ellipse class="f3" cx="9" cy="9" rx="1.5" ry="1"/>
    <!-- mouth / teeth -->
    <rect class="f4" x="6.5" y="10" width="2" height="2" rx="0.3"/>
    <rect class="f4" x="9.5" y="10" width="2" height="2" rx="0.3"/>
    <!-- arms -->
    <rect class="f2" x="1"  y="12" width="4" height="3" rx="1"/>
    <rect class="f2" x="13" y="12" width="4" height="3" rx="1"/>
    <!-- legs -->
    <rect class="f3" x="4"  y="19" width="4" height="3" rx="1"/>
    <rect class="f3" x="10" y="19" width="4" height="3" rx="1"/>
  </svg>`,

  fish: `<svg viewBox="0 0 24 18" xmlns="http://www.w3.org/2000/svg">
    <!-- tail fin -->
    <polygon class="f3" points="1,5 1,15 7,11 7,9"/>
    <!-- body -->
    <ellipse class="f2" cx="14" cy="10" rx="9" ry="6"/>
    <!-- highlight -->
    <ellipse class="f4" cx="13" cy="8" rx="5" ry="3" opacity="0.4"/>
    <!-- eye -->
    <circle class="f4" cx="20" cy="9" r="2.5"/>
    <circle class="f3" cx="20.5" cy="9" r="1.2"/>
    <!-- top fin -->
    <polygon class="f1" points="11,4 14,0 17,4"/>
    <!-- scales -->
    <path class="out" d="M12,8 Q14,6 16,8" stroke="var(--c3)" stroke-width="0.7"/>
    <path class="out" d="M10,10 Q12,8 14,10" stroke="var(--c3)" stroke-width="0.7"/>
    <path class="out" d="M14,10 Q16,8 18,10" stroke="var(--c3)" stroke-width="0.7"/>
  </svg>`,
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function SpriteStyles() {
  return <style>{SPRITE_CSS}</style>;
}

function MageBody({ isPlayer }) {
  return (
    <>
      {isPlayer && (
        <div className="rune-ring" />
      )}
      <div className="robe">
        <div className="face" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="eye left" />
          <div className="eye right" />
        </div>
        <div className="hat" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}>
          {isPlayer && <div className="hat-star">★</div>}
        </div>
        <div className="hat-brim" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '-3px' }} />
      </div>
      {isPlayer && <div className="staff" />}
    </>
  );
}

function CreatureSVG({ kind }) {
  const svg = SPRITE_SVG[kind];
  if (!svg) {
    console.error(`[Sprite] Unknown creature kind: "${kind}"`);
    return null;
  }
  return (
    <span
      className="body-svg"
      // SVG strings are authored above in this file — not user input
      dangerouslySetInnerHTML={{ __html: svg }} // eslint-disable-line react/no-danger
    />
  );
}

export function Sprite({ kind, color, isPlayer = false, name }) {
  return (
    <div
      className={`sprite kind-${kind} ${color}${isPlayer ? ' player' : ' enemy'}`}
      title={name}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 2,
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <div className="frame">
        <div className="aura" />
        {kind === 'mage'
          ? <MageBody isPlayer={isPlayer} />
          : <CreatureSVG kind={kind} />}
        {kind === 'fish' && (
          <>
            <span className="bubble b1" />
            <span className="bubble b2" />
            <span className="bubble b3" />
          </>
        )}
        <div className="shadow" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terrain + archKey → sprite mapping helpers
// ---------------------------------------------------------------------------

const KIND_BY_TERRAIN = {
  PLAINS:   'pegasus',
  FOREST:   'spider',
  SWAMP:    'zombie',
  MOUNTAIN: 'goblin',
  ISLAND:   'fish',
};

const COLOR_BY_ARCH = {
  WHITE_WEENIE:    'white',
  BLUE_TEMPO:      'blue',
  BLUE_CONTROL:    'blue',
  BLACK_CONTROL:   'black',
  BLACK_REANIMATOR:'black',
  RED_AGGRO:       'red',
  RED_BURN:        'red',
  GREEN_STOMPY:    'green',
};

// Sprite kind by archetype, so a monster's appearance follows the monster
// itself (not the tile it spawned on) now that encounters are decoupled from
// biome. KIND_BY_TERRAIN remains a fallback.
const KIND_BY_ARCH = {
  WHITE_WEENIE:     'pegasus',
  GREEN_STOMPY:     'spider',
  BLACK_CONTROL:    'zombie',
  BLACK_REANIMATOR: 'zombie',
  RED_AGGRO:        'goblin',
  RED_BURN:         'goblin',
  BLUE_TEMPO:       'fish',
  BLUE_CONTROL:     'fish',
};

const COLOR_BY_LETTER = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

export function spriteForMonster(archKey, terrainId) {
  return {
    kind:  KIND_BY_ARCH[archKey] ?? KIND_BY_TERRAIN[terrainId] ?? 'goblin',
    color: COLOR_BY_ARCH[archKey] ?? 'red',
  };
}

export function spriteForHenchman(colorLetter) {
  return { kind: 'mage', color: COLOR_BY_LETTER[colorLetter] ?? 'white' };
}
