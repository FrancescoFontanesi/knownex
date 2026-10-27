import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { init, advance, state, inspect, neighbors, expand, index } from '../lib/core.mjs';
import { migrate } from '../lib/migrate.mjs';

const usage = `Usage:
  node bin/memory.mjs init --root <project> --id <id> --name <name>
  node bin/memory.mjs migrate --root <project>
  node bin/memory.mjs advance --root <project> --proposal <file.json>
  node bin/memory.mjs state --root <project> [--revision <integer>]
node bin/memory.mjs inspect <id> --root <project> [--revision <integer>]
node bin/memory.mjs neighbors <id> --root <project> [--relation <type>] [--revision <integer>] [--limit <integer>]
node bin/memory.mjs expand <id> --root <project> [--relation <type>] [--revision <integer>] [--limit <integer>]
node bin/memory.mjs index --root <project> [--revision <integer>] [--list [--domain <id>] [--kind <type>] [--lifecycle <status>] [--limit <integer>] [--after <id>]]
Relative paths resolve from the working directory. --root contains memory/.`;

const [command, ...args] = process.argv.slice(2);
try {
  const options = {
    init: ['root', 'id', 'name'],
    migrate: ['root'],
    advance: ['root', 'proposal'],
    state: ['root', 'revision'],
    inspect: ['root', 'revision'],
    neighbors: ['root', 'revision', 'relation', 'limit'],
    expand: ['root', 'revision', 'relation', 'limit'],
    index: ['root', 'revision', 'list', 'domain', 'kind', 'lifecycle', 'limit', 'after'],
  };
  if (!Object.hasOwn(options, command)) throw new Error(usage);
  const { values, positionals } = parseArgs({
    args,
    options: Object.fromEntries(options[command].map(key => [key, { type: key === 'list' ? 'boolean' : 'string' }])),
    allowPositionals: command === 'inspect' || command === 'neighbors' || command === 'expand',
  });
  // parseArgs accepts repeated options; reject ambiguous commands instead.
  for (const key of options[command]) {
    const count = args.filter(arg => arg === `--${key}` || arg.startsWith(`--${key}=`)).length;
    if (count > 1) throw new Error(`duplicate option --${key}`);
  }
  if (!values.root?.trim()) throw new Error('--root is required and must contain memory/');
  for (const key of ['revision', 'limit']) {
    if (values[key] !== undefined && (!/^(0|[1-9][0-9]*)$/.test(values[key]) || !Number.isSafeInteger(Number(values[key])))) {
      throw new Error(`--${key} must be a nonnegative safe integer`);
    }
  }
  let result;
  if (command === 'migrate') {
    result = migrate(values.root);
  } else if (command === 'init') {
    result = init(values.root, { id: values.id, name: values.name });
  } else if (command === 'advance') {
    if (!values.proposal?.trim()) throw new Error('--proposal is required');
    const proposal = JSON.parse(fs.readFileSync(values.proposal, 'utf8'));
    result = advance(values.root, proposal);
  } else if (command === 'state') {
    result = state(values.root, values.revision === undefined ? undefined : Number(values.revision));
  } else if (command === 'index') {
    const { root, ...selection } = values;
    for (const key of ['revision', 'limit']) {
      if (selection[key] !== undefined) selection[key] = Number(selection[key]);
    }
    result = index(root, selection);
  } else {
    if (positionals.length !== 1) throw new Error('exactly one node ID is required');
    const selected = values.revision === undefined ? undefined : Number(values.revision);
    const navigate = command === 'expand' ? expand : neighbors;
    result = command === 'inspect' ? inspect(values.root, positionals[0], selected) : navigate(values.root, positionals[0], {
      revision: selected, relation: values.relation,
      limit: values.limit === undefined ? 20 : Number(values.limit),
    });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  if (error.memoryCode || command === 'inspect' || command === 'neighbors' || command === 'expand' || command === 'index') {
    process.stderr.write(`${JSON.stringify({ error: { code: error.memoryCode ?? error.code ?? 'INVALID_INPUT', message: error.message, details: error.details ?? {} } })}\n`);
  } else {
    process.stderr.write(`memory: ${error.message}\n`);
  }
  process.exitCode = 1;
}
