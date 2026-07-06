import { ZoneChip } from './ZoneChip';
import { Cost, PoolDisplay } from '../Card/Cost';
import s from './styles.module.css';

interface BannerPlayer {
  life: number;
  max: number;
  mana: Record<string, number>;
  lib: number;
  gy: number;
  handCount?: number;
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
  onLifeClick?: () => void;
  castPrompt?: CastPromptProps;
}

export function Banner({ side, player, onLifeClick, castPrompt }: BannerProps) {
  const isOpp = side === 'opp';
  const accent = isOpp ? 'var(--opp)' : 'var(--you)';

  const lifeColor =
    player.life <= 5
      ? 'var(--life-low)'
      : player.life <= 10
      ? 'var(--life-mid)'
      : isOpp
      ? 'var(--opp-life)'
      : 'var(--you-life)';

  const lifeBarBg = player.life <= 5
    ? 'linear-gradient(90deg, #c41818, #ee3030)'
    : isOpp
    ? 'linear-gradient(90deg, #8a2818, #c45028)'
    : 'linear-gradient(90deg, #2a8030, #5ac040)';

  const lifePct = Math.max(0, (player.life / player.max) * 100);
  const manaTot = Object.values(player.mana).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div
      data-iid={isOpp ? 'player-o' : 'player-p'}
      data-testid={isOpp ? 'banner-opp' : 'banner-you'}
      className={`${s.banner} ${isOpp ? s.bannerOpp : s.bannerYou}`}
    >
      {/* Life */}
      <div className={s.lifeBlock}>
        <div className={s.lifeLabels}>
          <span className={s.lifeSide} style={{ color: accent, textShadow: `0 0 5px ${accent}66` }}>
            {isOpp ? 'OPPONENT' : 'YOU'}
          </span>
          <span className={s.lifeWord}>Life</span>
        </div>
        <div className={s.lifeNumWrap}>
          {onLifeClick ? (
            <button
              onClick={onLifeClick}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,100,60,.5)',
                borderRadius: 3,
                color: lifeColor,
                cursor: 'pointer',
                padding: '0 4px',
                animation: 'mdTargetPulse 1.2s ease-in-out infinite',
                textShadow: `0 0 10px ${lifeColor}55, 0 2px 3px rgba(0,0,0,.9)`,
              }}
              className={`${s.lifeNum} ${player.life <= 5 ? s.lifePulse : ''}`}
              aria-label={`Target ${side === 'opp' ? 'opponent' : 'yourself'}`}
            >
              {player.life}
            </button>
          ) : (
            <span
              className={`${s.lifeNum} ${player.life <= 5 ? s.lifePulse : ''}`}
              style={{ color: lifeColor, textShadow: `0 0 10px ${lifeColor}55, 0 2px 3px rgba(0,0,0,.9)` }}
            >
              {player.life}
            </span>
          )}
          <span className={s.lifeMax}>/{player.max}</span>
        </div>
        <div className={s.lifeBar}>
          <div className={s.lifeBarFill} style={{ width: `${lifePct}%`, background: lifeBarBg }} />
        </div>
      </div>

      {/* Zone chips */}
      <div className={s.zoneChips}>
        <ZoneChip glyph="📚" count={player.lib} label="LIB" />
        <ZoneChip glyph="🪦" count={player.gy} label="GY" />
        {!!player.poisonCounters && (
          <ZoneChip glyph="☠" count={player.poisonCounters} label="POISON" />
        )}
        {isOpp && player.handCount !== undefined && (
          <ZoneChip glyph="🂠" count={player.handCount} label="HAND" />
        )}
      </div>

      <div className={s.bannerSpacer} />

      {/* Mana pool */}
      {manaTot > 0 ? (
        <div className={s.manaPool}>
          <span className={s.manaPoolLabel}>POOL</span>
          <PoolDisplay pool={player.mana} size={11} />
        </div>
      ) : (
        <span className={s.noMana}>NO MANA</span>
      )}

      {/* Cast/Activate flow prompt */}
      {castPrompt && (
        <div data-testid="cast-prompt" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 6px',
          background: 'rgba(20,10,40,.7)',
          border: '1px solid rgba(100,80,180,.4)',
          borderRadius: 3,
        }}>
          {castPrompt.mode === 'targeting' && (
            <>
              <span data-testid="cast-prompt-label" style={{ fontSize: 9, color: 'rgba(180,160,255,.9)', fontFamily: 'var(--font-display)' }}>
                {castPrompt.targetLabel ?? 'Select target'}
              </span>
              {castPrompt.targetsSelected != null && castPrompt.targetsSelected >= 1 && (
                <button
                  data-testid="cast-prompt-confirm"
                  onClick={castPrompt.onConfirmTargets}
                  style={{
                    background: 'rgba(60,40,120,.8)', border: '1px solid rgba(120,100,200,.6)',
                    color: 'rgba(200,180,255,.9)', borderRadius: 2, cursor: 'pointer',
                    fontSize: 9, padding: '1px 5px',
                  }}
                >OK</button>
              )}
              {castPrompt.canSkip && (
                <button
                  data-testid="cast-prompt-skip"
                  onClick={castPrompt.onSkip}
                  style={{
                    background: 'transparent', border: '1px solid rgba(100,80,160,.4)',
                    color: 'rgba(160,140,220,.7)', borderRadius: 2, cursor: 'pointer',
                    fontSize: 9, padding: '1px 5px',
                  }}
                >Skip</button>
              )}
            </>
          )}
          {castPrompt.mode === 'mana' && castPrompt.costNeeded && (
            <>
              <span data-testid="cast-prompt-need" style={{ fontSize: 9, color: 'var(--ink-faint)', fontFamily: 'var(--font-display)' }}>NEED</span>
              <Cost cost={castPrompt.costNeeded} size={11} />
            </>
          )}
          <button
            data-testid="cast-prompt-cancel"
            onClick={castPrompt.onCancel}
            style={{
              background: 'transparent', border: '1px solid rgba(120,90,40,.4)',
              color: 'var(--ink-parchment)', borderRadius: 2, cursor: 'pointer',
              fontSize: 9, padding: '1px 5px',
            }}
          >X</button>
        </div>
      )}
    </div>
  );
}
