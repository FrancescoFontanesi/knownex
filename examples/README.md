# Minimal memory example

`basic/` is a small, real memory created using `init` and `advance`: revision 0
is empty, revision 1 records a local-only decision and its verification task.
It contains only synthetic project information and no experimental results.

From the repository root:

```sh
node bin/memory.mjs state --root examples/basic
node bin/memory.mjs inspect DEC-LOCAL --root examples/basic --revision 1
node bin/memory.mjs index --root examples/basic --list
node bin/memory.mjs expand DEC-LOCAL --root examples/basic
```

Read `basic/memory/STATE.md`, follow its links to knowledge, then open the journal
to see the confirmation and historical links. No engine is needed to read them.

To reproduce the example, create a new empty project directory and run:

```sh
node bin/memory.mjs init --root /path/to/project --id documentation --name "Documentation Project"
node bin/memory.mjs advance --root /path/to/project --proposal examples/proposal.json
```

The project directory must already exist; `memory/` must not. The proposal starts
from revision 0. Do not apply it to an existing project without adapting its
revision, state and domain list.
