import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupBySlugOrName, toSlug } from '../poolCache.js';
import { scryfallGet } from '../services/scryfall.js';
import type { PoolCard, ScryfallCard } from '../types.js';

function poolCardMarkdown(card: PoolCard): string {
  const pt = card.power != null ? `**P/T:** ${card.power}/${card.toughness} | ` : '';
  return `## ${card.name}
**Cost:** ${card.manaCost || '(none)'} | **CMC:** ${card.cmc} | **Type:** ${card.typeLine}
${pt}**Rarity:** ${card.rarity.toUpperCase()} | **Set:** ${card.setCode}

**Oracle Text:**
${card.oracleText || '(none)'}

**Keywords:** ${card.keywords.join(', ') || '(none)'}
**Colors:** ${card.colors.join(', ') || '(colorless)'}
**Pool Status:** IN POOL (id: ${card.id})
**Scryfall URI:** ${card.scryfallUri}`;
}

function scryfallCardMarkdown(card: ScryfallCard, slug: string): string {
  const pt = card.power != null ? `**P/T:** ${card.power}/${card.toughness} | ` : '';
  return `## ${card.name}
**Cost:** ${card.mana_cost || '(none)'} | **CMC:** ${card.cmc} | **Type:** ${card.type_line}
${pt}**Rarity:** ${card.rarity.toUpperCase()} | **Set:** ${card.set}

**Oracle Text:**
${card.oracle_text || '(none)'}

**Keywords:** ${(card.keywords ?? []).join(', ') || '(none)'}
**Colors:** ${(card.colors ?? []).join(', ') || '(colorless)'}
**Pool Status:** NOT IN POOL (live fetch; suggested id: ${slug})
**Scryfall URI:** ${card.scryfall_uri}`;
}

export function registerCardLookup(server: McpServer): void {
  server.tool(
    'shandalar_card_lookup',
    'Look up canonical oracle data for a card by name or slug ID. Checks local pool cache first, falls back to Scryfall API.',
    {
      card: z.string().min(1).describe("Card name (e.g. 'Serra Angel') or slug ID (e.g. 'serra_angel')"),
      response_format: z.enum(['markdown', 'json']).default('markdown'),
    },
    async ({ card, response_format }) => {
      const poolCard = lookupBySlugOrName(card);
      const slug = toSlug(card);

      if (poolCard) {
        const text = response_format === 'json'
          ? JSON.stringify({ ...poolCard, pool_status: 'in_pool' }, null, 2)
          : poolCardMarkdown(poolCard);
        return { content: [{ type: 'text' as const, text }] };
      }

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

      const text = response_format === 'json'
        ? JSON.stringify({ ...scryfallCard, pool_status: 'live_fetch', suggested_id: slug }, null, 2)
        : scryfallCardMarkdown(scryfallCard, slug);
      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
