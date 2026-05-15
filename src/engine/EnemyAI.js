// src/engine/EnemyAI.js
// Enemy wander/chase logic for overworld canvas layer.
// No imports from DuelCore, AI.js, or React.

/**
 * Advance all enemy positions by one AI tick.
 *
 * @param {Array}  enemies    Current enemy array (immutable input)
 * @param {object} playerPos  {x, y}
 * @param {Array}  tiles      2D tile array (tiles[y][x])
 * @param {object} TERRAIN    Terrain constants (from MapGenerator.js)
 * @returns {Array}           New enemy array (input is never mutated)
 */
export function tickEnemyAI(enemies, playerPos, tiles, TERRAIN) {
  const canMoveTo = (x, y) => {
    const tile = tiles[y]?.[x];
    if (!tile) return false;
    if (tile.terrain === TERRAIN.WATER) return false;
    if (tile.structure) return false;
    return true;
  };

  return enemies.map(enemy => {
    const dx = playerPos.x - enemy.x;
    const dy = playerPos.y - enemy.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (dist <= 4) {
      // Chase: greedy step toward player, prefer axis with greater distance (tie → horizontal)
      let newX = enemy.x;
      let newY = enemy.y;
      let newDir = enemy.dir;

      const tryH = () => {
        if (dx === 0) return false;
        const nx = enemy.x + Math.sign(dx);
        if (canMoveTo(nx, enemy.y)) {
          newX = nx;
          newDir = dx > 0 ? 'right' : 'left';
          return true;
        }
        return false;
      };

      const tryV = () => {
        if (dy === 0) return false;
        const ny = enemy.y + Math.sign(dy);
        if (canMoveTo(enemy.x, ny)) {
          newY = ny;
          newDir = dy > 0 ? 'down' : 'up';
          return true;
        }
        return false;
      };

      if (Math.abs(dx) >= Math.abs(dy)) {
        if (!tryH()) tryV();
      } else {
        if (!tryV()) tryH();
      }

      const moved = newX !== enemy.x || newY !== enemy.y;
      return {
        ...enemy,
        x: newX,
        y: newY,
        dir: newDir,
        animFrame: moved ? (enemy.animFrame + 1) % 4 : enemy.animFrame,
      };
    }

    // Wander: 30% chance to stay put
    if (Math.random() < 0.3) return enemy;

    const CARDINALS = [
      { dx: 0, dy: -1, dir: 'up' },
      { dx: 0, dy: 1, dir: 'down' },
      { dx: -1, dy: 0, dir: 'left' },
      { dx: 1, dy: 0, dir: 'right' },
    ];
    const d = CARDINALS[Math.floor(Math.random() * 4)];
    const nx = enemy.x + d.dx;
    const ny = enemy.y + d.dy;
    if (canMoveTo(nx, ny)) {
      return {
        ...enemy,
        x: nx,
        y: ny,
        dir: d.dir,
        animFrame: (enemy.animFrame + 1) % 4,
      };
    }
    return enemy;
  });
}
