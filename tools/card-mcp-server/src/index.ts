import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCardLookup } from './tools/cardLookup.js';
import { registerAuditCrossref } from './tools/auditCrossref.js';
import { registerStubValidator } from './tools/stubValidator.js';
import { registerRulesConflict } from './tools/rulesConflict.js';
import { registerMissingCardGen } from './tools/missingCardGen.js';
import { getPool } from './poolCache.js';

// Fail fast if pool is missing before serving any requests
getPool();

const server = new McpServer({
  name: 'shandalar-card-mcp-server',
  version: '1.0.0',
});

registerCardLookup(server);
registerAuditCrossref(server);
registerStubValidator(server);
registerRulesConflict(server);
registerMissingCardGen(server);

const transport = new StdioServerTransport();
await server.connect(transport);
