import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { init, advance } from '../lib/core.mjs';

const serverFile = fileURLToPath(new URL('../mcp/stdio.mjs', import.meta.url));
const cliFile = fileURLToPath(new URL('../bin/memory.mjs', import.meta.url));
const names = ['memory_state', 'memory_index', 'memory_inspect', 'memory_neighbors', 'memory_expand'];
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-mcp-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  init(root, { id: 'sample', name: 'Sample' });
  const node = (id, kind, domain, summary, relations = []) => ({
    type: 'upsert_node', id, kind, domain, title: id, summary, lifecycle: 'active', relations,
  });
  advance(root, { expected_revision: 0, operations: [
    { type: 'set_state', domains: ['docs', 'engine'], focus_domain: 'engine', content: '# Sample\n\n[Decision](knowledge/SOURCE.md)' },
    node('SOURCE', 'decision', 'engine', 'Historical rationale\nComplete narrative: integrità ✓', [
      { type: 'supported_by', target: 'RESULT' }, { type: 'relevant_to', target: 'ISSUE' },
      { type: 'relevant_to', target: 'RESULT' },
    ]),
    node('RESULT', 'result', 'docs', 'Historical measured evidence'),
    node('ISSUE', 'issue', 'engine', 'Historical limitation'),
  ] });
  advance(root, { expected_revision: 1, operations: [
    { type: 'upsert_node', id: 'SOURCE', summary: 'Current rationale', relations: [{ type: 'relevant_to', target: 'LATER' }] },
    { type: 'upsert_node', id: 'RESULT', summary: 'Current measured evidence' },
    { type: 'upsert_node', id: 'ISSUE', lifecycle: 'superseded' },
    node('LATER', 'task', 'docs', 'Introduced later'),
  ] });
  return root;
}
function inventory(root) {
  return fs.readdirSync(root, { recursive: true }).sort().map(file => {
    const full = path.join(root, file);
    return [file, fs.statSync(full).isFile() ? fs.readFileSync(full).toString('hex') : null];
  });
}
async function connect(t, root, text = false, mode = 'legacy') {
  const client = new Client({ name: 'memory-test', version: '1.0.0' }, { versionNegotiation: { mode } });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [serverFile, '--root', root, ...(text ? ['--text-results'] : [])], stderr: 'pipe' });
  let stderr = '';
  transport.stderr.on('data', bytes => { stderr += bytes; });
  const errors = [];
  client.onerror = error => errors.push(error);
  t.after(() => client.close());
  await client.connect(transport);
  return { client, errors, stderr: () => stderr };
}
function cli(root, command, options) {
  const { id, ...flags } = options;
  const args = [cliFile, command, ...(id ? [id] : []), '--root', root];
  for (const [key, value] of Object.entries(flags)) {
    if (value === true) args.push(`--${key}`);
    else if (value !== false) args.push(`--${key}`, String(value));
  }
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('MCP stdio discovers only five strict read-only tools and isolates startup diagnostics', async t => {
  const root = setup(t);
  const { client, errors, stderr } = await connect(t, root);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), names);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(!('root' in tool.inputSchema.properties));
  }
  assert.equal(tools.find(tool => tool.name === 'memory_index').inputSchema.properties.limit.maximum, 100);
  assert.equal(tools.find(tool => tool.name === 'memory_expand').inputSchema.properties.limit.default, 20);
  assert.deepEqual(errors, []);
  assert.equal(stderr(), '');
  await assert.rejects(client.callTool({ name: 'advance', arguments: {} }), /not found/);
  for (const args of [[], ['--root', root, '--root', root], ['--root', path.join(root, 'absent')]]) {
    const result = spawnSync(process.execPath, [serverFile, ...args], { encoding: 'utf8', input: '' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /agent-memory MCP:/);
  }
  const eof = spawnSync(process.execPath, [serverFile, '--root', root], { encoding: 'utf8', input: '', timeout: 5000 });
  assert.equal(eof.status, 0, eof.stderr);
  assert.equal(eof.stdout, '');
});

test('MCP matches CLI data including historical summaries, typed edges, catalogs and limits without writes', async t => {
  const root = setup(t);
  const before = inventory(root);
  const { client, errors } = await connect(t, root);
  for (const revision of [0, 1, 2]) {
    for (const [command, options] of [
      ['state', { revision }], ['index', { revision }],
      ['index', { revision, list: true, kind: 'decision', limit: 1 }],
      ...(revision === 0 ? [] : [
        ['inspect', { revision, id: 'SOURCE' }],
        ['neighbors', { revision, id: 'SOURCE' }],
        ['expand', { revision, id: 'SOURCE' }],
        ['expand', { revision, id: 'SOURCE', relation: 'supported_by', limit: 1 }],
        ['neighbors', { revision, id: 'SOURCE', limit: 0 }],
      ]),
    ]) {
      const response = await client.callTool({ name: `memory_${command}`, arguments: options });
      assert.ok(!response.isError);
      assert.deepEqual(response.content, [], 'no duplicate JSON text payload');
      assert.deepEqual(response.structuredContent, cli(root, command, options));
    }
  }
  const historical = (await client.callTool({ name: 'memory_expand', arguments: { id: 'SOURCE', revision: 1 } })).structuredContent;
  assert.equal(historical.source.summary, 'Historical rationale\nComplete narrative: integrità ✓');
  assert.equal(historical.revision, 1);
  assert.deepEqual(historical.neighbors.map(n => n.id), ['ISSUE', 'RESULT']);
  assert.deepEqual(historical.neighbors[1].relations, ['relevant_to', 'supported_by']);
  assert.equal(historical.neighbors[1].summary, 'Historical measured evidence');
  assert.deepEqual(inventory(root), before);
  assert.deepEqual(errors, []);
  // Historical graph reads must still work without a readable Current State.
  fs.writeFileSync(path.join(root, 'memory/STATE.md'), 'damaged current');
  const restored = await client.callTool({ name: 'memory_expand', arguments: { id: 'SOURCE', revision: 1 } });
  assert.deepEqual(restored.structuredContent, historical);
  const absent = await client.callTool({ name: 'memory_inspect', arguments: { id: 'LATER', revision: 1 } });
  assert.equal(absent.isError, true);
  assert.equal(absent.structuredContent.error.code, 'NOT_FOUND');
});

test('MCP distinguishes schema rejection, missing nodes, invalid filters/cursors and missing revisions', async t => {
  const root = setup(t);
  const before = inventory(root);
  const { client } = await connect(t, root);
  for (const [name, args] of [
    ['memory_inspect', {}], ['memory_inspect', { id: '../outside' }],
    ['memory_state', { revision: '1' }], ['memory_state', { revision: -1 }],
    ['memory_state', { revision: 1.5 }], ['memory_state', { root }],
    ['memory_index', { list: 'true' }], ['memory_index', { list: true, limit: 101 }],
    ['memory_index', { list: true, limit: 0 }], ['memory_index', { list: true, kind: 'unknown' }],
    ['memory_expand', { id: 'SOURCE', limit: -1 }],
    ['memory_expand', { id: 'SOURCE', relation: 'invented' }],
  ]) {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /Input validation error/);
  }
  for (const [name, args, code] of [
    ['memory_inspect', { id: 'ABSENT' }, 'NOT_FOUND'],
    ['memory_index', { list: true, domain: 'unknown' }, 'INVALID_FILTER'],
    ['memory_index', { list: true, after: 'ABSENT' }, 'INVALID_CURSOR'],
    ['memory_index', { kind: 'task' }, 'INVALID_INPUT'],
    ...names.map(name => [name, { ...(name === 'memory_state' || name === 'memory_index' ? {} : { id: 'SOURCE' }), revision: 999 }, 'REVISION_NOT_FOUND']),
  ]) {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, code);
    if (code === 'INVALID_FILTER') assert.deepEqual(response.structuredContent.error.details.valid, ['docs', 'engine']);
  }
  const empty = await client.callTool({ name: 'memory_index', arguments: { list: true, domain: 'docs', kind: 'decision' } });
  assert.ok(!empty.isError);
  assert.equal(empty.structuredContent.total, 0);
  assert.deepEqual(inventory(root), before);
});

test('MCP text-only compatibility mode and modern protocol preserve the same data', async t => {
  const root = setup(t);
  const { client, errors } = await connect(t, root, true, 'auto');
  const response = await client.callTool({ name: 'memory_expand', arguments: { id: 'SOURCE', revision: 1 } });
  assert.ok(!response.isError);
  assert.equal(response.structuredContent, undefined);
  assert.equal(response.content.length, 1);
  assert.deepEqual(JSON.parse(response.content[0].text), cli(root, 'expand', { id: 'SOURCE', revision: 1 }));
  const error = await client.callTool({ name: 'memory_inspect', arguments: { id: 'ABSENT' } });
  assert.equal(error.isError, true);
  assert.equal(JSON.parse(error.content[0].text).error.code, 'NOT_FOUND');
  assert.deepEqual(errors, []);
});
