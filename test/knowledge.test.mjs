import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, inspect, neighbors, expand } from '../lib/core.mjs';
import { fixture, node } from './fixtures.mjs';
import { noteText, parseNote } from '../lib/markdown.mjs';

test('outgoing expansion preserves edge semantics, stable deduplication, filters and limits', t => {
  const root = fixture(t);
  const expanded = expand(root, 'DEC');
  assert.equal(expanded.direction, 'outgoing');
  assert.equal(expanded.depth, 1);
  assert.deepEqual(expanded.neighbors.map(n => n.id), ['ISS', 'RES']);
  assert.deepEqual(expanded.neighbors[1].relations, ['relevant_to', 'supported_by']);
  assert.equal(expanded.neighbors[1].summary, 'RES independent knowledge ✓');
  assert.equal(expand(root, 'DEC', { limit: 1 }).truncated, true);
  assert.equal(expand(root, 'DEC', { limit: 0 }).complete, false);
  assert.deepEqual(neighbors(root, 'DEC', { relation: 'supported_by' }).nodes.map(n => n.id), ['RES']);
  assert.equal(expand(root, 'RES').total, 0);
  assert.throws(() => expand(root, 'MISSING'), error => error.memoryCode === 'NOT_FOUND');
});

test('historical source, relations and targets never use future contents', t => {
  const root = fixture(t);
  const old = expand(root, 'DEC', { revision: 1 });
  advance(root, { expected_revision: 1, operations: [node('NEW', 'task'),
    { type: 'upsert_node', id: 'DEC', relations: [{ type: 'relevant_to', target: 'NEW' }] },
    { type: 'upsert_node', id: 'RES', summary: 'Future evidence' },
  ] });
  assert.deepEqual(expand(root, 'DEC', { revision: 1 }), old);
  assert.equal(expand(root, 'DEC').neighbors[0].id, 'NEW');
  fs.writeFileSync(path.join(root, 'memory/.history/1/knowledge/RES.md'), 'tampered');
  assert.throws(() => inspect(root, 'RES', 1), /corrupt historical/);
});

test('broken manual links are errors and arbitrary narrative round trips', t => {
  const root = fixture(t);
  const file = path.join(root, 'memory/knowledge/DEC.md');
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, original.replace('(RES.md)', '(ABSENT.md)').replace('[RES]', '[ABSENT]'));
  assert.throws(() => inspect(root, 'DEC'), /missing node/);
  fs.writeFileSync(file, original.replace('supported_by:', 'invented:'));
  assert.throws(() => inspect(root, 'DEC'), /invalid relation type/);
  const value = { id: 'ROUND', version: 1, kind: 'decision', domain: 'engine', title: 'Title\nwith newline', lifecycle: 'active', summary: '\nProse\n\n## Relations\n\nAn ordinary heading inside prose.\n', relations: [] };
  assert.deepEqual(parseNote(noteText(value), ['engine']), value);
  const crlf = { ...value, title: 'Single line', summary: 'Prose without newlines' };
  assert.deepEqual(parseNote(noteText(crlf).replaceAll('\n', '\r\n'), ['engine']), crlf);
});
