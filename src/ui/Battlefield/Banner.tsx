import { useIsMobile } from '../../hooks/useIsMobile';
import { LifeTotal } from './LifeTotal';
import { ZoneCount } from './ZoneCount';
import { Cost, PoolDisplay } from '../Card/Cost';
import type { ManaSym } from '../Card/types';

interface BannerPlayer {
  life: number;
  max: number;
  lifeAnim?: 'damage' | 'heal' | null;
  mana: Record<string, number>;
  lib: number;
  gy: number;
  poisonCounters?: number;
}

export interface CastPromptProps {
  mode: 'targeting' | 'mana';
  targetLabel?: string;
  canSkip?: boolean;
  onSkip?: () => void;
  onConfirmTargets?: () => void;
  targetsSelected?: number;
  costNeeded?: string;
  shortfall?: { needed: Record<string, number>; have: Record<string, number> } | null;
  onCancel: () => void;
}

interface BannerProps {
  side: 'you' | 'opp';
  player: BannerPlayer;
  flavorText?: string;
  onLifeClick?: () => void;
  onGraveyardClick?: () => void;
  compact?: boolean;
  castPrompt?: CastPromptProps;
}

export function Banner({ side, player, flavorText, onLifeClick, onGraveyardClick, compact = false, castPrompt }: BannerProps) {
  const isMobile = useIsMobile();
  const isOpp = side === 'opp';
  const manaTotal = Object.values(player.mana).reduce((a, b) => a + b, 0);
  const showPool = manaTotal > 0 || castPrompt?.mode === 'mana';

  const borderColor = isOpp ? 'rgba(180,80,30,.3)' : 'rgba(80,140,40,.3)';
  const bg = isOpp
    ? 'linear-gradient(90deg, rgba(60,20,10,.5), rgba(40,12,6,.3), rgba(60,20,10,.5))'
    : 'linear-gradient(90deg, rgba(20,40,10,.5), rgba(14,28,6,.3), rgba(20,40,10,.5))';

  return (
    <div
      data-testid={isOpp ? 'banner-opp' : 'banner-you'}
      style={{
        flexShrink: 0,
        padding: (isMobile || compact) ? '4px 8px' : '8px 14px',
        background: bg,
        borderTop: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        gap: (isMobile || compact) ? 8 : 16,
      }}
    >
      {onLifeClick ? (
        <button
          onClick={onLifeClick}
          title={`Target ${isOpp ? 'opponent' : 'yourself'}`}
          aria-label={`Target ${isOpp ? 'opponent' : 'yourself'}`}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,100,60,.5)',
            borderRadius: 3,
            cursor: 'pointer',
            padding: 0,
            animation: 'mdTargetPulse 1.2s ease-in-out infinite',
          }}
        >
          <LifeTotal
            life={player.life}
            max={player.max}
            label={isOpp ? 'Opponent' : 'You'}
            side={side}
            anim={player.lifeAnim}
          />
        </button>
      ) : (
        <LifeTotal
          life={player.life}
          max={player.max}
          label={isOpp ? 'Opponent' : 'You'}
          side={side}
          anim={player.lifeAnim}
          onClick={onLifeClick}
        />
      )}
      <ZoneCount label="Library" count={player.lib} glyph="📚" />
      <ZoneCount label="Graveyard" count={player.gy} glyph="⚰" onClick={onGraveyardClick} />
      {!!player.poisonCounters && <ZoneCount label="Poison" count={player.poisonCounters} glyph="☠" />}

      {showPool && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isMobile ? '3px 6px' : '6px 10px',
          background: 'rgba(0,0,0,.4)',
          border: '1px solid rgba(120,90,40,.3)',
          borderRadius: 3,
        }}>
          <span style={{
            fontSize: 9, color: 'var(--ink-faint)',
            fontFamily: 'var(--font-display)', letterSpacing: 1,
          }}>POOL</span>
          <PoolDisplay pool={player.mana as Partial<Record<ManaSym, number>>} size={isOpp ? 13 : 14} />
        </div>
      )}

      {castPrompt && (
        <div data-testid="cast-prompt" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px',
          background: 'rgba(20,10,40,.6)',
          border: '1px solid rgba(100,80,180,.4)',
          borderRadius: 3,
        }}>
          {castPrompt.mode === 'targeting' && (
            <>
              <span data-testid="cast-prompt-label" style={{ fontSize: 10, color: 'rgba(180,160,255,.9)', fontFamily: 'var(--font-display)' }}>
                {castPrompt.targetLabel ?? 'Select target'}
              </span>
              {castPrompt.targetsSelected != null && castPrompt.targetsSelected >= 1 && (
                <button
                  data-testid="cast-prompt-confirm"
                  onClick={castPrompt.onConfirmTargets}
                  style={{
                    background: 'rgba(60,40,120,.8)', border: '1px solid rgba(120,100,200,.6)',
                    color: 'rgba(200,180,255,.9)', borderRadius: 2, cursor: 'pointer',
                    fontSize: 10, padding: '2px 6px',
                  }}
                >Confirm</button>
              )}
              {castPrompt.canSkip && (
                <button
                  data-testid="cast-prompt-skip"
                  onClick={castPrompt.onSkip}
                  style={{
                    background: 'transparent', border: '1px solid rgba(100,80,160,.4)',
                    color: 'rgba(160,140,220,.7)', borderRadius: 2, cursor: 'pointer',
                    fontSize: 10, padding: '2px 6px',
                  }}
                >Skip</button>
              )}
            </>
          )}
          {castPrompt.mode === 'mana' && castPrompt.costNeeded && (
            <>
              <span data-testid="cast-prompt-need" style={{ fontSize: 9, color: 'var(--ink-faint)', fontFamily: 'var(--font-display)' }}>NEED</span>
              <Cost cost={castPrompt.costNeeded} size={12} />
            </>
          )}
          <button
            data-testid="cast-prompt-cancel"
            onClick={castPrompt.onCancel}
            style={{
              background: 'transparent', border: '1px solid rgba(120,90,40,.4)',
              color: 'var(--ink-parchment)', borderRadius: 2, cursor: 'pointer',
              fontSize: 10, padding: '2px 6px',
            }}
          >Cancel</button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {flavorText && (
        <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
          {flavorText}
        </span>
      )}
    </div>
  );
}
