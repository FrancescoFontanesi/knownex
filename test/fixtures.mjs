import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { init, advance } from '../lib/core.mjs';
export function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-markdown-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
export const node = (id, kind = 'decision', relations = [], domain = 'engine') => ({
  type: 'upsert_node', id, kind, domain, title: `${id} title`, summary: `${id} independent knowledge ✓`, lifecycle: 'active', relations,
});
export function fixture(t) {
  const root = temporary(t);
  init(root, { id: 'sample', name: 'Sample' });
  advance(root, { expected_revision: 0, message: 'Decision adopted after verification.', reason: 'Local-only operation is required.', operations: [
    { type: 'set_state', domains: ['engine', 'docs'], focus_domain: 'engine', content: '# Sample\n\n## Objective\n\nCheck local links.\n\n## Current status\n\nReady for a small fix.\n\n## Decisions and constraints\n\nLocal files only.\n\n## Open issues\n\nSee the linked issue.\n\n## Next actions\n\nResolve the issue before release.\n\n## References\n\n- [Decision](knowledge/DEC.md)\n- [Issue](knowledge/ISS.md)\n' },
    node('DEC', 'decision', [{ type: 'supported_by', target: 'RES' }, { type: 'relevant_to', target: 'ISS' }, { type: 'relevant_to', target: 'RES' }]),
    node('RES', 'result', [], 'docs'), node('ISS', 'issue'),
  ] });
  return root;
}
export function inventory(root) {
  return fs.readdirSync(root, { recursive: true }).sort().map(file => {
    const full = path.join(root, file);
    return [file, fs.statSync(full).isFile() ? fs.readFileSync(full).toString('hex') : null];
  });
}
