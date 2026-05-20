import { ZoneChip } from './ZoneChip';
import { PoolDisplay } from '../Card/Cost';
import s from './styles.module.css';

interface BannerPlayer {
  life: number;
  max: number;
  mana: Record<string, number>;
  lib: number;
  gy: number;
  handCount?: number;
}

interface BannerProps {
  side: 'you' | 'opp';
  player: BannerPlayer;
}

export function Banner({ side, player }: BannerProps) {
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
          <span
            className={`${s.lifeNum} ${player.life <= 5 ? s.lifePulse : ''}`}
            style={{ color: lifeColor, textShadow: `0 0 10px ${lifeColor}55, 0 2px 3px rgba(0,0,0,.9)` }}
          >
            {player.life}
          </span>
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
    </div>
  );
}
