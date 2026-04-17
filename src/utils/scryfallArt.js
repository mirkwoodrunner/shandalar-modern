const cache = new Map();

export async function fetchOldestArt(cardName) {
  const cached = cache.get(cardName);
  if (cached?.status === 'resolved') return cached.url;
  if (cached?.status === 'error') return null;

  const encodedName = encodeURIComponent(cardName);

  try {
    const classicUrl = `https://api.scryfall.com/cards/search?order=released&dir=asc&unique=prints&q=!"${encodedName}" (set:lea OR set:leb OR set:2ed OR set:3ed OR set:4ed)`;
    const classicResp = await fetch(classicUrl);

    let artUrl = null;

    if (classicResp.ok) {
      const classicData = await classicResp.json();
      if (classicData?.data?.length > 0) {
        artUrl = extractArtCrop(classicData.data[0], cardName);
      }
    }

    if (!artUrl) {
      const namedResp = await fetch(`https://api.scryfall.com/cards/named?exact=${encodedName}`);
      if (!namedResp.ok) {
        cache.set(cardName, { url: null, status: 'error' });
        return null;
      }
      const namedData = await namedResp.json();
      artUrl = extractArtCrop(namedData, cardName);
    }

    if (!artUrl) {
      cache.set(cardName, { url: null, status: 'error' });
      return null;
    }

    cache.set(cardName, { url: artUrl, status: 'resolved' });
    return artUrl;
  } catch (err) {
    cache.set(cardName, { url: null, status: 'error' });
    return null;
  }
}

function extractArtCrop(cardData, cardName) {
  if (cardData?.image_uris?.art_crop) {
    return cardData.image_uris.art_crop;
  }
  if (cardData?.card_faces?.[0]?.image_uris?.art_crop) {
    return cardData.card_faces[0].image_uris.art_crop;
  }
  console.error('scryfallArt: missing image_uris for', cardName, cardData);
  return null;
}

export function getCachedArt(cardName) {
  const cached = cache.get(cardName);
  return cached?.status === 'resolved' ? cached.url : null;
}
