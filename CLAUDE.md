# Claude Code context for this repo

You are working in a **personal fork of [anomalyco/opencode](https://github.com/anomalyco/opencode)** that's customized to talk to GWDG ChatAI and TUDaGPT (university LLM gateways serving open-weight models). The customized CLI is branded `iibcode`. See `README.md` for user-facing docs (the original upstream English README and 21 translations live in `docs/upstream-readme/`).

## What this repo is

- A clone of `anomalyco/opencode` (a TypeScript/Bun coding-agent CLI/TUI), with a project-local `opencode.json` adding `@ai-sdk/openai-compatible` providers for **GWDG** (and eventually TUDaGPT).
- Default branch: **`dev`** (upstream's default — not `main`).
- Git remotes:
  - `upstream` → `https://github.com/anomalyco/opencode.git` (anomalyco, read-only for us)
  - `origin` → `https://git-ce.rwth-aachen.de/tuda-iib/iibai/iibcode.git` (RWTH GitLab, the active fork host)
  - `old-origin` → `https://github.com/schaefer-iib-tu-darmstadt/iibcode.git` (former GitHub fork, kept as backup; safe to remove with `git remote remove old-origin`)

## Golden rules when working here

1. **Don't modify upstream files unless absolutely necessary.** Every file we edit becomes a merge conflict on `git pull upstream`. Prefer config-only changes via `opencode.json`. If you must touch source, do it in a clearly-named branch and document why.
2. **Never push to `upstream`.** That's `anomalyco/opencode`. Pushes go to `origin` (the user's fork) only.
3. **Never commit secrets.** `GWDG_API_KEY` lives in the User-scope env var on Windows, referenced as `{env:GWDG_API_KEY}` in `opencode.json`. Don't inline it.
4. **Don't run `bun install` without `--ignore-scripts` on Windows** unless Visual Studio C++ Build Tools are installed (see "Known issues" in `README.md`). It will fail building `tree-sitter-powershell`.

## Key paths

| Path | What |
|---|---|
| `opencode.json` | Project-local config. **Owned by us.** Defines `provider.gwdg` and the model list. |
| `README.md` | **Owned by us.** The iibcode quickstart (was `IIBCODE_QUICKSTART.md` before the rename). Marked `merge=ours` in `.gitattributes`. |
| `docs/upstream-readme/` | **Owned by us.** Holds the original upstream English `README.md` + 21 translations, moved here so iibcode owns the root README. Also `merge=ours`. |
| `docs/*.md` | **Owned by us.** Fork-specific docs split out from `README.md` (`development.md`, `troubleshooting.md`, `maintainer-sync.md`, `models.md`). All `merge=ours`. |
| `scripts/` | **Owned by us.** `setup.ts` is the one-command onboarding (`bun run setup`): install → build → binary onto PATH → global-config → prompt+store `GWDG_API_KEY`. It chains the other two: `build-iibcode.ts` builds the standalone binary (`iibcode:build`); `install-global-config.ts` syncs `opencode.json` to `~/.config` (`setup:global-config`). |
| `packages/opencode/src/cli/cmd/tui/util/gwdg-refresh.ts` | **Owned by us.** Backs the in-TUI `/models-refresh` command: fetches the GWDG `/v1/models` catalog, probes tool-call support, scrapes per-model context windows from the GWDG docs, and writes the result into `opencode.json`. |
| `.gitattributes` | **Owned by us.** Marks `README.md`, `docs/*.md`, `docs/upstream-readme/**`, and `docs/images/**` as `merge=ours` so upstream merges auto-keep our version. |
| `packages/opencode/src/provider/` | Provider plumbing (read-only for us; understanding only). |
| `packages/opencode/src/session/` | Message loop and tool-call dispatch. The place to patch if open-weight models start emitting malformed tool calls (so far Qwen3-Coder is fine). |
| `packages/opencode/src/tool/` | Built-in tool definitions (glob, grep, read, write, edit, bash, etc.). |
| `packages/opencode/src/cli/cmd/run.ts` | The `opencode run` non-interactive entrypoint — accepts `--dir <path>` to set project root. |
| `packages/opencode/src/auth/index.ts` | Where `auth.json` (per-provider API keys, mode 0600) is read/written. |
| `packages/opencode/src/config/variable.ts` | Implements `{env:VAR}` and `{file:path}` substitution in `opencode.json`. |

## Fork-specific source patches (upstream files we modify)

**Canonical list: `docs/fork-changes.md`** — keep it in sync with any change here. Golden rule #1 says avoid touching upstream source, but two features require it. These paths are **not** `merge=ours` (that driver only works for whole-file ownership), so `git merge upstream/dev` may conflict on them. Every edit is an **additive, commented block**; the bulk of each feature lives in fork-owned files so the upstream-file hooks stay tiny. On conflict: keep upstream's surrounding code, re-apply our block, rebuild (`bun run iibcode:build`). Paths below are relative to `packages/opencode/src/`.

**Rate-limit display** — surfaces GWDG's `x-ratelimit-*` response headers in the TUI sidebar and uses them to time retry backoff:

| File | Our addition |
|---|---|
| `session/llm.ts` | **Primary capture:** a `wrapStream` middleware that reads `x-ratelimit-*` / `ratelimit-*` response headers and injects them into the finish-step `providerMetadata.ratelimit.headers`. Provider-agnostic — this is what makes it work for GWDG (`@ai-sdk/openai-compatible`). |
| `session/processor.ts` | `extractRateLimit()` reads `ratelimit.headers` off provider metadata onto the message |
| `session/message-v2.ts` | `rateLimit` field on the Assistant message schema |
| `session/retry.ts` | Use the headers to estimate backoff wait time |
| `cli/cmd/tui/feature-plugins/sidebar/context.tsx` | **2 lines only**: import + `registerRateLimitSlot(api)`. The `RateLimitView` (order 150, between Context at 100 and MCP at 200; renders `remaining/limit req/min` + `req/hr` or `N/A`) lives in `sidebar/rate-limit.tsx` — **entirely ours**. Second `api.slots.register` call gets its own slot id via `runtime.ts`. |

(The former `provider/sdk/copilot/**` capture patches were superseded by the `session/llm.ts` middleware and have been reverted — those files are untouched upstream again.)

**GWDG `/models-refresh` with context limits**:

| File | Our addition |
|---|---|
| `cli/cmd/tui/app.tsx` | **1 line** in the command list (`GwdgRefreshCommand.command({ dialog, toast, project })`) plus the `useProject` import/call it needs |
| `cli/cmd/tui/util/gwdg-refresh-command.ts` | **Entirely ours:** the command handler — resolve config path → fetch catalog → probe tool-call → scrape context limits → write `opencode.json` → SIGUSR2 reload |
| `cli/cmd/tui/util/gwdg-refresh.ts` | **Entirely ours:** the refresh + docs-scrape logic. `resolveConfigPath()` prefers a project-local `opencode.json` (walk up via `findOpencodeJson`) but falls back to the **global** `~/.config/opencode/opencode.json` (`globalConfigPath()`, XDG path) so `/models-refresh` also works when iibcode is launched outside the repo — editing the config that's actually in effect there. |

**Branding**: `cli/brand.ts` (**entirely ours**, exports `BRAND.name`/`BRAND.short`) + one-line uses in `cli/cmd/tui/app.tsx` terminal titles + redrawn splash art in `cli/logo.ts`.

## Environment

- **Platform:** Windows 10/11. Bun runs natively. Bash is Git Bash.
- **API key:** `GWDG_API_KEY` — User-scope env var. Set once with `[Environment]::SetEnvironmentVariable("GWDG_API_KEY", "...", "User")`. After setting, **new** shells inherit it; existing ones (including a running Claude Code instance) do not — restart Claude Code if its bash tool can't see it.
- **Bun:** v1.3.13 on PATH (installed via WinGet at `C:\Users\schae\AppData\Local\Microsoft\WinGet\Links\bun.exe`).
- **Endpoints:**
  - GWDG: `https://chat-ai.academiccloud.de/v1` — OpenAI-compatible, `Authorization: Bearer $GWDG_API_KEY`. Note: `/v1/models` is a standard **GET** (the OpenAI `/v1/models` endpoint).
  - TUDaGPT: TU-network only, base URL TBD (ask HRZ).

## Common commands

```bash
# List configured models for the gwdg provider (config sanity check)
bun dev models gwdg

# One-shot run from any directory — IMPORTANT: use --dir, see "Gotcha" below
bun dev run --dir . "your prompt" -m gwdg/qwen3-coder-30b-a3b-instruct

# Interactive TUI (rooted in packages/opencode due to --cwd in dev script — gotcha below)
bun dev

# Pull upstream changes
git fetch upstream && git merge upstream/dev

# Test GWDG endpoint directly (PowerShell)
$h = @{ Authorization = "Bearer $env:GWDG_API_KEY"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://chat-ai.academiccloud.de/v1/models" -Method Get -Headers $h

# Re-probe the model list, tool-call support, and context limits:
# run the /models-refresh command inside the TUI. It adds any new GWDG models to
# opencode.json and refreshes each model's context window from the GWDG docs.
```

## Known gotchas

1. **`bun dev` forces cwd to `packages/opencode`** because the root `dev` script does `bun run --cwd packages/opencode --conditions=browser src/index.ts`. This means OpenCode treats that subdirectory as the project root. For one-shot `run`, override with `--dir <path>`. For TUI usage, build a binary with `bun run iibcode:build` (from the repo root, **not** `packages/opencode/`) and run that from your actual project directory. See README → "Build the `iibcode` binary".
2. **Models can hallucinate counts** even when tools return correct results (Qwen3-Coder reported "31" matches when glob said 41). For numeric aggregations, prefer to surface the tool's reported count rather than ask the model to count from a list.
3. **`bun install` needs `--ignore-scripts`** on this Windows setup (no VS C++ tooling). Already noted, just don't forget on a fresh clone.
4. **`merge=ours` driver needs one-time per-clone setup.** `.gitattributes` marks `README.md` and `docs/upstream-readme/**` as `merge=ours` so `git merge upstream/dev` auto-keeps our version on those paths. The driver itself is not committed; on every fresh clone run once: `git config merge.ours.driver true`. Without it, you'll get normal merge conflicts on the README during upstream syncs (resolution is still trivial: `git checkout --ours README.md docs/upstream-readme/`).
5. **Upstream sometimes adds a new translation** (e.g. `README.cs.md`). After `git merge upstream/dev`, it'll appear at the repo root. Move it: `git mv README.cs.md docs/upstream-readme/`. The `merge=ours` rule only fires for *existing* paths, so a brand-new file slips through.

## Verified working as of 2026-07-03

- GWDG API key valid (32 hex chars).
- `GET /v1/models` returns 19 live models (all `status: ready`).
- 13 of 19 GWDG-served models return well-formed OpenAI tool calls (probed live via `/models-refresh`). 6 fail with a vLLM-side `--enable-auto-tool-choice` server-config error and are configured `tool_call: false` in `opencode.json`. Since May: `gemma-4-31b-it` gained tool calling, `gemma-3-27b-it` left the catalog, `qwen3.5-35b-a3b`/`qwen3.5-27b` were replaced by `qwen3.6-27b`.
- `gwdg/qwen3-coder-30b-a3b-instruct` is the recommended default for agentic use — fast, tool-capable, coding-tuned.
- Per-model `limit.context` values now come from the GWDG docs scrape (no longer 128k guesses); `limit.output` is still a uniform 8192 default.
- Run `/models-refresh` inside the TUI to re-probe (adds new GWDG models and refreshes per-model context limits from the GWDG docs; handy when GWDG enables tool calling on more deployments).

## Tasks that are still TODO

- Wire up TUDaGPT as a second provider once the base URL and auth are available.
- Wire up Blablador (Helmholtz AI / FZ Jülich) as a third provider — OpenAI-compatible gateway, so config-only via `opencode.json` like GWDG; needs a Helmholtz AAI login for the API key.
- Consider trimming OpenCode's default tool set (15+ tools) for smaller open-weight models that get confused by too many options. Hook: `packages/opencode/src/tool/registry.ts`.
- Write a Qwen-tuned system prompt and bind it via OpenCode's agent config.
