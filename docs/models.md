# Available models (July 2026 — GWDG)

Configured in [`../opencode.json`](../opencode.json), all under the `gwdg/` provider prefix. Ground-truthed against the live API on 2026-07-03 (tool-support re-probe 2026-07-04) — run `/models-refresh` in the TUI to update.

For GWDG's own positioning of these models (descriptions, intended use cases, vision support, etc.), see their [model overview](https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html). GWDG's official *standard recommendation* is `meta-llama-3.1-8b-instruct` for general use; iibcode picks `qwen3.6-35b-a3b` as the default for coding-agent work (set via the top-level `model` key in `opencode.json`) — fast MoE inference (162 tok/s, sub-second tool calls in a 2026-07-03 live probe), GWDG-endorsed for coding/agentic workflows, 262k context.

**GWDG ran a decommissioning wave on 2026-07-03.** `llama-3.3-70b-instruct` and `teuken-7b-instruct-research` are dead (404/500 — dropped from `opencode.json`). `qwen3-coder-30b-a3b-instruct`, `deepseek-r1-distill-llama-70b`, and `internvl3.5-30b-a3b` are delisted from `/v1/models` but still answered requests that evening; only the former default is kept in the config for now. New arrival: `qwen3-coder-next`. Earlier changes since May: `gemma-4-31b-it` gained tool calling, `gemma-3-27b-it` left the catalog, and `qwen3.5-35b-a3b` / `qwen3.5-27b` were replaced by `qwen3.6-27b`.

## Tool-capable (14 configured, 13 in the live catalog) — usable for agentic flows

Membership is decided purely by HTTP status: a model whose tool probe returns **2xx** (the deployment accepts a `tools` request) is configured; **4xx** (`enable-auto-tool-choice`) means no server-side tool support and it's left out. There is no denylist. Context windows as scraped from the GWDG docs on 2026-07-03.

- `qwen3.6-35b-a3b` — **iibcode default** for coding tasks; fast MoE (262k)
- `qwen3-coder-next` — successor to the retired Qwen3 Coder (256k)
- `qwen3-30b-a3b-instruct-2507` — older Qwen3 instruct (256k)
- `qwen3.5-397b-a17b` — flagship Qwen, thinking/reasoning (256k)
- `qwen3.5-122b-a10b` — large Qwen, thinking (256k)
- `qwen3.6-27b` — newer Qwen, dense — slow for agentic loops: hidden thinking on every tool round trip (262k)
- `mistral-large-3-675b-instruct-2512` — flagship Mistral (256k)
- `devstral-2-123b-instruct-2512` — Mistral's coding-tuned model (256k)
- `glm-4.7` — strong on agentic tasks (200k)
- `gemma-4-31b-it` — vision; tool-capable since the July re-probe (256k)
- `openai-gpt-oss-120b` — OpenAI's open weights; very fast (128k)
- `meta-llama-3.1-8b-instruct` — small Llama (fast smoke tests) (128k)
- `apertus-70b-instruct-2509` — Swiss open model; **accepts tools (2xx) since the 2026-07-04 re-probe**, though flaky at actually emitting a call (65k)
- `qwen3-coder-30b-a3b-instruct` — former default; **delisted 2026-07-03**, still answering for now (256k)

## Catalog models without tool calling (2) — not configured in iibcode

These return HTTP 400 when sent a `tools` array. The cause is a server-side vLLM config gap (`--enable-auto-tool-choice` not set), not a model capability gap — they may light up if GWDG re-deploys them (as happened with `gemma-4-31b-it`, and with `apertus-70b-instruct-2509` on 2026-07-04). They are **not** in `opencode.json`, and `/models-refresh` skips models whose tool probe returns a 4xx, so they stay out until GWDG enables tools on them.

- `qwen3-omni-30b-a3b-instruct` (256k) — was also broken for plain chat (chat template error) when probed in May
- `medgemma-27b-it` — high demand (queues) (128k)

(`internvl3.5-30b-a3b` and `deepseek-r1-distill-llama-70b` were delisted 2026-07-03 — still answering that evening, but removed from the config.)

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

To re-sync `opencode.json` against the live API (probes tool-call support by HTTP status, scrapes per-model context limits from the GWDG docs, and writes the result back), run `/models-refresh` inside the TUI. Only models whose probe returns 2xx are added; the toast reports `Added N, skipped M without tool calling`. Note it only *adds* models — entries that disappear from the catalog are kept and reported as stale, never auto-removed.

GWDG rate limits (from response headers, 2026-07-03): **2 req/s, 60 req/min, 9 000 req/h**.
