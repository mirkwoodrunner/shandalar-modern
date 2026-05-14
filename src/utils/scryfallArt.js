const artCache = new Map();

export async function fetchOldestArt(cardName) {
  if (artCache.has(cardName)) {
    const cached = artCache.get(cardName);
    return cached.status === 'resolved' ? cached.url : null;
  }
  // Mark as pending immediately to prevent duplicate in-flight requests
  artCache.set(cardName, { status: 'pending' });
  try {
    const setParams = 'order=released&dir=asc&q=';
    const sets = ['set:lea', 'set:leb', 'set:2ed', 'set:3ed', 'set:4ed'];
    const query = encodeURIComponent(`!"${cardName}" (${sets.join(' OR ')})`);
    let url = null;
    const classicRes = await fetch(
      `https://api.scryfall.com/cards/search?${setParams}${query}&unique=prints`
    );
    if (classicRes.ok) {
      const classicData = await classicRes.json();
      const card = classicData.data?.[0];
      url = card?.image_uris?.art_crop ?? card?.card_faces?.[0]?.image_uris?.art_crop ?? null;
    }
    if (!url) {
      const namedRes = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`
      );
      if (namedRes.ok) {
        const namedData = await namedRes.json();
        url = namedData?.image_uris?.art_crop ?? namedData?.card_faces?.[0]?.image_uris?.art_crop ?? null;
      }
    }
    if (url) {
      artCache.set(cardName, { status: 'resolved', url });
      return url;
    } else {
      console.error(`[scryfallArt] No art_crop found for "${cardName}"`);
      artCache.set(cardName, { status: 'error' });
      return null;
    }
  } catch (err) {
    console.error(`[scryfallArt] Fetch failed for "${cardName}":`, err.message);
    artCache.set(cardName, { status: 'error' });
    return null;
  }
}

export function subscribeCachedArt(cardName) {
  const entry = artCache.get(cardName);
  if (!entry) return null;
  if (entry.status === 'resolved') return entry.url;
  return null; // pending or error — caller must wait for fetchOldestArt to resolve
}
