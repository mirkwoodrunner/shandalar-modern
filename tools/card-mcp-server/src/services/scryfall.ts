const SCRYFALL_BASE = 'https://api.scryfall.com';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function scryfallGet<T>(path: string): Promise<T> {
  await sleep(75);
  const res = await fetch(`${SCRYFALL_BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Scryfall ${res.status} for ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}
