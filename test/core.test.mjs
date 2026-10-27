import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { init, advance, state, inspect, index } from '../lib/core.mjs';
import { fixture, temporary, inventory, node } from './fixtures.mjs';

test('readable Markdown state, exclusive initialization and CLI parity', t => {
  const root = fixture(t);
  const result = state(root);
  assert.match(result.content, /Local files only/);
  assert.match(fs.readFileSync(path.join(root, 'memory/STATE.md'), 'utf8'), /\[Decision\]\(knowledge\/DEC.md\)/);
  assert.equal(result.schema_version, 3);
  assert.equal(result.dirty, false);
  const before = inventory(root);
  assert.throws(() => init(root, { id: 'other', name: 'Other' }), /EEXIST/);
  assert.deepEqual(inventory(root), before);
  const cli = spawnSync(process.execPath, ['bin/memory.mjs', 'state', '--root', root], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), result);
});

test('partial updates preserve fields and immutable Markdown history', t => {
  const root = fixture(t);
  const history = inventory(path.join(root, 'memory/.history/1'));
  const original = inspect(root, 'DEC', 1);
  advance(root, { expected_revision: 1, reason: 'New evidence.', operations: [
    { type: 'upsert_node', id: 'DEC', summary: 'New narrative' }, node('NEW', 'task'),
  ] });
  assert.equal(inspect(root, 'DEC').version, 2);
  assert.equal(inspect(root, 'DEC').title, original.title);
  assert.deepEqual(inspect(root, 'DEC').relations, original.relations);
  assert.deepEqual(inspect(root, 'DEC', 1), original);
  assert.deepEqual(inventory(path.join(root, 'memory/.history/1')), history);
  assert.throws(() => inspect(root, 'NEW', 1), error => error.memoryCode === 'NOT_FOUND');
  assert.match(fs.readFileSync(path.join(root, 'memory/journal/0002.md'), 'utf8'), /New evidence\.[\s\S]*DEC v2/);
  fs.writeFileSync(path.join(root, 'memory/STATE.md'), 'broken');
  assert.equal(inspect(root, 'DEC', 1).summary, original.summary);
  assert.equal(state(root, 2).revision, 2);
});

test('invalid and stale proposals fail before changing memory', t => {
  const root = fixture(t);
  const before = inventory(root);
  for (const proposal of [
    { expected_revision: 0, operations: [{ type: 'set_state' }] },
    { expected_revision: 1, operations: [{ type: 'upsert_node', id: 'DEC', typo: true }] },
    { expected_revision: 1, operations: [node('../escape')] },
    { expected_revision: 1, operations: [node('BAD', 'invalid')] },
    { expected_revision: 1, operations: [node('BAD', 'decision', [{ type: 'relevant_to', target: 'ABSENT' }])] },
    { expected_revision: 1, operations: [{ type: 'set_state', content: '[bad](knowledge/ABSENT.md)' }] },
    { expected_revision: 1, operations: [{ type: 'upsert_node', id: 'DEC', relations: [{ type: 'invented', target: 'RES' }] }] },
  ]) assert.throws(() => advance(root, proposal));
  assert.deepEqual(inventory(root), before);
});

test('manual edits are current and dirty; explicit revisions remain confirmed until advance', t => {
  const root = fixture(t);
  const stateFile = path.join(root, 'memory/STATE.md');
  const noteFile = path.join(root, 'memory/knowledge/DEC.md');
  const old = inspect(root, 'DEC', 1);
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('Ready for a small fix.', 'Human edited status.'));
  fs.writeFileSync(noteFile, fs.readFileSync(noteFile, 'utf8').replace('DEC independent knowledge ✓', 'Human edited narrative.'));
  assert.equal(state(root).dirty, true);
  assert.equal(inspect(root, 'DEC').dirty, true);
  assert.equal(inspect(root, 'DEC').summary, 'Human edited narrative.');
  assert.deepEqual(inspect(root, 'DEC', 1), old);
  advance(root, { expected_revision: 1, operations: [{ type: 'set_state' }] });
  assert.equal(inspect(root, 'DEC').version, 2);
  assert.equal(inspect(root, 'DEC').dirty, false);
  assert.match(state(root).content, /Human edited status/);
  assert.deepEqual(inspect(root, 'DEC', 1), old);
});

test('cooperative locks block current access while historical access remains available', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'memory/.write.lock'), 'interrupted writer');
  for (const read of [() => state(root), () => inspect(root, 'DEC'), () => index(root), () => advance(root, { expected_revision: 1, operations: [{ type: 'set_state' }] })]) assert.throws(read, error => error.memoryCode === 'MEMORY_BUSY');
  assert.equal(inspect(root, 'DEC', 1).version, 1);
});

test('historical collisions preserve bytes and fail closed after interrupted publication', t => {
  const root = fixture(t);
  const target = path.join(root, 'memory/.history/2');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'sentinel'), 'preserve');
  assert.throws(() => advance(root, { expected_revision: 1, operations: [{ type: 'set_state', content: 'new' }] }), /EEXIST/);
  assert.equal(fs.readFileSync(path.join(target, 'sentinel'), 'utf8'), 'preserve');
  assert.throws(() => state(root), error => error.memoryCode === 'MEMORY_BUSY');
  assert.equal(state(root, 1).revision, 1);
});

test('case aliases, reserved IDs and manual version changes are rejected', t => {
  const root = fixture(t);
  for (const id of ['con', 'dec']) assert.throws(() => advance(root, { expected_revision: 1, operations: [node(id)] }));
  const file = path.join(root, 'memory/knowledge/DEC.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('version: 1', 'version: 99'));
  assert.throws(() => index(root), /engine-owned/);
});

test('empty memory works and duplicate frontmatter fails', t => {
  const root = temporary(t);
  init(root, { id: 'empty', name: 'Empty' });
  assert.deepEqual(index(root, { list: true }).nodes, []);
  fs.writeFileSync(path.join(root, 'memory/knowledge/BAD.md'), '---\nid: "BAD"\nid: "BAD"\n---\n');
  assert.throws(() => index(root), /duplicate/);
});

test('an ordinary publication failure preserves confirmed history and blocks mixed current reads', t => {
  const root = fixture(t);
  const previous = inspect(root, 'DEC', 1);
  const rename = fs.renameSync;
  let count = 0;
  fs.renameSync = function (...args) { if (++count === 2) throw new Error('injected rename failure'); return rename.apply(this, args); };
  try {
    assert.throws(() => advance(root, { expected_revision: 1, operations: [{ type: 'upsert_node', id: 'DEC', summary: 'Next narrative' }] }), /injected rename failure/);
  } finally { fs.renameSync = rename; }
  assert.throws(() => state(root), error => error.memoryCode === 'MEMORY_BUSY');
  assert.deepEqual(inspect(root, 'DEC', 1), previous);
  assert.throws(() => inspect(root, 'DEC', 2), error => error.memoryCode === 'REVISION_NOT_FOUND');
});

test('a writer completing during retrieval cannot label new contents with an old revision', t => {
  const root = fixture(t);
  const read = fs.readFileSync;
  let triggered = false;
  fs.readFileSync = function (file, ...args) {
    if (!triggered && path.resolve(String(file)) === path.join(root, 'memory/knowledge/DEC.md')) {
      triggered = true;
      advance(root, { expected_revision: 1, operations: [{ type: 'upsert_node', id: 'DEC', summary: 'Concurrent evidence' }] });
    }
    return read.call(this, file, ...args);
  };
  try { assert.throws(() => inspect(root, 'DEC'), error => error.memoryCode === 'MEMORY_CHANGED'); }
  finally { fs.readFileSync = read; }
  assert.equal(inspect(root, 'DEC').revision, 2);
});
