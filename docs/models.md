# Available models (early May 2026 — GWDG)

Configured in [`../opencode.json`](../opencode.json), all under the `gwdg/` provider prefix. Ground-truthed against the live API on 2026-05-07 — run `/models-refresh` in the TUI to update.

For GWDG's own positioning of these models (descriptions, intended use cases, vision support, etc.), see their [model overview](https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html). GWDG's official *standard recommendation* is `meta-llama-3.1-8b-instruct` for general use; iibcode picks `qwen3-coder-30b-a3b-instruct` as the default for coding-agent work.

## Tool-capable (13) — usable for agentic flows

- `qwen3-coder-30b-a3b-instruct` — **iibcode default** for coding tasks (256k context)
- `qwen3.5-397b-a17b` — flagship Qwen, thinking/reasoning
- `qwen3.5-122b-a10b` — large Qwen, thinking
- `qwen3.5-35b-a3b` — mid Qwen, thinking
- `qwen3.5-27b` — small Qwen, thinking
- `qwen3.6-35b-a3b` — newer Qwen
- `qwen3-30b-a3b-instruct-2507` — older Qwen3 instruct
- `mistral-large-3-675b-instruct-2512` — flagship Mistral
- `devstral-2-123b-instruct-2512` — Mistral's coding-tuned model
- `glm-4.7` — strong on agentic tasks
- `openai-gpt-oss-120b` — OpenAI's open weights
- `llama-3.3-70b-instruct` — Meta's flagship
- `meta-llama-3.1-8b-instruct` — small Llama (fast smoke tests)

## Listed but no tool calling on GWDG today (8) — non-agentic only

These return HTTP 400 when sent a `tools` array. The cause is a server-side vLLM config gap (`--enable-auto-tool-choice` not set), not a model capability gap — they may light up if GWDG re-deploys them. Configured `tool_call: false` in `opencode.json`.

- `apertus-70b-instruct-2509`
- `qwen3-omni-30b-a3b-instruct` — also broken for plain chat (chat template error)
- `internvl3.5-30b-a3b` — vision + video
- `gemma-4-31b-it`, `gemma-3-27b-it`
- `medgemma-27b-it` — high demand (queues)
- `deepseek-r1-distill-llama-70b` — thinking
- `teuken-7b-instruct-research` — research-only

## Probing the live catalog

Full GWDG catalog from a shell:

```bash
curl -H "Authorization: Bearer $GWDG_API_KEY" https://chat-ai.academiccloud.de/v1/models
```

PowerShell:

```powershell
$h = @{ Authorization = "Bearer $env:GWDG_API_KEY"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://chat-ai.academiccloud.de/v1/models" -Method Get -Headers $h
```

To re-sync `opencode.json` against the live API (probes tool-call support, scrapes per-model context limits from the GWDG docs, and writes the result back), run `/models-refresh` inside the TUI.
