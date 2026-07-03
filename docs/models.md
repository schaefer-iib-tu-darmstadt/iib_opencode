# Available models (July 2026 — GWDG)

Configured in [`../opencode.json`](../opencode.json), all under the `gwdg/` provider prefix. Ground-truthed against the live API on 2026-07-03 — run `/models-refresh` in the TUI to update.

For GWDG's own positioning of these models (descriptions, intended use cases, vision support, etc.), see their [model overview](https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html). GWDG's official *standard recommendation* is `meta-llama-3.1-8b-instruct` for general use; iibcode picks `qwen3-coder-30b-a3b-instruct` as the default for coding-agent work.

Changes since the May 2026 snapshot: `gemma-4-31b-it` gained tool calling, `gemma-3-27b-it` left the catalog, and `qwen3.5-35b-a3b` / `qwen3.5-27b` were replaced by `qwen3.6-27b`.

## Tool-capable (13) — usable for agentic flows

Context windows as scraped from the GWDG docs on 2026-07-03.

- `qwen3-coder-30b-a3b-instruct` — **iibcode default** for coding tasks (256k)
- `qwen3.5-397b-a17b` — flagship Qwen, thinking/reasoning (256k)
- `qwen3.5-122b-a10b` — large Qwen, thinking (256k)
- `qwen3.6-35b-a3b` — newer Qwen (262k)
- `qwen3.6-27b` — newer Qwen, dense (262k)
- `qwen3-30b-a3b-instruct-2507` — older Qwen3 instruct (256k)
- `mistral-large-3-675b-instruct-2512` — flagship Mistral (256k)
- `devstral-2-123b-instruct-2512` — Mistral's coding-tuned model (256k)
- `glm-4.7` — strong on agentic tasks (200k)
- `gemma-4-31b-it` — vision; tool-capable since the July re-probe (256k)
- `openai-gpt-oss-120b` — OpenAI's open weights (128k)
- `llama-3.3-70b-instruct` — Meta's flagship (128k)
- `meta-llama-3.1-8b-instruct` — small Llama (fast smoke tests) (128k)

## Listed but no tool calling on GWDG today (6) — non-agentic only

These return HTTP 400 when sent a `tools` array. The cause is a server-side vLLM config gap (`--enable-auto-tool-choice` not set), not a model capability gap — they may light up if GWDG re-deploys them (as happened with `gemma-4-31b-it`). Configured `tool_call: false` in `opencode.json`.

- `apertus-70b-instruct-2509` (65k)
- `qwen3-omni-30b-a3b-instruct` (256k) — was also broken for plain chat (chat template error) when probed in May
- `internvl3.5-30b-a3b` — vision + video (40k)
- `medgemma-27b-it` — high demand (queues) (128k)
- `deepseek-r1-distill-llama-70b` — thinking (32k)
- `teuken-7b-instruct-research` — research-only (128k)

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
