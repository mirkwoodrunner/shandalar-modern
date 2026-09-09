// src/ui/Phaser/HandScene.ts
// Render + animation only. No engine imports, no rules knowledge.
// Receives plain card data (iid/name/type) and calls callbacks — it never
// mutates GameState itself.

import Phaser from 'phaser';
import { getHandLayoutConfig, layoutHand, type HandCardLayout } from './handLayout';

export interface HandSceneCardData {
  iid: string;
  name: string;
  type?: string;
}

const TWEEN_DURATION_MS = 220;
const CARD_STROKE = 0x8a6a3a;
const CARD_FILL = 0x241a10;
const OFFSCREEN_DECK_Y_OFFSET = 220;

export class HandScene extends Phaser.Scene {
  private onCardTapped: (iid: string) => void = () => {};
  private containers: Map<string, Phaser.GameObjects.Container> = new Map();
  private cardData: Map<string, HandSceneCardData> = new Map();
  private activeTweens: Set<Phaser.Tweens.Tween> = new Set();

  constructor() {
    super({ key: 'HandScene' });
  }

  // Set by PhaserDuelHost once the scene instance exists — routes taps back
  // out to whatever React-side action the host was given.
  setOnCardTapped(cb: (iid: string) => void) {
    this.onCardTapped = cb;
  }

  create() {
    // Nothing rendered until the first syncHand() call — hand contents
    // arrive from outside the scene, driven by real GameState.
  }

  private getLayoutConfig() {
    return getHandLayoutConfig(this.scale.width, this.scale.height);
  }

  private buildCardContainer(card: HandSceneCardData, layout: HandCardLayout): Phaser.GameObjects.Container {
    if (!card.iid || !card.name) {
      throw new Error(`HandScene: card is missing iid or name: ${JSON.stringify(card)}`);
    }
    const cfg = this.getLayoutConfig();
    const rect = this.add.rectangle(0, 0, cfg.cardWidth, cfg.cardHeight, CARD_FILL)
      .setStrokeStyle(2, CARD_STROKE);
    const label = this.add.text(0, 0, card.name, {
      fontSize: '11px',
      color: '#e8d8b0',
      align: 'center',
      wordWrap: { width: cfg.cardWidth - 8 },
    }).setOrigin(0.5);

    const container = this.add.container(layout.x, layout.y, [rect, label]);
    container.setRotation(layout.rotation);
    container.setScale(layout.scale);
    container.setDepth(layout.depth);
    container.setSize(cfg.cardWidth, cfg.cardHeight);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerup', () => this.onCardTapped(card.iid));

    return container;
  }

  // Diffs against currently rendered iids. New cards tween in from an
  // offscreen deck point, removed cards tween out.
  syncHand(cards: HandSceneCardData[]) {
    for (const card of cards) {
      if (!card.iid || !card.name) {
        throw new Error(`HandScene.syncHand: card is missing iid or name: ${JSON.stringify(card)}`);
      }
    }

    const cfg = this.getLayoutConfig();
    const iids = cards.map(c => c.iid);
    const layouts = layoutHand(iids, cfg);
    const layoutByIid = new Map(layouts.map(l => [l.iid, l]));

    // Removed cards: tween out and destroy.
    for (const [iid, container] of this.containers) {
      if (layoutByIid.has(iid)) continue;
      this.tweenOutAndDestroy(iid, container);
    }

    // New + existing cards: create or reposition.
    for (const card of cards) {
      this.cardData.set(card.iid, card);
      const layout = layoutByIid.get(card.iid)!;
      const existing = this.containers.get(card.iid);
      if (existing) {
        this.addTween(this.tweens.add({
          targets: existing,
          x: layout.x,
          y: layout.y,
          rotation: layout.rotation,
          scale: layout.scale,
          duration: TWEEN_DURATION_MS,
          ease: 'Cubic.easeOut',
        }));
        existing.setDepth(layout.depth);
        continue;
      }

      const container = this.buildCardContainer(card, layout);
      // Enter from an offscreen "deck" point below the hand.
      container.setPosition(layout.x, this.scale.height + OFFSCREEN_DECK_Y_OFFSET);
      container.setAlpha(0);
      this.containers.set(card.iid, container);
      this.addTween(this.tweens.add({
        targets: container,
        x: layout.x,
        y: layout.y,
        alpha: 1,
        duration: TWEEN_DURATION_MS,
        ease: 'Cubic.easeOut',
      }));
    }
  }

  private tweenOutAndDestroy(iid: string, container: Phaser.GameObjects.Container) {
    this.containers.delete(iid);
    this.cardData.delete(iid);
    this.addTween(this.tweens.add({
      targets: container,
      y: container.y + OFFSCREEN_DECK_Y_OFFSET,
      alpha: 0,
      duration: TWEEN_DURATION_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => container.destroy(),
    }));
  }

  // Tweens the card from its hand slot to a center-stage point, scales up,
  // then fires onComplete. This is the animation Phase 1 exists to evaluate.
  playCardAnimation(iid: string, onComplete: () => void) {
    const container = this.containers.get(iid);
    if (!container) {
      onComplete();
      return;
    }
    this.containers.delete(iid);
    this.cardData.delete(iid);
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    this.addTween(this.tweens.add({
      targets: container,
      x: centerX,
      y: centerY,
      rotation: 0,
      scale: 1.15,
      duration: TWEEN_DURATION_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        container.destroy();
        onComplete();
      },
    }));
  }

  // Test/Playwright hook: what is actually on screen right now.
  getRenderedLayout(): HandCardLayout[] {
    const cfg = this.getLayoutConfig();
    const iids = Array.from(this.containers.keys());
    return layoutHand(iids, cfg);
  }

  // Test/Playwright hook: route a simulated tap through the same handler
  // a real pointer event uses — no separate test-only code path.
  simulateTap(iid: string) {
    this.onCardTapped(iid);
  }

  private addTween(tween: Phaser.Tweens.Tween) {
    this.activeTweens.add(tween);
    tween.on('complete', () => this.activeTweens.delete(tween));
  }

  shutdown() {
    for (const tween of this.activeTweens) {
      tween.stop();
    }
    this.activeTweens.clear();
    for (const container of this.containers.values()) {
      container.destroy();
    }
    this.containers.clear();
    this.cardData.clear();
  }
}
