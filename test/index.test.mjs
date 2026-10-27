import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, index, inspect } from '../lib/core.mjs';
import { fixture, inventory, node } from './fixtures.mjs';

test('overview, filters, stable pagination, superseded lifecycle and history isolation', t => {
  const root = fixture(t);
  advance(root, { expected_revision: 1, operations: [{ type: 'upsert_node', id: 'DEC', lifecycle: 'superseded' }, node('NEW', 'task')] });
  assert.equal(index(root).total, 4);
  assert.deepEqual(index(root).domains, [{ domain: 'docs', count: 1 }, { domain: 'engine', count: 3 }]);
  assert.equal(index(root, { list: true, domain: 'engine', kind: 'decision', lifecycle: 'superseded' }).nodes[0].id, 'DEC');
  assert.equal(index(root, { list: true, domain: 'docs', kind: 'task' }).total, 0);
  const ids = [];
  let after;
  do {
    const page = index(root, { list: true, limit: 1, ...(after ? { after } : {}) });
    assert.equal(page.total, 4);
    assert.equal(page.complete, !page.truncated);
    ids.push(...page.nodes.map(node => node.id));
    after = page.next_after;
  } while (after);
  assert.deepEqual(ids, ['DEC', 'ISS', 'NEW', 'RES']);
  assert.equal(index(root, { revision: 1 }).total, 3);
  assert.equal(index(root, { revision: 1, list: true, lifecycle: 'superseded' }).total, 0);
  for (const options of [{ limit: 1 }, { list: true, limit: 0 }, { list: true, limit: 101 }, { list: true, after: 'MISSING' }, { list: true, domain: 'missing' }, { list: true, kind: 'missing' }]) assert.throws(() => index(root, options));
});

test('manual metadata edits are visible even with restored mtime, without cache or read side effects', t => {
  const root = fixture(t);
  assert.equal(index(root, { list: true }).nodes[0].title, 'DEC title');
  const file = path.join(root, 'memory/knowledge/DEC.md');
  const stat = fs.statSync(file);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('DEC title', 'New title'));
  fs.utimesSync(file, stat.atime, stat.mtime);
  const before = inventory(root);
  assert.equal(index(root, { list: true }).nodes[0].title, 'New title');
  assert.deepEqual(inventory(root), before);
  assert.equal(fs.existsSync(path.join(root, 'memory/.index')), false);
});

test('discovery reads bounded headers and ignores unrelated large prose', t => {
  const root = fixture(t);
  const file = path.join(root, 'memory/knowledge/RES.md');
  const raw = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, raw.slice(0, raw.indexOf('\n---\n') + 6) + '\n' + 'large prose '.repeat(200000));
  const originalReadFile = fs.readFileSync;
  const originalRead = fs.readSync;
  let bytes = 0;
  fs.readFileSync = function (file, ...args) {
    assert.ok(!String(file).includes(`${path.sep}knowledge${path.sep}`), 'must not read full notes');
    return originalReadFile.call(this, file, ...args);
  };
  fs.readSync = function (...args) { const n = originalRead.apply(this, args); bytes += n; return n; };
  try { assert.equal(index(root, { list: true }).total, 3); }
  finally { fs.readFileSync = originalReadFile; fs.readSync = originalRead; }
  assert.ok(bytes <= 3 * 512, `header reads used ${bytes} bytes`);
  assert.equal(inspect(root, 'DEC').id, 'DEC');
  assert.throws(() => inspect(root, 'RES'), /Relations/);
});
