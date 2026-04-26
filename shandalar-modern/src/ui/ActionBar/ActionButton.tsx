import { useState } from 'react';
import type { ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'end' | 'ghost';

const VARIANT_STYLES: Record<ButtonVariant, {
  bg: string; bd: string; color: string; shadow: string;
}> = {
  default: {
    bg: 'linear-gradient(180deg, #2a2218, var(--bg-panel))',
    bd: '#7a5a30',
    color: 'var(--ink-parchment)',
    shadow: '0 0 0 rgba(0,0,0,0)',
  },
  primary: {
    bg: 'linear-gradient(180deg, #4a3a18, #2a1e0a)',
    bd: 'var(--brass)',
    color: 'var(--brass-hi)',
    shadow: '0 0 12px rgba(196,160,64,.4)',
  },
  end: {
    bg: 'linear-gradient(180deg, #3a2018, #1c0e0a)',
    bd: '#a85030',
    color: '#ffb090',
    shadow: '0 0 8px rgba(168,80,48,.3)',
  },
  ghost: {
    bg: 'transparent',
    bd: 'rgba(120,90,40,.4)',
    color: 'var(--ink-muted)',
    shadow: 'none',
  },
};

interface ActionButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
}

export function ActionButton({ children, variant = 'default', disabled, onClick }: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const s = VARIANT_STYLES[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: s.bg,
        border: `1.5px solid ${s.bd}`,
        color: s.color,
        padding: '8px 18px',
        borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-display)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        boxShadow: `${s.shadow}, inset 0 1px 0 rgba(255,255,255,.06)`,
        opacity: disabled ? 0.4 : 1,
        transition: 'all var(--t-fast)',
        textShadow: '0 1px 2px rgba(0,0,0,.7)',
        filter: hovered && !disabled ? 'brightness(1.25)' : 'none',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'none',
      }}
    >
      {children}
    </button>
  );
}
