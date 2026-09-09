// src/ui/Phaser/PhaserDuelHost.tsx
// Owns the Phaser canvas element lifecycle. Presentation + wiring only —
// this file never imports from src/engine/. It reads the same sandbox
// escape hatch (window.__duelDispatch / window.__duelState) the existing
// Playwright specs already use, and does not mutate GameState itself: it
// only ever dispatches a plain GameAction object, same as the UI layer
// does everywhere else in this app.

import React, { useEffect, useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<HandScene | null>(null);
  const lastHandKeyRef = useRef<string>('');

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

  return <div ref={containerRef} data-testid="phaser-host" style={{ position: 'absolute', inset: 0 }} />;
}

export default PhaserDuelHost;
