import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { state, index, inspect, neighbors, expand } from '../lib/core.mjs';

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional();
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const neighborhood = z.strictObject({
  id, revision,
  relation: z.enum(['supersedes', 'supported_by', 'relevant_to']).optional(),
  limit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(20),
});

/** Bind one initialized, trusted project for the lifetime of this MCP instance. */
export function createMemoryServer(root, { textResults = false } = {}) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('--root is required');
  const project = fs.realpathSync(root);
  if (!fs.statSync(project).isDirectory() || !fs.statSync(`${project}/memory`).isDirectory()) {
    throw new Error('--root must contain an existing memory directory');
  }
  const server = new McpServer({ name: 'knownex', version: '0.1.0' });
  const render = (value, isError = false) => ({
    ...(isError ? { isError: true } : {}),
    ...(textResults ? { content: [{ type: 'text', text: JSON.stringify(value) }] }
      : { content: [], structuredContent: value }),
  });
  const tools = [
    ['memory_state', 'Read STATE.md operational content. Explicit revision selects a confirmed snapshot; omitted revision permits manual edits.',
      z.strictObject({ revision }), args => state(project, args.revision)],
    ['memory_index', 'Discover note metadata without reading prose: overview or filtered, ID-ordered catalog pages with Markdown paths.',
      z.strictObject({ revision, list: z.boolean().default(false),
        domain: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
        kind: z.enum(['decision', 'issue', 'result', 'task']).optional(),
        lifecycle: z.enum(['active', 'superseded']).optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Catalog only; default 20. Requires list=true.'),
        after: id.optional().describe('Exclusive matching node ID; requires list=true and the same revision/filters.'),
      }), args => index(project, args)],
    ['memory_inspect', 'Read one full node, including its summary, version and outgoing relations.',
      z.strictObject({ id, revision }), args => inspect(project, args.id, args.revision)],
    ['memory_neighbors', 'Read full outgoing target nodes, deduplicated by ID, at one snapshot revision.',
      neighborhood, ({ id, ...options }) => neighbors(project, id, options)],
    ['memory_expand', 'Read source and adjacent summaries with connecting edge types, outgoing depth one only.',
      neighborhood, ({ id, ...options }) => expand(project, id, options)],
  ];
  for (const [name, description, inputSchema, read] of tools) {
    server.registerTool(name, {
      description, inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, args => {
      try {
        return render(read(args));
      } catch (error) {
        return render({ error: {
          code: error.memoryCode ?? error.code ?? 'INVALID_INPUT',
          message: error.message,
          details: error.details ?? {},
        } }, true);
      }
    });
  }
  return server;
}
