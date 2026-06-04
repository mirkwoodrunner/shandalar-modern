import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lookupBySlugOrName } from '../poolCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readAuditFile(): string {
  const auditPath = resolve(__dirname, '../../../../docs/audit/card-effect-audit.md');
  try {
    return readFileSync(auditPath, 'utf-8');
  } catch {
    throw new Error(`Cannot read card-effect-audit.md at ${auditPath}`);
  }
}

interface GroupData {
  description: string;
  slugs: string[];
}

function parseGroup(content: string, letter: string): GroupData | null {
  const upper = letter.toUpperCase();
  const headerRe = new RegExp(`^### Group ${upper}[^\\n]*`, 'm');
  const headerMatch = content.match(headerRe);
  if (!headerMatch || headerMatch.index === undefined) return null;

  const start = headerMatch.index + headerMatch[0].length;
  const nextGroupMatch = content.slice(start).match(/^### Group [A-P]/m);
  const end = nextGroupMatch?.index !== undefined
    ? start + nextGroupMatch.index
    : content.length;

  const section = content.slice(start, end);

  const descMatch = section.match(/^[^\n]*\n\n([^\n|#][^\n]+)/m);
  const description = descMatch ? descMatch[1].trim() : '';

  const slugRe = /\| `([a-z][a-z0-9_]*)` \|/g;
  const slugs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = slugRe.exec(section)) !== null) {
    slugs.push(m[1]);
  }

  return { description, slugs };
}

export function registerAuditCrossref(server: McpServer): void {
  server.tool(
    'shandalar_audit_crossref',
    'Return every card in a handler group (A-P) from card-effect-audit.md with oracle text from the pool cache.',
    {
      group: z.string().length(1).regex(/^[A-Pa-p]$/).describe('Handler group letter A-P from card-effect-audit.md'),
      include_oracle: z.boolean().default(true).describe('Include oracle text for each card'),
      response_format: z.enum(['markdown', 'json']).default('markdown'),
    },
    async ({ group, include_oracle, response_format }) => {
      const auditContent = readAuditFile();
      const groupData = parseGroup(auditContent, group);

      if (!groupData) {
        return {
          content: [{
            type: 'text' as const,
            text: `Group "${group.toUpperCase()}" not found in card-effect-audit.md`,
          }],
        };
      }

      interface CardRow {
        slug: string;
        oracle: string;
        pool_status: string;
      }

      const rows: CardRow[] = groupData.slugs.map(slug => {
        const poolCard = lookupBySlugOrName(slug);
        return {
          slug,
          oracle: include_oracle
            ? (poolCard?.oracleText ?? 'MISSING FROM POOL')
            : '',
          pool_status: poolCard ? 'IN POOL' : 'MISSING FROM POOL',
        };
      });

      if (response_format === 'json') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              group: group.toUpperCase(),
              description: groupData.description,
              cards: rows,
            }, null, 2),
          }],
        };
      }

      const tableRows = rows
        .map(r => `| ${r.slug} | ${r.oracle.replace(/\n/g, ' ')} | ${r.pool_status} |`)
        .join('\n');

      const text = `## Group ${group.toUpperCase()} — ${groupData.description}

| Card | Oracle Text | Pool Status |
|------|-------------|-------------|
${tableRows}`;

      return { content: [{ type: 'text' as const, text }] };
    }
  );
}
