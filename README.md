# KnowNex

Knowledge Nexus for Humans & AI Agents.

**Technical preview — not a stable release.** Markdown-native knowledge and
persistent memory for humans and AI agents, with selective context retrieval,
navigable links, versioned history and MCP integration.

KnowNex keeps a project's current state, individual knowledge notes and journal
as readable Markdown. An agent can open a known file, follow a reference, or use
a deterministic engine to discover relevant notes and traverse their outgoing
relations. The aim is to avoid loading irrelevant context; lower token usage is
a design goal, not a measured result for this preview.

## How memory works

- **Current State:** `memory/STATE.md` describes the objective, operational
  status, focus, decisions, constraints, open issues and next actions.
- **Knowledge:** `memory/knowledge/<ID>.md` contains autonomous notes with a
  restricted frontmatter and ordinary Markdown links for typed relations.
- **Journal:** `memory/journal/` records confirmed changes, recorded reasons
  and links to historical versions. Missing reasons are not invented.
- **History:** independent Markdown checkpoints preserve confirmed revisions.

Markdown is the source of truth, so people and agents can read it without CLI,
MCP or a database. The optional catalog reads note metadata rather than all note
bodies; it is rebuilt on demand and has no persistent cache.

This is an excerpt from the [working example](examples/basic/memory/STATE.md):

```markdown
# Documentation Project

## Objective

Keep local documentation links valid without network access.

## Current status

The local-only scope is agreed. Verification is the next action.

## Decisions and constraints

Do not fetch remote URLs or introduce external dependencies.

## Next actions

Verify local file links before release.

## References

- [Local-only scope](knowledge/DEC-LOCAL.md)
- [Verification task](knowledge/TASK-CHECK.md)
```

Read a known file when it suffices. Follow its links for a specific gap. Use
`index` when you do not know the relevant ID, `inspect` for one note, and
`expand` when several directly linked notes are needed. No bootstrap sequence
or graph traversal is mandatory. The optional
[navigation skill](.agents/skills/agent-memory-navigate/SKILL.md) describes this policy.

## Run from a checkout

Requires Node.js **22 or later** and npm. From the checkout directory:

```sh
npm ci
npm test
node bin/memory.mjs state --root examples/basic
node bin/memory.mjs index --root examples/basic --list
node bin/memory.mjs inspect DEC-LOCAL --root examples/basic
node bin/memory.mjs expand DEC-LOCAL --root examples/basic --revision 1
```

For your own existing project directory:

```sh
node bin/memory.mjs init --root /path/to/project --id my-project --name "My Project"
node bin/memory.mjs advance --root /path/to/project --proposal examples/proposal.json
```

Initialization never overwrites an existing memory. The proposal is an editable
example, not a project scanner. Keep the checked-in example unchanged when
trying updates; initialize your own project instead. No global CLI install or
npm publication is required. The package is named `knownex` and marked private
to prevent accidental npm publication. Install from the
[GitHub repository](https://github.com/FrancescoFontanesi/knownex):

```sh
git clone https://github.com/FrancescoFontanesi/knownex.git
cd knownex
npm ci
```

## Optional read-only MCP

Run `node mcp/stdio.mjs --root /absolute/path/to/project`. The root is fixed for
the server instance. Exposed tools are `memory_state`, `memory_index`,
`memory_inspect`, `memory_neighbors` and `memory_expand`; no write tool exists.
Tool names and the skill identifier retain compatibility.

Example client configuration, to apply manually after replacing both paths:

```toml
[mcp_servers.knownex]
command = "node"
args = ["/absolute/path/to/checkout/mcp/stdio.mjs", "--root", "/absolute/path/to/project"]
```

On Windows, use absolute paths with forward slashes. The server uses stdio for
protocol only and stderr for diagnostics. Results use `structuredContent`;
`--text-results` selects a single JSON text result for clients that need it.
Reading Markdown directly remains available without MCP or client configuration.

## Implemented scope and limits

Implemented: initialization, validated typed updates, stable IDs and node
versions, readable journal, historical checkpoints, filtered/paginated catalogs,
outgoing depth-one traversal, CLI and five read-only MCP tools. Legacy JSON
memories have an explicit offline migration with an untouched backup.

Manual current-file edits are visible before confirmation. `dirty` applies to
the returned document; explicit revisions always select confirmed checkpoints.
Writes use a cooperative lock and are **not a multifile atomic transaction**.
Interrupted writes require manual recovery. External editors do not respect the
lock; power-loss durability is not guaranteed. Full snapshots use additional
disk space. Traversal limits count neighbors, not bytes. Link validation covers
the engine's restricted note links, not arbitrary CommonMark or factual accuracy.

There is no semantic search, curator, automatic ingestion, hook or background
service. No claim of reduced tokens, latency or cost is made.

## Roadmap

Next: evaluate the Markdown-first workflow in a controlled agent experiment and
document the results before considering further changes. The preview makes no
claim of lower token usage, latency or cost than other approaches.

## License and documentation

[MIT](LICENSE), copyright 2026 Francesco Fontanesi. Dependency licenses remain
those of their respective authors.

See [CLI and format reference](docs/CLI.md), [architecture](ARCHITECTURE.md),
[examples](examples/README.md) and [publication report](PUBLICATION-REPORT.md).
