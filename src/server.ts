import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { open, unlink } from 'node:fs/promises';
import { isAbsolute, extname } from 'node:path';
import { z } from 'zod';

const MODEL = 'heygen/heygen-voice-1-turbo:free';
const VOICES = ['nadine', 'tabitha', 'bram', 'gareth', 'noelle', 'meredith', 'sabrina', 'lucian', 'weston', 'vincent'] as const;

export function createServer() {
  const server = new McpServer({ name: 'openrouter-heygen-voice', version: '1.0.0' });
  server.registerTool('list_voices', {
    description: 'List the 10 built-in HeyGen voices (catalog snapshot 2026-11-03). No generation request is made.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => ({ content: [{ type: 'text', text: JSON.stringify({ model: MODEL, voices: VOICES, catalog_date: '2026-11-03', scheduled_end: '2026-11-30' }) }] }));

  server.registerTool('generate_speech', {
    description: 'Submit one request to OpenRouter HeyGen Voice Turbo free and save the generated audio as WAV. Uses free model quota; no automatic retries or paid fallback. Existing files are never overwritten.',
    inputSchema: {
      text: z.string().min(1).max(5000).refine(value => value.trim().length > 0, 'Text must not be blank'),
      voice: z.enum(VOICES).describe('One of the ten built-in voice IDs'),
      output_path: z.string().min(1).describe('Absolute path for a new .wav file; parent directory must already exist'),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async ({ text, voice, output_path }) => {
    if (!isAbsolute(output_path) || extname(output_path).toLowerCase() !== '.wav') throw new Error('output_path must be an absolute .wav path');
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY is not set');
    const file = await open(output_path, 'wx');
    let saved = false;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'OpenRouter HeyGen Voice MCP' },
        body: JSON.stringify({ model: MODEL, input: text, voice, response_format: 'pcm' }),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}; no automatic retry. Check model availability, key, and quota.`);
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.split(';')[0]?.trim().toLowerCase() !== 'audio/pcm') throw new Error(`Unexpected content type: ${contentType || '(missing)'}`);
      const pcm = Buffer.from(await response.arrayBuffer());
      if (pcm.length === 0 || pcm.length % 2 !== 0) throw new Error('Empty or invalid 16-bit PCM response');
      const rateMatch = contentType.match(/(?:^|;)\s*rate\s*=\s*(\d+)/i);
      const channelsMatch = contentType.match(/(?:^|;)\s*channels\s*=\s*(\d+)/i);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 44100;
      const channels = channelsMatch ? Number(channelsMatch[1]) : 1;
      if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || channels !== 1) throw new Error('Unsupported PCM sample rate or channel count');
      const header = Buffer.alloc(44);
      header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
      header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28);
      header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
      header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
      await file.writeFile(Buffer.concat([header, pcm]));
      saved = true;
      return { content: [{ type: 'text', text: JSON.stringify({ model: MODEL, voice, output_path, format: 'wav', pcm_format: 's16le', sample_rate: sampleRate, channels, bytes: pcm.length + 44, duration_seconds: pcm.length / (sampleRate * channels * 2), generation_id: response.headers.get('x-generation-id'), source_content_type: contentType }) }] };
    } finally {
      await file.close();
      if (!saved) await unlink(output_path);
    }
  });
  return server;
}
