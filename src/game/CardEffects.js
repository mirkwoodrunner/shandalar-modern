export function handleBlackLotusActivation(gameState, targetColor) {
  const newState = JSON.parse(JSON.stringify(gameState));

  const lotusInHand = newState.p_hand.find(c => c.name === 'Black Lotus');
  const lotusOnField = newState.p_battlefield.find(c => c.name === 'Black Lotus');
  const lotus = lotusInHand || lotusOnField;

  if (!lotus) {
    console.error('handleBlackLotusActivation: Black Lotus not found in hand or battlefield');
    return newState;
  }

  // Remove from wherever it is
  if (lotusInHand) {
    newState.p_hand = newState.p_hand.filter(c => c.name !== 'Black Lotus');
  } else {
    newState.p_battlefield = newState.p_battlefield.filter(c => c.name !== 'Black Lotus');
  }

  // Send to graveyard
  newState.p_graveyard.push(lotus);

  // Add 3 mana of chosen color
  newState.p_mana_pool[targetColor] = (newState.p_mana_pool[targetColor] || 0) + 3;

  return newState;
}

export function handleTimetwister(gameState, castingPlayer) {
  const newState = JSON.parse(JSON.stringify(gameState));
  const p = castingPlayer === 'p' ? 'p' : 'a';
  const opp = castingPlayer === 'p' ? 'a' : 'p';

  // Merge each graveyard back into its library
  newState[`${p}_library`] = [...newState[`${p}_library`], ...newState[`${p}_graveyard`]];
  newState[`${p}_graveyard`] = [];

  newState[`${opp}_library`] = [...newState[`${opp}_library`], ...newState[`${opp}_graveyard`]];
  newState[`${opp}_graveyard`] = [];

  // Fisher-Yates shuffle
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  newState[`${p}_library`] = shuffle(newState[`${p}_library`]);
  newState[`${opp}_library`] = shuffle(newState[`${opp}_library`]);

  // Draw 7 for each player
  for (let i = 0; i < 7; i++) {
    if (newState[`${p}_library`].length > 0) {
      newState[`${p}_hand`].push(newState[`${p}_library`].shift());
    }
    // If the library is empty, the player simply does not draw ? no token, no error
    // Drawing from an empty library is handled by the normal loss condition elsewhere

    if (newState[`${opp}_library`].length > 0) {
      newState[`${opp}_hand`].push(newState[`${opp}_library`].shift());
    }
  }

  // Timetwister goes to the casting player's graveyard ? it is the only card there
  newState[`${p}_graveyard`] = [{ name: 'Timetwister', type_line: 'Sorcery' }];

  return newState;
}
