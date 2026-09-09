// src/ui/Phaser/PhaserDuelHost.tsx
// Owns the Phaser canvas element lifecycle. Presentation + wiring only —
// this file never imports from src/engine/. It reads the same sandbox
// escape hatch (window.__duelDispatch / window.__duelState) the existing
// Playwright specs already use, and does not mutate GameState itself: it
// only ever dispatches a plain GameAction object, same as the UI layer
// does everywhere else in this app.

import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { HandScene, type HandSceneCardData } from './HandScene';

interface DuelStateLike {
  p?: { hand?: Array<{ iid: string; name: string; type?: string; typeEff?: string }> };
}

interface PhaserDuelHostProps {
  sandbox?: boolean;
  // Optional direct wiring, for a future non-sandbox mount. When omitted
  // (the Phase 1 sandbox POC), state and actions come from the same
  // window.__duelState / window.__duelDispatch hatch useDuelController
  // already exposes for Playwright.
  state?: DuelStateLike;
  dispatch?: (action: { type: string; [key: string]: unknown }) => void;
  castSpell?: (iid: string) => void;
  selectCard?: (iid: string) => void;
}

const POLL_INTERVAL_MS = 100;

function isLandCard(card: { type?: string; typeEff?: string }): boolean {
  const t = card.typeEff ?? card.type;
  return typeof t === 'string' && t.includes('Land');
}

function toSceneCards(hand: DuelStateLike['p'] extends { hand?: infer H } ? H : never): HandSceneCardData[] {
  if (!Array.isArray(hand)) return [];
  return hand.map(c => ({ iid: c.iid, name: c.name, type: c.typeEff ?? c.type }));
}

export function PhaserDuelHost({ sandbox = false, state, dispatch, castSpell, selectCard }: PhaserDuelHostProps) {
  // Two nested divs on purpose: Phaser's Scale.RESIZE mode overwrites
  // whatever element it's given as `parent` with its own inline
  // width:100%/height:100%, which stomped the `bottom:0` this component
  // needs on the element it positions below the ActionBar (the two goals
  // fought over the same element's height and Phaser won, blowing the
  // canvas out to a full viewport height regardless of where it started).
  // outerRef is the one this component positions; containerRef is
  // Phaser's own to mutate freely, nested inside where outerRef's
  // (well-defined, top+bottom-derived) height sets the 100% it resolves against.
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<HandScene | null>(null);
  const lastHandKeyRef = useRef<string>('');
  // Where the real ActionBar's bottom edge sits, so the canvas footprint
  // starts exactly there rather than a guessed constant. null == not yet
  // measured, so the canvas stays collapsed (no click surface at all)
  // instead of risking a full-viewport flash that swallows clicks.
  const [topOffsetPx, setTopOffsetPx] = useState<number | null>(null);

  // Kept fresh across renders so the Phaser callback (set up once) always
  // sees the latest props/window hooks without needing to recreate the game.
  const propsRef = useRef({ state, dispatch, castSpell, selectCard, sandbox });
  propsRef.current = { state, dispatch, castSpell, selectCard, sandbox };

  const getCurrentState = (): DuelStateLike | null => {
    const { state: propState, sandbox: isSandbox } = propsRef.current;
    if (propState) return propState;
    if (isSandbox) return (window as any).__duelState?.() ?? null;
    return null;
  };

  const doDispatch = (action: { type: string; [key: string]: unknown }) => {
    const { dispatch: propDispatch, sandbox: isSandbox } = propsRef.current;
    if (propDispatch) { propDispatch(action); return; }
    if (isSandbox) (window as any).__duelDispatch?.(action);
  };

  const handleCardTapped = (iid: string) => {
    const scene = sceneRef.current;
    const state = getCurrentState();
    const card = state?.p?.hand?.find(c => c.iid === iid);
    if (!card || !scene) return;

    scene.playCardAnimation(iid, () => {
      if (isLandCard(card)) {
        doDispatch({ type: 'PLAY_LAND', who: 'p', iid });
        return;
      }
      const { castSpell: propCastSpell, selectCard: propSelectCard } = propsRef.current;
      if (propCastSpell) { propCastSpell(iid); return; }
      if (propSelectCard) { propSelectCard(iid); return; }
      doDispatch({ type: 'SELECT_CARD', iid });
    });
  };

  // Mount / unmount the Phaser game. Runs once — HandScene's own methods
  // (syncHand) are how later state changes reach the canvas.
  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      transparent: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: containerRef.current.clientWidth || 800,
        height: containerRef.current.clientHeight || 600,
      },
      scene: [HandScene],
    });
    gameRef.current = game;

    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene('HandScene') as HandScene;
      scene.setOnCardTapped(handleCardTapped);
      sceneRef.current = scene;
    });

    return () => {
      sceneRef.current = null;
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for hand changes. The Phase 1 sandbox mount has no subscription
  // channel into useDuelController's state beyond the window hatch, so a
  // light poll is the simplest thing that keeps the canvas honest about
  // real GameState rather than tracking a local copy.
  useEffect(() => {
    const interval = setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const currentState = getCurrentState();
      const hand = currentState?.p?.hand ?? [];
      const key = hand.map(c => c.iid).join(',');
      if (key === lastHandKeyRef.current) return;
      lastHandKeyRef.current = key;
      scene.syncHand(toSceneCards(hand));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Track the real ActionBar's bottom edge so the canvas footprint starts
  // exactly there instead of a guessed constant that drifted from actual
  // layout between viewports (a fixed vh band overlapped the ActionBar's
  // buttons on desktop while undershooting it on mobile). end-turn-button
  // is present in both the normal ActionBar and its endTurnPending variant.
  //
  // Folded into the same tick: forcing Phaser to re-measure whenever the
  // outer box's real size changes. Scale.RESIZE mode only re-measures its
  // parent on a real `window` resize event -- a CSS-only size change (our
  // `top` shift) never reaches it on its own, so without this the canvas
  // keeps its stale mount-time size.
  useEffect(() => {
    let lastW = 0;
    let lastH = 0;
    const tick = () => {
      const bar = document.querySelector('[data-testid="end-turn-button"]');
      if (bar) {
        const bottom = Math.round(bar.getBoundingClientRect().bottom);
        setTopOffsetPx(prev => (prev === bottom ? prev : bottom));
      }
      const el = outerRef.current;
      const game = gameRef.current;
      if (el && game && sceneRef.current) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
          lastW = w; lastH = h;
          // Scale.RESIZE mode only re-measures its parent on a real
          // `window` resize event (see ScaleManager#startListeners) — it
          // has no ResizeObserver on the parent element itself, so a CSS
          // -only size change (like the `top` shift below) never reaches
          // it on its own. `scale.resize()` is documented for NONE mode
          // only and fights RESIZE mode's own bookkeeping (it got
          // immediately overwritten back to a stale 0-height parent
          // reading). Calling the same sequence RESIZE mode's own
          // window-resize handler uses is what actually sticks.
          game.scale.updateBounds();
          game.scale.getParentBounds();
          game.scale.refresh();
        }
      }
    };
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    window.addEventListener('resize', tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', tick);
    };
  }, []);

  // Playwright hook, gated identically to the existing sandbox hatch.
  useEffect(() => {
    if (!sandbox) return;
    (window as any).__phaserHand = () => sceneRef.current?.getRenderedLayout() ?? null;
    (window as any).__phaserTapCard = (iid: string) => sceneRef.current?.simulateTap(iid);
    return () => {
      delete (window as any).__phaserHand;
      delete (window as any).__phaserTapCard;
    };
  }, [sandbox]);

  // Footprint is intentionally the hand-fan band at the bottom of the
  // screen, not the full viewport: a full-bleed canvas sits in front of
  // everything in the DOM and swallows every click, including the
  // ActionBar's Pass Priority / Done Attacking / End Turn buttons that
  // render just above the hand — that was a real lockup during combat,
  // not a hypothetical. `top` tracks the ActionBar's measured bottom edge
  // (see the effect above) so the canvas starts exactly below it and
  // never overlaps, on any viewport. Until the first measurement lands,
  // collapse to zero height so there's no full-viewport click-catching
  // flash.
  const outerStyle: React.CSSProperties = topOffsetPx === null
    ? { position: 'absolute', left: 0, right: 0, top: '100%', bottom: 0, overflow: 'hidden' }
    : { position: 'absolute', left: 0, right: 0, top: topOffsetPx, bottom: 0, overflow: 'hidden' };

  return (
    <div ref={outerRef} data-testid="phaser-host" style={outerStyle}>
      <div ref={containerRef} />
    </div>
  );
}

export default PhaserDuelHost;
