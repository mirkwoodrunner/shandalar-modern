// src/ui/Stack/StackDisplay.tsx
// Renders the spell stack as a card splay. Top item (last in array) is fully visible;
// lower items show title bars only. Mobile: fixed bottom sheet. Desktop: overlay.

import React, { useState, useEffect, useRef } from 'react';
import { fetchOldestArt } from '../../utils/scryfallArt.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface StackEntry {
  id: string;
  card: any;
  caster: 'p' | 'o';
  targets: string[];
  xVal: number;
  isAbility?: boolean;
  abilityText?: string;
}

export interface StackDisplayProps {
  stack: StackEntry[];
  isMobile: boolean;
  // px offset from bottom for fixed positioning. Default 48.
  // bottomOffset prop: DuelScreen.tsx passes 48 (MobileActionDrawer tab height),
  // DuelScreenMobile.tsx passes 56 (mobile ActionBar height).
  // Update these values if ActionBar heights change.
  bottomOffset?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function casterLabel(caster: 'p' | 'o'): string {
  return caster === 'p' ? 'YOU' : 'OPP';
}

function borderColor(caster: 'p' | 'o'): string {
  return caster === 'p' ? '#4a8f4a' : '#8f4a4a';
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface TopCardProps {
  entry: StackEntry;
  artUrl: string | null;
  isMobile: boolean;
}

function TopCard({ entry, artUrl, isMobile }: TopCardProps) {
  const { card, caster, abilityText } = entry;
  const w = isMobile ? 96 : 120;
  const h = isMobile ? 134 : 168;
  const rulesText = abilityText ?? card.text ?? card.effect ?? '';

  return (
    <div
      data-testid="stack-top-card"
      style={{
        width: w,
        height: h,
        border: `2px solid ${borderColor(caster)}`,
        borderRadius: 6,
        background: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Art area */}
      <div style={{
        flex: '0 0 50%',
        background: artUrl
          ? `url(${artUrl}) center/cover no-repeat`
          : '#1a1a1a',
        border: '1px solid #333',
        borderBottom: 'none',
      }} />
      {/* Text area */}
      <div style={{
        flex: 1,
        padding: '3px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: isMobile ? 8 : 9,
          fontWeight: 700,
          color: '#e8d880',
          fontFamily: 'var(--font-display, serif)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {card.name}
        </div>
        <div style={{
          fontSize: isMobile ? 7 : 8,
          color: '#a09060',
          fontFamily: 'var(--font-display, serif)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {card.type ?? ''}
        </div>
        <div style={{
          fontSize: isMobile ? 6 : 7,
          color: '#888',
          fontFamily: 'var(--font-mono, monospace)',
          lineHeight: 1.3,
          overflow: 'hidden',
          flex: 1,
        }}>
          {rulesText}
        </div>
        <div style={{
          fontSize: isMobile ? 6 : 7,
          color: borderColor(caster),
          fontFamily: 'var(--font-display, serif)',
          fontWeight: 700,
          marginTop: 2,
        }}>
          {casterLabel(caster)}
        </div>
      </div>
    </div>
  );
}

interface TitleBarProps {
  entry: StackEntry;
  artUrl: string | null;
  isMobile: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function TitleBar({ entry, artUrl, isMobile, expanded, onToggle }: TitleBarProps) {
  const { card, caster } = entry;
  const h = isMobile ? 24 : 28;
  const rulesText = entry.abilityText ?? card.text ?? card.effect ?? '';

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${card.name}, cast by ${caster === 'p' ? 'you' : 'opponent'}, click to view details`}
        data-testid="stack-title-bar"
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        style={{
          height: h,
          border: `1px solid ${borderColor(caster)}`,
          borderRadius: 4,
          background: '#111',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 6,
          paddingRight: 6,
          gap: 6,
          cursor: 'pointer',
          userSelect: 'none',
          width: isMobile ? 96 : 120,
          flexShrink: 0,
          position: 'relative',
        }}
        title={isMobile ? undefined : `${card.name} (${casterLabel(caster)}): ${rulesText}`}
      >
        <span style={{
          fontSize: isMobile ? 7 : 8,
          color: '#e8d880',
          fontFamily: 'var(--font-display, serif)',
          fontWeight: 700,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {card.name}
        </span>
        <span style={{
          fontSize: isMobile ? 6 : 7,
          color: borderColor(caster),
          fontFamily: 'var(--font-display, serif)',
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {casterLabel(caster)}
        </span>
      </div>
      {/* Mobile tap-to-expand */}
      {isMobile && expanded && (
        <div style={{
          border: `1px solid ${borderColor(caster)}`,
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          background: '#0e0e0e',
          padding: '4px 6px',
          width: 96,
        }}>
          <div style={{ fontSize: 7, color: '#a09060', fontFamily: 'var(--font-display, serif)', marginBottom: 2 }}>
            {card.type ?? ''}
          </div>
          <div style={{ fontSize: 7, color: '#888', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.3 }}>
            {rulesText}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function StackDisplay({ stack, isMobile, bottomOffset = 48 }: StackDisplayProps) {
  const [artUrls, setArtUrls] = useState<Record<string, string | null>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fetchedRef = useRef<Set<string>>(new Set());

  // Load art for each unique card name
  useEffect(() => {
    for (const entry of stack) {
      const name = entry.card?.name;
      if (!name || fetchedRef.current.has(name)) continue;
      fetchedRef.current.add(name);
      fetchOldestArt(name).then((url: string | null) => {
        setArtUrls(prev => ({ ...prev, [name]: url }));
      });
    }
  }, [stack]);

  if (!stack || stack.length === 0) return null;

  // Visual order: index 0 at bottom, last index at top. We render top-to-bottom visually as
  // last-index first (top of stack at top of display, lowest at bottom).
  const ordered = [...stack].reverse();
  const topEntry = ordered[0];
  const restEntries = ordered.slice(1);

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        // bottomOffset prop: DuelScreen.tsx passes 48 (MobileActionDrawer tab height),
        // DuelScreenMobile.tsx passes 56 (mobile ActionBar height).
        // Update these values if ActionBar heights change.
        bottom: bottomOffset,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
        padding: '6px 12px',
        background: 'rgba(10,8,5,0.92)',
        borderTop: '1px solid rgba(180,140,60,.3)',
        zIndex: 50,
        maxHeight: '40vh',
        overflowX: 'auto',
        overflowY: 'hidden',
      }
    : {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 10,
        background: 'rgba(10,8,5,0.88)',
        border: '1px solid rgba(180,140,60,.3)',
        borderRadius: 8,
        zIndex: 50,
        maxHeight: '80vh',
        overflowY: 'auto',
      };

  return (
    <div data-testid="stack-display" style={panelStyle}>
      {/* Top stack item — fully visible with art */}
      <TopCard
        entry={topEntry}
        artUrl={artUrls[topEntry.card?.name] ?? null}
        isMobile={isMobile}
      />
      {/* Remaining items — title bars only */}
      {restEntries.map(entry => (
        <TitleBar
          key={entry.id}
          entry={entry}
          artUrl={artUrls[entry.card?.name] ?? null}
          isMobile={isMobile}
          expanded={expandedId === entry.id}
          onToggle={() => setExpandedId(prev => prev === entry.id ? null : entry.id)}
        />
      ))}
    </div>
  );
}
