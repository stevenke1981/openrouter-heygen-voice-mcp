import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server';

let client: Client;
let dir: string;
let originalFetch: typeof fetch;
let originalKey: string | undefined;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'heygen-mcp-test-'));
  originalFetch = globalThis.fetch;
  originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});
afterEach(async () => {
  await client.close();
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  for (const name of await readdir(dir)) await unlink(join(dir, name));
  await rmdir(dir);
});

describe('MCP speech tools', () => {
  test('discovers the built-in voices without generation', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name).sort()).toEqual(['generate_speech', 'list_voices']);
    const result = await client.callTool({ name: 'list_voices', arguments: {} });
    const content = result.content as { type: string; text: string }[];
    expect(JSON.parse(content[0]!.text).voices).toHaveLength(10);
  });
  test('sends one fixed free-model request and writes a playable WAV container', async () => {
    const path = join(dir, 'speech.wav');
    let calls = 0;
    globalThis.fetch = (async (_url: RequestInfo | URL, options?: RequestInit) => {
      calls++;
      expect(JSON.parse(String(options?.body))).toEqual({ model: 'heygen/heygen-voice-1-turbo:free', input: '你好', voice: 'nadine', response_format: 'pcm' });
      return new Response(new Uint8Array([1, 0, 2, 0]), { headers: { 'content-type': 'audio/pcm; rate=44100; channels=1', 'x-generation-id': 'gen-test' } });
    }) as unknown as typeof fetch;
    const result = await client.callTool({ name: 'generate_speech', arguments: { text: '你好', voice: 'nadine', output_path: path } });
    expect(result.isError).not.toBe(true);
    expect(calls).toBe(1);
    const wav = await readFile(path);
    expect(wav.subarray(0,4).toString()).toBe('RIFF');
    expect(wav.subarray(8,12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(44100);
    expect(wav.readUInt32LE(40)).toBe(4);
    expect([...wav.subarray(44)]).toEqual([1,0,2,0]);
  });
  test('refuses an existing output before calling the API', async () => {
    const path = join(dir, 'existing.wav');
    await writeFile(path, 'keep');
    globalThis.fetch = (() => { throw new Error('should not call'); }) as unknown as typeof fetch;
    const result = await client.callTool({ name: 'generate_speech', arguments: { text: 'hello', voice: 'nadine', output_path: path } });
    expect(result.isError).toBe(true);
    expect(await Bun.file(path).text()).toBe('keep');
  });
  test('removes the reserved output when OpenRouter fails', async () => {
    const path = join(dir, 'failed.wav');
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    const result = await client.callTool({ name: 'generate_speech', arguments: { text: 'hello', voice: 'nadine', output_path: path } });
    expect(result.isError).toBe(true);
    expect(await Bun.file(path).exists()).toBe(false);
  });
  test('rejects invalid input before generation', async () => {
    globalThis.fetch = (() => { throw new Error('should not call'); }) as unknown as typeof fetch;
    for (const args of [
      { text: 'hello', voice: 'unknown', output_path: join(dir, 'a.wav') },
      { text: 'x'.repeat(5001), voice: 'nadine', output_path: join(dir, 'a.wav') },
      { text: 'hello', voice: 'nadine', output_path: 'relative.wav' },
    ]) {
      const result = await client.callTool({ name: 'generate_speech', arguments: args });
      expect(result.isError).toBe(true);
    }
  });
});
