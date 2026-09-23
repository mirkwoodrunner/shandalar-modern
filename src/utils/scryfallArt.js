// Default printing preference: the classic sets Shandalar's pool was printed in.
export const CLASSIC_PRINTING_SETS = ['set:lea', 'set:leb', 'set:2ed', 'set:3ed', 'set:4ed'];

// Persistent name-to-URL cache. Neutral key: shared by Shandalar and Learn Mode.
// This caches the resolved art_crop URL string only, never image bytes.
export const ART_CACHE_KEY = 'art-cache:v1';

const artCache = new Map();

// Cache key for a card + printing preference. The default preference keys by bare
// card name, so persisted entries read as { [cardName]: ... }. Any other preference
// gets a suffixed key so different printings never collide.
function cacheKey(cardName, sets) {
  if (!sets || sets.length === 0) return `${cardName}|any`;
  const joined = sets.join(',');
  if (joined === CLASSIC_PRINTING_SETS.join(',')) return cardName;
  return `${cardName}|${joined}`;
}

// Shallow, presence-based validation (mirrors src/hooks/usePersistence.ts).
// Any bad entry invalidates the whole cache. No partial repair.
function isValidArtCache(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const entry of Object.values(value)) {
    if (typeof entry !== 'object' || entry === null) return false;
    if (!('url' in entry) || !('resolvedAt' in entry)) return false;
    if (entry.url !== null && typeof entry.url !== 'string') return false;
  }
  return true;
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(ART_CACHE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    if (!isValidArtCache(parsed)) {
      clearPersisted();
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(ART_CACHE_KEY);
  } catch {
    // storage unavailable
  }
}

let persisted = loadPersisted();

function writePersisted(key, url, artist) {
  persisted = { ...persisted, [key]: { url, artist, resolvedAt: new Date().toISOString() } };
  try {
    localStorage.setItem(ART_CACHE_KEY, JSON.stringify(persisted));
  } catch {
    // quota exceeded, private browsing, or no storage: in-memory only
  }
}

// Hydrate the in-memory Map once on module load.
for (const [key, entry] of Object.entries(persisted)) {
  artCache.set(
    key,
    entry.url
      ? { status: 'resolved', url: entry.url, artist: entry.artist }
      : { status: 'error', artist: entry.artist }
  );
}

function pickArt(card) {
  const url = card?.image_uris?.art_crop ?? card?.card_faces?.[0]?.image_uris?.art_crop ?? null;
  const artist = card?.artist ?? card?.card_faces?.[0]?.artist ?? null;
  return { url, artist };
}

// Resolves to { url, artist } (both nullable). One-argument calls search
// CLASSIC_PRINTING_SETS first, exactly as before. Pass { sets: [] } or
// { sets: null } to skip the set search and go straight to cards/named.
export async function fetchOldestArt(cardName, { sets = CLASSIC_PRINTING_SETS } = {}) {
  const key = cacheKey(cardName, sets);
  if (artCache.has(key)) {
    const cached = artCache.get(key);
    return cached.status === 'resolved'
      ? { url: cached.url, artist: cached.artist }
      : { url: null, artist: null };
  }
  // Mark as pending immediately to prevent duplicate in-flight requests
  artCache.set(key, { status: 'pending' });
  try {
    let url = null;
    let artist = null;
    if (sets && sets.length > 0) {
      const setParams = 'order=released&dir=asc&q=';
      const query = encodeURIComponent(`!"${cardName}" (${sets.join(' OR ')})`);
      const classicRes = await fetch(
        `https://api.scryfall.com/cards/search?${setParams}${query}&unique=prints`
      );
      if (classicRes.ok) {
        const classicData = await classicRes.json();
        ({ url, artist } = pickArt(classicData.data?.[0]));
      }
    }
    // Only a definitive Scryfall answer (found, or 404 not found) is persisted.
    // Transient failures stay in-memory so the next page load retries.
    let definitive = !!url;
    if (!url) {
      const namedRes = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`
      );
      if (namedRes.ok) {
        const namedData = await namedRes.json();
        ({ url, artist } = pickArt(namedData));
        definitive = true;
      } else if (namedRes.status === 404) {
        definitive = true;
      }
    }
    if (url) {
      artCache.set(key, { status: 'resolved', url, artist });
      writePersisted(key, url, artist);
      return { url, artist };
    } else {
      console.error(`[scryfallArt] No art_crop found for "${cardName}"`);
      artCache.set(key, { status: 'error' });
      if (definitive) writePersisted(key, null, null);
      return { url: null, artist: null };
    }
  } catch (err) {
    console.error(`[scryfallArt] Fetch failed for "${cardName}":`, err.message);
    artCache.set(key, { status: 'error' });
    return { url: null, artist: null };
  }
}

// Returns the resolved URL string (or null). Unchanged for existing callers.
export function subscribeCachedArt(cardName, { sets = CLASSIC_PRINTING_SETS } = {}) {
  const entry = artCache.get(cacheKey(cardName, sets));
  if (!entry) return null;
  if (entry.status === 'resolved') return entry.url;
  return null; // pending or error -- caller must wait for fetchOldestArt to resolve
}

// Returns { url, artist } for a resolved entry, else null.
export function peekCachedArt(cardName, { sets = CLASSIC_PRINTING_SETS } = {}) {
  const entry = artCache.get(cacheKey(cardName, sets));
  if (!entry || entry.status !== 'resolved') return null;
  return { url: entry.url, artist: entry.artist };
}
