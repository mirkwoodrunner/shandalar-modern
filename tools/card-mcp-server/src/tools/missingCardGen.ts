import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupBySlugOrName, toSlug } from '../poolCache.js';
import { scryfallGet } from '../services/scryfall.js';
import type { PoolCard, ScryfallCard } from '../types.js';

interface CardEntry {
  id: string;
  name: string;
  cost: string;
  cmc: number;
  type: string;
  subtype: string;
  color: string;
  power: string | null;
  toughness: string | null;
  effect: string;
  keywords: string[];
}

function extractSubtype(typeLine: string): string {
  const dashIdx = typeLine.indexOf('—');
  if (dashIdx === -1) return '';
  return typeLine.slice(dashIdx + 2).trim();
}

function extractType(typeLine: string): string {
  const parts = typeLine.split(/[—–\-]/);
  const superAndMain = parts[0].trim();
  const words = superAndMain.split(/\s+/);
  return words[words.length - 1] ?? words[0] ?? typeLine;
}

function extractColor(colors: string[]): string {
  return colors[0] ?? '';
}

function fromPoolCard(card: PoolCard, effectHint: string): CardEntry {
  return {
    id: card.id,
    name: card.name,
    cost: card.manaCost || '',
    cmc: card.cmc,
    type: extractType(card.typeLine),
    subtype: extractSubtype(card.typeLine),
    color: extractColor(card.colors),
    power: card.power,
    toughness: card.toughness,
    effect: effectHint,
    keywords: card.keywords,
  };
}

function fromScryfallCard(card: ScryfallCard, slug: string, effectHint: string): CardEntry {
  return {
    id: slug,
    name: card.name,
    cost: card.mana_cost || '',
    cmc: card.cmc,
    type: extractType(card.type_line),
    subtype: extractSubtype(card.type_line),
    color: extractColor(card.colors),
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    effect: effectHint,
    keywords: card.keywords ?? [],
  };
}

function toJsSnippet(entry: CardEntry): string {
  const kwStr = entry.keywords.length > 0
    ? `[${entry.keywords.map(k => `'${k}'`).join(', ')}]`
    : '[]';
  const powerLine = entry.power != null ? `\n    power: '${entry.power}',\n    toughness: '${entry.toughness}',` : '';
  const subtypeLine = entry.subtype ? `\n    subtype: '${entry.subtype}',` : '';

  return `  {
    id: '${entry.id}',
    name: '${entry.name}',
    cost: '${entry.cost}',
    cmc: ${entry.cmc},
    type: '${entry.type}',${subtypeLine}
    color: '${entry.color}',${powerLine}
    effect: '${entry.effect}',
    keywords: ${kwStr},
  },`;
}

export function registerMissingCardGen(server: McpServer): void {
  server.tool(
    'shandalar_missing_card_gen',
    'Generate a cards.js DB entry for a card not yet in cards.js. Uses pool cache first, Scryfall fallback.',
    {
      card: z.string().min(1).describe('Card name or slug ID'),
      effect_hint: z.string().optional().describe("Effect string to assign, e.g. 'GROUP_A_PROTECTION'. Defaults to 'STUB'"),
      response_format: z.enum(['js_snippet', 'json']).default('js_snippet'),
    },
    async ({ card, effect_hint, response_format }) => {
      const effectStr = effect_hint ?? 'STUB';
      const slug = toSlug(card);
      const poolCard = lookupBySlugOrName(card);

      let entry: CardEntry;

      if (poolCard) {
        entry = fromPoolCard(poolCard, effectStr);
      } else {
        let scryfallCard: ScryfallCard;
        try {
          scryfallCard = await scryfallGet<ScryfallCard>(`/cards/named?exact=${encodeURIComponent(card)}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('404')) {
            return {
              content: [{
                type: 'text' as const,
                text: `Card not found in pool or Scryfall: "${card}"`,
              }],
            };
          }
          throw e;
        }
        entry = fromScryfallCard(scryfallCard, slug, effectStr);
      }

      if (response_format === 'json') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(entry, null, 2) }],
        };
      }

      return { content: [{ type: 'text' as const, text: toJsSnippet(entry) }] };
    }
  );
}
