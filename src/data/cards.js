// src/data/cards.js

export const CARD_DB = [
  {
    id: "plains",
    name: "Plains",
    type: "Land",
    produces: ["W"],
    rarity: "C",
    image: "https://cards.scryfall.io/large/front/5/f/5f045353-0667-4581-987d-42994966d8f8.jpg"
  },
  {
    id: "black_lotus",
    name: "Black Lotus",
    type: "Artifact",
    cmc: 0,
    rarity: "R",
    activated: { cost: "T,sac", effect: "addMana3Any" },
    image: "https://cards.scryfall.io/large/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg"
  },
  // ... PASTE THE REST OF YOUR ~1,500 LINES HERE ...
];

// Helper to find cards by ID quickly
export const getCardById = (id) => CARD_DB.find(c => c.id === id);
