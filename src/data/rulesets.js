// src/data/rulesets.js

export const WORLD_RULES = {
  initialPlayerState: {
    health: 10,
    gold: 100,
    food: 20,
    position: { x: 5, y: 5 },
    inventory: []
  },
  movement: {
    costPerMove: 1, // Food cost
    terrainModifiers: {
      grass: 1,
      forest: 2,
      mountain: 3,
      swamp: 2,
      water: 99 // Impassable without special item
    }
  },
  encounters: {
    chancePerStep: 0.15,
    enemyLevelScaling: true
  }
};

export const DUEL_RULES = {
  startingHandSize: 7,
  maxHandSize: 7,
  startingLife: 20,
  deckMinimum: 40,
  phases: [
    'UNTAP',
    'UPKEEP',
    'DRAW',
    'MAIN_1',
    'COMBAT',
    'MAIN_2',
    'END'
  ],
  winConditions: {
    zeroLife: true,
    deckOut: true,
    poisonCounters: 10
  }
};

export const REWARDS_ENGINE = {
  winMultiplier: 1.5,
  lossPenalty: 0.5,
  anteEnabled: true // Classic Shandalar mechanic
};
