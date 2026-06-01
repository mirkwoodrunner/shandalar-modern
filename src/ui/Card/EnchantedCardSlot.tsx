// src/ui/Card/EnchantedCardSlot.tsx
// Presentational wrapper. Renders a FieldCard with attached auras splayed to the right.
// Each aura peeks 30px out from behind the host. Desktop: hover tooltip. Mobile: tap to expand.
// No game logic. No state mutation. Per SYSTEMS.md s15 (Non-Goals).

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { AuraRecord } from './types';
import styles from './EnchantedCardSlot.module.css';

const PEEK_WIDTH = 30;

const AURA_COLOR: Record<string, string> = {
  W: 'var(--frame-w-bg, #342e18)',
  U: 'var(--frame-u-bg, #0e2036)',
  B: 'var(--frame-b-bg, #221030)',
  R: 'var(--frame-r-bg, #2e1008)',
  G: 'var(--frame-g-bg, #102418)',
  '': 'var(--frame-a-bg, #282828)',
};
const AURA_BORDER: Record<string, string> = {
  W: 'var(--frame-w-bd, #d4b040)',
  U: 'var(--frame-u-bd, #3888d0)',
  B: 'var(--frame-b-bd, #9960cc)',
  R: 'var(--frame-r-bd, #cc4422)',
  G: 'var(--frame-g-bd, #40a030)',
  '': 'var(--frame-a-bd, #788888)',
};

interface SlotProps {
  cardHeight: number;
  cardWidth: number;
  enchantments: AuraRecord[];
  isMobile?: boolean;
  children: React.ReactNode;
}

export function EnchantedCardSlot({
  cardHeight,
  cardWidth,
  enchantments,
  isMobile = false,
  children,
}: SlotProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setMobileOpen(false);
  }, []);

  useEffect(() => () => setHoveredIdx(null), []);

  if (!enchantments || enchantments.length === 0) {
    return <>{children}</>;
  }

  const totalWidth = cardWidth + enchantments.length * PEEK_WIDTH;

  const handleAuraMouseEnter = (e: React.MouseEvent, idx: number) => {
    if (isMobile) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPos({ x: rect.right + 6, y: rect.top });
    setHoveredIdx(idx);
  };

  const handleAuraMouseLeave = () => {
    if (isMobile) return;
    setHoveredIdx(null);
  };

  const handleAuraTap = (e: React.MouseEvent) => {
    if (!isMobile) return;
    e.stopPropagation();
    setMobileOpen(true);
  };

  const hoveredAura = hoveredIdx !== null ? enchantments[hoveredIdx] : null;

  return (
    <>
      <div
        ref={slotRef}
        className={styles.slot}
        style={{ width: totalWidth, height: cardHeight }}
      >
        {/* Host card -- always at left: 0, z-index above all auras */}
        <div style={{ position: 'absolute', left: 0, top: 0, zIndex: enchantments.length + 1 }}>
          {children}
        </div>

        {/* Aura peek strips -- each offset 30px further right, behind host */}
        {enchantments.map((aura, i) => {
          const color = (aura.cardData?.color as string) ?? '';
          const bg = AURA_COLOR[color] ?? AURA_COLOR[''];
          const bd = AURA_BORDER[color] ?? AURA_BORDER[''];
          const leftPos = cardWidth - 10 + i * PEEK_WIDTH;
          const zIdx = enchantments.length - i;

          return (
            <div
              key={aura.iid}
              className={styles.auraPeek}
              style={{
                left: leftPos,
                width: PEEK_WIDTH,
                height: cardHeight,
                background: `linear-gradient(160deg, ${bg}, #0a0806 80%)`,
                border: `1.5px solid ${bd}`,
                zIndex: zIdx,
              }}
              onMouseEnter={e => handleAuraMouseEnter(e, i)}
              onMouseLeave={handleAuraMouseLeave}
              onClick={handleAuraTap}
            >
              <span
                className={styles.auraName}
                style={{ color: AURA_BORDER[color] ?? '#c8a040' }}
              >
                {aura.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Desktop tooltip -- rendered into document.body via portal */}
      {!isMobile && hoveredAura &&
        ReactDOM.createPortal(
          <div
            className={styles.tooltip}
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            <div className={styles.tooltipName}>{hoveredAura.name}</div>
            {hoveredAura.cardData?.text && (
              <div className={styles.tooltipText}>
                {String(hoveredAura.cardData.text)}
              </div>
            )}
          </div>,
          document.body,
        )
      }

      {/* Mobile overlay -- full-screen dim + bottom sheet */}
      {isMobile && mobileOpen &&
        ReactDOM.createPortal(
          <div className={styles.mobileOverlay} onClick={handleOverlayClick}>
            <div className={styles.mobilePanel}>
              <div className={styles.mobilePanelTitle}>Enchantments</div>
              {enchantments.map(aura => {
                const color = (aura.cardData?.color as string) ?? '';
                const nameColor = AURA_BORDER[color] ?? '#c8a040';
                return (
                  <div key={aura.iid} className={styles.mobileAuraCard}>
                    <div className={styles.mobileAuraCardName} style={{ color: nameColor }}>
                      {aura.name}
                    </div>
                    {aura.cardData?.text && (
                      <div className={styles.mobileAuraCardText}>
                        {String(aura.cardData.text)}
                      </div>
                    )}
                  </div>
                );
              })}
              <button className={styles.mobileDismiss} onClick={() => setMobileOpen(false)}>
                Close
              </button>
            </div>
          </div>,
          document.body,
        )
      }
    </>
  );
}
