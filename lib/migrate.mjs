import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, snapshot, confirmSnapshot } from './core.mjs';
import { check, keys, integer, identifier, validateNode } from './markdown.mjs';

function json(file, digest) {
  const bytes = fs.readFileSync(file);
  if (digest) check(/^[a-f0-9]{64}$/.test(digest) && hash(bytes) === digest, `legacy hash mismatch: ${file}`);
  return JSON.parse(bytes.toString('utf8'));
}
function convert(old) {
  keys(old, ['schema_version', 'revision', 'project', 'focus_domain', 'domains', 'graph_snapshot'], 'legacy state');
  check(old.schema_version === 2, 'only schema_version 2 can be migrated');
  integer(old.revision);
  keys(old.project, ['id', 'name', 'summary', 'objective'], 'legacy project');
  check(typeof old.project.summary === 'string' && typeof old.project.objective === 'string', 'invalid legacy project text');
  const meta = { schema_version: 3, revision: old.revision, project_id: old.project.id,
    project_name: old.project.name, focus_domain: old.focus_domain, domains: Object.keys(old.domains).sort() };
  let body = `# ${old.project.name}\n\n## Objective\n\n${old.project.objective}\n\n## Current status\n\n${old.project.summary}\n\n## Focus\n\n${old.focus_domain ?? 'Not selected.'}\n`;
  for (const domain of meta.domains) {
    identifier(domain, true);
    const entry = old.domains[domain];
    keys(entry, ['summary', 'current_focus', 'next_action', 'current_nodes'], 'legacy domain');
    for (const key of ['summary', 'current_focus', 'next_action']) check(typeof entry[key] === 'string', `invalid legacy ${key}`);
    body += `\n## Domain: ${domain}\n\n${entry.summary}\n\n### Current focus\n\n${entry.current_focus}\n\n### Next action\n\n${entry.next_action}\n\n### References\n\n`;
    check(entry.current_nodes === undefined || Array.isArray(entry.current_nodes), 'invalid current_nodes');
    for (const id of entry.current_nodes ?? []) { identifier(id); body += `- [${id}](knowledge/${id}.md)\n`; }
  }
  return { meta, body };
}
/** Explicit, offline conversion. The untouched legacy tree remains a sibling backup. */
export function migrate(root) {
  const project = path.resolve(root);
  const base = path.join(project, 'memory');
  check(!fs.existsSync(path.join(base, 'STATE.md')), 'Markdown memory already exists');
  const lock = path.join(base, '.write.lock');
  const fd = fs.openSync(lock, 'wx');
  fs.writeFileSync(fd, 'offline Markdown migration\n');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  const token = randomUUID();
  const stage = path.join(project, `.memory-migration-${token}`);
  const backup = path.join(project, `memory.v2-backup-${token}`);
  let moved = false;
  try {
    const current = json(path.join(base, 'current', 'STATE.json'));
    integer(current.revision);
    for (const file of fs.readdirSync(path.join(base, 'history'))) {
      const match = /^(0|[1-9][0-9]*)\.json$/.exec(file);
      if (match) {
        check(Number(match[1]) <= current.revision, 'legacy history contains a future revision; resolve interrupted writes before migration');
        if (Number(match[1]) === current.revision) check(JSON.stringify(json(path.join(base, 'history', file))) === JSON.stringify(current), 'legacy current/history conflict');
      }
    }
    const revisions = [];
    for (let revision = 0; revision <= current.revision; revision++) {
      const old = revision === current.revision ? current : json(path.join(base, 'history', `${revision}.json`));
      check(old.revision === revision, 'legacy revision mismatch');
      const converted = convert(old);
      let nodes = [];
      if (old.graph_snapshot !== undefined) {
        check(/^[a-f0-9]{64}$/.test(old.graph_snapshot), 'invalid legacy graph digest');
        const graph = json(path.join(base, 'graphs', `${old.graph_snapshot}.json`), old.graph_snapshot);
        keys(graph, ['schema_version', 'nodes'], 'legacy graph');
        check(graph.schema_version === 1 && graph.nodes && typeof graph.nodes === 'object', 'invalid legacy graph');
        nodes = Object.entries(graph.nodes).map(([id, reference]) => {
          identifier(id);
          keys(reference, ['version', 'hash'], 'legacy node reference');
          integer(reference.version, 1);
          check(/^[a-f0-9]{64}$/.test(reference.hash), 'invalid legacy node digest');
          const node = json(path.join(base, 'nodes', id, `${reference.version}-${reference.hash}.json`), reference.hash);
          validateNode(node, converted.meta.domains);
          check(node.id === id && node.version === reference.version, 'legacy node identity mismatch');
          return node;
        }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      }
      revisions.push({ ...converted, nodes });
    }
    fs.mkdirSync(stage);
    for (const dir of ['knowledge', 'journal', '.history']) fs.mkdirSync(path.join(stage, dir));
    for (const { meta, body, nodes } of revisions) {
      const prepared = snapshot(stage, meta, body, nodes, `Imported existing revision ${meta.revision} from schema 2. Earlier change rationale was not recorded by the engine.`);
      fs.writeFileSync(path.join(stage, 'journal', `${String(meta.revision).padStart(4, '0')}.md`), prepared.journal, { flag: 'wx' });
      confirmSnapshot(stage, meta.revision, prepared.seal);
    }
    const latest = revisions.at(-1).meta.revision;
    fs.copyFileSync(path.join(stage, '.history', String(latest), 'STATE.md'), path.join(stage, 'STATE.md'), fs.constants.COPYFILE_EXCL);
    for (const node of revisions.at(-1).nodes) fs.copyFileSync(path.join(stage, '.history', String(latest), 'knowledge', `${node.id}.md`), path.join(stage, 'knowledge', `${node.id}.md`), fs.constants.COPYFILE_EXCL);
    // Both absolute rename targets are fixed siblings inside the explicitly selected project.
    check(path.dirname(base) === project && path.dirname(stage) === project && path.dirname(backup) === project, 'unsafe migration paths');
    fs.renameSync(base, backup);
    moved = true;
    try { fs.renameSync(stage, base); }
    catch (error) { fs.renameSync(backup, base); moved = false; throw error; }
    return { revision: latest, migrated_revisions: revisions.length, backup, memory: base };
  } finally {
    const ownedLock = path.join(moved ? backup : base, '.write.lock');
    if (fs.existsSync(ownedLock)) fs.unlinkSync(ownedLock);
    // Failed staging is retained for inspection; no recursive deletion of user data.
  }
}
