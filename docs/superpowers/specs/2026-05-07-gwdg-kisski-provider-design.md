# GWDG / KISSKI Chat AI provider for opencode fork

**Status:** Approved through brainstorming; ready for implementation planning
**Date:** 2026-05-07
**Author:** Claude (Opus 4.7) + Nils
**Repo:** `iibcode` (fork of `anomalyco/opencode`; cloned into `iibcode/` on Nils' machine)

---

## Goal

Wire up the GWDG Chat AI / KISSKI LLM gateway as a selectable provider in this opencode fork, so the user can run `bun dev run -m gwdg/<model>` (or pick the model in the TUI) and have opencode talk to `https://chat-ai.academiccloud.de/v1` with their `GWDG_API_KEY`.

The integration must be:
- **Config-only.** No source patches in `packages/opencode/`.
- **Merge-safe.** A `git merge upstream/dev` must not destroy our settings.
- **Honest.** The model list and tool-call flags must reflect the actual live state of the GWDG API, not a guess.

## Non-goals

- TUDaGPT integration (separate spec when base URL/auth are available).
- Fixing the `bun dev --cwd packages/opencode` cwd gotcha.
- Building a release binary for TUI-from-anywhere usage.
- Per-model `cost` fields (KISSKI is flat-rate-by-tier, not per-token).
- Detecting GWDG's actual server-side context limits (the API doesn't expose them).

## Background — what we learned from research

### GWDG / KISSKI API ground-truth (verified 2026-05-07)

- **Base URL:** `https://chat-ai.academiccloud.de/v1`
- **Auth:** `Authorization: Bearer <api_key>`
- **OpenAI-compatible.** Endpoints include `/chat/completions`, `/models`, `/embeddings`, `/documents`, `/images/*`, `/audio/*`.
- **`/v1/models` uses GET**, contrary to what the existing `CLAUDE.md` claims. (Live test confirmed.)
- **Rate limits (Basic tier):** 10 req/min, 200/hour, 400/day, 3000/month.

### Live model catalog — 21 models, all `status: "ready"` as of 2026-05-07

Tool-call probe results (each model sent `tools=[get_weather]`, `tool_choice=auto`):

**13 models work agentically** (returned `finish_reason=tool_calls`):
- `qwen3-coder-30b-a3b-instruct`
- `glm-4.7`
- `qwen3.5-27b` (thinking)
- `qwen3.6-35b-a3b`
- `devstral-2-123b-instruct-2512`
- `qwen3.5-122b-a10b` (thinking)
- `qwen3.5-35b-a3b` (thinking)
- `qwen3.5-397b-a17b` (thinking, flagship)
- `mistral-large-3-675b-instruct-2512` (flagship)
- `meta-llama-3.1-8b-instruct`
- `openai-gpt-oss-120b`
- `qwen3-30b-a3b-instruct-2507`
- `llama-3.3-70b-instruct`

**8 models lack tool-call support on GWDG today:**
- 7 return HTTP 400 with `"auto" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set` — a vLLM-side server config issue, not a model capability gap. Affected: `apertus-70b-instruct-2509`, `internvl3.5-30b-a3b`, `gemma-4-31b-it`, `gemma-3-27b-it`, `medgemma-27b-it`, `deepseek-r1-distill-llama-70b`, `teuken-7b-instruct-research`.
- 1 returns a different error (`default chat template is no longer allowed`): `qwen3-omni-30b-a3b-instruct`. Likely broken even for non-tool calls; included in the catalog with `tool_call: false` so users see it via `models gwdg` but won't have opencode try to use it agentically.

### Opencode-side fit

- `@ai-sdk/openai-compatible` is **already bundled** (`packages/opencode/src/provider/provider.ts:101`). No npm install or vendor patch required.
- Custom providers are declared in `opencode.json` per the schema in `packages/opencode/src/config/provider.ts`. Required-or-useful fields per provider: `npm`, `name`, `options.baseURL`, `options.apiKey`, `models`.
- Per-model fields used here: `name`, `tool_call`, `reasoning`, `attachment`, `limit.context`, `limit.output`. (Schema source: `packages/opencode/src/provider/models.ts`.)
- Opencode defaults `tool_call` to `true` if unset (`provider.ts:1011`), so explicit `tool_call: false` is the way to opt models out.
- Opencode supports a global config layer (`Global.Path.config/opencode.json`, e.g. `%APPDATA%/opencode/opencode.json` on Windows) that is **merged** with project config (`config.ts:561`). Users can override `limit.context` per-model in their personal global config without touching the tracked file.

### Existing fork state

- The repo already contains `CLAUDE.md` and `IIBCODE_QUICKSTART.md` describing the *intended* GWDG integration, but no code or config has actually been committed.
- The root `opencode.json` is currently gitignored (`.gitignore:20`).
- A separate file `.opencode/opencode.jsonc` is tracked, has empty `"provider": {}`, and is heavily modified upstream — **not** the right hook point for our customizations.
- No `upstream` git remote is configured. Adding it is out of scope for this task.

## Architectural decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Where the GWDG provider config lives | Tracked `opencode.json` at repo root | Matches existing docs ("`opencode.json` is owned by us"), survives clones, doesn't conflict with upstream-managed `.opencode/opencode.jsonc`. |
| `.gitignore` handling | Remove the `/opencode.json` line | One-line change in a stable region; trivial to resolve if upstream ever conflicts. |
| Model scope | All 21 live models, capability-tagged | User wants full optionality. Listing all is honest about what's available; tagging reflects reality. |
| Tool-call flag source | Live probe of `/v1/chat/completions` | Probe gives binary truth. Defaults and assumptions would drift. |
| Context limits | Conservative defaults baked in | GWDG doesn't expose actual limits; users override per-model in global config when they hit real caps. |
| Cost fields | Omitted | KISSKI is tier-billed, not per-token. |
| Refresh tooling | PowerShell script that prints to stdout | Windows-native, ~50 LOC, no new runtime deps; manual diff/merge keeps a human in the loop and avoids JSONC comment loss. |
| Doc updates | Fix stale claims in `CLAUDE.md` and `IIBCODE_QUICKSTART.md` | Probe surfaced concrete drift (POST vs GET, fabricated-name worry, missing tool-call notes). |

## Files changed

| File | Action | Notes |
|---|---|---|
| `.gitignore` | Edit | Remove the `/opencode.json` line |
| `opencode.json` | New (tracked) | Defines `provider.gwdg` + 21 models with capability tags |
| `scripts/gwdg-refresh-models.ps1` | New | Re-queries `/v1/models` + tool-call probe; emits refreshed `provider.gwdg.models` JSON to stdout |
| `package.json` (repo root) | Edit | Add `"gwdg:refresh": "pwsh -File scripts/gwdg-refresh-models.ps1"` script alias |
| `CLAUDE.md` | Edit | Fix POST→GET on `/v1/models`; refresh "verified working" date and content |
| `IIBCODE_QUICKSTART.md` | Edit | Refresh model list; group by tool-call capability; note the 8 non-agentic models; add `bun run gwdg:refresh` instruction |

**Out of scope:** `packages/opencode/src/**` (no source changes), `.opencode/opencode.jsonc` (upstream-managed).

## `opencode.json` shape — full spec

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "gwdg": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "GWDG Chat AI (KISSKI)",
      "options": {
        "baseURL": "https://chat-ai.academiccloud.de/v1",
        "apiKey": "{env:GWDG_API_KEY}"
      },
      "models": {
        "qwen3-coder-30b-a3b-instruct": {
          "name": "Qwen3 Coder 30B A3B Instruct",
          "tool_call": true,
          "limit": { "context": 256000, "output": 8192 }
        },
        "glm-4.7": {
          "name": "GLM-4.7",
          "tool_call": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "qwen3.5-27b": {
          "name": "Qwen3.5 27B (thinking)",
          "tool_call": true,
          "reasoning": true,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "qwen3.6-35b-a3b": {
          "name": "Qwen3.6 35B A3B",
          "tool_call": true,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "devstral-2-123b-instruct-2512": {
          "name": "Devstral 2 123B Instruct 2512",
          "tool_call": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "qwen3.5-122b-a10b": {
          "name": "Qwen3.5 122B A10B (thinking)",
          "tool_call": true,
          "reasoning": true,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "qwen3.5-35b-a3b": {
          "name": "Qwen3.5 35B A3B (thinking)",
          "tool_call": true,
          "reasoning": true,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "qwen3.5-397b-a17b": {
          "name": "Qwen3.5 397B A17B (flagship, thinking)",
          "tool_call": true,
          "reasoning": true,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "mistral-large-3-675b-instruct-2512": {
          "name": "Mistral Large 3 675B Instruct 2512 (flagship)",
          "tool_call": true,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "meta-llama-3.1-8b-instruct": {
          "name": "Meta Llama 3.1 8B Instruct",
          "tool_call": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "openai-gpt-oss-120b": {
          "name": "OpenAI GPT OSS 120B",
          "tool_call": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "qwen3-30b-a3b-instruct-2507": {
          "name": "Qwen3 30B A3B Instruct 2507",
          "tool_call": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "llama-3.3-70b-instruct": {
          "name": "Meta Llama 3.3 70B Instruct",
          "tool_call": true,
          "limit": { "context": 128000, "output": 8192 }
        },

        "apertus-70b-instruct-2509": {
          "name": "Apertus 70B Instruct 2509 (no tool calling on GWDG)",
          "tool_call": false,
          "limit": { "context": 128000, "output": 8192 }
        },
        "qwen3-omni-30b-a3b-instruct": {
          "name": "Qwen3 Omni 30B A3B Instruct (broken: chat template error)",
          "tool_call": false,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "internvl3.5-30b-a3b": {
          "name": "InternVL 3.5 30B A3B (no tool calling on GWDG)",
          "tool_call": false,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "gemma-4-31b-it": {
          "name": "Gemma 4 31B IT (no tool calling on GWDG)",
          "tool_call": false,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "gemma-3-27b-it": {
          "name": "Gemma 3 27B IT (no tool calling on GWDG)",
          "tool_call": false,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "medgemma-27b-it": {
          "name": "MedGemma 27B IT (no tool calling on GWDG; high demand)",
          "tool_call": false,
          "attachment": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "deepseek-r1-distill-llama-70b": {
          "name": "DeepSeek R1 Distill Llama 70B (no tool calling on GWDG; thinking)",
          "tool_call": false,
          "reasoning": true,
          "limit": { "context": 128000, "output": 8192 }
        },
        "teuken-7b-instruct-research": {
          "name": "Teuken 7B Instruct (research, no tool calling on GWDG)",
          "tool_call": false,
          "limit": { "context": 4096, "output": 2048 }
        }
      }
    }
  }
}
```

### Per-model field rules

- **`tool_call`** — `true` for the 13 probed-working models; `false` for the 8 that returned an error.
- **`reasoning: true`** — set on models whose live `/v1/models` `output` array includes `"thought"`: the four `qwen3.5-*` thinking variants and `deepseek-r1-distill-llama-70b`.
- **`attachment: true`** — set on models whose `input` includes `"image"`: 9 models in total.
- **`limit.context`** — `256000` for `qwen3-coder-30b-a3b-instruct` (Qwen3-Coder native), `4096` for `teuken-7b-instruct-research` (small research model), `128000` for everything else (conservative default for modern open-weight models).
- **`limit.output`** — `8192` universally, `2048` for Teuken.
- **`name`** — taken from the live API's `name` field, with parenthetical hints for notable states (no tool calling / thinking / flagship / broken / high demand).
- **No `cost` field** — KISSKI is flat-rate-by-tier.

## `scripts/gwdg-refresh-models.ps1` — design

### Behavior

1. Read `$env:GWDG_API_KEY`. Exit with a clear error if missing.
2. `Invoke-RestMethod` against `https://chat-ai.academiccloud.de/v1/models` (GET) → list of `{id, name, input[], output[], demand, status}`.
3. Read existing `opencode.json` from repo root if present, parse, extract current `provider.gwdg.models` block. (Used to preserve any user overrides on `limit.context` / `limit.output`.)
4. For each model from step 2, send a tool-call probe (`POST /v1/chat/completions` with a `get_weather` tool, `tool_choice: "auto"`, `temperature: 0`, `max_tokens: 200`). Sleep 800ms between requests to stay under the 10/min Basic-tier limit.
5. Classify each model:
   - HTTP 200 with `tool_calls.length > 0` → `tool_call: true`
   - HTTP 400 with the vLLM `--enable-auto-tool-choice` error → `tool_call: false` (name suffix: "no tool calling on GWDG")
   - Any other error → `tool_call: false` (name suffix: "broken: <short error>")
6. Build the new `provider.gwdg.models` block:
   - `name` from API + parenthetical hints
   - `tool_call` from probe
   - `reasoning: true` if `output` includes `"thought"`
   - `attachment: true` if `input` includes `"image"`
   - `limit.context` / `limit.output` — preserve from existing config if the model was already there; otherwise default `128000` / `8192`, with a `// TODO: verify limit` JSONC comment for new models
7. Print the new `provider.gwdg.models` JSON object to stdout. **Never** modify `opencode.json` directly.

### What the script does NOT do

- Doesn't write to `opencode.json` (output is stdout only)
- Doesn't fetch upstream changes or run any opencode build steps
- Doesn't read `auth.json` (only the `GWDG_API_KEY` env var)
- Doesn't probe for actual server-side context limits (no API exposes them)
- Doesn't accept `--write`, `--filter`, or other flags

### Compatibility

Targets Windows PowerShell 5.1 syntax (no `??`, no ternary, no PSCustomObject splatting tricks). Works under both `pwsh` (PowerShell 7+) and `powershell` (5.1).

### `package.json` integration

Add one entry to root `package.json`:
```jsonc
{
  "scripts": {
    "gwdg:refresh": "pwsh -File scripts/gwdg-refresh-models.ps1"
  }
}
```

## Doc updates

### `CLAUDE.md`

| Area | Change |
|---|---|
| Endpoints note | `/v1/models requires POST, not GET` → `/v1/models is a standard GET` |
| PowerShell sanity-check snippet | `-Method Post` → `-Method Get` |
| "Verified working as of 2026-05-03" block | Update date to `2026-05-07`; expand the body to: "13 of 21 GWDG-served models return well-formed OpenAI tool calls (probed live). 8 fail with a vLLM-side `--enable-auto-tool-choice` error and are configured `tool_call: false` in `opencode.json`. Run `bun run gwdg:refresh` to re-probe." |

### `IIBCODE_QUICKSTART.md`

| Area | Change |
|---|---|
| **Available models** body | Replace hand-curated list with two grouped lists: **Tool-capable (13)** and **Listed but no tool calling on GWDG (8)**, taken from probe results. Mark `qwen3-coder-30b-a3b-instruct` as the recommended default. |
| **Available models** footer | `POST https://chat-ai.academiccloud.de/v1/models` → `GET ...` |
| **Verify it works** | Add `bun run gwdg:refresh` after the existing commands, with one-liner "re-probe model list & tool-call support". |
| **Known issues** | Add a third entry noting that 8 GWDG-served models don't currently expose tool calling (server-side vLLM config), so they're configured `tool_call: false`. Re-run `bun run gwdg:refresh` if GWDG enables more. |

### `package.json`

Add the `gwdg:refresh` script entry described above. Nothing else changes.

### Out of doc scope

- The `bun dev --cwd` gotcha — still real, separate fix.
- Setup instructions (`bun install --ignore-scripts`, env-var setup) — still accurate.
- License, upstream-pull instructions — unchanged.

## Verification plan

### Pre-flight

1. `git check-ignore opencode.json` returns nothing (file is tracked-able).
2. `bun -e "JSON.parse(require('fs').readFileSync('opencode.json'))"` succeeds.
3. Opencode validates `opencode.json` against `https://opencode.ai/config.json` on load — any schema mismatch surfaces on the first `bun dev` invocation.

### Functional

4. **Provider discovered:** `bun dev models gwdg` lists all 21 model IDs.
5. **Smoke run — non-tool:** `bun dev run --dir . "Reply with just the word PONG" -m gwdg/qwen3-coder-30b-a3b-instruct` prints `PONG`.
6. **Smoke run — agentic:** `bun dev run --dir . "List the .md files in this directory using the glob tool" -m gwdg/qwen3-coder-30b-a3b-instruct` triggers a `glob` tool call, opencode dispatches it, model summarizes results.
7. **Negative check:** `bun dev run --dir . "Reply PONG" -m gwdg/teuken-7b-instruct-research` replies (or attempts to) without opencode exposing tools to the model.

### Refresh script

8. `bun run gwdg:refresh > scratch.json` produces valid JSON containing a `provider.gwdg.models` block; no crash on rate-limit/transient error.
9. **Idempotency:** running it twice and comparing (sorted) outputs shows no differences.

### Merge-safety smoke test (optional, requires upstream remote)

10. **Prerequisite** — none of the fork's remotes currently point at `anomalyco/opencode`. To run this test, first add it: `git remote add upstream https://github.com/anomalyco/opencode.git && git fetch upstream`. Then from a clean tree: `git merge --no-commit --no-ff upstream/dev && git status`. No conflicts on `opencode.json` or `scripts/gwdg-refresh-models.ps1`. Only `.gitignore` could plausibly conflict — trivial one-line resolve. Then `git merge --abort`. Whether to commit the `upstream` remote configuration is out of scope for this spec.

### Out of verification scope

- Running all 21 models end-to-end (probe already validates tool-call shape; one default-model E2E proves the full loop).
- TUI behavior (functional CLI checks suffice).
- Long-context behavior at the configured `limit.context` (these are conservative defaults; users override per-model in global config if real caps are smaller).

## Risks & open questions

| Risk | Severity | Mitigation |
|---|---|---|
| GWDG enables tool calling on more models tomorrow | Low | `bun run gwdg:refresh` regenerates the block; manual diff/merge picks up the change. |
| GWDG removes a model | Low | Same mitigation. |
| `qwen3-omni` is broken even non-agentically | Low | Configured with `tool_call: false` and a "broken" hint in the name; users discover by trying it. |
| Conservative `limit.context: 128000` exceeds GWDG's actual server-side cap for some model | Medium | Users override per-model in `%APPDATA%/opencode/opencode.json` (global config layer that opencode merges). Not silent-failing. |
| Future upstream changes to `.gitignore` near the `/opencode.json` line | Low | Trivial one-line merge resolve. |
| `pwsh` not installed on a contributor's machine | Low | Script also runs under `powershell` (PS 5.1); alias works for both. |

## Appendix — reference material

- [Available Models — GWDG HPC Documentation](https://docs.hpc.gwdg.de/services/chat-ai/models/index.html) (note: stale; live `/v1/models` is the source of truth)
- [SAIA — GWDG HPC Documentation (API endpoints)](https://docs.hpc.gwdg.de/services/ai-services/saia/index.html)
- [Chat AI service — KISSKI](https://kisski.gwdg.de/en/leistungen/2-02-llm-service/)
- [KISSKI endpoint Python example — ScaDS](https://scads.github.io/generative-ai-notebooks/15_endpoint_apis/06_kisski_endpoint.html)
- Opencode source references (in this repo):
  - `packages/opencode/src/provider/provider.ts:101` — `@ai-sdk/openai-compatible` bundled
  - `packages/opencode/src/provider/provider.ts:1011` — `tool_call` defaults to `true`
  - `packages/opencode/src/config/provider.ts` — provider config schema
  - `packages/opencode/src/provider/models.ts` — model field schema
  - `packages/opencode/src/config/config.ts:561` — global config merge
- Probe results (raw): `%TEMP%\gwdg_probe_results.json` (one-shot, not committed)
