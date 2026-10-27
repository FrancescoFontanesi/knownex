import fs from 'node:fs';

export const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const DOMAIN = /^[a-z0-9][a-z0-9_-]*$/;
export const KINDS = ['decision', 'issue', 'result', 'task'];
export const LIFECYCLES = ['active', 'superseded'];
export const RELATIONS = ['supersedes', 'supported_by', 'relevant_to'];
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { memoryCode: code, details });
}
export function check(value, message) { if (!value) fail('INVALID_INPUT', message); }
export function keys(value, allowed, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  check(Object.keys(value).every(key => allowed.includes(key)), `unknown field in ${label}`);
}
export function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  check(Number.isSafeInteger(value) && value >= min && value <= max, `integer must be between ${min} and ${max}`);
}
export function identifier(value, domain = false) {
  check(typeof value === 'string' && (domain ? DOMAIN : ID).test(value), `invalid ${domain ? 'domain' : 'ID'}: ${value}`);
  // Win32 aliases and case folding must not create two identities for one file.
  check(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value), `reserved ID: ${value}`);
}
function header(meta) {
  return `---\n${Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n`;
}
export function split(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  check(match, 'missing restricted frontmatter');
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^([a-z_]+): (.+)$/.exec(line);
    check(item && !Object.hasOwn(meta, item[1]), 'invalid or duplicate frontmatter field');
    try { meta[item[1]] = JSON.parse(item[2]); }
    catch { fail('INVALID_INPUT', `frontmatter values must be JSON literals: ${item[1]}`); }
  }
  const remainder = text.slice(match[0].length);
  return { meta, body: remainder.startsWith('\r\n') ? remainder.slice(2) : remainder.startsWith('\n') ? remainder.slice(1) : remainder };
}
// Discovery reads at most the frontmatter, never the full prose. Bound malformed headers.
export function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(512);
    let text = '';
    for (let count = 0; count < 128; count++) {
      const n = fs.readSync(fd, bytes, 0, bytes.length, null);
      if (!n) break;
      text += bytes.subarray(0, n).toString('latin1');
      if (/\r?\n---\r?\n/.test(text.slice(4))) {
        return split(Buffer.from(text, 'latin1').toString('utf8')).meta;
      }
    }
    fail('INVALID_INPUT', 'frontmatter missing terminator or exceeds 64 KiB');
  } finally { fs.closeSync(fd); }
}
export function validateState(meta) {
  keys(meta, ['schema_version', 'revision', 'project_id', 'project_name', 'focus_domain', 'domains'], 'state');
  check(meta.schema_version === 3, 'STATE.md schema_version must be 3');
  integer(meta.revision);
  identifier(meta.project_id, true);
  check(typeof meta.project_name === 'string' && meta.project_name.trim(), 'project_name must be nonempty');
  check(Array.isArray(meta.domains), 'domains must be an array of IDs');
  meta.domains.forEach(id => identifier(id, true));
  check(new Set(meta.domains).size === meta.domains.length, 'duplicate domains');
  check(meta.focus_domain === null || meta.domains.includes(meta.focus_domain), 'focus_domain must name an existing domain');
}
export function validateMeta(meta, domains) {
  keys(meta, ['id', 'version', 'kind', 'domain', 'title', 'lifecycle'], 'note metadata');
  identifier(meta.id);
  integer(meta.version, 1);
  check(KINDS.includes(meta.kind), 'invalid kind');
  check(LIFECYCLES.includes(meta.lifecycle), 'invalid lifecycle');
  identifier(meta.domain, true);
  check(domains.includes(meta.domain), `unknown domain: ${meta.domain}`);
  check(typeof meta.title === 'string' && meta.title.trim(), 'title must be nonempty');
  check(Buffer.byteLength(header(meta)) <= 64 * 1024, 'note frontmatter exceeds 64 KiB');
}
export function validateNode(node, domains) {
  keys(node, ['id', 'version', 'kind', 'domain', 'title', 'summary', 'lifecycle', 'relations'], 'note');
  const { summary, relations, ...meta } = node;
  validateMeta(meta, domains);
  check(typeof summary === 'string' && Array.isArray(relations), 'summary and relations are required');
  const seen = new Set();
  for (const relation of relations) {
    keys(relation, ['type', 'target'], 'relation');
    check(RELATIONS.includes(relation.type), `invalid relation type: ${relation.type}`);
    identifier(relation.target);
    const key = `${relation.type}:${relation.target}`;
    check(!seen.has(key), `duplicate relation: ${key}`);
    seen.add(key);
  }
}
const RELATION_HEADING = '\n\n## Relations\n\n';
export function noteText(node) {
  const { summary, relations, ...meta } = node;
  return header(meta) + summary + RELATION_HEADING + [...relations]
    .sort((a, b) => compare(a.target, b.target) || compare(a.type, b.type))
    .map(({ type, target }) => `- ${type}: [${target}](${target}.md)`).join('\n') + '\n';
}
export function parseNote(text, domains) {
  const { meta, body } = split(text);
  const boundary = [...body.matchAll(/\r?\n\r?\n## Relations\r?\n\r?\n/g)].at(-1);
  check(boundary, 'note must end with a ## Relations section');
  const relations = body.slice(boundary.index + boundary[0].length).trim().split(/\r?\n/).filter(Boolean).map(line => {
    const match = /^- ([a-z_]+): \[([A-Za-z0-9_-]+)\]\(\2\.md\)$/.exec(line);
    check(match, 'invalid relation link');
    return { type: match[1], target: match[2] };
  });
  const node = { ...meta, summary: body.slice(0, boundary.index), relations };
  validateNode(node, domains);
  return node;
}
export const stateText = (meta, body) => header(meta) + body;
export function validateLinks(body, ids, state = false) {
  // Only engine-owned note links are validated; source/web links remain ordinary data.
  for (const match of body.matchAll(/\]\((?:\.\/)?(knowledge\/)?([A-Za-z0-9_-]+)\.md(?:#[^\s)]*)?\)/g)) {
    if (state !== Boolean(match[1])) continue;
    if (!ids.has(match[2])) fail('INVALID_REFERENCE', `unknown linked note: ${match[2]}`);
  }
}
export function validateReferences(node, ids) {
  for (const { target } of node.relations) {
    if (!ids.has(target)) fail('INVALID_REFERENCE', `${node.id} references missing node ${target}`);
  }
  validateLinks(node.summary, ids);
}
