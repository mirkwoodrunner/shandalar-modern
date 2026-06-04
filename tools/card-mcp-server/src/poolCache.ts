import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PoolCard } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _cache: PoolCard[] | null = null;

export function getPool(): PoolCard[] {
  if (_cache) return _cache;
  const poolPath = resolve(__dirname, '../../../scryfall/shandalar-card-pool.json');
  try {
    const raw = readFileSync(poolPath, 'utf-8');
    _cache = JSON.parse(raw) as PoolCard[];
    return _cache;
  } catch {
    throw new Error(
      `FATAL: Cannot load shandalar-card-pool.json at ${poolPath}. ` +
      `Run 'node scryfall/process-card-pool.js' first to generate it.`
    );
  }
}

export function lookupBySlugOrName(input: string): PoolCard | undefined {
  const pool = getPool();
  const slug = toSlug(input);
  return (
    pool.find(c => c.id === slug) ||
    pool.find(c => c.name.toLowerCase() === input.toLowerCase())
  );
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
