import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { migrate } from '../lib/migrate.mjs';
import { hash, state, index, inspect } from '../lib/core.mjs';
import { temporary, inventory } from './fixtures.mjs';

function legacy(t) {
  const root = temporary(t);
  const base = path.join(root, 'memory');
  for (const dir of ['current', 'history', 'graphs', 'nodes/OLD']) fs.mkdirSync(path.join(base, dir), { recursive: true });
  const write = (file, data) => fs.writeFileSync(path.join(base, file), JSON.stringify(data, null, 2) + '\n');
  const old = { schema_version: 2, revision: 0, project: { id: 'sample', name: 'Sample', summary: 'Initial summary', objective: 'Historical objective' }, focus_domain: null, domains: {} };
  write('history/0.json', old);
  const node = { id: 'OLD', version: 1, kind: 'decision', domain: 'engine', title: 'Historical decision', summary: '\nExact historical narrative\r\n', lifecycle: 'superseded', relations: [] };
  const nodeBytes = JSON.stringify(node, null, 2) + '\n';
  const nodeHash = hash(nodeBytes);
  fs.writeFileSync(path.join(base, 'nodes/OLD', `1-${nodeHash}.json`), nodeBytes);
  const graph = { schema_version: 1, nodes: { OLD: { version: 1, hash: nodeHash } } };
  const graphBytes = JSON.stringify(graph, null, 2) + '\n';
  const graphHash = hash(graphBytes);
  fs.writeFileSync(path.join(base, 'graphs', `${graphHash}.json`), graphBytes);
  write('current/STATE.json', { ...old, revision: 1, focus_domain: 'engine', domains: { engine: { summary: 'Domain summary', current_focus: 'Focus', next_action: 'Next', current_nodes: ['OLD'] } }, graph_snapshot: graphHash });
  return { root, node };
}
test('explicit migration preserves all revision facts, exact narratives and a byte-identical legacy backup', t => {
  const { root, node } = legacy(t);
  const before = inventory(path.join(root, 'memory'));
  assert.throws(() => state(root), error => error.memoryCode === 'MIGRATION_REQUIRED');
  const migrated = migrate(root);
  assert.equal(migrated.migrated_revisions, 2);
  assert.deepEqual(inventory(migrated.backup), before);
  assert.equal(index(root, { revision: 0 }).total, 0);
  assert.match(state(root, 0).content, /Historical objective/);
  const { path: ignoredPath, revision: ignoredRevision, dirty: ignoredDirty, ...result } = inspect(root, 'OLD', 1);
  assert.deepEqual(result, node);
  assert.match(state(root).content, /Domain summary[\s\S]*Focus[\s\S]*Next[\s\S]*knowledge\/OLD.md/);
  assert.throws(() => migrate(root), /already exists/);
  assert.match(fs.readFileSync(path.join(root, 'memory/journal/0001.md'), 'utf8'), /Not recorded/);
});
test('invalid legacy hashes abort before activation and keep the original tree intact', t => {
  const { root } = legacy(t);
  const base = path.join(root, 'memory');
  const graph = fs.readdirSync(path.join(base, 'graphs'))[0];
  fs.writeFileSync(path.join(base, 'graphs', graph), 'corrupt');
  const before = inventory(base);
  assert.throws(() => migrate(root), /hash mismatch/);
  assert.deepEqual(inventory(base), before);
  assert.equal(fs.existsSync(path.join(base, 'STATE.md')), false);
});

test('conflicting legacy current/history revisions are not silently discarded', t => {
  const { root } = legacy(t);
  fs.writeFileSync(path.join(root, 'memory/history/1.json'), JSON.stringify({ revision: 1, conflicting: true }));
  const before = inventory(path.join(root, 'memory'));
  assert.throws(() => migrate(root), /conflict/);
  assert.deepEqual(inventory(path.join(root, 'memory')), before);
});
