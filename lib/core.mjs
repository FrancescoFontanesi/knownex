import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { check, fail, keys, integer, identifier, compare, KINDS, LIFECYCLES, RELATIONS,
  split, readHeader, validateState, validateMeta, validateNode, validateReferences,
  validateLinks, parseNote, noteText, stateText } from './markdown.mjs';

export const hash = value => createHash('sha256').update(value).digest('hex');
const memory = root => path.resolve(root, 'memory');
const revisionDir = (base, revision) => path.join(base, '.history', String(revision));
const relative = (selected, file) => `memory/${selected.historical ? `.history/${selected.meta.revision}/` : ''}${file}`;
function regular(file) {
  check(fs.lstatSync(file).isFile(), `not a regular file: ${file}`);
  return fs.readFileSync(file, 'utf8');
}
function unlocked(base) {
  if (fs.existsSync(path.join(base, '.write.lock'))) fail('MEMORY_BUSY', 'writer or interrupted write present; inspect .write.lock before recovery');
}
function stable(selected) {
  if (selected.historical) return;
  unlocked(selected.base);
  if (regular(path.join(selected.base, 'STATE.md')) !== selected.raw) fail('MEMORY_CHANGED', 'state changed during retrieval; retry or select an explicit revision');
}
function checkpoint(base, revision) {
  const directory = revisionDir(base, revision);
  if (!fs.existsSync(path.join(directory, '.complete'))) fail('REVISION_NOT_FOUND', `revision ${revision} not found or not confirmed`, { revision });
  const bytes = regular(path.join(directory, 'manifest.json'));
  check(regular(path.join(directory, '.complete')).trim() === hash(bytes), 'corrupt checkpoint manifest');
  const manifest = JSON.parse(bytes);
  check(manifest.revision === revision && manifest.nodes && typeof manifest.nodes === 'object', 'invalid checkpoint');
  return manifest;
}
function selection(root, revision) {
  const base = memory(root);
  if (!fs.existsSync(path.join(base, 'STATE.md')) && fs.existsSync(path.join(base, 'current', 'STATE.json'))) fail('MIGRATION_REQUIRED', 'legacy JSON memory: run memory migrate on a verified copy first');
  if (revision !== undefined) integer(revision);
  const historical = revision !== undefined;
  if (!historical) unlocked(base);
  const directory = historical ? revisionDir(base, revision) : base;
  const manifest = historical ? checkpoint(base, revision) : undefined;
  const raw = regular(path.join(directory, 'STATE.md'));
  if (manifest) check(manifest.state_hash === hash(raw), 'corrupt historical STATE.md');
  const { meta, body } = split(raw);
  validateState(meta);
  check(!historical || meta.revision === revision, 'checkpoint revision mismatch');
  const committed = manifest ?? checkpoint(base, meta.revision);
  if (!historical) unlocked(base);
  return { base, directory, meta, body, raw, historical, committed };
}
function catalog(selected) {
  if (selected.historical) return Object.values(selected.committed.nodes).map(entry => {
    validateMeta(entry.meta, selected.meta.domains);
    return { ...entry.meta };
  }).sort((a, b) => compare(a.id, b.id));
  const result = [];
  const folded = new Set();
  for (const file of fs.readdirSync(path.join(selected.directory, 'knowledge'), { withFileTypes: true })) {
    check(file.isFile() && file.name.endsWith('.md'), `unexpected knowledge entry: ${file.name}`);
    const meta = readHeader(path.join(selected.directory, 'knowledge', file.name));
    validateMeta(meta, selected.meta.domains);
    check(file.name === `${meta.id}.md`, 'note filename must match its ID');
    check(!folded.has(meta.id.toLowerCase()), 'case-colliding note IDs');
    folded.add(meta.id.toLowerCase());
    check(meta.version === (selected.committed.nodes[meta.id]?.meta.version ?? 1), 'note version is engine-owned');
    result.push(meta);
  }
  for (const id of Object.keys(selected.committed.nodes)) check(result.some(meta => meta.id === id), `committed note removed: ${id}; use lifecycle instead`);
  stable(selected);
  return result.sort((a, b) => compare(a.id, b.id));
}
function readNode(selected, id, entries) {
  identifier(id);
  if (!entries.some(meta => meta.id === id)) fail('NOT_FOUND', `node ${id} not found`, { id, revision: selected.meta.revision });
  const raw = regular(path.join(selected.directory, 'knowledge', `${id}.md`));
  if (selected.historical) check(hash(raw) === selected.committed.nodes[id].hash, `corrupt historical note: ${id}`);
  const node = parseNote(raw, selected.meta.domains);
  check(node.id === id, 'note ID mismatch');
  validateReferences(node, new Set(entries.map(meta => meta.id)));
  stable(selected);
  return { ...node, path: relative(selected, `knowledge/${id}.md`), revision: selected.meta.revision,
    dirty: !selected.historical && hash(raw) !== selected.committed.nodes[id]?.hash };
}
export function state(root, revision) {
  const selected = selection(root, revision);
  const { meta, body } = selected;
  validateLinks(body, new Set(catalog(selected).map(meta => meta.id)), true);
  return { schema_version: 3, revision: meta.revision, project: { id: meta.project_id, name: meta.project_name },
    focus_domain: meta.focus_domain, domains: meta.domains, content: body,
    path: relative(selected, 'STATE.md'), dirty: !selected.historical && hash(selected.raw) !== selected.committed.state_hash };
}
export function inspect(root, id, revision) {
  const selected = selection(root, revision);
  return readNode(selected, id, catalog(selected));
}
function neighborhood(root, id, options) {
  keys(options, ['revision', 'relation', 'limit'], 'navigation options');
  const { revision, relation, limit = 20 } = options;
  integer(limit);
  check(relation === undefined || RELATIONS.includes(relation), 'invalid relation filter');
  const selected = selection(root, revision);
  const entries = catalog(selected);
  const source = readNode(selected, id, entries);
  const edges = source.relations.filter(edge => !relation || edge.type === relation);
  const targets = [...new Set(edges.map(edge => edge.target))].sort(compare);
  return { selected, entries, source, edges, targets, limit, relation };
}
export function neighbors(root, id, options = {}) {
  const { selected, entries, targets, limit, relation } = neighborhood(root, id, options);
  return { id, revision: selected.meta.revision, relation: relation ?? null, limit, total: targets.length,
    truncated: targets.length > limit, nodes: targets.slice(0, limit).map(target => readNode(selected, target, entries)) };
}
export function expand(root, id, options = {}) {
  const { selected, entries, source, edges, targets, limit, relation } = neighborhood(root, id, options);
  return { id, revision: selected.meta.revision, source, direction: 'outgoing', depth: 1,
    relation: relation ?? null, limit, total: targets.length, truncated: targets.length > limit,
    complete: targets.length <= limit, neighbors: targets.slice(0, limit).map(target => {
      const { relations: ignored, ...node } = readNode(selected, target, entries);
      return { ...node, relations: edges.filter(edge => edge.target === target).map(edge => edge.type).sort(compare) };
    }) };
}
export function index(root, options = {}) {
  keys(options, ['revision', 'list', 'domain', 'kind', 'lifecycle', 'limit', 'after'], 'index options');
  const { revision, list = false, domain, kind, lifecycle, limit = 20, after } = options;
  check(typeof list === 'boolean', 'list must be boolean');
  check(list || [domain, kind, lifecycle, options.limit, after].every(value => value === undefined), 'catalog options require list');
  integer(limit, 1, 100);
  const selected = selection(root, revision);
  const entries = catalog(selected);
  const valid = { domain: selected.meta.domains, kind: KINDS, lifecycle: LIFECYCLES };
  for (const [key, value] of Object.entries({ domain, kind, lifecycle })) if (value !== undefined && !valid[key].includes(value)) fail('INVALID_FILTER', `unknown ${key}: ${value}`, { valid: valid[key] });
  if (!list) {
    const counts = (values, field) => [...values].sort(compare).map(value => ({ [field]: value, count: entries.filter(node => node[field] === value).length }));
    return { revision: selected.meta.revision, total: entries.length,
      domains: counts(selected.meta.domains, 'domain'), kinds: counts(KINDS, 'kind'), lifecycles: counts(LIFECYCLES, 'lifecycle') };
  }
  const matches = entries.filter(node => (!domain || node.domain === domain) && (!kind || node.kind === kind) && (!lifecycle || node.lifecycle === lifecycle));
  if (after !== undefined) {
    identifier(after);
    if (!matches.some(node => node.id === after)) fail('INVALID_CURSOR', 'after must identify a matching node in this revision');
  }
  const remaining = matches.filter(node => after === undefined || compare(node.id, after) > 0);
  const nodes = remaining.slice(0, limit).map(node => ({ ...node, path: relative(selected, `knowledge/${node.id}.md`) }));
  const truncated = remaining.length > limit;
  return { revision: selected.meta.revision, filters: { domain: domain ?? null, kind: kind ?? null, lifecycle: lifecycle ?? null },
    total: matches.length, limit, after: after ?? null, nodes, truncated, complete: !truncated, next_after: truncated ? nodes.at(-1).id : null };
}
function writeExclusive(file, bytes) {
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function replace(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeExclusive(temporary, bytes);
  fs.renameSync(temporary, file);
}
export function snapshot(base, meta, body, nodes, message, reason) {
  validateState(meta);
  const ids = new Set(nodes.map(node => node.id));
  check(ids.size === nodes.length && new Set(nodes.map(node => node.id.toLowerCase())).size === nodes.length, 'duplicate or case-colliding IDs');
  validateLinks(body, ids, true);
  nodes.forEach(node => { validateNode(node, meta.domains); validateReferences(node, ids); });
  const raw = stateText(meta, body);
  const directory = revisionDir(base, meta.revision);
  fs.mkdirSync(directory); // Exclusive: never overwrite a confirmed or interrupted revision.
  fs.mkdirSync(path.join(directory, 'knowledge'));
  const manifest = { revision: meta.revision, state_hash: hash(raw), nodes: Object.fromEntries(nodes.map(node => {
    const { summary, relations, ...metadata } = node;
    return [node.id, { meta: metadata, hash: hash(noteText(node)) }];
  })) };
  writeExclusive(path.join(directory, 'STATE.md'), raw);
  for (const node of nodes) writeExclusive(path.join(directory, 'knowledge', `${node.id}.md`), noteText(node));
  const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
  writeExclusive(path.join(directory, 'manifest.json'), manifestBytes);
  const journal = `# Revision ${meta.revision}\n\n${message}\n\n## Reason\n\n${reason ?? 'Not recorded.'}\n\n## Confirmed state\n\n[STATE revision ${meta.revision}](../.history/${meta.revision}/STATE.md)\n\n## Knowledge\n\n${nodes.map(node => `- [${node.id} v${node.version}](../.history/${meta.revision}/knowledge/${node.id}.md) — ${node.title}`).join('\n')}\n`;
  return { raw, journal, manifest, seal: hash(manifestBytes) + '\n' };
}
export function confirmSnapshot(base, revision, seal) {
  writeExclusive(path.join(revisionDir(base, revision), '.complete'), seal);
}
export function init(root, project) {
  keys(project, ['id', 'name'], 'project');
  const meta = { schema_version: 3, revision: 0, project_id: project.id, project_name: project.name, focus_domain: null, domains: [] };
  validateState(meta);
  const base = memory(root);
  fs.mkdirSync(base);
  writeExclusive(path.join(base, '.write.lock'), 'initialization\n');
  for (const directory of ['knowledge', 'journal', '.history']) fs.mkdirSync(path.join(base, directory));
  const body = `# ${project.name}\n\n## Objective\n\nNot recorded.\n\n## Current status\n\nInitialized.\n\n## Decisions and constraints\n\nNot recorded.\n\n## Open issues\n\nNot recorded.\n\n## Next actions\n\nNot recorded.\n\n## References\n`;
  const prepared = snapshot(base, meta, body, [], 'Memory initialized.');
  writeExclusive(path.join(base, 'STATE.md'), prepared.raw);
  writeExclusive(path.join(base, 'journal', '0000.md'), prepared.journal);
  confirmSnapshot(base, 0, prepared.seal);
  fs.unlinkSync(path.join(base, '.write.lock'));
  return state(root);
}
export function advance(root, proposal) {
  keys(proposal, ['expected_revision', 'operations', 'message', 'reason'], 'proposal');
  integer(proposal.expected_revision);
  check(Array.isArray(proposal.operations) && proposal.operations.length > 0, 'operations must be nonempty');
  for (const key of ['message', 'reason']) check(proposal[key] === undefined || typeof proposal[key] === 'string', `${key} must be a string`);
  const selected = selection(root);
  if (selected.meta.revision !== proposal.expected_revision) fail('STALE_REVISION', 'expected_revision does not match current revision');
  const entries = catalog(selected);
  const originalNotes = new Map(entries.map(meta => [meta.id, regular(path.join(selected.base, 'knowledge', `${meta.id}.md`))]));
  const nodes = new Map([...originalNotes].map(([id, raw]) => [id, parseNote(raw, selected.meta.domains)]));
  const meta = structuredClone(selected.meta);
  let body = selected.body;
  const touched = new Set();
  for (const operation of proposal.operations) {
    if (operation?.type === 'set_state') {
      keys(operation, ['type', 'content', 'domains', 'focus_domain'], 'set_state');
      if (operation.content !== undefined) { check(typeof operation.content === 'string', 'content must be Markdown text'); body = operation.content; }
      for (const key of ['domains', 'focus_domain']) if (Object.hasOwn(operation, key)) meta[key] = operation[key];
    } else if (operation?.type === 'upsert_node') {
      keys(operation, ['type', 'id', 'kind', 'domain', 'title', 'summary', 'lifecycle', 'relations'], 'upsert_node');
      identifier(operation.id);
      check(!touched.has(operation.id), 'only one upsert per ID');
      touched.add(operation.id);
      const { type, ...changes } = operation;
      nodes.set(operation.id, { version: 1, ...nodes.get(operation.id), ...changes });
    } else fail('INVALID_INPUT', `unsupported operation: ${operation?.type}; use set_state or upsert_node`);
  }
  meta.revision++;
  validateState(meta);
  for (const node of nodes.values()) {
    const prior = selected.committed.nodes[node.id];
    node.version = prior?.meta.version ?? 1;
    validateNode(node, meta.domains);
    if (prior && hash(noteText(node)) !== prior.hash) node.version++;
  }
  const ordered = [...nodes.values()].sort((a, b) => compare(a.id, b.id));
  const ids = new Set(nodes.keys());
  check(new Set(ordered.map(node => node.id.toLowerCase())).size === ordered.length, 'case-colliding IDs');
  validateLinks(body, ids, true);
  ordered.forEach(node => validateReferences(node, ids));
  const lock = path.join(selected.base, '.write.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') fail('MEMORY_BUSY', 'another writer holds .write.lock'); throw error; }
  let publication = false;
  let success = false;
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, revision: meta.revision }) + '\n');
    fs.fsyncSync(fd);
    check(regular(path.join(selected.base, 'STATE.md')) === selected.raw, 'STATE changed during preparation');
    for (const [id, raw] of originalNotes) check(regular(path.join(selected.base, 'knowledge', `${id}.md`)) === raw, 'note changed during preparation');
    const files = fs.readdirSync(path.join(selected.base, 'knowledge')).sort(compare);
    check(JSON.stringify(files) === JSON.stringify(entries.map(node => `${node.id}.md`).sort(compare)), 'knowledge inventory changed during preparation');
    const changed = ordered.filter(node => selected.committed.nodes[node.id]?.hash !== hash(noteText(node)));
    const message = proposal.message ?? `State updated. Changed knowledge: ${changed.map(node => `${node.id} v${node.version}`).join(', ') || 'none'}.`;
    publication = true;
    const next = snapshot(selected.base, meta, body, ordered, message, proposal.reason);
    for (const node of ordered) replace(path.join(selected.base, 'knowledge', `${node.id}.md`), noteText(node));
    writeExclusive(path.join(selected.base, 'journal', `${String(meta.revision).padStart(4, '0')}.md`), next.journal);
    replace(path.join(selected.base, 'STATE.md'), next.raw);
    confirmSnapshot(selected.base, meta.revision, next.seal);
    success = true;
  } finally {
    fs.closeSync(fd);
    // A partial publication remains locked for explicit recovery; historical reads stay available.
    if (!publication || success) fs.unlinkSync(lock);
  }
  return state(root);
}
