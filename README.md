# OpenRouter HeyGen Voice MCP

A stdio MCP server that generates speech using OpenRouter's `heygen/heygen-voice-1-turbo:free` model and saves a local WAV file. It offers the ten built-in voices; it does not clone voices or silently switch to paid models.

> OpenRouter lists this free model as scheduled to end on **2026-11-30**. Availability and free quota can change. Check the [model page](https://openrouter.ai/heygen/heygen-voice-1-turbo:free) before relying on it.

## Requirements

- [Bun](https://bun.sh/), Node-compatible MCP client, and an [OpenRouter API key](https://openrouter.ai/settings/keys).
- Network access to `https://openrouter.ai/api/v1/audio/speech`.
- Set `OPENROUTER_API_KEY` in the MCP client's environment. Do not place keys in this repository or share them in chat.

## Setup

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
```

Configure your MCP client with the absolute paths to Bun and this project's `src/index.ts`. The following is an example for Codex's `config.toml`; use paths appropriate for your system:

```toml
[mcp_servers.openrouter-heygen-voice]
command = "C:/Users/YOU/.bun/bin/bun.exe"
args = ["C:/PATH/TO/openrouter-heygen-voice-mcp/src/index.ts"]
```

Set `OPENROUTER_API_KEY` in your operating-system or client environment and restart the client if necessary. For the current PowerShell session, a key already securely saved in the Windows user environment can be inherited without printing it:

```powershell
$env:OPENROUTER_API_KEY = [Environment]::GetEnvironmentVariable('OPENROUTER_API_KEY', 'User')
```

Restart the MCP client after changing configuration. Do not embed credentials in tool arguments, project files, or repository configuration.

## Tools

- `list_voices`: returns the ten built-in voice IDs from the 2026-11-03 model-catalog snapshot. No generation request.
- `generate_speech`: takes `text` (1–5,000 UTF-16 code units), `voice` (one of the listed IDs), and an absolute, new `.wav` `output_path`. The parent folder must already exist. Makes **one** OpenRouter request; it does not retry, split text, overwrite files, or fall back to a paid model. A failed or timed-out request should be investigated before retrying.

Example MCP tool arguments:

```json
{"text":"你好，這是語音測試。","voice":"nadine","output_path":"C:/Temp/heygen-sample.wav"}
```

The API sends the input text to OpenRouter and HeyGen. It returns raw PCM; the server writes a WAV header for signed 16-bit little-endian PCM, using sample-rate and channel information from the response when present, or the model's documented 44.1 kHz mono when absent. The result includes the generation ID, response content type, sample rate, file size, and calculated duration. WAV container validation is not a substitute for listening to the result.

[OpenRouter TTS documentation](https://openrouter.ai/docs/guides/overview/multimodal/tts) · [Model catalog API](https://openrouter.ai/api/v1/models?output_modalities=speech)

## Development

`bun test` uses an in-memory MCP transport and mocked HTTP responses; it does not generate speech or spend quota. Do not use real keys in tests. `bun run start` serves stdio; keep stdout reserved for MCP protocol messages.

## License

MIT. This project is independent of OpenRouter and HeyGen.
