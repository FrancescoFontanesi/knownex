# KnowNex — Publication Report

## Identity and scope

**KnowNex — Knowledge Nexus for Humans & AI Agents.** Technical preview,
not a stable release. Description: Markdown-native knowledge and persistent
memory for humans and AI agents, with selective context retrieval, navigable
links, versioned history and MCP integration.

Destination: `FrancescoFontanesi/knownex`, branch `main`.
Repository URL: https://github.com/FrancescoFontanesi/knownex
Preparation date: 2026-10-27.

The interrupted earlier naming attempt left local documentation, a minimal
example, exclusions and successful installation/test logs. No public repository,
remote or commit existed. This preparation reuses that work without changing
the memory engine, storage format, primitive semantics or historical experiments.

## Name checks

- Authenticated GitHub account: `FrancescoFontanesi`; owner profile and GitHub CLI
  agree. The repository lookup for `FrancescoFontanesi/knownex` returned 404 before
  creation; repository creation must still succeed to establish availability.
- npm registry lookup for `knownex` returned 404. This is a point-in-time lookup,
  not a reservation. The package stays `private: true`; nothing is published to npm.
- Search found no equivalent agent-memory project with this name. Unrelated uses
  include an AI-assisted news project described as KnowNex Intelligence & Tech
  and a web agency's older Knownex innovation-center project. Sources:
  [owner's public profile](https://np.linkedin.com/in/yuvraj-knownex) and
  [agency portfolio](https://innovabe.com/our-solutions). These are documented
  residual naming ambiguities, not evidence of a competing memory engine.
- Repository/package identifiers are distinct from trademark rights. No trademark
  clearance or exclusivity is claimed.

## License and dependencies

MIT is explicitly authorized by the owner. `LICENSE` uses the
[Open Source Initiative MIT text](https://opensource.org/license/mit), with
copyright 2026 Francesco Fontanesi. The name is verified from the authenticated
owner's account; no identity is invented. Package and lockfile declare MIT.

No dependency is added or upgraded. Runtime: `@modelcontextprotocol/server`
2.4.0 (Apache-2.0), `zod` 4.6.7 (MIT). Test client:
`@modelcontextprotocol/client` 2.4.0 (Apache-2.0). Installed transitive licenses
are checked against the lockfile. Permissive dependency licenses remain their
own; the project MIT license does not relicense dependencies. No dependency
source is vendored. npm ci reports zero known vulnerabilities at verification
time, which is not a guarantee of absence of vulnerabilities.

## Files prepared

- Rebranded README, ARCHITECTURE, CLI reference and skill description.
- Updated package/lockfile identity, description, MIT and repository links.
- MCP server identity is `knownex`; tool names, schemas, diagnostics compatibility
  and primitive behavior remain unchanged. No engine or test logic is changed.
- Added LICENSE and `.gitattributes`: LF checkout avoids breaking byte hashes in
  Markdown checkpoints on Windows.
- Retained the small reproducible `examples/basic` memory and its proposal.
- Preserved `.gitignore` exclusions prepared during the interrupted attempt.

Included: source under `lib`, `bin`, `mcp`; all functional tests and synthetic
test fixtures; navigation skill; README, architecture and CLI reference;
minimal example, proposal, package files, license and this report.

Excluded but retained locally: experiments and their reports/traces, node_modules,
root generated memory and migration backups, private `.codex`/MCP configuration,
workstation AGENTS.md, local graph/cache, local publication logs and the earlier
architectural report containing experiment and machine-specific references.
No heavy experimental artifacts, conversation transcripts or credentials are
intended for the public tree. Local diagnostic evidence stays in the ignored
`.publication` directory.

## Verification

| Check | Result |
|---|---|
| npm ci | Passed; 14 dependencies installed, zero reported vulnerabilities. |
| Full suite | 23 passed, 0 failed, 0 skipped. |
| README CLI commands | 4/4 passed on the included example. |
| Fresh initialization and proposal | Passed from revision 0 to 1. |
| MCP stdio, official client | 5/5 tools match engine results; clean stderr and unchanged memory. |
| Package and lockfile | Name, version, license and pinned dependency versions match. |
| Dependency licenses | 14 installed packages: Apache-2.0, MIT or ISC; compatible permissive licenses. |
| Local Markdown links | 17 rendered local links resolve; code examples are checked separately. |
| Content and sizes | 37 candidate files reviewed; largest is 16,857 bytes; none exceeds 1 MiB. |
| Secret/private-path patterns | No findings in candidate content; excludes local configuration and logs. |
| Previous Git history | No commits or tracked files existed; no old history will be exposed. |
| Historical experiments | 1,383 preexisting experiment files retain their SHA-256 hashes. |
| Skill | Metadata validator passes; only product name changes in the description. |

The staged tree is checked again before commit. Diagnostic logs, hashes and full
MCP responses remain local, excluded from publication. The checks do not establish
an absence of all possible secrets or vulnerabilities. Commit authorship uses the
verified owner name and GitHub noreply address, not a private email address.

## Known limits and residual risks

Multifile publication is not atomic. Writers use a cooperative lock; external
editors can ignore it. Interrupted writes require manual recovery; power-loss
durability is not guaranteed. Historical snapshots use additional disk space.
Catalog discovery scans frontmatter; traversal limits count neighbors, not bytes.
`dirty` refers to an individual returned document. Link validation is restricted
to engine-owned links and does not verify prose or arbitrary CommonMark.

No token, performance or superiority claim is made. Secret scanning is heuristic,
combined with content review; it is not proof that all sensitive information is
detectable. The preview does not implement curator, hooks or semantic search.

## Publication state

Prepared for the authorized initial public commit after successful checks.
The exact commit SHA is obtained after commit and reported in the delivery
response; a commit cannot embed its own hash without changing it. Remote commit
and full tree identity are verified after push. No npm publication, tag, GitHub
release, force push, agent benchmark or subsequent experiment is authorized here.
