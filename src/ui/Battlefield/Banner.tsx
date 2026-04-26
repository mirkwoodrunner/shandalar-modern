import { LifeTotal } from './LifeTotal';
import { ZoneCount } from './ZoneCount';
import { PoolDisplay } from '../Card/Cost';
import type { ManaSym } from '../Card/types';

interface BannerPlayer {
  life: number;
  max: number;
  lifeAnim?: 'damage' | 'heal' | null;
  mana: Record<string, number>;
  lib: number;
  gy: number;
}

interface BannerProps {
  side: 'you' | 'opp';
  player: BannerPlayer;
  flavorText?: string;
  onLifeClick?: () => void;
  onGraveyardClick?: () => void;
}

export function Banner({ side, player, flavorText, onLifeClick, onGraveyardClick }: BannerProps) {
  const isOpp = side === 'opp';
  const manaTotal = Object.values(player.mana).reduce((a, b) => a + b, 0);

  const borderColor = isOpp ? 'rgba(180,80,30,.3)' : 'rgba(80,140,40,.3)';
  const bg = isOpp
    ? 'linear-gradient(90deg, rgba(60,20,10,.5), rgba(40,12,6,.3), rgba(60,20,10,.5))'
    : 'linear-gradient(90deg, rgba(20,40,10,.5), rgba(14,28,6,.3), rgba(20,40,10,.5))';

  return (
    <div style={{
      flexShrink: 0,
      padding: '8px 14px',
      background: bg,
      borderTop: `1px solid ${borderColor}`,
      borderBottom: `1px solid ${borderColor}`,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <LifeTotal
        life={player.life}
        max={player.max}
        label={isOpp ? 'Opponent' : 'You'}
        side={side}
        anim={player.lifeAnim}
        onClick={onLifeClick}
      />
      <ZoneCount label="Library" count={player.lib} glyph="?" />
      <ZoneCount label="Graveyard" count={player.gy} glyph="?" onClick={onGraveyardClick} />

      {manaTotal > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px',
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

      <div style={{ flex: 1 }} />

      {flavorText && (
        <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
          {flavorText}
        </span>
      )}
    </div>
  );
}
