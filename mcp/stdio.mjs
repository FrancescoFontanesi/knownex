import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMemoryServer } from './server.mjs';

try {
  const { values } = parseArgs({ options: { root: { type: 'string' }, 'text-results': { type: 'boolean' } } });
  for (const key of ['root', 'text-results']) {
    if (process.argv.slice(2).filter(arg => arg === `--${key}` || arg.startsWith(`--${key}=`)).length > 1) {
      throw new Error(`duplicate option --${key}`);
    }
  }
  const server = createMemoryServer(values.root, { textResults: values['text-results'] ?? false });
  serveStdio(() => server);
} catch (error) {
  process.stderr.write(`agent-memory MCP: ${error.message}\n`);
  process.exitCode = 1;
}
