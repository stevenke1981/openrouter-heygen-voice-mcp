import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

test('real stdio server starts and advertises tools', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('src/index.ts')], env: { PATH: process.env.PATH ?? '' } });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  await client.connect(transport);
  expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual(['generate_speech', 'list_voices']);
  await client.close();
});
