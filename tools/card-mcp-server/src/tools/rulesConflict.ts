import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupBySlugOrName } from '../poolCache.js';
import { scryfallGet } from '../services/scryfall.js';
import type { ScryfallCard, ScryfallRulingsResponse } from '../types.js';

export function registerRulesConflict(server: McpServer): void {
  server.tool(
    'shandalar_rules_conflict',
    'Show oracle text and official rulings for a card alongside a proposed implementation description, for manual conflict review.',
    {
      card: z.string().min(1).describe('Card name or slug ID'),
      proposed_implementation: z.string().min(10).describe('Plain English description of how the card is proposed to behave in cardHandlers.js'),
      response_format: z.enum(['markdown', 'json']).default('markdown'),
    },
    async ({ card, proposed_implementation, response_format }) => {
      const poolCard = lookupBySlugOrName(card);

      let oracleText: string;
      let scryfallId: string | null = null;
      let cardName: string;

      if (poolCard) {
        oracleText = poolCard.oracleText || '(none)';
        scryfallId = poolCard.scryfallId;
        cardName = poolCard.name;
      } else {
        let liveCard: ScryfallCard;
        try {
          liveCard = await scryfallGet<ScryfallCard>(`/cards/named?exact=${encodeURIComponent(card)}`);
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
        oracleText = liveCard.oracle_text || '(none)';
        scryfallId = liveCard.id;
        cardName = liveCard.name;
      }

      let rulings: Array<{ published_at: string; comment: string }> = [];
      if (scryfallId) {
        try {
          const rulingsResp = await scryfallGet<ScryfallRulingsResponse>(`/cards/${scryfallId}/rulings`);
          rulings = rulingsResp.data.map(r => ({ published_at: r.published_at, comment: r.comment }));
        } catch {
          // Rulings fetch is best-effort; proceed without them
        }
      }

      if (response_format === 'json') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              card: cardName,
              oracle_text: oracleText,
              rulings,
              proposed_implementation,
            }, null, 2),
          }],
        };
      }

      const rulingsSection = rulings.length > 0
        ? rulings.map(r => `- ${r.published_at}: ${r.comment}`).join('\n')
        : '(no official rulings)';

      const text = `## Rules Conflict Check: ${cardName}

### Oracle Text (Canonical)
${oracleText}

### Official Rulings (Scryfall)
${rulingsSection}

### Your Proposed Implementation
${proposed_implementation}

---
Review the oracle text and rulings above against your implementation.`;

      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
