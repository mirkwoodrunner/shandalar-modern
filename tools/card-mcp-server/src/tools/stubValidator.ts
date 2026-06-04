import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupBySlugOrName } from '../poolCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENGINE_STUBS = new Set(['channel', 'fastbond', 'kudzu', 'regeneration']);

interface StubEntry {
  id: string;
  name?: string;
  cost?: string;
  cmc?: number;
  type?: string;
}

function extractStr(line: string, field: string): string | undefined {
  const m = line.match(new RegExp(`${field}:\\s*["']([^"']*)["']`));
  return m?.[1];
}

function extractNum(line: string, field: string): number | undefined {
  const m = line.match(new RegExp(`${field}:\\s*(\\d+(?:\\.\\d+)?)`));
  return m ? parseFloat(m[1]) : undefined;
}

function parseStubs(cardsJs: string): StubEntry[] {
  const stubs: StubEntry[] = [];
  for (const line of cardsJs.split('\n')) {
    if (!/effect:\s*["'](STUB|stub)["']/.test(line)) continue;
    const id = extractStr(line, 'id');
    if (!id) continue;
    stubs.push({
      id,
      name: extractStr(line, 'name'),
      cost: extractStr(line, 'cost'),
      cmc: extractNum(line, 'cmc'),
      type: extractStr(line, 'type'),
    });
  }
  return stubs;
}

interface Mismatch {
  slug: string;
  field: string;
  cards_js_value: string;
  pool_value: string;
}

export function registerStubValidator(server: McpServer): void {
  server.tool(
    'shandalar_stub_validator',
    'Cross-check cards.js stub entries against shandalar-card-pool.json; report field-level mismatches.',
    {
      filter: z.enum(['all', 'mismatch_only']).default('mismatch_only').describe('Return all stubs or only mismatches'),
      response_format: z.enum(['markdown', 'json']).default('markdown'),
    },
    async ({ filter, response_format }) => {
      const cardsPath = resolve(__dirname, '../../../../src/data/cards.js');
      let cardsJs: string;
      try {
        cardsJs = readFileSync(cardsPath, 'utf-8');
      } catch {
        throw new Error(`Cannot read cards.js at ${cardsPath}`);
      }

      const stubs = parseStubs(cardsJs);
      const mismatches: Mismatch[] = [];
      const allRows: Array<{ slug: string; mismatches: Mismatch[]; pool_status: string }> = [];

      for (const stub of stubs) {
        if (ENGINE_STUBS.has(stub.id)) continue;

        const poolCard = lookupBySlugOrName(stub.id);
        const stubMismatches: Mismatch[] = [];

        if (poolCard) {
          if (stub.name && stub.name.toLowerCase() !== poolCard.name.toLowerCase()) {
            stubMismatches.push({ slug: stub.id, field: 'name', cards_js_value: stub.name, pool_value: poolCard.name });
          }
          if (stub.cmc !== undefined && stub.cmc !== poolCard.cmc) {
            stubMismatches.push({ slug: stub.id, field: 'cmc', cards_js_value: String(stub.cmc), pool_value: String(poolCard.cmc) });
          }
          if (stub.type && !poolCard.typeLine.toLowerCase().includes(stub.type.toLowerCase())) {
            stubMismatches.push({ slug: stub.id, field: 'type', cards_js_value: stub.type, pool_value: poolCard.typeLine });
          }
        }

        mismatches.push(...stubMismatches);
        if (filter === 'all' || stubMismatches.length > 0) {
          allRows.push({
            slug: stub.id,
            mismatches: stubMismatches,
            pool_status: poolCard ? 'IN POOL' : 'MISSING FROM POOL',
          });
        }
      }

      const engineSkipped = stubs.filter(s => ENGINE_STUBS.has(s.id)).length;

      if (response_format === 'json') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              stubs_checked: stubs.length - engineSkipped,
              mismatch_count: mismatches.length,
              engine_handled_skipped: engineSkipped,
              results: allRows,
            }, null, 2),
          }],
        };
      }

      const mismatchRows = mismatches
        .map(m => `| ${m.slug} | ${m.field} | ${m.cards_js_value} | ${m.pool_value} |`)
        .join('\n');

      const mismatchSection = mismatches.length > 0
        ? `\n### Mismatches\n| Slug | Field | cards.js Value | Pool Value |\n|------|-------|---------------|------------|\n${mismatchRows}`
        : '\n### Mismatches\nNone found.';

      const text = `## Stub Validation Report
Stubs checked: ${stubs.length - engineSkipped} | Mismatches: ${mismatches.length} | Engine-handled (skipped): ${engineSkipped}
${mismatchSection}`;

      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
